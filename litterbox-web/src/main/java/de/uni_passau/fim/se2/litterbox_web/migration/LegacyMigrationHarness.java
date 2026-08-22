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
import java.nio.file.Files;
import java.nio.file.Path;
import java.sql.Connection;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;

import javax.sql.DataSource;

public final class LegacyMigrationHarness {

    private static final List<String> TARGET_TABLES = List.of(
        "submission", "submission_event", "source_artifact", "submission_artifact", "analysis",
        "analysis_metric", "scratch_project_stats", "asset", "analysis_asset", "issue_feedback",
        "quiz_answer", "legacy_id_map", "external_id", "contact_message",
        "idempotency_key", "analysis_job"
    );
    private final DataSource sourceDataSource;
    private final DataSource targetDataSource;
    private final LegacyArtifactReanalysisVerifier reanalysisVerifier;
    private LegacyArtifactVerificationEvidence verificationEvidence = LegacyArtifactVerificationEvidence.empty();

    public LegacyMigrationHarness(final DataSource sourceDataSource, final DataSource targetDataSource) {
        this(sourceDataSource, targetDataSource, LegacySyntheticReanalysisVerifier::verify);
    }

    LegacyMigrationHarness(
        final DataSource sourceDataSource,
        final DataSource targetDataSource,
        final LegacyArtifactReanalysisVerifier reanalysisVerifier
    ) {
        this.sourceDataSource = Objects.requireNonNull(sourceDataSource, "sourceDataSource");
        this.targetDataSource = Objects.requireNonNull(targetDataSource, "targetDataSource");
        this.reanalysisVerifier = Objects.requireNonNull(reanalysisVerifier, "reanalysisVerifier");
    }

    public LegacyArtifactVerificationEvidence verificationEvidence() {
        return verificationEvidence;
    }

    /** Validates and imports one separate legacy schema into one clean Flyway-created target schema. */
    public LegacyMigrationReport migrate(final LegacyMigrationOptions options) {
        return run(options, true);
    }

    /**
     * Does everything {@link #migrate} does and then puts it all back: the transaction is rolled back and every copied
     * file removed. The report is the same report, so what a real import would find can be read off before one is
     * attempted, on a schema that is left as clean as it was found.
     */
    public LegacyMigrationReport rehearse(final LegacyMigrationOptions options) {
        return run(options, false);
    }

    private LegacyMigrationReport run(final LegacyMigrationOptions options, final boolean commit) {
        Objects.requireNonNull(options, "options");
        verificationEvidence = LegacyArtifactVerificationEvidence.empty();
        final Path rehearsalStore = commit ? null : rehearsalStore();
        final LegacyMigrationOptions effectiveOptions = rehearsalStore == null ? options
            : withArtifactStore(options, rehearsalStore);
        try (
            Connection source = sourceDataSource.getConnection();
            Connection target = targetDataSource.getConnection()
        ) {
            configureConnections(source, target);
            LegacyTargetWriter writer = null;
            try {
                validateSeparateSchemas(source, target);
                new LegacySourceSchemaValidator().validate(source);
                validateTargetSchema(target);
                validateCleanTarget(target);
                final LegacyMigrationModel.SourceData data = new LegacySourceReader().read(source);
                final LegacyMigrationModel.PreparedMigration plan = new LegacyMigrationPlanner()
                    .prepare(data, effectiveOptions);
                writer = new LegacyTargetWriter(target, effectiveOptions, reanalysisVerifier);
                final LegacyMigrationModel.TargetResult result = writer.write(plan);
                validateChecksums(plan, result);
                final LegacyMigrationReport report = report(plan, result);
                source.rollback();
                if (commit) {
                    target.commit();
                }
                else {
                    target.rollback();
                    writer.cleanupArtifacts();
                }
                verificationEvidence = result.verificationEvidence();
                return report;
            }
            catch (SQLException | IOException | RuntimeException exception) {
                rollback(source);
                rollback(target);
                if (writer != null) {
                    writer.cleanupArtifacts();
                }
                if (exception instanceof LegacyMigrationException migrationException) {
                    throw migrationException;
                }
                throw new LegacyMigrationException("Legacy migration failed and was rolled back", exception);
            }
        }
        catch (SQLException exception) {
            throw new LegacyMigrationException("Legacy migration failed and was rolled back", exception);
        }
        finally {
            if (rehearsalStore != null) {
                deleteRehearsalStore(rehearsalStore);
            }
        }
    }

    /** Keeps a rehearsal's transient artifacts outside the configured, durable source-artifact store. */
    private Path rehearsalStore() {
        try {
            return Files.createTempDirectory("litterbox-legacy-migration-rehearsal-");
        }
        catch (IOException exception) {
            throw new LegacyMigrationException("Legacy migration rehearsal staging could not be created", exception);
        }
    }

    private LegacyMigrationOptions withArtifactStore(final LegacyMigrationOptions options, final Path artifactStore) {
        return new LegacyMigrationOptions(
            options.locale(), options.litterboxArtifactVersion(), artifactStore, options.legacyReportRoot(),
            options.approvedSchoolTypes(), options.tokenResolutions(), options.questionResolutions(),
            options.sourceMappings()
        );
    }

    private void deleteRehearsalStore(final Path rehearsalStore) {
        try (var paths = Files.walk(rehearsalStore)) {
            paths.sorted(Comparator.reverseOrder()).forEach(path -> {
                try {
                    Files.deleteIfExists(path);
                }
                catch (IOException exception) {
                    throw new LegacyMigrationException(
                        "Legacy migration rehearsal staging could not be removed", exception
                    );
                }
            });
        }
        catch (IOException exception) {
            throw new LegacyMigrationException("Legacy migration rehearsal staging could not be removed", exception);
        }
    }

    private void rollback(final Connection connection) {
        try {
            connection.rollback();
        }
        catch (SQLException ignored) {
            // The original failure remains authoritative.
        }
    }

    private void configureConnections(final Connection source, final Connection target) throws SQLException {
        source.setAutoCommit(false);
        source.setReadOnly(true);
        source.setTransactionIsolation(Connection.TRANSACTION_REPEATABLE_READ);
        target.setAutoCommit(false);
        target.setTransactionIsolation(Connection.TRANSACTION_SERIALIZABLE);
    }

    private void validateSeparateSchemas(final Connection source, final Connection target) {
        if (Objects.equals(sourceCatalog(source), sourceCatalog(target))) {
            throw new LegacyMigrationException(
                "Legacy source and migration target must be separate schemas",
                List.of(
                    new LegacyMigrationException.Diagnostic(
                        "SCHEMAS_NOT_SEPARATE", null, null, "source and target catalog are identical", 1
                    )
                )
            );
        }
    }

    private String sourceCatalog(final Connection connection) {
        try {
            return connection.getCatalog();
        }
        catch (SQLException exception) {
            throw new LegacyMigrationException("Database catalog could not be inspected", exception);
        }
    }

    private void validateTargetSchema(final Connection target) throws SQLException {
        final Set<String> tables = discoverTables(target);
        final List<LegacyMigrationException.Diagnostic> diagnostics = new ArrayList<>();
        TARGET_TABLES.stream().filter(table -> !tables.contains(table)).forEach(
            table -> diagnostics.add(
                new LegacyMigrationException.Diagnostic(
                    "MISSING_TARGET_TABLE", table, null, "Flyway table is absent", 1
                )
            )
        );
        if (!diagnostics.isEmpty()) {
            throw new LegacyMigrationException("Target schema is not the expected Flyway schema", diagnostics);
        }
    }

    private Set<String> discoverTables(final Connection connection) throws SQLException {
        final java.util.HashSet<String> result = new java.util.HashSet<>();
        final String sql = "SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES "
            + "WHERE TABLE_SCHEMA = DATABASE() AND TABLE_TYPE = 'BASE TABLE'";
        try (
            Statement statement = connection.createStatement();
            ResultSet rows = statement.executeQuery(sql)
        ) {
            while (rows.next()) {
                result.add(rows.getString(1));
            }
        }
        return Set.copyOf(result);
    }

    private void validateCleanTarget(final Connection target) throws SQLException {
        final long mapped = count(target, "legacy_id_map");
        if (mapped > 0) {
            throw new LegacyAlreadyMigratedException(mapped);
        }
        final List<LegacyMigrationException.Diagnostic> diagnostics = new ArrayList<>();
        for (String table : TARGET_TABLES) {
            final long rows = count(target, table);
            if (rows > 0) {
                diagnostics.add(
                    new LegacyMigrationException.Diagnostic(
                        "TARGET_NOT_CLEAN", table, null, "target table already contains rows", rows
                    )
                );
            }
        }
        if (!diagnostics.isEmpty()) {
            throw new LegacyMigrationException("Target schema must be clean before legacy migration", diagnostics);
        }
    }

    private long count(final Connection connection, final String table) throws SQLException {
        try (
            Statement statement = connection.createStatement();
            ResultSet rows = statement.executeQuery(
                "SELECT COUNT(*) FROM " + table
            )
        ) {
            rows.next();
            return rows.getLong(1);
        }
    }

    private void validateChecksums(
        final LegacyMigrationModel.PreparedMigration plan,
        final LegacyMigrationModel.TargetResult target
    ) {
        final List<LegacyMigrationException.Diagnostic> diagnostics = new ArrayList<>();
        if (!plan.sourceReportChecksum().equals(target.reportChecksum())) {
            diagnostics.add(
                new LegacyMigrationException.Diagnostic(
                    "REPORT_CHECKSUM_MISMATCH", "analysis", "report_json", "aggregate representation changed", 1
                )
            );
        }
        if (!plan.sourceMetricChecksum().equals(target.metricChecksum())) {
            diagnostics.add(
                new LegacyMigrationException.Diagnostic(
                    "METRIC_CHECKSUM_MISMATCH", "analysis_metric", "value", "aggregate representation changed", 1
                )
            );
        }
        if (!diagnostics.isEmpty()) {
            throw new LegacyMigrationException("Target verification failed before commit", diagnostics);
        }
    }

    private LegacyMigrationReport report(
        final LegacyMigrationModel.PreparedMigration plan,
        final LegacyMigrationModel.TargetResult result
    ) {
        final LegacyMigrationReport.QuestionJoins planned = plan.questionJoins();
        final LegacyMigrationReport.QuestionJoins questions = new LegacyMigrationReport.QuestionJoins(
            planned.source(), planned.automatic(), planned.explicitlyResolved(),
            planned.ambiguousBeforeResolution(), planned.unmatchedBeforeResolution(),
            result.rowCounts().getOrDefault("quiz_answer", 0L)
        );
        return new LegacyMigrationReport(
            "MIGRATED", plan.source().rowCounts(), result.rowCounts(), plan.source().nullCounts(),
            result.nullCounts(), plan.tokenCollisions(), result.metrics(), plan.missingCoreMetricNames(),
            plan.coreMetricNamesOutsideLegacyView(),
            comparison(plan.source().rowCounts(), "feedback", result.rowCounts(), "issue_feedback"),
            questions,
            comparison(plan.source().rowCounts(), "extId", result.rowCounts(), "external_id"),
            comparison(plan.source().rowCounts(), "nachrichten", result.rowCounts(), "contact_message"),
            plan.artifactSummary(), plan.reportSummary(), plan.privacy(), plan.reconciliations(),
            new LegacyMigrationReport.Checksums(
                plan.sourceReportChecksum(), result.reportChecksum(),
                plan.sourceMetricChecksum(), result.metricChecksum()
            )
        );
    }

    private LegacyMigrationReport.CountComparison comparison(
        final Map<String, Long> source,
        final String sourceName,
        final Map<String, Long> target,
        final String targetName
    ) {
        return new LegacyMigrationReport.CountComparison(
            source.getOrDefault(sourceName, 0L), target.getOrDefault(targetName, 0L)
        );
    }
}
