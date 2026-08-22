/*
 * Copyright (C) 2024-2026 LitterBox-Web contributors
 *
 * This file is part of LitterBox-Web.
 * Licenced under the EUPL-1.2 or later.
 *
 * SPDX-FileCopyrightText: 2024-2026 LitterBox-Web contributors
 * SPDX-License-Identifier: EUPL-1.2
 */
package de.uni_passau.fim.se2.litterbox_web.statistics;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.Comparator;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ConcurrentMap;
import java.util.stream.Collectors;
import java.util.stream.IntStream;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import de.uni_passau.fim.se2.litterbox_web.catalogue.PatternCatalogueService;
import de.uni_passau.fim.se2.litterbox_web.persistence.DatabaseWork;
import reactor.core.publisher.Mono;

/** Reads only the anonymous projection and applies public sample suppression before data leaves the server. */
@Service
public class PublicStatisticsService {

    public static final int DEFAULT_MINIMUM_SAMPLE_SIZE = 50;
    public static final Duration CACHE_TTL = Duration.ofMinutes(10);
    private static final int MAX_FINDINGS_PER_TYPE = 10;
    private final StatisticsRepository repository;
    private final DatabaseWork databaseWork;
    private final PatternCatalogueService catalogue;
    private final Clock clock;
    private final int minimumSampleSize;
    private CachedResponses cache;

    @Autowired
    public PublicStatisticsService(
        final StatisticsRepository repository,
        final DatabaseWork databaseWork,
        @Value(
            "${litterbox.statistics.minimum-public-sample-size:" + DEFAULT_MINIMUM_SAMPLE_SIZE + "}"
        ) final int minimumSampleSize
    ) {
        this(repository, databaseWork, new PatternCatalogueService(), Clock.systemUTC(), minimumSampleSize);
    }

    PublicStatisticsService(
        final StatisticsRepository repository,
        final DatabaseWork databaseWork,
        final PatternCatalogueService catalogue,
        final Clock clock,
        final int minimumSampleSize
    ) {
        this.repository = Objects.requireNonNull(repository, "repository");
        this.databaseWork = Objects.requireNonNull(databaseWork, "databaseWork");
        this.catalogue = Objects.requireNonNull(catalogue, "catalogue");
        this.clock = Objects.requireNonNull(clock, "clock");
        if (minimumSampleSize < 1) {
            throw new IllegalArgumentException("Minimum public sample size must be positive");
        }
        this.minimumSampleSize = minimumSampleSize;
    }

    public synchronized Mono<PublicStatistics> statistics(final Locale locale) {
        final Locale requestedLocale = Objects.requireNonNull(locale, "locale");
        final CachedResponses current = currentCache();
        return current.responsesByLanguage().computeIfAbsent(
            requestedLocale.getLanguage(),
            ignored -> current.snapshot().map(snapshot -> response(snapshot, requestedLocale)).cache()
        );
    }

    private CachedResponses currentCache() {
        final Instant now = clock.instant();
        if (cache != null && cache.expiresAt().isAfter(now)) {
            return cache;
        }
        final Object generation = new Object();
        final Mono<StatisticsRepository.Snapshot> snapshot = databaseWork.submit(repository::snapshot)
            .doOnError(ignored -> invalidate(generation))
            .cache();
        cache = new CachedResponses(generation, snapshot, new ConcurrentHashMap<>(), now.plus(CACHE_TTL));
        return cache;
    }

    private synchronized void invalidate(final Object generation) {
        if (cache != null && cache.generation() == generation) {
            cache = null;
        }
    }

    private PublicStatistics response(final StatisticsRepository.Snapshot snapshot, final Locale locale) {
        final StatisticsRepository.Totals totals = snapshot.totals();
        if (totals.projects() < minimumSampleSize) {
            return new PublicStatistics(
                false, Instant.EPOCH, null, List.of(), List.of(), List.of()
            );
        }
        return new PublicStatistics(
            true, totals.generatedAt(),
            new Totals(totals.projects(), totals.blocks(), totals.scripts(), totals.sprites()),
            distributions(snapshot.distributions()),
            findingGroups(snapshot.findings(), totals.findingProjects(), locale),
            categories(snapshot.categories(), totals.blockCategoryProjects())
        );
    }

    private List<Distribution> distributions(
        final List<StatisticsRepository.DistributionRow> rows
    ) {
        final Map<String, List<StatisticsRepository.DistributionRow>> byMetric = rows.stream().collect(
            Collectors.groupingBy(StatisticsRepository.DistributionRow::metric)
        );
        return StatisticsProjector.PUBLIC_DISTRIBUTION_METRICS.stream()
            .map(metric -> distribution(metric, byMetric.getOrDefault(metric, List.of())))
            .flatMap(Optional::stream)
            .toList();
    }

    /**
     * Publishes robust summaries and a fixed-size smooth shape, never the underlying value-frequency rows. Values are
     * laid out evenly on the log1p scale, and Gaussian kernel density is weighted by each anonymous frequency.
     */
    private Optional<Distribution> distribution(
        final String metric, final List<StatisticsRepository.DistributionRow> rows
    ) {
        final List<StatisticsRepository.DistributionRow> values = rows.stream()
            .filter(row -> row.value() >= 0 && row.count() > 0)
            .sorted(Comparator.comparingLong(StatisticsRepository.DistributionRow::value))
            .toList();
        final long sampleSize = values.stream().mapToLong(StatisticsRepository.DistributionRow::count).sum();
        if (values.isEmpty() || sampleSize == 0) {
            return Optional.empty();
        }
        final long minimum = values.getFirst().value();
        final long p25 = quantile(values, sampleSize, 0.25);
        final long median = quantile(values, sampleSize, 0.5);
        final long p75 = quantile(values, sampleSize, 0.75);
        final long p95 = quantile(values, sampleSize, 0.95);
        final long displayMaximum = displayMaximum(values, sampleSize, p95);
        final long zeroCount = values.stream().filter(row -> row.value() == 0)
            .mapToLong(StatisticsRepository.DistributionRow::count).sum();
        return Optional.of(
            new Distribution(
                metric, sampleSize, minimum, p25, median, p75, p95, displayMaximum, zeroCount,
                prevalence(zeroCount, sampleSize),
                points(values, minimum, displayMaximum)
            )
        );
    }

    private static long quantile(
        final List<StatisticsRepository.DistributionRow> values, final long sampleSize, final double percentile
    ) {
        final long target = Math.max(1, (long) Math.ceil(sampleSize * percentile));
        long cumulative = 0;
        for (StatisticsRepository.DistributionRow row : values) {
            cumulative += row.count();
            if (cumulative >= target) {
                return row.value();
            }
        }
        return values.getLast().value();
    }

    private static long displayMaximum(
        final List<StatisticsRepository.DistributionRow> values, final long sampleSize, final long p95
    ) {
        final long floorRankP99 = valueAtRank(values, Math.max(1, (long) Math.floor(sampleSize * 0.99)));
        return Math.max(p95, floorRankP99);
    }

    private static long valueAtRank(final List<StatisticsRepository.DistributionRow> values, final long target) {
        long cumulative = 0;
        for (StatisticsRepository.DistributionRow row : values) {
            cumulative += row.count();
            if (cumulative >= target) {
                return row.value();
            }
        }
        return values.getLast().value();
    }

    private static List<CurvePoint> points(
        final List<StatisticsRepository.DistributionRow> values,
        final long minimum,
        final long displayMaximum
    ) {
        final List<StatisticsRepository.DistributionRow> visibleValues = values.stream()
            .filter(row -> row.value() <= displayMaximum)
            .toList();
        final long visibleSampleSize = visibleValues.stream()
            .mapToLong(StatisticsRepository.DistributionRow::count)
            .sum();
        final double lower = Math.log1p(minimum);
        final double upper = Math.log1p(Math.max(minimum, displayMaximum));
        final double bandwidth = bandwidth(visibleValues, visibleSampleSize);
        final List<Double> positions = IntStream.range(0, 41)
            .mapToDouble(index -> lower + (upper - lower) * index / 40.0)
            .boxed().toList();
        final List<Double> densities = positions.stream()
            .map(position -> density(visibleValues, visibleSampleSize, position, bandwidth))
            .toList();
        final double maximum = densities.stream().mapToDouble(Double::doubleValue).max().orElse(0.0);
        return IntStream.range(0, positions.size()).mapToObj(index -> {
            final double value;
            if (index == 0) {
                value = minimum;
            }
            else if (index == positions.size() - 1) {
                value = displayMaximum;
            }
            else {
                value = Math.max(0.0, Math.expm1(positions.get(index)));
            }
            return new CurvePoint(value, maximum == 0.0 ? 0.0 : densities.get(index) / maximum);
        }).toList();
    }

    private static double bandwidth(final List<StatisticsRepository.DistributionRow> values, final long sampleSize) {
        final double mean = values.stream().mapToDouble(
            row -> Math.log1p(row.value()) * row.count()
        ).sum() / sampleSize;
        final double variance = values.stream().mapToDouble(row -> {
            final double difference = Math.log1p(row.value()) - mean;
            return difference * difference * row.count();
        }).sum() / sampleSize;
        final double silverman = 1.06 * Math.sqrt(variance) * Math.pow(sampleSize, -0.2);
        return Double.isFinite(silverman) && silverman > 0.0 ? silverman : 0.25;
    }

    private static double density(
        final List<StatisticsRepository.DistributionRow> values,
        final long sampleSize,
        final double position,
        final double bandwidth
    ) {
        final double denominator = sampleSize * bandwidth * Math.sqrt(2.0 * Math.PI);
        return values.stream().mapToDouble(row -> {
            final double z = (position - Math.log1p(row.value())) / bandwidth;
            return row.count() * Math.exp(-0.5 * z * z);
        }).sum() / denominator;
    }

    private List<FindingGroup> findingGroups(
        final List<StatisticsRepository.FindingRow> rows, final long projects, final Locale locale
    ) {
        return rows.stream()
            .filter(row -> StatisticsProjector.ISSUE_TYPES.contains(row.issueType()))
            .collect(Collectors.groupingBy(StatisticsRepository.FindingRow::issueType)).entrySet().stream()
            .sorted(Map.Entry.comparingByKey()).map(
                entry -> new FindingGroup(
                    entry.getKey(), entry.getValue().stream()
                        .sorted(
                            Comparator.comparingLong(StatisticsRepository.FindingRow::projectsAffected).reversed()
                                .thenComparing(
                                    Comparator.comparingLong(StatisticsRepository.FindingRow::occurrences).reversed()
                                )
                                .thenComparing(StatisticsRepository.FindingRow::finderId)
                        )
                        .limit(MAX_FINDINGS_PER_TYPE)
                        .map(
                            row -> new Finding(
                                row.finderId(), finderName(row.finderId(), locale), row.projectsAffected(),
                                row.occurrences(),
                                prevalence(row.projectsAffected(), projects)
                            )
                        ).toList()
                )
            ).toList();
    }

    private List<BlockCategory> categories(
        final List<StatisticsRepository.CategoryRow> rows, final long projects
    ) {
        final Map<String, StatisticsRepository.CategoryRow> byMetric = rows.stream().collect(
            Collectors.toMap(StatisticsRepository.CategoryRow::metric, row -> row)
        );
        final long classifiedBlocks = StatisticsProjector.BLOCK_CATEGORY_METRICS.stream()
            .map(byMetric::get)
            .filter(Objects::nonNull)
            .mapToLong(StatisticsRepository.CategoryRow::blocks)
            .sum();
        return StatisticsProjector.BLOCK_CATEGORY_METRICS.stream().map(metric -> {
            final StatisticsRepository.CategoryRow row = byMetric.get(metric);
            final long projectsUsing = row == null ? 0 : row.projectsUsing();
            final long blocks = row == null ? 0 : row.blocks();
            return new BlockCategory(
                metric, projectsUsing, prevalence(projectsUsing, projects), blocks,
                prevalence(blocks, classifiedBlocks)
            );
        }).toList();
    }

    private String finderName(final String finderId, final Locale locale) {
        try {
            return catalogue.entry(finderId, locale).name();
        }
        catch (IllegalArgumentException ignored) {
            return finderId;
        }
    }

    private static double prevalence(final long numerator, final long denominator) {
        return denominator == 0 ? 0.0 : (double) numerator / denominator;
    }

    public record PublicStatistics(
        boolean available,
        Instant generatedAt,
        Totals totals,
        List<Distribution> distributions,
        List<FindingGroup> findingGroups,
        List<BlockCategory> blockCategories
    ) {
    }

    public record Totals(long projects, long blocks, long scripts, long sprites) {
    }

    public record Distribution(
        String metric,
        long sampleSize,
        long minimum,
        long p25,
        long median,
        long p75,
        long p95,
        long displayMaximum,
        long zeroCount,
        double zeroPrevalence,
        List<CurvePoint> points
    ) {
    }

    /** A normalized density value on the chart's raw-count x axis. */
    public record CurvePoint(double value, double relativeDensity) {
    }

    public record FindingGroup(String type, List<Finding> findings) {
    }

    public record Finding(String finderId, String name, long projectsAffected, long occurrences, double prevalence) {
    }

    public record BlockCategory(
        String metric, long projectsUsing, double prevalence, long blocks, double blockShare
    ) {
    }

    private record CachedResponses(
        Object generation,
        Mono<StatisticsRepository.Snapshot> snapshot,
        ConcurrentMap<String, Mono<PublicStatistics>> responsesByLanguage,
        Instant expiresAt
    ) {
    }
}
