/*
 * Copyright (C) 2024-2026 LitterBox-Web contributors
 *
 * This file is part of LitterBox-Web.
 * Licenced under the EUPL-1.2 or later.
 *
 * SPDX-FileCopyrightText: 2024-2026 LitterBox-Web contributors
 * SPDX-License-Identifier: EUPL-1.2
 */
package de.uni_passau.fim.se2.litterbox_web.web_ui.statistics;

import java.time.Clock;
import java.time.LocalDate;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.stream.Stream;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Profile;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import de.uni_passau.fim.se2.litterbox_web.web_ui.persistence.DatabaseWork;
import de.uni_passau.fim.se2.litterbox_web.web_ui.persistence.ReadCommittedTransactions;
import de.uni_passau.fim.se2.litterbox_web.web_ui.support.WebUiProfiles;
import reactor.core.publisher.Mono;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/** Turns completed analyses into the one-way anonymous public-statistics projection. */
@Component
@Profile(WebUiProfiles.PUBLIC_WEB)
@ConditionalOnProperty(
    prefix = "litterbox.statistics",
    name = "rollup-enabled",
    havingValue = "true",
    matchIfMissing = true
)
@ConditionalOnProperty(
    prefix = "litterbox.statistics.synthetic-demo",
    name = "enabled",
    havingValue = "false",
    matchIfMissing = true
)
public class StatisticsProjector {

    private static final Logger log = LoggerFactory.getLogger(StatisticsProjector.class);
    private static final int MAX_FINDER_ID_LENGTH = 160;
    static final List<String> ISSUE_TYPES = List.of("bug", "smell", "perfume");
    static final Map<String, String> LEGACY_ISSUE_METRICS = Map.of(
        "bug", "bugs", "smell", "smells", "perfume", "perfumes"
    );
    static final List<String> COMPLEXITY_METRICS = List.of(
        "interprocedural_cyclomatic_complexity", "most_complex_script", "max_nested_block_count",
        "length_longest_script", "procedure_count", "variable_count"
    );
    static final List<String> PUBLIC_DISTRIBUTION_METRICS = List.of(
        "block_count", "script_count", "sprite_count", "bug_count", "smell_count", "perfume_count",
        "interprocedural_cyclomatic_complexity", "most_complex_script", "max_nested_block_count",
        "length_longest_script", "procedure_count", "variable_count"
    );
    static final List<String> CORE_BLOCK_CATEGORY_METRICS = List.of(
        "motion_block_count", "looks_block_count", "sound_block_count", "events_block_count",
        "control_block_count", "sensing_block_count", "operators_block_count", "variables_block_count",
        "my_blocks_block_count"
    );
    static final String OTHER_BLOCK_CATEGORY_METRIC = "other_block_count";
    static final List<String> BLOCK_CATEGORY_METRICS = Stream.concat(
        CORE_BLOCK_CATEGORY_METRICS.stream(), Stream.of(OTHER_BLOCK_CATEGORY_METRIC)
    ).toList();

    private final StatisticsRepository repository;
    private final DatabaseWork databaseWork;
    private final ReadCommittedTransactions transactions;
    private final Clock clock;
    private final JsonMapper mapper;
    private final int batchSize;

    @Autowired
    @SuppressWarnings("checkstyle:ParameterNumber")
    public StatisticsProjector(
        final StatisticsRepository repository,
        final DatabaseWork databaseWork,
        final ReadCommittedTransactions transactions,
        @Value("${litterbox.statistics.rollup-batch-size:100}") final int batchSize
    ) {
        this(repository, databaseWork, transactions, Clock.systemUTC(), JsonMapper.shared(), batchSize);
    }

    StatisticsProjector(
        final StatisticsRepository repository,
        final DatabaseWork databaseWork,
        final ReadCommittedTransactions transactions,
        final Clock clock,
        final JsonMapper mapper,
        final int batchSize
    ) {
        this.repository = Objects.requireNonNull(repository, "repository");
        this.databaseWork = Objects.requireNonNull(databaseWork, "databaseWork");
        this.transactions = Objects.requireNonNull(transactions, "transactions");
        this.clock = Objects.requireNonNull(clock, "clock");
        this.mapper = Objects.requireNonNull(mapper, "mapper");
        if (batchSize < 1) {
            throw new IllegalArgumentException("Statistics batch size must be positive");
        }
        this.batchSize = batchSize;
    }

    /** A bounded and directly invocable pass, useful to deployments and tests as well as the scheduler. */
    public Mono<Integer> project() {
        final LocalDate currentUtcDay = LocalDate.now(clock);
        return databaseWork.submit(() -> projectInDatabase(currentUtcDay));
    }

    @Scheduled(fixedDelayString = "${litterbox.statistics.rollup-interval-millis:60000}")
    public void scheduledProject() {
        project().subscribe(
            projected -> log.debug("Projected {} completed analyses into public statistics", projected),
            error -> log.warn("Could not update the public-statistics projection", error)
        );
    }

    private int projectInDatabase(final LocalDate currentUtcDay) {
        if (repository.hasSyntheticProjection()) {
            log.warn("Public-statistics roll-up is disabled because this database contains synthetic demo aggregates");
            return 0;
        }
        int projected = 0;
        for (long analysisId : repository.eligibleAnalysisIds(currentUtcDay, batchSize)) {
            if (Boolean.TRUE.equals(transactions.execute(status -> projectOne(analysisId, currentUtcDay)))) {
                projected++;
            }
        }
        return projected;
    }

    private boolean projectOne(final long analysisId, final LocalDate currentUtcDay) {
        if (!repository.claim(analysisId, currentUtcDay)) {
            return false;
        }
        final StatisticsRepository.AnalysisRow analysis = repository.analysis(analysisId);
        final Map<String, Double> metrics = repository.metrics(analysisId);
        final long blocks = count(metrics, "block_count");
        final long scripts = count(metrics, "script_count");
        final long sprites = count(metrics, "sprite_count");
        repository.addDistribution("block_count", blocks);
        repository.addDistribution("script_count", scripts);
        repository.addDistribution("sprite_count", sprites);
        final boolean hasBlockCategories = addBlockCategories(metrics, blocks);
        for (String metric : COMPLEXITY_METRICS) {
            final Long value = complexityValue(metrics, metric);
            if (value != null) {
                repository.addDistribution(metric, value);
            }
        }
        final FindingDetails findingDetails = findings(analysisId, analysis.reportJson(), analysis.legacy());
        findingDetails.findings().forEach(
            (key, occurrences) -> repository.addFinding(key.finderId(), key.issueType(), occurrences)
        );
        for (String issueType : ISSUE_TYPES) {
            final Long count = burden(metrics, analysis.legacy(), findingDetails, issueType);
            if (count != null) {
                repository.addDistribution(issueType + "_count", count);
            }
        }
        repository.addTotals(blocks, scripts, sprites, findingDetails.available(), hasBlockCategories);
        return true;
    }

    private boolean addBlockCategories(final Map<String, Double> metrics, final long totalBlocks) {
        if (countOrNull(metrics, "block_count") == null) {
            return false;
        }
        final Map<String, Long> categoryCounts = new LinkedHashMap<>();
        long coreBlocks = 0;
        for (String metric : CORE_BLOCK_CATEGORY_METRICS) {
            final Long categoryBlocks = countOrNull(metrics, metric);
            if (categoryBlocks == null || categoryBlocks > totalBlocks - coreBlocks) {
                return false;
            }
            categoryCounts.put(metric, categoryBlocks);
            coreBlocks += categoryBlocks;
        }
        categoryCounts.forEach((metric, blocks) -> {
            if (blocks > 0) {
                repository.addBlockCategory(metric, blocks);
            }
        });
        final long otherBlocks = totalBlocks - coreBlocks;
        if (otherBlocks > 0) {
            repository.addBlockCategory(OTHER_BLOCK_CATEGORY_METRIC, otherBlocks);
        }
        return true;
    }

    private FindingDetails findings(final long analysisId, final String reportJson, final boolean legacy) {
        if (reportJson == null || reportJson.isBlank()) {
            return FindingDetails.unavailable();
        }
        try {
            final JsonNode issues = mapper.readTree(reportJson).path("issues");
            if (!issues.isArray()) {
                return FindingDetails.unavailable();
            }
            final Map<FindingKey, Long> result = new HashMap<>();
            final String finderField = legacy ? "finder" : "finderId";
            for (JsonNode issue : issues) {
                final JsonNode finder = issue.get(finderField);
                final JsonNode type = issue.get("type");
                if (finder == null || !finder.isTextual() || type == null || !type.isTextual()) {
                    return FindingDetails.unavailable();
                }
                final String finderId = finder.asText().strip();
                final String issueType = type.asText().strip().toLowerCase(Locale.ROOT);
                if (
                    finderId.isEmpty() || finderId.length() > MAX_FINDER_ID_LENGTH || !ISSUE_TYPES.contains(issueType)
                ) {
                    return FindingDetails.unavailable();
                }
                result.merge(new FindingKey(finderId, issueType), 1L, Long::sum);
            }
            return new FindingDetails(true, Map.copyOf(result));
        }
        catch (Exception exception) {
            // A malformed historical report must not stop metrics already stored in normalized analysis_metric rows.
            log.warn("Could not read findings from analysis {} for public statistics", analysisId, exception);
            return FindingDetails.unavailable();
        }
    }

    private static Long burden(
        final Map<String, Double> metrics,
        final boolean legacy,
        final FindingDetails details,
        final String issueType
    ) {
        if (legacy) {
            final Long stored = countOrNull(metrics, LEGACY_ISSUE_METRICS.get(issueType));
            if (stored != null) {
                return stored;
            }
        }
        if (!details.available()) {
            return null;
        }
        return details.findings().entrySet().stream()
            .filter(entry -> issueType.equals(entry.getKey().issueType()))
            .mapToLong(Map.Entry::getValue).sum();
    }

    private static long count(final Map<String, Double> metrics, final String metric) {
        final Long value = countOrNull(metrics, metric);
        return value == null ? 0 : value;
    }

    private static Long countOrNull(final Map<String, Double> metrics, final String metric) {
        final Double value = metrics.get(metric);
        if (value == null || !Double.isFinite(value) || value < 0) {
            return null;
        }
        return (long) Math.floor(value);
    }

    private static Long complexityValue(final Map<String, Double> metrics, final String metric) {
        final Long current = countOrNull(metrics, metric);
        if (current != null || !"max_nested_block_count".equals(metric)) {
            return current;
        }
        // Analyses produced before the metric was renamed store the same nesting measure under this legacy name.
        return countOrNull(metrics, "nested_block_count");
    }

    record FindingKey(String finderId, String issueType) {
    }

    record FindingDetails(boolean available, Map<FindingKey, Long> findings) {

        static FindingDetails unavailable() {
            return new FindingDetails(false, Map.of());
        }
    }
}
