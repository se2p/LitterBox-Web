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

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.io.IOException;
import java.io.OutputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.sql.Connection;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;
import java.util.Arrays;
import java.util.HashMap;
import java.util.HexFormat;
import java.util.List;
import java.util.Map;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.jdbc.core.JdbcTemplate;

import de.uni_passau.fim.se2.litterbox.analytics.ProgramMetricAnalyzer;

class LegacyMigrationIntegrationTest {

    private static final String MAPPED_SOURCE = "mapped-source.sb3";

    private LegacyMigrationTestDatabase schemas;
    private JdbcTemplate target;

    @BeforeEach
    void createSchemas() throws Exception {
        schemas = new LegacyMigrationTestDatabase();
        schemas.loadSchema();
        schemas.loadData();
        target = new JdbcTemplate(schemas.target());
    }

    @AfterEach
    void dropSchemas() {
        schemas.close();
    }

    @Test
    void importsSyntheticLegacyRowsAndProducesPrivacySafeReport(@TempDir final Path artifactRoot) throws Exception {
        final LegacyMigrationOptions options = schemas.options(artifactRoot);
        final LegacyMigrationHarness migration = harness();
        final LegacyMigrationReport report = migration.migrate(options);

        assertAggregateReport(report, schemas.resourcePath(MAPPED_SOURCE));
        assertPreservedRows(report);
        assertArtifacts(artifactRoot);
        assertMetrics(report);
        assertPrivacySafeJson(report.toJson());
        assertThat(migration.verificationEvidence()).isEqualTo(
            new LegacyArtifactVerificationEvidence(
                1, 1, 1, 1, 0, LegacyArtifactReanalysisVerifier.LEGACY_REPORT_VERSION
            )
        );
        assertThat(migration.verificationEvidence().toString()).doesNotContain(
            "legacy source artifact", MAPPED_SOURCE, "synthetic-author", "synthetic-shared", artifactRoot.toString()
        );
        assertRerunRejectedWithoutWrites(options);
    }

    @Test
    void keepsMissingMismatchedUnknownAndMappedRowsUnavailableIndependently(@TempDir final Path artifactRoot)
        throws Exception {
        final LegacyMigrationReport report = harness().migrate(schemas.options(artifactRoot));

        assertThat(storedArtifact("101")).containsEntry("source_kind", "LEGACY").containsEntry("byte_size", 51L)
            .doesNotContainEntry("input_sha256", null);
        assertThat(storedArtifact("102")).containsEntry("source_kind", "LEGACY_UNAVAILABLE")
            .containsEntry("byte_size", 0L).containsEntry("input_sha256", null);
        assertThat(storedArtifact("103")).containsEntry("source_kind", "LEGACY_UNAVAILABLE")
            .containsEntry("byte_size", 0L).containsEntry("input_sha256", null);
        assertThat(report.artifacts()).extracting(
            LegacyMigrationReport.Artifacts::checksumMismatched,
            LegacyMigrationReport.Artifacts::missingFiles,
            LegacyMigrationReport.Artifacts::mappingsWithoutProgramme
        ).containsExactly(1L, 1L, 1L);
    }

    /**
     * The legacy column names the report; it has never held one. Copying the column into the new schema stores the name
     * of a file that only ever existed on the old server, and every finding is lost while every count still adds up.
     */
    @Test
    void readsEachReportFromTheFileItsRowNames(@TempDir final Path artifactRoot) throws Exception {
        final LegacyMigrationReport report = harness().migrate(schemas.options(artifactRoot));

        final String stored = target
            .queryForObject("SELECT report_json FROM analysis WHERE legacy_id = '101'", String.class);
        assertThat(stored).isEqualTo(schemas.resourceText("core-metrics-report.json"))
            .isNotEqualTo("synthetic-101.json");
        assertThat(report.reports().referenced()).isEqualTo(2L);
        assertThat(report.reports().loaded()).isEqualTo(1L);
        assertThat(report.reports().missing()).isEqualTo(1L);
        assertThat(report.reports().withoutReference()).isEqualTo(1L);
        assertThat(report.reports().unreadable()).isZero();
        assertThat(target.queryForObject("SELECT report_json FROM analysis WHERE legacy_id = '103'", String.class))
            .isNull();
    }

    /**
     * The whole body is parsed into memory on every read of the submission it belongs to, and the old site let reports
     * grow to many times what this service will produce. Importing one would buy a row nobody can open, so the body is
     * left behind — but the metrics were read out of it before that, and those are what the measurements are drawn
     * from, so the row keeps everything a reader can actually be shown.
     */
    @Test
    void keepsTheMetricsOfAReportTooLargeToServeAndLeavesTheBodyBehind(@TempDir final Path artifactRoot)
        throws Exception {
        schemas.writeReport("synthetic-103.json", oversizedReport());

        final LegacyMigrationReport report = harness().migrate(schemas.options(artifactRoot));

        assertThat(report.reports().oversized()).isEqualTo(1L);
        assertThat(report.reports().loaded()).isEqualTo(1L);
        assertThat(report.reports().unreadable()).isZero();
        assertThat(report.reports().missing()).isZero();
        assertThat(target.queryForObject("SELECT report_json FROM analysis WHERE legacy_id = '103'", String.class))
            .isNull();
        assertThat(
            target.queryForObject(
                "SELECT value FROM analysis_metric metric JOIN analysis ON analysis.id = metric.analysis_id "
                    + "WHERE analysis.legacy_id = '103' AND metric.name = 'block_count'",
                Double.class
            )
        ).isEqualTo(1.0);
    }

    /** A real report with a large enough field bolted on: still one object, still carrying every metric. */
    private String oversizedReport() throws Exception {
        final String original = schemas.resourceText("core-metrics-report.json");
        final String padding = "x".repeat(LegacyMigrationPlanner.MAX_REPORT_BYTES);
        return original.replaceFirst("\\{", "{\"padding\": \"" + padding + "\",");
    }

    /** A named file that holds something other than a report counts apart from one that is not there at all. */
    @Test
    void countsANamedFileThatIsNotAReport(@TempDir final Path artifactRoot) throws Exception {
        schemas.writeReport("synthetic-103.json", "this was never a report");

        final LegacyMigrationReport report = harness().migrate(schemas.options(artifactRoot));

        assertThat(report.reports().unreadable()).isEqualTo(1L);
        assertThat(report.reports().missing()).isZero();
        assertThat(report.reports().loaded()).isEqualTo(1L);
        assertThat(target.queryForObject("SELECT report_json FROM analysis WHERE legacy_id = '103'", String.class))
            .isNull();
    }

    /** The names come from a database this migration does not own, so one that climbs out is refused. */
    @Test
    void refusesAReportNameThatLeavesItsDirectory(@TempDir final Path artifactRoot) throws Exception {
        schemas.setReportReference(103L, "../outside-the-report-directory.json");

        final LegacyMigrationException exception = failureFrom(
            () -> harness().migrate(schemas.options(artifactRoot))
        );

        assertThat(codes(exception)).contains("UNSAFE_REPORT_REFERENCE");
        assertTargetBusinessTablesEmpty();
    }

    /** What a real import would find, without leaving anything behind that a real one would have to be given. */
    @Test
    void rehearsesTheWholeImportAndLeavesTheSchemaClean(@TempDir final Path artifactRoot) throws Exception {
        final LegacyMigrationOptions options = schemas.options(artifactRoot);
        Files.createDirectories(artifactRoot);
        final Path preexisting = artifactRoot.resolve("preexisting-artifact");
        Files.writeString(preexisting, "preserved");

        final LegacyMigrationReport rehearsal = harness().rehearse(options);

        assertThat(rehearsal.status()).isEqualTo("MIGRATED");
        assertThat(rehearsal.reports().loaded()).isEqualTo(1L);
        assertTargetBusinessTablesEmpty();
        assertOnlyRegularFile(artifactRoot, preexisting);
        // Having rehearsed changes nothing about what a real import may then do.
        assertThat(harness().migrate(options).reports().loaded()).isEqualTo(1L);
        assertArtifacts(artifactRoot);
    }

    @Test
    void recordsAnUnmappedLegacyRowAsUnavailable(@TempDir final Path artifactRoot) throws Exception {
        final LegacyMigrationOptions complete = schemas.options(artifactRoot);
        final Map<Long, LegacyMigrationOptions.SourceMapping> mappings = new HashMap<>(complete.sourceMappings());
        mappings.remove(103L);
        final LegacyMigrationOptions options = optionsLike(
            complete, complete.artifactStoreRoot(), complete.tokenResolutions(), complete.questionResolutions(),
            mappings
        );

        final LegacyMigrationReport report = harness().migrate(options);

        assertThat(report.artifacts().withoutMapping()).isEqualTo(1L);
        assertThat(report.artifacts().missingFiles()).isZero();
        assertThat(
            target.queryForObject(
                "SELECT source_kind FROM source_artifact artifact JOIN analysis "
                    + "ON artifact.id = analysis.source_artifact_id WHERE analysis.legacy_id = '103'",
                String.class
            )
        ).isEqualTo("LEGACY_UNAVAILABLE");
    }

    @Test
    void failsReanalysisAndRollsBackDatabaseAndCopiedFiles(@TempDir final Path artifactRoot) throws Exception {
        final Path unrelated = artifactRoot.resolve("unrelated.synthetic");
        Files.writeString(unrelated, "unrelated fixture");
        final LegacyMigrationException exception = failureFrom(
            () -> harness(input -> {
                input.bytes().transferTo(OutputStream.nullOutputStream());
                throw new IOException("protected synthetic re-analysis failure");
            }).migrate(schemas.options(artifactRoot))
        );

        assertThat(codes(exception)).containsExactly("REANALYSIS_FAILED");
        assertThat(exception.getMessage()).doesNotContain("protected", "synthetic re-analysis failure");
        assertThat(exception.diagnostics().toString()).doesNotContain(
            "legacy source artifact", MAPPED_SOURCE, artifactRoot.toString()
        );
        assertTargetBusinessTablesEmpty();
        assertThat(Files.readString(unrelated)).isEqualTo("unrelated fixture");
        assertOnlyRegularFile(artifactRoot, unrelated);
    }

    @Test
    void detectsCopiedArtifactTamperingAndRollsBack(@TempDir final Path artifactRoot) throws Exception {
        final byte[] tampered = Files.readAllBytes(schemas.resourcePath(MAPPED_SOURCE));
        Arrays.fill(tampered, (byte) 'x');
        final LegacyMigrationException exception = failureFrom(
            () -> harness(input -> {
                Files.write(input.storagePath(), tampered);
                input.bytes().transferTo(OutputStream.nullOutputStream());
                return new LegacyArtifactReanalysisResult(LegacySyntheticReanalysisVerifier.VERSION, true);
            }).migrate(schemas.options(artifactRoot))
        );

        assertThat(codes(exception)).contains("COPIED_ARTIFACT_CHECKSUM_MISMATCH");
        assertNothingWasKept(artifactRoot);
    }

    @Test
    void detectsCopiedArtifactTruncationAndRollsBack(@TempDir final Path artifactRoot) throws Exception {
        final byte[] truncated = Arrays.copyOf(
            Files.readAllBytes(schemas.resourcePath(MAPPED_SOURCE)), 1
        );
        final LegacyMigrationException exception = failureFrom(
            () -> harness(input -> {
                Files.write(input.storagePath(), truncated);
                input.bytes().transferTo(OutputStream.nullOutputStream());
                return new LegacyArtifactReanalysisResult(LegacySyntheticReanalysisVerifier.VERSION, true);
            }).migrate(schemas.options(artifactRoot))
        );

        assertThat(codes(exception)).contains("COPIED_ARTIFACT_SIZE_MISMATCH");
        assertNothingWasKept(artifactRoot);
    }

    @Test
    void rejectsPersistedByteSizeMismatch(@TempDir final Path artifactRoot) throws Exception {
        target.execute(
            "CREATE TRIGGER synthetic_corrupt_artifact_size BEFORE INSERT ON source_artifact "
                + "FOR EACH ROW SET NEW.byte_size = NEW.byte_size + 1"
        );
        final LegacyMigrationException sizeException = failureFrom(
            () -> harness().migrate(schemas.options(artifactRoot))
        );
        assertThat(codes(sizeException)).containsExactly("COPIED_ARTIFACT_SIZE_MISMATCH");
        assertNothingWasKept(artifactRoot);
    }

    @Test
    void rejectsUnsafePersistedStoragePath(@TempDir final Path artifactRoot) throws Exception {
        target.execute(
            "CREATE TRIGGER synthetic_corrupt_artifact_path BEFORE INSERT ON source_artifact "
                + "FOR EACH ROW SET NEW.storage_key = IF(NEW.source_kind = 'LEGACY', "
                + "'../synthetic-escape', NEW.storage_key)"
        );
        final LegacyMigrationException exception = failureFrom(
            () -> harness().migrate(schemas.options(artifactRoot))
        );

        assertThat(codes(exception)).containsExactly("UNSAFE_ARTIFACT_PATH");
        assertNothingWasKept(artifactRoot);
    }

    @Test
    void rejectsASymbolicLinkAsTheArtifactStoreRoot(@TempDir final Path temporaryRoot) throws Exception {
        final Path backingDirectory = Files.createDirectory(temporaryRoot.resolve("backing"));
        final Path artifactRoot = Files.createSymbolicLink(
            temporaryRoot.resolve("artifact-store"), backingDirectory
        );
        final LegacyMigrationException exception = failureFrom(
            () -> harness().migrate(withArtifactRoot(schemas.options(temporaryRoot), artifactRoot))
        );

        assertThat(codes(exception)).containsExactly("UNSAFE_ARTIFACT_PATH");
        assertNothingWasKept(backingDirectory);
    }

    @Test
    void rejectsASymbolicLinkInTheContentAddressedPath(@TempDir final Path temporaryRoot) throws Exception {
        final Path artifactRoot = Files.createDirectory(temporaryRoot.resolve("artifact-store"));
        final Path outsideDirectory = Files.createDirectory(temporaryRoot.resolve("outside"));
        final LegacyMigrationOptions complete = schemas.options(temporaryRoot);
        final String mappedDigest = complete.sourceMappings().get(101L).expectedSha256();
        Files.createSymbolicLink(artifactRoot.resolve(mappedDigest.substring(0, 2)), outsideDirectory);

        final LegacyMigrationException exception = failureFrom(
            () -> harness().migrate(withArtifactRoot(complete, artifactRoot))
        );

        assertThat(codes(exception)).containsExactly("UNSAFE_ARTIFACT_PATH");
        assertNothingWasKept(outsideDirectory);
    }

    @Test
    void acceptanceSurfaceUsesSeparateSchemasAndLeavesNoShapeOfTheOldDatabase(
        @TempDir final Path artifactRoot
    ) throws Exception {
        final LegacyMigrationOptions options = schemas.options(artifactRoot);
        final LegacyMigrationReport report = harness().migrate(options);
        final JdbcTemplate source = new JdbcTemplate(schemas.source());

        assertThat(source.queryForObject("SELECT DATABASE()", String.class))
            .isNotEqualTo(target.queryForObject("SELECT DATABASE()", String.class));
        assertThat(source.queryForObject("SELECT COUNT(*) FROM programme", Long.class)).isEqualTo(3L);
        assertThat(report.status()).isEqualTo("MIGRATED");
        assertThat(report.targetRowCounts()).containsEntry("submission", 3L)
            .containsEntry("analysis", 3L)
            .containsEntry("analysis_metric", 106L)
            .containsEntry("external_id", 2L)
            .containsEntry("contact_message", 2L);
        assertThat(report.toJson()).doesNotContain(
            "synthetic-author", "synthetic-shared", "example.invalid", "Synthetic message"
        );

        try (
            Connection connection = schemas.target().getConnection();
            Statement statement = connection.createStatement()
        ) {
            // What the old database held is now in the normalized tables and nothing else. The target carries no
            // shape of the old one: its queries are not going to be run again, and a view standing in for them would
            // be a contract nobody has undertaken to keep correct.
            try (
                ResultSet views = statement.executeQuery(
                    "SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLES "
                        + "WHERE TABLE_SCHEMA = DATABASE() AND TABLE_TYPE = 'VIEW'"
                )
            ) {
                assertThat(views.next()).isTrue();
                assertThat(views.getLong(1)).isZero();
            }
        }
        assertRerunRejectedWithoutWrites(options);
    }

    @Test
    void reconcilesTokenCollisionsButRejectsAmbiguousJoinsBeforeTargetWrites(@TempDir final Path artifactRoot)
        throws Exception {
        final LegacyMigrationOptions complete = schemas.options(artifactRoot);
        final LegacyMigrationOptions unresolved = optionsLike(
            complete, complete.artifactStoreRoot(), Map.of(), Map.of(), complete.sourceMappings()
        );

        assertThatThrownBy(() -> harness().migrate(unresolved))
            .isInstanceOfSatisfying(
                LegacyMigrationException.class,
                exception -> assertThat(codes(exception))
                    .containsOnly("QUESTION_RESOLUTION_REQUIRED")
            );
        assertTargetBusinessTablesEmpty();
    }

    @Test
    void deterministicallyCanonicalizesDuplicateAndCaseCollidingTokens(@TempDir final Path artifactRoot)
        throws Exception {
        final LegacyMigrationOptions complete = schemas.options(artifactRoot);
        final LegacyMigrationOptions automatic = optionsLike(
            complete, complete.artifactStoreRoot(), Map.of(), complete.questionResolutions(), complete.sourceMappings()
        );

        final LegacyMigrationReport report = harness().migrate(automatic);

        assertThat(target.queryForList("SELECT share_token FROM submission ORDER BY id", String.class))
            .containsExactly(
                "synthetic-shared", expectedGeneratedToken(102L, "synthetic-shared"),
                expectedGeneratedToken(103L, "Synthetic-Shared")
            );
        assertThat(report.tokenCollisions()).isEqualTo(new LegacyMigrationReport.TokenCollisions(1, 1, 3, 2, 0));
    }

    @Test
    void retainsStatisticsAuthorOnMismatchAndCountsItWithoutReportingNames(@TempDir final Path artifactRoot)
        throws Exception {
        new JdbcTemplate(schemas.source()).update(
            "UPDATE statistiken SET author = 'reconciled-author' WHERE program = 101"
        );

        final LegacyMigrationReport report = harness().migrate(schemas.options(artifactRoot));

        assertThat(
            target.queryForObject(
                "SELECT author_username FROM scratch_project_stats stats JOIN analysis ON analysis.id = stats.analysis_id "
                    + "WHERE analysis.legacy_id = '101'",
                String.class
            )
        ).isEqualTo("reconciled-author");
        assertThat(report.reconciliations().usernameMismatches()).isEqualTo(1L);
        assertThat(report.toJson()).doesNotContain("reconciled-author");
    }

    @Test
    void prefersReportMetricsAndCountsStatisticsConflicts(@TempDir final Path artifactRoot) throws Exception {
        new JdbcTemplate(schemas.source()).update("UPDATE statistiken SET block_count = 17 WHERE program = 101");

        final LegacyMigrationReport report = harness().migrate(schemas.options(artifactRoot));

        assertThat(
            target.queryForObject(
                "SELECT value FROM analysis_metric metric JOIN analysis ON analysis.id = metric.analysis_id "
                    + "WHERE analysis.legacy_id = '101' AND metric.name = 'block_count'",
                Double.class
            )
        ).isEqualTo(1.0);
        assertThat(report.reconciliations().reportMetricConflicts()).containsEntry("block_count", 1L);
    }

    @Test
    void metricVerificationUsesTheDatabaseRepresentationOfZero() {
        assertThat(LegacyChecksums.metrics(Map.of(101L, Map.of("entropy", -0.0d))))
            .isEqualTo(LegacyChecksums.metrics(Map.of(101L, Map.of("entropy", 0.0d))));
    }

    @Test
    void deduplicatesExternalIdEventsAndKeepsEveryLegacyIdentity(@TempDir final Path artifactRoot) throws Exception {
        new JdbcTemplate(schemas.source()).update(
            "INSERT INTO `extId` (id, extId, timestamp) VALUES (403, 'syn0001', '2026-04-01 00:00:03')"
        );

        final LegacyMigrationReport report = harness().migrate(schemas.options(artifactRoot));

        assertThat(report.externalIds()).isEqualTo(new LegacyMigrationReport.CountComparison(3, 2));
        assertThat(target.queryForObject("SELECT COUNT(*) FROM external_id", Long.class)).isEqualTo(2L);
        assertThat(
            target.queryForObject(
                "SELECT COUNT(*) FROM legacy_id_map WHERE old_table_name = 'extId'", Long.class
            )
        ).isEqualTo(3L);
    }

    @Test
    void reportsMissingUnexpectedAndIncompatibleSchemaChanges(@TempDir final Path artifactRoot) throws Exception {
        final JdbcTemplate source = new JdbcTemplate(schemas.source());
        source.execute("ALTER TABLE programme DROP COLUMN description");
        source.execute("ALTER TABLE feedback MODIFY reaction VARCHAR(12) NOT NULL");
        source.execute("ALTER TABLE fragen ADD COLUMN unexpected_required_change INT NULL");

        assertThatThrownBy(() -> harness().migrate(schemas.options(artifactRoot)))
            .isInstanceOfSatisfying(
                LegacyMigrationException.class,
                exception -> assertThat(codes(exception))
                    .contains("MISSING_COLUMN", "INCOMPATIBLE_SQL_TYPE", "UNEXPECTED_COLUMN", "COLUMN_ORDER_CHANGED")
            );
        assertTargetBusinessTablesEmpty();
    }

    @Test
    void rollsBackDatabaseAndCopiedArtifactWhenVerificationFails(@TempDir final Path artifactRoot) throws Exception {
        target.execute(
            "CREATE TRIGGER synthetic_corrupt_report BEFORE INSERT ON analysis FOR EACH ROW "
                + "SET NEW.report_json = '{}'"
        );

        assertThatThrownBy(() -> harness().migrate(schemas.options(artifactRoot)))
            .isInstanceOfSatisfying(
                LegacyMigrationException.class,
                exception -> assertThat(codes(exception)).contains("REPORT_CHECKSUM_MISMATCH")
            );
        assertNothingWasKept(artifactRoot);
    }

    @Test
    void sourceFeedbackFixtureEnforcesUniqueness() throws Exception {
        try (
            Connection connection = schemas.source().getConnection();
            Statement statement = connection.createStatement()
        ) {
            assertThatThrownBy(
                () -> statement.executeUpdate(
                    "INSERT INTO feedback (program, pattern, reaction) "
                        + "VALUES (101, 'SyntheticFinderAlpha', -1)"
                )
            ).isInstanceOf(SQLException.class);
        }
    }

    private LegacyMigrationHarness harness() {
        return new LegacyMigrationHarness(schemas.source(), schemas.target());
    }

    private String expectedGeneratedToken(final long id, final String originalToken) {
        final String seed = "legacy-reconciliation-v1\u0000" + id + "\u0000" + originalToken + "\u00000";
        return "legacy-" + HexFormat.of().formatHex(LegacyChecksums.digest(seed)).substring(0, 36);
    }

    private LegacyMigrationHarness harness(final LegacyArtifactReanalysisVerifier verifier) {
        return new LegacyMigrationHarness(schemas.source(), schemas.target(), verifier);
    }

    private LegacyMigrationOptions withArtifactRoot(
        final LegacyMigrationOptions options,
        final Path artifactRoot
    ) {
        return optionsLike(
            options, artifactRoot, options.tokenResolutions(), options.questionResolutions(),
            options.sourceMappings()
        );
    }

    /** The same terms a real import would be given, with the parts one test needs to differ put in their place. */
    private LegacyMigrationOptions optionsLike(
        final LegacyMigrationOptions base,
        final Path artifactRoot,
        final Map<Long, String> tokenResolutions,
        final Map<Long, Long> questionResolutions,
        final Map<Long, LegacyMigrationOptions.SourceMapping> sourceMappings
    ) {
        return new LegacyMigrationOptions(
            base.locale(), base.litterboxArtifactVersion(), artifactRoot, base.legacyReportRoot(),
            base.approvedSchoolTypes(), tokenResolutions, questionResolutions, sourceMappings
        );
    }

    /** What was stored for one old row: the artifact its analysis points at, and whether its bytes came along. */
    private Map<String, Object> storedArtifact(final String legacyId) {
        return target.queryForMap(
            "SELECT artifact.source_kind, artifact.byte_size, analysis.input_sha256 "
                + "FROM analysis JOIN source_artifact artifact ON artifact.id = analysis.source_artifact_id "
                + "WHERE analysis.legacy_id = ?",
            legacyId
        );
    }

    /** The codes a refusal carries, which is what these tests hold it to and never the wording. */
    private List<String> codes(final LegacyMigrationException exception) {
        return exception.diagnostics().stream().map(LegacyMigrationException.Diagnostic::code).toList();
    }

    /** Nothing was written and nothing was left behind, which a refused migration has to be true of at once. */
    private void assertNothingWasKept(final Path root) throws IOException {
        assertTargetBusinessTablesEmpty();
        assertOnlyRegularFile(root, null);
    }

    private LegacyMigrationException failureFrom(final ThrowingOperation operation) throws Exception {
        try {
            operation.run();
        }
        catch (LegacyMigrationException exception) {
            return exception;
        }
        throw new AssertionError("Expected synthetic migration verification to fail");
    }

    private void assertOnlyRegularFile(final Path root, final Path expected) throws IOException {
        try (var files = Files.walk(root)) {
            final List<Path> regular = files.filter(Files::isRegularFile).toList();
            if (expected == null) {
                assertThat(regular).isEmpty();
            }
            else {
                assertThat(regular).containsExactly(expected);
            }
        }
    }

    @FunctionalInterface
    private interface ThrowingOperation {

        void run() throws Exception;
    }

    private void assertAggregateReport(final LegacyMigrationReport report, final Path mapped) throws IOException {
        assertThat(report.status()).isEqualTo("MIGRATED");
        assertThat(report.sourceRowCounts()).containsAllEntriesOf(
            Map.of(
                "programme", 3L, "statistiken", 2L, "feedback", 3L,
                "fragen", 3L, "extId", 2L, "nachrichten", 2L
            )
        );
        assertThat(report.targetRowCounts()).containsAllEntriesOf(
            Map.of(
                "submission", 3L, "analysis", 3L, "source_artifact", 3L,
                "submission_artifact", 3L, "issue_feedback", 3L, "quiz_answer", 3L,
                "external_id", 2L, "contact_message", 2L, "legacy_id_map", 15L
            )
        ).containsEntry("analysis_metric", 106L)
            .containsEntry("scratch_project_stats", 2L);
        assertThat(report.tokenCollisions()).isEqualTo(new LegacyMigrationReport.TokenCollisions(1, 1, 3, 0, 3));
        assertThat(report.feedback()).isEqualTo(new LegacyMigrationReport.CountComparison(3, 3));
        assertThat(report.questionJoins()).isEqualTo(new LegacyMigrationReport.QuestionJoins(3, 1, 2, 1, 1, 3));
        assertThat(report.externalIds()).isEqualTo(new LegacyMigrationReport.CountComparison(2, 2));
        assertThat(report.contactMessages()).isEqualTo(new LegacyMigrationReport.CountComparison(2, 2));
        assertThat(report.artifacts()).isEqualTo(
            new LegacyMigrationReport.Artifacts(
                3, 1, 1, 1, 0, 1, 2, Files.size(mapped)
            )
        );
        assertThat(report.privacy()).isEqualTo(new LegacyMigrationReport.Privacy(4, 3, 1, 1, 1, 1, List.of(1L)));
        assertThat(report.sourceNullCounts()).containsEntry("programme.litterbox", 1L)
            .containsEntry("fragen.correct", 1L);
        assertThat(report.targetNullCounts()).containsEntry("analysis.input_sha256", 2L)
            .containsEntry("quiz_answer.correct", 1L);
        assertThat(report.checksums().sourceMetrics()).isEqualTo(report.checksums().targetMetrics());
        assertThat(report.checksums().sourceReportSnapshots()).isEqualTo(report.checksums().targetReportSnapshots());
    }

    private void assertPreservedRows(final LegacyMigrationReport report) throws IOException {
        // Read back the way anything will read it from now on: the normalized rows, with the old identities
        // resolved through legacy_id_map rather than through a view shaped like the database they replaced.
        assertThat(
            target.queryForMap(
                "SELECT map.old_token, map.old_filename, submission.school_type, stats.author_username "
                    + "FROM analysis "
                    + "JOIN submission ON submission.id = analysis.submission_id "
                    + "JOIN legacy_id_map map "
                    + "ON map.analysis_id = analysis.id AND map.old_table_name = 'programme' "
                    + "LEFT JOIN scratch_project_stats stats ON stats.analysis_id = analysis.id "
                    + "WHERE analysis.legacy_id = '101'"
            )
        ).containsEntry("old_token", "synthetic-shared")
            .containsEntry("author_username", "synthetic-author-alpha")
            .containsEntry("old_filename", "repeated-synthetic.sb3")
            .containsEntry("school_type", "PRIMARY");
        assertThat(
            target.queryForObject(
                "SELECT submission.school_type FROM analysis "
                    + "JOIN submission ON submission.id = analysis.submission_id "
                    + "WHERE analysis.legacy_id = '102'",
                String.class
            )
        ).isNull();
        assertThat(target.queryForObject("SELECT report_json FROM analysis WHERE legacy_id = '101'", String.class))
            .isEqualTo(schemas.resourceText("core-metrics-report.json"));
        assertThat(target.queryForObject("SELECT COUNT(*) FROM analysis WHERE input_sha256 IS NOT NULL", Long.class))
            .isEqualTo(1L);
        assertPreservedRowsUnderThem();
        assertThat(report.privacy().unmappedSchoolRows()).isEqualTo(1);
    }

    /** The questions, feedback, external ids and messages that hung off a programme, and their own identities. */
    private void assertPreservedRowsUnderThem() {
        assertThat(target.queryForObject("SELECT LENGTH(answer) FROM quiz_answer WHERE id = 202", Integer.class))
            .isEqualTo(500);
        assertThat(target.queryForObject("SELECT correct FROM quiz_answer WHERE id = 202", Boolean.class)).isNull();
        assertThat(
            target.queryForObject(
                "SELECT old_filename FROM legacy_id_map WHERE old_table_name = 'fragen' AND old_id = '203'",
                String.class
            )
        ).isEqualTo("unmatched-synthetic.sb3");
        // Every legacy row keeps its own identity and stays attached to the programme it belonged to.
        assertThat(
            target.queryForList(
                "SELECT CAST(stat.old_id AS UNSIGNED) FROM legacy_id_map stat "
                    + "WHERE stat.old_table_name = 'statistiken' ORDER BY CAST(stat.old_id AS UNSIGNED)",
                Long.class
            )
        ).containsExactly(1001L, 1002L);
        assertThat(programmeIdsBehind("statistiken")).containsExactly(101L, 102L);
        assertThat(
            target.queryForList(
                "SELECT CAST(old_id AS UNSIGNED) FROM legacy_id_map "
                    + "WHERE old_table_name = 'feedback' ORDER BY CAST(old_id AS UNSIGNED)",
                Long.class
            )
        ).containsExactly(301L, 302L, 303L);
        assertThat(programmeIdsBehind("feedback")).containsExactly(101L, 102L, 103L);
        assertThat(target.queryForMap("SELECT legacy_name, legacy_value FROM external_id WHERE id = 401"))
            .containsEntry("legacy_name", "extId").containsEntry("legacy_value", "SYN0001");
        assertThat(
            target.queryForMap(
                "SELECT sender_name, sender_email, message, created_at FROM contact_message WHERE id = 501"
            )
        ).containsEntry("sender_name", "Synthetic subject α")
            .containsEntry("sender_email", "synthetic-one@example.invalid")
            .containsEntry("message", "Synthetic message α")
            .containsEntry("created_at", null);
        assertThat(target.queryForObject("SELECT LENGTH(message) FROM contact_message WHERE id = 502", Integer.class))
            .isEqualTo(2000);
    }

    /** The programme each row of a legacy table belonged to, by way of the analysis both were mapped onto. */
    private List<Long> programmeIdsBehind(final String oldTable) {
        return target.queryForList(
            "SELECT CAST(programme.old_id AS UNSIGNED) FROM legacy_id_map row_map "
                + "JOIN legacy_id_map programme "
                + "ON programme.analysis_id = row_map.analysis_id AND programme.old_table_name = 'programme' "
                + "WHERE row_map.old_table_name = ? ORDER BY CAST(row_map.old_id AS UNSIGNED)",
            Long.class, oldTable
        );
    }

    private void assertArtifacts(final Path root) throws Exception {
        final String hex = target.queryForObject(
            "SELECT HEX(input_sha256) FROM analysis WHERE legacy_id = '101'", String.class
        ).toLowerCase(java.util.Locale.ROOT);
        final Path stored = root.resolve(hex.substring(0, 2)).resolve(hex.substring(2));
        assertThat(stored).hasSameBinaryContentAs(schemas.resourcePath(MAPPED_SOURCE));
        assertThat(
            target.queryForObject(
                "SELECT manifest_json FROM source_artifact WHERE source_kind = 'LEGACY_UNAVAILABLE' ORDER BY id LIMIT 1",
                String.class
            )
        ).contains("\"sourceAvailability\":\"UNAVAILABLE\"")
            .contains("\"artifactDigestMeaning\":\"MANIFEST_IDENTITY_NOT_SOURCE_BYTES\"");
    }

    private void assertMetrics(final LegacyMigrationReport report) {
        final List<String> current = new ProgramMetricAnalyzer().getMetricNames().stream().sorted().toList();
        final List<String> imported = target.queryForList(
            "SELECT name FROM analysis_metric metric JOIN analysis ON analysis.id = metric.analysis_id "
                + "WHERE analysis.legacy_id = '101' ORDER BY name",
            String.class
        );
        assertThat(imported).containsAll(current);
        assertThat(report.missingCoreMetricNames()).isEmpty();
        assertThat(report.coreMetricNamesOutsideLegacyView()).containsExactlyElementsOf(
            current.stream().filter(name -> !LegacySchemaContract.STATIC_METRIC_NAMES.contains(name)).toList()
        );
        assertThat(report.coreMetricNamesOutsideLegacyView()).hasSize(12);
        assertThat(report.metrics().get("block_count"))
            .isEqualTo(new LegacyMigrationReport.MetricAggregate(1, 2, 1, 1, 1));
    }

    private void assertPrivacySafeJson(final String json) {
        assertThat(json).doesNotContain(
            "synthetic-shared", "resolved-synthetic", "synthetic-author", "example.invalid",
            "Synthetic message", "Synthetic subject", "synthetic-unmapped-category",
            "repeated-synthetic.sb3", "Synthetic question", "Synthetic answer"
        );
    }

    private void assertRerunRejectedWithoutWrites(final LegacyMigrationOptions options) {
        final Map<String, Object> before = target.queryForMap(
            "SELECT (SELECT COUNT(*) FROM submission) AS submissions, "
                + "(SELECT COUNT(*) FROM analysis) AS analyses, "
                + "(SELECT COUNT(*) FROM legacy_id_map) AS mappings"
        );
        assertThatThrownBy(() -> harness().migrate(options))
            .isInstanceOf(LegacyAlreadyMigratedException.class)
            .hasMessage("Target schema already contains a completed legacy migration");
        assertThat(
            target.queryForMap(
                "SELECT (SELECT COUNT(*) FROM submission) AS submissions, "
                    + "(SELECT COUNT(*) FROM analysis) AS analyses, "
                    + "(SELECT COUNT(*) FROM legacy_id_map) AS mappings"
            )
        ).isEqualTo(before);
    }

    private void assertTargetBusinessTablesEmpty() {
        for (
            String table : List.of(
                "submission", "source_artifact", "submission_artifact", "analysis", "analysis_metric",
                "scratch_project_stats", "issue_feedback", "quiz_answer", "legacy_id_map", "external_id",
                "contact_message"
            )
        ) {
            assertThat(target.queryForObject("SELECT COUNT(*) FROM " + table, Long.class)).as(table).isZero();
        }
    }
}
