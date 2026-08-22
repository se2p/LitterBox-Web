/*
 * Copyright (C) 2024-2026 LitterBox-Web contributors
 *
 * This file is part of LitterBox-Web.
 * Licenced under the EUPL-1.2 or later.
 *
 * SPDX-FileCopyrightText: 2024-2026 LitterBox-Web contributors
 * SPDX-License-Identifier: EUPL-1.2
 */
package de.uni_passau.fim.se2.litterbox_web.migration;

import java.io.IOException;
import java.io.InputStream;
import java.nio.file.Files;
import java.nio.file.LinkOption;
import java.nio.file.Path;
import java.security.MessageDigest;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.HexFormat;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.TreeMap;
import java.util.TreeSet;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.MapperFeature;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.SerializationFeature;

import de.uni_passau.fim.se2.litterbox.analytics.ProgramMetricAnalyzer;

final class LegacyMigrationPlanner {

    private static final String RECONCILIATION_POLICY_VERSION = "legacy-reconciliation-v1";

    /** Package-private so that a test can hold it against the ceiling {@code single_project} applies to itself. */
    static final int MAX_REPORT_BYTES = 10 * 1024 * 1024;
    private final ObjectMapper mapper = configuredMapper();
    private final DiagnosticAccumulator diagnostics = new DiagnosticAccumulator();

    LegacyMigrationModel.PreparedMigration prepare(
        final LegacyMigrationModel.SourceData source,
        final LegacyMigrationOptions options
    ) {
        final Map<Long, LegacyMigrationModel.Programme> programmes = indexProgrammes(source.programmes());
        final StatisticsResult statistics = validateStatistics(
            source.statistics(), programmes
        );
        validateFeedback(source.feedback(), programmes);
        validateLengths(source, options);
        final TokenResult tokens = resolveTokens(source.programmes(), options.tokenResolutions());
        final QuestionResult questions = resolveQuestions(source, programmes, options.questionResolutions());
        final SchoolResult schools = mapSchools(source, options.approvedSchoolTypes());
        final ReportResult reports = loadReports(source.programmes(), options.legacyReportRoot());
        final MetricResult metrics = mergeMetrics(source.programmes(), statistics.rows(), reports.metrics());
        final ArtifactResult artifacts = inspectArtifacts(source.programmes(), options.sourceMappings());
        diagnostics.throwIfPresent();
        return new LegacyMigrationModel.PreparedMigration(
            source, tokens.shareTokens(), schools.schoolTypes(), questions.programmeIds(), metrics.values(),
            artifacts.artifacts(), reports.reports(), tokens.summary(), questions.summary(), artifacts.summary(),
            reports.summary(), schools.privacy(),
            metrics.missingCoreNames(), metrics.outsideStaticView(),
            new LegacyMigrationReport.Reconciliations(
                RECONCILIATION_POLICY_VERSION, statistics.usernameMismatches(), metrics.conflicts()
            ),
            LegacyChecksums.reports(source.programmes(), reports.reports()),
            LegacyChecksums.metrics(metrics.values())
        );
    }

    private Map<Long, LegacyMigrationModel.Programme> indexProgrammes(
        final List<LegacyMigrationModel.Programme> programmes
    ) {
        final Map<Long, LegacyMigrationModel.Programme> result = new LinkedHashMap<>();
        for (LegacyMigrationModel.Programme programme : programmes) {
            if (result.put(programme.id(), programme) != null) {
                diagnostics.add("DUPLICATE_IDENTIFIER", "programme", "id", "identifier is not unique");
            }
        }
        return result;
    }

    private StatisticsResult validateStatistics(
        final List<LegacyMigrationModel.Statistics> rows,
        final Map<Long, LegacyMigrationModel.Programme> programmes
    ) {
        final Map<Long, LegacyMigrationModel.Statistics> result = new HashMap<>();
        for (LegacyMigrationModel.Statistics row : rows) {
            if (!programmes.containsKey(row.programmeId())) {
                diagnostics.add("MISSING_PROGRAMME_REFERENCE", "statistiken", "program", "reference is absent");
            }
            if (result.put(row.programmeId(), row) != null) {
                diagnostics.add("DUPLICATE_PROGRAMME_REFERENCE", "statistiken", "program", "reference is not unique");
            }
        }
        final long mismatches = rows.stream().filter(row -> {
            final LegacyMigrationModel.Programme programme = programmes.get(row.programmeId());
            return programme != null && nonBlank(row.author()) && nonBlank(programme.scratchUsername())
                && !row.author().equals(programme.scratchUsername());
        }).count();
        return new StatisticsResult(Map.copyOf(result), mismatches);
    }

    private boolean nonBlank(final String value) {
        return value != null && !value.isBlank();
    }

    private void validateFeedback(
        final List<LegacyMigrationModel.Feedback> rows,
        final Map<Long, LegacyMigrationModel.Programme> programmes
    ) {
        final Set<String> unique = new HashSet<>();
        for (LegacyMigrationModel.Feedback row : rows) {
            if (!programmes.containsKey(row.programmeId())) {
                diagnostics.add("MISSING_PROGRAMME_REFERENCE", "feedback", "program", "reference is absent");
            }
            if (!Set.of(-1, 0, 1).contains(row.reaction())) {
                diagnostics.add("INCOMPATIBLE_VALUE", "feedback", "reaction", "expected -1, 0, or 1");
            }
            final String key = row.programmeId() + "\u0000" + row.pattern();
            if (!unique.add(key)) {
                diagnostics.add("DUPLICATE_FEEDBACK", "feedback", "pattern", "programme and pattern are not unique");
            }
        }
    }

    private void validateLengths(
        final LegacyMigrationModel.SourceData source,
        final LegacyMigrationOptions options
    ) {
        options.approvedSchoolTypes().values().forEach(
            value -> checkLength(
                value, 64, "MAPPED_VALUE_TOO_LONG", "programme", "institution"
            )
        );
        options.tokenResolutions().values().forEach(
            value -> checkLength(
                value, 43, "RESOLUTION_TOO_LONG", "programme", "token"
            )
        );
        for (LegacyMigrationModel.Programme row : source.programmes()) {
            checkLength(row.filename(), 255, "VALUE_TOO_LONG", "programme", "file");
            checkLength(row.scratchUsername(), 255, "VALUE_TOO_LONG", "programme", "scratchUsername");
        }
        for (LegacyMigrationModel.Statistics row : source.statistics()) {
            checkLength(row.author(), 255, "VALUE_TOO_LONG", "statistiken", "author");
        }
        for (LegacyMigrationModel.Question row : source.questions()) {
            checkLength(row.question(), 500, "VALUE_TOO_LONG", "fragen", "question");
            checkLength(row.answer(), 500, "VALUE_TOO_LONG", "fragen", "answer");
            validateCorrect(row.correct());
        }
    }

    private void validateCorrect(final String value) {
        if (value == null) {
            return;
        }
        final String normalized = value.trim().toLowerCase(Locale.ROOT);
        if (!Set.of("0", "1", "false", "true").contains(normalized)) {
            diagnostics.add("INCOMPATIBLE_VALUE", "fragen", "correct", "expected null, 0, 1, false, or true");
        }
    }

    private void checkLength(
        final String value, final int maximum, final String code, final String table, final String column
    ) {
        if (value != null && value.length() > maximum) {
            diagnostics.add(code, table, column, "value exceeds target capacity");
        }
    }

    private TokenResult resolveTokens(
        final List<LegacyMigrationModel.Programme> rows,
        final Map<Long, String> resolutions
    ) {
        final Map<String, List<LegacyMigrationModel.Programme>> exact = new TreeMap<>();
        final Map<String, List<LegacyMigrationModel.Programme>> folded = new TreeMap<>();
        indexTokens(rows, exact, folded);
        validateTokenResolutionIds(rows, resolutions);
        final Set<String> reserved = reserveTokens(folded, resolutions);
        final TokenAllocation allocation = allocateTokens(folded, resolutions, reserved);
        final Set<Long> affected = collisionIds(folded);
        final long exactGroups = exact.values().stream().filter(group -> group.size() > 1).count();
        final long caseGroups = folded.values().stream().filter(this::hasDistinctCaseVariants).count();
        validateResolvedTokenUniqueness(allocation.shareTokens());
        return new TokenResult(
            Map.copyOf(allocation.shareTokens()),
            new LegacyMigrationReport.TokenCollisions(
                exactGroups, caseGroups, affected.size(), allocation.generated(), allocation.explicit()
            )
        );
    }

    private void indexTokens(
        final List<LegacyMigrationModel.Programme> rows,
        final Map<String, List<LegacyMigrationModel.Programme>> exact,
        final Map<String, List<LegacyMigrationModel.Programme>> folded
    ) {
        for (LegacyMigrationModel.Programme row : rows) {
            exact.computeIfAbsent(row.token(), ignored -> new ArrayList<>()).add(row);
            folded.computeIfAbsent(row.token().toLowerCase(Locale.ROOT), ignored -> new ArrayList<>()).add(row);
        }
    }

    private void validateTokenResolutionIds(
        final List<LegacyMigrationModel.Programme> rows,
        final Map<Long, String> resolutions
    ) {
        final Set<Long> ids = rows.stream().map(LegacyMigrationModel.Programme::id)
            .collect(java.util.stream.Collectors.toSet());
        resolutions.keySet().stream().filter(id -> !ids.contains(id)).forEach(
            ignored -> diagnostics.add("UNKNOWN_TOKEN_RESOLUTION", "programme", "token", "resolution has no source row")
        );
    }

    private Set<String> reserveTokens(
        final Map<String, List<LegacyMigrationModel.Programme>> folded,
        final Map<Long, String> resolutions
    ) {
        final Set<String> reserved = new HashSet<>();
        for (List<LegacyMigrationModel.Programme> group : folded.values()) {
            group.sort(java.util.Comparator.comparingLong(LegacyMigrationModel.Programme::id));
            for (int index = 0; index < group.size(); index++) {
                final LegacyMigrationModel.Programme row = group.get(index);
                final String resolution = resolutions.get(row.id());
                if (resolution != null) {
                    reserved.add(resolution.toLowerCase(Locale.ROOT));
                }
                else if (group.size() == 1 || index == 0) {
                    reserved.add(row.token().toLowerCase(Locale.ROOT));
                }
            }
        }
        return reserved;
    }

    private TokenAllocation allocateTokens(
        final Map<String, List<LegacyMigrationModel.Programme>> folded,
        final Map<Long, String> resolutions,
        final Set<String> reserved
    ) {
        final Map<Long, String> shareTokens = new LinkedHashMap<>();
        long generated = 0;
        long explicit = 0;
        for (List<LegacyMigrationModel.Programme> group : folded.values()) {
            final TokenAllocation groupAllocation = allocateGroup(group, resolutions, reserved, shareTokens);
            generated += groupAllocation.generated();
            explicit += groupAllocation.explicit();
        }
        return new TokenAllocation(shareTokens, generated, explicit);
    }

    private TokenAllocation allocateGroup(
        final List<LegacyMigrationModel.Programme> group,
        final Map<Long, String> resolutions,
        final Set<String> reserved,
        final Map<Long, String> shareTokens
    ) {
        if (group.size() == 1) {
            allocateUniqueToken(group.getFirst(), resolutions, shareTokens);
            return TokenAllocation.empty();
        }
        long generated = 0;
        long explicit = 0;
        for (int index = 0; index < group.size(); index++) {
            final LegacyMigrationModel.Programme row = group.get(index);
            final String resolution = resolutions.get(row.id());
            if (resolution != null) {
                shareTokens.put(row.id(), resolution);
                explicit++;
            }
            else if (index == 0) {
                shareTokens.put(row.id(), row.token());
            }
            else {
                shareTokens.put(row.id(), generatedToken(row, reserved));
                generated++;
            }
        }
        return new TokenAllocation(Map.of(), generated, explicit);
    }

    private void allocateUniqueToken(
        final LegacyMigrationModel.Programme row,
        final Map<Long, String> resolutions,
        final Map<Long, String> shareTokens
    ) {
        if (resolutions.containsKey(row.id())) {
            diagnostics.add("UNNECESSARY_TOKEN_RESOLUTION", "programme", "token", "unique token must be preserved");
        }
        shareTokens.put(row.id(), row.token());
    }

    private String generatedToken(final LegacyMigrationModel.Programme row, final Set<String> used) {
        int attempt = 0;
        while (true) {
            final String seed = RECONCILIATION_POLICY_VERSION + "\u0000" + row.id() + "\u0000" + row.token()
                + "\u0000" + attempt;
            final String candidate = "legacy-"
                + HexFormat.of().formatHex(LegacyChecksums.digest(seed)).substring(0, 36);
            if (used.add(candidate.toLowerCase(Locale.ROOT))) {
                return candidate;
            }
            attempt++;
        }
    }

    private Set<Long> collisionIds(final Map<String, List<LegacyMigrationModel.Programme>> folded) {
        final Set<Long> result = new HashSet<>();
        folded.values().stream().filter(group -> group.size() > 1).flatMap(List::stream)
            .map(LegacyMigrationModel.Programme::id).forEach(result::add);
        return result;
    }

    private boolean hasDistinctCaseVariants(final List<LegacyMigrationModel.Programme> rows) {
        return rows.stream().map(LegacyMigrationModel.Programme::token).distinct().count() > 1;
    }

    private void validateResolvedTokenUniqueness(final Map<Long, String> shareTokens) {
        final Set<String> seen = new HashSet<>();
        for (String token : shareTokens.values()) {
            if (token == null || token.isBlank()) {
                diagnostics.add("INVALID_TOKEN_RESOLUTION", "programme", "token", "target token is blank");
            }
            else if (!seen.add(token.toLowerCase(Locale.ROOT))) {
                diagnostics.add("TARGET_TOKEN_COLLISION", "programme", "token", "resolved tokens still collide");
            }
        }
    }

    private QuestionResult resolveQuestions(
        final LegacyMigrationModel.SourceData source,
        final Map<Long, LegacyMigrationModel.Programme> programmes,
        final Map<Long, Long> resolutions
    ) {
        final Map<String, List<Long>> filenames = new HashMap<>();
        source.programmes().stream().filter(row -> row.filename() != null).forEach(
            row -> filenames
                .computeIfAbsent(row.filename().toLowerCase(Locale.ROOT), ignored -> new ArrayList<>()).add(row.id())
        );
        final Map<Long, Long> result = new LinkedHashMap<>();
        long automatic = 0;
        long resolved = 0;
        long ambiguous = 0;
        long unmatched = 0;
        for (LegacyMigrationModel.Question question : source.questions()) {
            final List<Long> candidates = filenames
                .getOrDefault(question.programName().toLowerCase(Locale.ROOT), List.of());
            final Long resolution = resolutions.get(question.id());
            if (candidates.size() == 1 && resolution == null) {
                result.put(question.id(), candidates.get(0));
                automatic++;
            }
            else {
                ambiguous += candidates.size() > 1 ? 1 : 0;
                unmatched += candidates.isEmpty() ? 1 : 0;
                resolved += resolution == null ? 0 : 1;
                validateQuestionResolution(question, candidates, resolution, programmes);
                if (resolution != null) {
                    result.put(question.id(), resolution);
                }
            }
        }
        resolutions.keySet().stream().filter(id -> source.questions().stream().noneMatch(row -> row.id() == id))
            .forEach(
                ignored -> diagnostics
                    .add("UNKNOWN_QUESTION_RESOLUTION", "fragen", "id", "resolution has no source row")
            );
        final LegacyMigrationReport.QuestionJoins summary = new LegacyMigrationReport.QuestionJoins(
            source.questions().size(), automatic, resolved, ambiguous, unmatched, source.questions().size()
        );
        return new QuestionResult(Map.copyOf(result), summary);
    }

    private void validateQuestionResolution(
        final LegacyMigrationModel.Question question,
        final List<Long> candidates,
        final Long resolution,
        final Map<Long, LegacyMigrationModel.Programme> programmes
    ) {
        if (resolution == null) {
            final String detail = candidates.isEmpty() ? "filename has no programme"
                : "filename has multiple programmes";
            diagnostics.add("QUESTION_RESOLUTION_REQUIRED", "fragen", "programName", detail);
        }
        else if (!programmes.containsKey(resolution)) {
            diagnostics.add("INVALID_QUESTION_RESOLUTION", "fragen", "programName", "resolved programme is absent");
        }
        else if (candidates.size() == 1 && !Objects.equals(candidates.get(0), resolution)) {
            diagnostics
                .add("INVALID_QUESTION_RESOLUTION", "fragen", "programName", "resolution contradicts unique join");
        }
    }

    private SchoolResult mapSchools(
        final LegacyMigrationModel.SourceData source,
        final Map<String, String> approved
    ) {
        final Map<Long, String> schoolTypes = new LinkedHashMap<>();
        final Map<String, Long> unmapped = new HashMap<>();
        long mapped = 0;
        for (LegacyMigrationModel.Programme row : source.programmes()) {
            final String target = row.institution() == null ? null : approved.get(row.institution());
            if (target != null) {
                schoolTypes.put(row.id(), target);
                mapped++;
            }
            else if (row.institution() != null) {
                unmapped.merge(row.institution(), 1L, Long::sum);
            }
        }
        final long unmappedRows = unmapped.values().stream().mapToLong(Long::longValue).sum();
        final List<Long> frequencies = unmapped.values().stream().sorted(java.util.Comparator.reverseOrder()).toList();
        final LegacyMigrationReport.Privacy privacy = new LegacyMigrationReport.Privacy(
            countProgrammeValues(source.programmes(), ValueKind.IP)
                + countContactValues(source.contacts(), ValueKind.IP),
            countProgrammeValues(source.programmes(), ValueKind.GENDER)
                + countContactValues(source.contacts(), ValueKind.GENDER),
            countContactValues(source.contacts(), ValueKind.AGE), mapped, unmappedRows, unmapped.size(), frequencies
        );
        return new SchoolResult(Map.copyOf(schoolTypes), privacy);
    }

    private long countProgrammeValues(final List<LegacyMigrationModel.Programme> rows, final ValueKind kind) {
        return rows.stream().filter(row -> switch (kind) {
            case IP -> row.ip() != null;
            case GENDER -> row.gender() != null;
            case AGE -> false;
        }).count();
    }

    private long countContactValues(final List<LegacyMigrationModel.Contact> rows, final ValueKind kind) {
        return rows.stream().filter(row -> switch (kind) {
            case IP -> row.ip() != null;
            case GENDER -> row.gender() != null;
            case AGE -> row.age() != null;
        }).count();
    }

    private MetricResult mergeMetrics(
        final List<LegacyMigrationModel.Programme> programmes,
        final Map<Long, LegacyMigrationModel.Statistics> statistics,
        final Map<Long, Map<String, Double>> reports
    ) {
        final List<String> coreNames = new ProgramMetricAnalyzer().getMetricNames().stream().sorted().toList();
        final Set<String> importedNames = new TreeSet<>();
        final Map<Long, Map<String, Double>> result = new LinkedHashMap<>();
        final Map<String, Long> conflicts = new TreeMap<>();
        for (LegacyMigrationModel.Programme programme : programmes) {
            final Map<String, Double> merged = new TreeMap<>();
            final LegacyMigrationModel.Statistics statistic = statistics.get(programme.id());
            if (statistic != null) {
                merged.putAll(statistic.metrics());
            }
            final Map<String, Double> reportMetrics = reports.get(programme.id());
            if (reportMetrics != null) {
                reportMetrics.forEach((name, value) -> {
                    final Double statisticValue = merged.put(name, value);
                    if (statisticValue != null && Double.compare(statisticValue, value) != 0) {
                        conflicts.merge(name, 1L, Long::sum);
                    }
                });
            }
            importedNames.addAll(merged.keySet());
            result.put(programme.id(), Map.copyOf(merged));
        }
        final List<String> missing = coreNames.stream().filter(name -> !importedNames.contains(name)).toList();
        final List<String> outside = coreNames.stream()
            .filter(name -> !LegacySchemaContract.STATIC_METRIC_NAMES.contains(name)).toList();
        return new MetricResult(Map.copyOf(result), missing, outside, Map.copyOf(conflicts));
    }

    private Map<String, Double> reportMetrics(
        final JsonNode report,
        final List<String> coreNames
    ) {
        final Map<String, Double> values = new TreeMap<>();
        if (report == null) {
            return Map.of();
        }
        final JsonNode metrics = report.path("metrics");
        if (!metrics.isObject()) {
            return Map.of();
        }
        for (String name : coreNames) {
            final JsonNode value = metrics.get(name);
            if (value != null && !value.isNumber()) {
                diagnostics.add("INCOMPATIBLE_REPORT_METRIC", "programme", "litterbox", "core metric is not numeric");
            }
            else if (value != null) {
                values.put(name, value.doubleValue());
            }
        }
        return Map.copyOf(values);
    }

    /**
     * Reads each programme's report from the directory the old site wrote it to. The {@code litterbox} column names
     * that file; it has never held the report, so a migration that copies the column into {@code report_json} moves a
     * filename and leaves every finding behind.
     *
     * <p>
     * A report that is not there, or is not a report, is counted and left out: that costs one project its findings,
     * where failing the whole import over it would cost every project everything.
     */
    private ReportResult loadReports(
        final List<LegacyMigrationModel.Programme> programmes,
        final Path root
    ) {
        final Map<Long, LegacyMigrationModel.ReportSnapshot> result = new LinkedHashMap<>();
        final Map<Long, Map<String, Double>> metrics = new LinkedHashMap<>();
        final List<String> coreNames = new ProgramMetricAnalyzer().getMetricNames().stream().sorted().toList();
        long referenced = 0;
        long missing = 0;
        long unreadable = 0;
        long oversized = 0;
        long without = 0;
        for (LegacyMigrationModel.Programme programme : programmes) {
            final String reference = programme.reportReference();
            if (reference == null || reference.isBlank()) {
                without++;
                continue;
            }
            referenced++;
            final Path file = resolveReport(root, reference);
            if (file == null || !Files.isRegularFile(file, LinkOption.NOFOLLOW_LINKS)) {
                missing++;
                continue;
            }
            final LoadedReport report = readReport(file, coreNames);
            if (report == null) {
                unreadable++;
                continue;
            }
            // The metrics are numbers this has already extracted, and they are what the measurements are drawn from,
            // so they are kept whatever the report weighs. Only the body is left behind.
            metrics.put(programme.id(), report.metrics());
            if (isTooLargeToServe(report.snapshot())) {
                oversized++;
                continue;
            }
            result.put(programme.id(), report.snapshot());
        }
        final LegacyMigrationReport.Reports summary = new LegacyMigrationReport.Reports(
            referenced, result.size(), missing, unreadable, oversized, without
        );
        return new ReportResult(Map.copyOf(result), Map.copyOf(metrics), summary);
    }

    /**
     * Whether a report is larger than a reader could be served. The whole body is parsed into memory on every read of
     * the submission it belongs to, so importing one the service would refuse to produce buys a row that cannot be
     * opened; the old site had no such ceiling and a handful of its reports are many times over it.
     *
     * <p>
     * Counted rather than refused, for the reason a missing report is: one project loses the findings it can no longer
     * be shown, where stopping the import over it would cost every project everything. The count is in the report and
     * in what the command logs, so nothing goes quietly.
     *
     * <p>
     * The number is the one {@code single_project} holds itself to. It is written out again here because this module
     * may only depend on {@code persistence} and so cannot read it from there, and a test fails if the two drift.
     */
    private boolean isTooLargeToServe(final LegacyMigrationModel.ReportSnapshot report) {
        return report.byteSize() > MAX_REPORT_BYTES;
    }

    /** Resolves one legacy filename inside the report directory, or {@code null} when it climbs out of it. */
    private Path resolveReport(final Path root, final String reference) {
        final Path resolved = LegacyPaths.resolveInsideDirectory(root, reference);
        if (resolved == null) {
            diagnostics.add("UNSAFE_REPORT_REFERENCE", "programme", "litterbox", "reference leaves its directory");
        }
        return resolved;
    }

    /** Parses one report at a time, retaining only its path, byte identity, and metric values. */
    private LoadedReport readReport(final Path file, final List<String> coreNames) {
        try (InputStream input = Files.newInputStream(file, LinkOption.NOFOLLOW_LINKS)) {
            final JsonNode root = mapper.readTree(input);
            if (!root.isObject()) {
                return null;
            }
            final FileIdentity identity = fileIdentity(file);
            return new LoadedReport(
                new LegacyMigrationModel.ReportSnapshot(file, identity.sha256(), identity.byteSize()),
                reportMetrics(root, coreNames)
            );
        }
        catch (IOException exception) {
            return null;
        }
    }

    private FileIdentity fileIdentity(final Path file) throws IOException {
        final MessageDigest digest = LegacyChecksums.digest();
        long size = 0;
        try (InputStream input = Files.newInputStream(file, LinkOption.NOFOLLOW_LINKS)) {
            final byte[] buffer = new byte[8192];
            int read;
            while ((read = input.read(buffer)) >= 0) {
                if (read > 0) {
                    digest.update(buffer, 0, read);
                    size += read;
                }
            }
        }
        return new FileIdentity(digest.digest(), size);
    }

    private ArtifactResult inspectArtifacts(
        final List<LegacyMigrationModel.Programme> programmes,
        final Map<Long, LegacyMigrationOptions.SourceMapping> mappings
    ) {
        final Map<Long, LegacyMigrationModel.Artifact> result = new LinkedHashMap<>();
        long mapped = 0;
        long matched = 0;
        long mismatched = 0;
        long missing = 0;
        long without = 0;
        long bytes = 0;
        final Set<Long> programmeIds = programmes.stream().map(LegacyMigrationModel.Programme::id)
            .collect(java.util.stream.Collectors.toSet());
        for (LegacyMigrationModel.Programme programme : programmes) {
            final LegacyMigrationOptions.SourceMapping mapping = mappings.get(programme.id());
            if (mapping == null) {
                without++;
                result.put(programme.id(), unavailableArtifact(programme, null, "NO_EXPLICIT_MAPPING"));
            }
            else if (!Files.isRegularFile(mapping.path(), LinkOption.NOFOLLOW_LINKS)) {
                mapped++;
                missing++;
                result.put(programme.id(), unavailableArtifact(programme, mapping.path(), "MAPPED_FILE_UNAVAILABLE"));
            }
            else {
                mapped++;
                final ArtifactInspection inspection = inspectFile(mapping);
                if (inspection.matches()) {
                    matched++;
                    bytes += inspection.byteSize();
                    result.put(programme.id(), verifiedArtifact(programme, mapping.path(), inspection));
                }
                else {
                    mismatched++;
                    result.put(programme.id(), unavailableArtifact(programme, mapping.path(), "CHECKSUM_MISMATCH"));
                }
            }
        }
        final long unknown = mappings.keySet().stream().filter(id -> !programmeIds.contains(id)).count();
        final long unavailable = mismatched + missing + without;
        final LegacyMigrationReport.Artifacts summary = new LegacyMigrationReport.Artifacts(
            mapped, matched, mismatched, missing, without, unknown, unavailable, bytes
        );
        return new ArtifactResult(Map.copyOf(result), summary);
    }

    private ArtifactInspection inspectFile(final LegacyMigrationOptions.SourceMapping mapping) {
        final MessageDigest digest = LegacyChecksums.digest();
        long size = 0;
        try (InputStream input = Files.newInputStream(mapping.path(), LinkOption.NOFOLLOW_LINKS)) {
            final byte[] buffer = new byte[8192];
            int read;
            while ((read = input.read(buffer)) >= 0) {
                if (read > 0) {
                    digest.update(buffer, 0, read);
                    size += read;
                }
            }
        }
        catch (IOException exception) {
            throw new LegacyMigrationException("Explicit source mapping could not be inspected", exception);
        }
        final byte[] actual = digest.digest();
        final boolean matches = MessageDigest.isEqual(actual, HexFormat.of().parseHex(mapping.expectedSha256()));
        return new ArtifactInspection(actual, size, matches);
    }

    private LegacyMigrationModel.Artifact verifiedArtifact(
        final LegacyMigrationModel.Programme programme,
        final java.nio.file.Path path,
        final ArtifactInspection inspection
    ) {
        final Map<String, Object> manifest = manifest(programme, "AVAILABLE", "EXPLICIT_ID_PATH_SHA256");
        manifest.put("sourcePathReference", path.toString());
        manifest.put("verifiedSha256", HexFormat.of().formatHex(inspection.sha256()));
        return new LegacyMigrationModel.Artifact(
            programme.id(), LegacyMigrationModel.Availability.VERIFIED, path, inspection.sha256(),
            inspection.byteSize(), null, json(manifest)
        );
    }

    private LegacyMigrationModel.Artifact unavailableArtifact(
        final LegacyMigrationModel.Programme programme,
        final java.nio.file.Path path,
        final String reason
    ) {
        final Map<String, Object> manifest = manifest(programme, "UNAVAILABLE", "EXPLICIT_OR_ABSENT");
        manifest.put("reason", reason);
        manifest.put("artifactDigestMeaning", "MANIFEST_IDENTITY_NOT_SOURCE_BYTES");
        if (path != null) {
            manifest.put("sourcePathReference", path.toString());
        }
        final byte[] digest = LegacyChecksums.digest("legacy-unavailable\u0000" + programme.id() + "\u0000" + reason);
        return new LegacyMigrationModel.Artifact(
            programme.id(), LegacyMigrationModel.Availability.UNAVAILABLE, path, digest, 0, reason, json(manifest)
        );
    }

    private Map<String, Object> manifest(
        final LegacyMigrationModel.Programme programme,
        final String availability,
        final String mappingMode
    ) {
        final Map<String, Object> manifest = new TreeMap<>();
        manifest.put("legacyDescription", programme.description());
        manifest.put("legacyFilename", programme.filename());
        manifest.put("legacyId", Long.toString(programme.id()));
        manifest.put("legacyTable", "programme");
        manifest.put("legacyUrl", programme.url());
        manifest.put("mappingMode", mappingMode);
        manifest.put("sourceAvailability", availability);
        return manifest;
    }

    private String json(final Map<String, Object> value) {
        try {
            return mapper.writeValueAsString(value);
        }
        catch (IOException exception) {
            throw new IllegalStateException("Artifact provenance could not be serialized", exception);
        }
    }

    private static ObjectMapper configuredMapper() {
        final ObjectMapper result = new ObjectMapper();
        result.enable(MapperFeature.SORT_PROPERTIES_ALPHABETICALLY);
        result.enable(SerializationFeature.ORDER_MAP_ENTRIES_BY_KEYS);
        return result;
    }

    private enum ValueKind {
        IP,
        GENDER,
        AGE
    }

    private record TokenResult(Map<Long, String> shareTokens, LegacyMigrationReport.TokenCollisions summary) {
    }

    private record TokenAllocation(Map<Long, String> shareTokens, long generated, long explicit) {

        static TokenAllocation empty() {
            return new TokenAllocation(Map.of(), 0, 0);
        }
    }

    private record QuestionResult(Map<Long, Long> programmeIds, LegacyMigrationReport.QuestionJoins summary) {
    }

    private record SchoolResult(Map<Long, String> schoolTypes, LegacyMigrationReport.Privacy privacy) {
    }

    private record MetricResult(
        Map<Long, Map<String, Double>> values,
        List<String> missingCoreNames,
        List<String> outsideStaticView,
        Map<String, Long> conflicts
    ) {
    }

    private record ArtifactResult(
        Map<Long, LegacyMigrationModel.Artifact> artifacts,
        LegacyMigrationReport.Artifacts summary
    ) {
    }

    private record ReportResult(
        Map<Long, LegacyMigrationModel.ReportSnapshot> reports,
        Map<Long, Map<String, Double>> metrics,
        LegacyMigrationReport.Reports summary
    ) {
    }

    private record LoadedReport(LegacyMigrationModel.ReportSnapshot snapshot, Map<String, Double> metrics) {
    }

    private record FileIdentity(byte[] sha256, long byteSize) {

        FileIdentity {
            sha256 = sha256.clone();
        }

        @Override
        public byte[] sha256() {
            return sha256.clone();
        }
    }

    private record StatisticsResult(Map<Long, LegacyMigrationModel.Statistics> rows, long usernameMismatches) {
    }

    private record ArtifactInspection(byte[] sha256, long byteSize, boolean matches) {

        ArtifactInspection {
            sha256 = sha256.clone();
        }

        @Override
        public byte[] sha256() {
            return sha256.clone();
        }
    }

    private static final class DiagnosticAccumulator {

        private final Map<Key, Long> counts = new LinkedHashMap<>();

        void add(final String code, final String table, final String column, final String detail) {
            counts.merge(new Key(code, table, column, detail), 1L, Long::sum);
        }

        void throwIfPresent() {
            if (counts.isEmpty()) {
                return;
            }
            final List<LegacyMigrationException.Diagnostic> result = counts.entrySet().stream()
                .map(
                    entry -> new LegacyMigrationException.Diagnostic(
                        entry.getKey().code(), entry.getKey().table(), entry.getKey().column(),
                        entry.getKey().detail(), entry.getValue()
                    )
                ).toList();
            throw new LegacyMigrationException("Legacy source data requires explicit correction or resolution", result);
        }

        private record Key(String code, String table, String column, String detail) {
        }
    }
}
