/*
 * Copyright (C) 2024-2026 LitterBox-Web contributors
 *
 * This file is part of LitterBox-Web.
 * Licenced under the EUPL-1.2 or later.
 *
 * SPDX-FileCopyrightText: 2024-2026 LitterBox-Web contributors
 * SPDX-License-Identifier: EUPL-1.2
 */
package de.uni_passau.fim.se2.litterbox_web.web_ui.persistence;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;

import java.sql.Connection;
import java.sql.SQLException;
import java.sql.Statement;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;

import de.uni_passau.fim.se2.litterbox_web.util.TestDatabase;
import de.uni_passau.fim.se2.litterbox_web.web_ui.persistence.jpa.Analyses;
import de.uni_passau.fim.se2.litterbox_web.web_ui.persistence.jpa.AnalysisJobs;
import de.uni_passau.fim.se2.litterbox_web.web_ui.persistence.jpa.AnalysisMetrics;
import de.uni_passau.fim.se2.litterbox_web.web_ui.persistence.jpa.SourceArtifacts;
import de.uni_passau.fim.se2.litterbox_web.web_ui.persistence.jpa.SubmissionArtifacts;
import de.uni_passau.fim.se2.litterbox_web.web_ui.persistence.jpa.SubmissionEvents;
import de.uni_passau.fim.se2.litterbox_web.web_ui.persistence.jpa.Submissions;
import de.uni_passau.fim.se2.litterbox_web.web_ui.util.ImmediateWork;
import de.uni_passau.fim.se2.litterbox_web.web_ui.util.TestRepositories;

class MariaDbMigrationIntegrationTest {

    private static final String INSERT_ANALYSIS = "INSERT INTO analysis ";
    private static final String WORKER = "worker";
    private static final String MIGRATIONS = "classpath:db/migration";
    private static final Set<String> EXPECTED_TABLES = Set.of(
        "submission", "submission_event", "source_artifact", "submission_artifact", "analysis",
        "analysis_metric", "scratch_project_stats", "asset", "analysis_asset", "issue_feedback",
        "quiz_answer", "legacy_id_map", "external_id", "contact_message", "idempotency_key",
        "analysis_job", "ask_ai_conversation", "ask_ai_message",
        "statistics_processed_analysis", "statistics_total", "statistics_distribution",
        "statistics_finding", "statistics_block_category"
    );

    @Test
    void migratesFoundationAndEnforcesResearchKeys() throws Exception {
        try (TestDatabase database = TestDatabase.freshSchema("schema_migration")) {
            migrateAndAssert(database);
            try (TestRepositories repositories = new TestRepositories(database)) {
                assertRepositoriesAgreeWithTheSchema(database, repositories);
            }
        }
    }

    @Test
    void clearsTheAnonymousProjectionWhenUpgradingFromV4() {
        try (TestDatabase database = TestDatabase.freshSchema("statistics_rebuild")) {
            final Flyway throughV4 = Flyway.configure()
                .dataSource(database.dataSource())
                .locations(MIGRATIONS)
                .target("4")
                .load();
            throughV4.migrate();
            final JdbcTemplate jdbc = database.jdbcTemplate();
            jdbc.update(
                "INSERT INTO submission (share_token, source_type, locale, state) "
                    + "VALUES ('statistics-rebuild', 'UPLOAD', 'en', 'DONE')"
            );
            jdbc.update(
                "INSERT INTO source_artifact (sha256, storage_key, byte_size, source_kind, retention_state) "
                    + "VALUES (UNHEX(SHA2('statistics-rebuild', 256)), 'statistics/rebuild.sb3', 1, "
                    + "'PROJECT', 'ACTIVE')"
            );
            jdbc.update(
                "INSERT INTO analysis (submission_id, source_artifact_id, provenance, report_schema_version, "
                    + "litterbox_artifact_version, detector_set, locale, status, from_creation, completed_at) "
                    + "VALUES (1, 1, 'NEW', '1', 'test', 'all', 'en', 'DONE', TRUE, '2026-08-13 12:00:00')"
            );
            jdbc.update("INSERT INTO statistics_processed_analysis (analysis_id) VALUES (1)");
            jdbc.update(
                "INSERT INTO statistics_total (singleton, projects, finding_projects, block_category_projects) "
                    + "VALUES (1, 1, 1, 1)"
            );
            jdbc.update(
                "INSERT INTO statistics_distribution (metric, metric_value, count) VALUES ('block_count', 1, 1)"
            );
            jdbc.update(
                "INSERT INTO statistics_finding (finder_id, issue_type, projects_affected, occurrences) "
                    + "VALUES ('type_error', 'bug', 1, 1)"
            );
            jdbc.update(
                "INSERT INTO statistics_block_category (metric, projects_using, blocks) "
                    + "VALUES ('motion_block_count', 1, 1)"
            );

            final Flyway latest = Flyway.configure()
                .dataSource(database.dataSource())
                .locations(MIGRATIONS)
                .load();
            assertThat(latest.migrate().migrationsExecuted).isEqualTo(3);

            assertThat(latest.info().current().getVersion().getVersion()).isEqualTo("7");
            assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM statistics_processed_analysis", Long.class)).isZero();
            assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM statistics_total", Long.class)).isZero();
            assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM statistics_distribution", Long.class)).isZero();
            assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM statistics_finding", Long.class)).isZero();
            assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM statistics_block_category", Long.class)).isZero();
        }
    }

    @Test
    void namesNoProjectForASubmissionLinkedBeforeNamesWereKept() throws Exception {
        try (TestDatabase database = TestDatabase.freshSchema("link_name_upgrade")) {
            Flyway.configure()
                .dataSource(database.dataSource())
                .locations(MIGRATIONS)
                .target("6")
                .load()
                .migrate();
            final JdbcTemplate jdbc = database.jdbcTemplate();
            jdbc.update(
                "INSERT INTO submission (share_token, source_type, locale, state) "
                    + "VALUES ('link-name-upgrade', 'UPLOAD', 'en', 'DONE')"
            );
            jdbc.update(
                "INSERT INTO source_artifact (sha256, storage_key, original_filename, byte_size, source_kind, "
                    + "retention_state) VALUES (UNHEX(SHA2('link-name-upgrade', 256)), 'upgrade/shared.sb3', "
                    + "'someone-else.sb3', 1, 'UPLOAD', 'ACTIVE')"
            );
            jdbc.update(
                "INSERT INTO submission_artifact (submission_id, artifact_id, role) VALUES (1, 1, 'ORIGINAL')"
            );

            Flyway.configure()
                .dataSource(database.dataSource())
                .locations(MIGRATIONS)
                .load()
                .migrate();

            try (TestRepositories repositories = new TestRepositories(database)) {
                final DatabaseWork work = ImmediateWork.database();
                final SourceArtifactAccess access = new SourceArtifactAccess(
                    new SourceArtifactRepository(
                        repositories.of(SourceArtifacts.class), work, ImmediateWork.storage(),
                        mock(SourceArtifactStore.class)
                    ),
                    new SubmissionArtifactRepository(
                        repositories.of(SubmissionArtifacts.class), repositories.of(Analyses.class), work,
                        repositories.transactions()
                    ),
                    mock(SourceArtifactStore.class), ImmediateWork.storage()
                );
                final Analysis analysis = new Analysis(
                    1, 1, 1, null, "NEW", "1", "test", "en", "DONE", ".sb3", null, null, null, null, null, null,
                    Map.of()
                );

                assertThat(access.findForAnalysis(analysis).block().originalFilename()).isNull();
                assertThat(access.submittedName(analysis).block()).isNull();
            }
        }
    }

    @SuppressWarnings("checkstyle:MethodLength")
    private void migrateAndAssert(final TestDatabase database) throws Exception {
        final Flyway flyway = Flyway.configure()
            .dataSource(database.dataSource())
            .locations(MIGRATIONS)
            .load();
        assertThat(flyway.migrate().migrationsExecuted).isGreaterThanOrEqualTo(2);
        assertThat(flyway.info().current().getVersion().getVersion()).isEqualTo("7");

        try (Connection connection = database.dataSource().getConnection()) {
            final Set<String> tables;
            try (var result = connection.getMetaData().getTables(null, null, "%", new String[] { "TABLE" })) {
                final Set<String> discovered = new HashSet<>();
                while (result.next()) {
                    final String table = result.getString("TABLE_NAME").toLowerCase();
                    if (EXPECTED_TABLES.contains(table)) {
                        discovered.add(table);
                    }
                }
                tables = discovered;
            }
            assertThat(tables).containsExactlyInAnyOrderElementsOf(EXPECTED_TABLES);

            try (Statement statement = connection.createStatement()) {
                statement.executeUpdate(
                    "INSERT INTO submission (share_token, source_type, locale, state) "
                        + "VALUES ('synthetic-token', 'UPLOAD', 'en', 'QUEUED')"
                );
                assertThatThrownBy(
                    () -> statement.executeUpdate(
                        "INSERT INTO submission (share_token, source_type, locale, state) "
                            + "VALUES ('synthetic-token', 'UPLOAD', 'en', 'QUEUED')"
                    )
                ).isInstanceOf(SQLException.class);
                statement.executeUpdate(
                    "INSERT INTO submission_event (submission_id, sequence_no, event_type, payload_json) "
                        + "VALUES (1, 1, 'QUEUED', '{}')"
                );
                assertThatThrownBy(
                    () -> statement.executeUpdate(
                        "INSERT INTO submission_event (submission_id, sequence_no, event_type, payload_json) "
                            + "VALUES (1, 1, 'DONE', '{}')"
                    )
                ).isInstanceOf(SQLException.class);
                statement.executeUpdate(
                    "INSERT INTO source_artifact "
                        + "(sha256, storage_key, byte_size, source_kind, retention_state) "
                        + "VALUES (UNHEX(REPEAT('aa', 32)), 'synthetic/key', 0, 'UPLOAD', 'ACTIVE')"
                );
                statement.executeUpdate(
                    INSERT_ANALYSIS
                        + "(submission_id, source_artifact_id, provenance, report_schema_version, "
                        + "litterbox_artifact_version, locale, status, from_creation) "
                        + "VALUES (1, 1, 'NEW', '1', 'synthetic', 'en', 'QUEUED', TRUE)"
                );
                // A submission is created once, and a request repeated after the first attempt died must resume that
                // creation rather than start a second under the same key.
                assertThatThrownBy(
                    () -> statement.executeUpdate(
                        INSERT_ANALYSIS
                            + "(submission_id, source_artifact_id, provenance, report_schema_version, "
                            + "litterbox_artifact_version, locale, status, from_creation) "
                            + "VALUES (1, 1, 'NEW', '1', 'synthetic', 'en', 'QUEUED', TRUE)"
                    )
                ).isInstanceOf(SQLException.class);
                // Running the project again is not that, and is not forbidden: a newer LitterBox over the project the
                // submission already holds is a second analysis, with its own version and its own result.
                statement.executeUpdate(
                    INSERT_ANALYSIS
                        + "(submission_id, source_artifact_id, provenance, report_schema_version, "
                        + "litterbox_artifact_version, locale, status) "
                        + "VALUES (1, 1, 'NEW', '1', 'synthetic-2', 'en', 'QUEUED')"
                );
                try (
                    var reanalysed = statement.executeQuery(
                        "SELECT COUNT(*) FROM analysis WHERE submission_id = 1 AND project_name IS NULL"
                    )
                ) {
                    assertThat(reanalysed.next()).isTrue();
                    assertThat(reanalysed.getInt(1)).isEqualTo(2);
                }
                statement.executeUpdate("DELETE FROM analysis WHERE litterbox_artifact_version = 'synthetic-2'");
                // The same holds for a project named out of a batch. Two workers unpacking one archive must not both
                // create the analysis of a project...
                statement.executeUpdate(
                    INSERT_ANALYSIS
                        + "(submission_id, source_artifact_id, project_name, provenance, report_schema_version, "
                        + "litterbox_artifact_version, locale, status, from_creation) "
                        + "VALUES (1, 1, 'child.sb3', 'NEW', '1', 'synthetic', 'en', 'QUEUED', TRUE)"
                );
                assertThatThrownBy(
                    () -> statement.executeUpdate(
                        INSERT_ANALYSIS
                            + "(submission_id, source_artifact_id, project_name, provenance, "
                            + "report_schema_version, litterbox_artifact_version, locale, status, from_creation) "
                            + "VALUES (1, 1, 'child.sb3', 'NEW', '1', 'synthetic', 'en', 'QUEUED', TRUE)"
                    )
                ).isInstanceOf(SQLException.class);
                // ...and analysing that retained project again afterwards is not that, and is allowed, which the
                // single global key on a submission's project names had forbidden.
                statement.executeUpdate(
                    INSERT_ANALYSIS
                        + "(submission_id, source_artifact_id, project_name, provenance, report_schema_version, "
                        + "litterbox_artifact_version, locale, status) "
                        + "VALUES (1, 1, 'child.sb3', 'NEW', '1', 'synthetic-3', 'en', 'QUEUED')"
                );
                try (
                    var named = statement.executeQuery(
                        "SELECT COUNT(*) FROM analysis WHERE submission_id = 1 AND project_name = 'child.sb3'"
                    )
                ) {
                    assertThat(named.next()).isTrue();
                    assertThat(named.getInt(1)).isEqualTo(2);
                }
                statement.executeUpdate("DELETE FROM analysis WHERE project_name = 'child.sb3'");
                statement.executeUpdate(
                    "INSERT INTO analysis_job (submission_id, analysis_id, state) VALUES (1, 1, 'QUEUED')"
                );
                statement.executeUpdate(
                    "INSERT INTO analysis_job (submission_id, job_kind, source_reference, state) "
                        + "VALUES (1, 'STUDIO_INGEST', '12345', 'QUEUED')"
                );
                try (
                    var studioJob = statement.executeQuery(
                        "SELECT analysis_id, job_kind, source_reference FROM analysis_job "
                            + "WHERE job_kind = 'STUDIO_INGEST'"
                    )
                ) {
                    assertThat(studioJob.next()).isTrue();
                    assertThat(studioJob.getObject("analysis_id")).isNull();
                    assertThat(studioJob.getString("job_kind")).isEqualTo("STUDIO_INGEST");
                    assertThat(studioJob.getString("source_reference")).isEqualTo("12345");
                }
                statement.executeUpdate(
                    "INSERT INTO analysis_metric (analysis_id, name, value) VALUES (1, 'block_count', 1)"
                );
                assertThatThrownBy(
                    () -> statement.executeUpdate(
                        "INSERT INTO analysis_metric (analysis_id, name, value) VALUES (1, 'block_count', 2)"
                    )
                ).isInstanceOf(SQLException.class);
                statement.executeUpdate(
                    "INSERT INTO statistics_distribution (metric, metric_value, count) "
                        + "VALUES ('block_count', 37, 1)"
                );
                assertThatThrownBy(
                    () -> statement.executeUpdate(
                        "INSERT INTO statistics_distribution (metric, metric_value, count) "
                            + "VALUES ('block_count', -1, 1)"
                    )
                ).isInstanceOf(SQLException.class);
                // An Ask AI conversation is addressed by its public id alone, so two conversations may never share
                // one.
                statement.executeUpdate(
                    "INSERT INTO ask_ai_conversation (public_id, submission_id, analysis_id, locale, scope_kind, "
                        + "scope_selector, scope_label, user_visible_until, analysis_retain_until) "
                        + "VALUES ('synthetic-conversation', 1, 1, 'en', 'common', 'common:SUMMARISE', 'SUMMARISE', "
                        + "NOW(6) + INTERVAL 7 DAY, NOW(6) + INTERVAL 30 DAY)"
                );
                assertThatThrownBy(
                    () -> statement.executeUpdate(
                        "INSERT INTO ask_ai_conversation (public_id, submission_id, analysis_id, locale, scope_kind, "
                            + "scope_selector, scope_label, user_visible_until, analysis_retain_until) "
                            + "VALUES ('synthetic-conversation', 1, 1, 'en', 'common', 'common:SUMMARISE', "
                            + "'SUMMARISE', NOW(6) + INTERVAL 7 DAY, NOW(6) + INTERVAL 30 DAY)"
                    )
                ).isInstanceOf(SQLException.class);
                // A client message id is an idempotency key within its conversation: a retried send must land on the
                // row the first attempt created, never beside it. The paired assistant row carries no client id, so
                // it sits under the same key without colliding.
                statement.executeUpdate(
                    "INSERT INTO ask_ai_message (conversation_id, ordinal, sender, action, outcome, "
                        + "client_message_id) VALUES (1, 1, 'user', 'ASK', 'ANSWERED', 'synthetic-message')"
                );
                assertThatThrownBy(
                    () -> statement.executeUpdate(
                        "INSERT INTO ask_ai_message (conversation_id, ordinal, sender, action, outcome, "
                            + "client_message_id) VALUES (1, 2, 'user', 'ASK', 'ANSWERED', 'synthetic-message')"
                    )
                ).isInstanceOf(SQLException.class);
                statement.executeUpdate(
                    "INSERT INTO ask_ai_message (conversation_id, ordinal, sender, action, outcome) "
                        + "VALUES (1, 2, 'assistant', 'ASK', 'ANSWERED')"
                );
                // Ordinals order one conversation's transcript, so a turn may never write two rows onto the same
                // position.
                assertThatThrownBy(
                    () -> statement.executeUpdate(
                        "INSERT INTO ask_ai_message (conversation_id, ordinal, sender, action, outcome) "
                            + "VALUES (1, 2, 'assistant', 'ASK', 'ANSWERED')"
                    )
                ).isInstanceOf(SQLException.class);
                statement.executeUpdate("DELETE FROM ask_ai_message WHERE conversation_id = 1");
                statement.executeUpdate("DELETE FROM ask_ai_conversation WHERE public_id = 'synthetic-conversation'");
                // The old site's SQL is not going to be run again, so the schema carries the tables and nothing
                // shaped like the database they replaced. A view here would be a contract nobody has agreed to keep.
                try (
                    var result = statement.executeQuery(
                        "SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLES "
                            + "WHERE TABLE_SCHEMA = DATABASE() AND TABLE_TYPE = 'VIEW'"
                    )
                ) {
                    assertThat(result.next()).isTrue();
                    assertThat(result.getInt(1)).isZero();
                }
                statement.executeUpdate(
                    "INSERT INTO idempotency_key "
                        + "(scope, idempotency_key, request_fingerprint, submission_id) "
                        + "VALUES ('public', 'synthetic-key', UNHEX(REPEAT('bb', 32)), 1)"
                );
                assertThatThrownBy(
                    () -> statement.executeUpdate(
                        "INSERT INTO idempotency_key "
                            + "(scope, idempotency_key, request_fingerprint, submission_id) "
                            + "VALUES ('public', 'synthetic-key', UNHEX(REPEAT('cc', 32)), 1)"
                    )
                ).isInstanceOf(SQLException.class);
                statement.executeUpdate(
                    "INSERT INTO issue_feedback (analysis_id, finder_name, reaction) "
                        + "VALUES (1, 'SyntheticFinder', 'HELPFUL')"
                );
                assertThatThrownBy(
                    () -> statement.executeUpdate(
                        "INSERT INTO issue_feedback (analysis_id, finder_name, reaction) "
                            + "VALUES (1, 'SyntheticFinder', 'NOT_HELPFUL')"
                    )
                ).isInstanceOf(SQLException.class);
                statement.executeUpdate(
                    "UPDATE analysis SET project_id = '123', project_name = 'synthetic.sb3', report_json = '{}' WHERE id = 1"
                );
                statement.executeUpdate(
                    "INSERT INTO scratch_project_stats (analysis_id, views, author_username) "
                        + "VALUES (1, 7, 'SyntheticResearcher')"
                );
                statement.executeUpdate(
                    "INSERT INTO legacy_id_map (old_table_name, old_id, old_token, old_filename, analysis_id) "
                        + "VALUES ('programme', '41', 'old-token', 'legacy.sb3', 1)"
                );
                statement.executeUpdate(
                    "INSERT INTO quiz_answer (analysis_id, question_id, answer, correct) "
                        + "VALUES (1, 'synthetic-question', 'synthetic-answer', TRUE)"
                );
                // The old identities stay resolvable as data: this is the row an old id, token or filename is
                // looked up through, now that nothing reshapes it into the columns the old site used.
                try (
                    var result = statement.executeQuery(
                        "SELECT map.old_token, map.old_filename, stats.author_username "
                            + "FROM legacy_id_map map "
                            + "JOIN scratch_project_stats stats ON stats.analysis_id = map.analysis_id "
                            + "WHERE map.old_table_name = 'programme' AND map.old_id = '41'"
                    )
                ) {
                    assertThat(result.next()).isTrue();
                    assertThat(result.getString("old_token")).isEqualTo("old-token");
                    assertThat(result.getString("old_filename")).isEqualTo("legacy.sb3");
                    assertThat(result.getString("author_username")).isEqualTo("SyntheticResearcher");
                }
                statement.executeUpdate(
                    "INSERT INTO submission (share_token, source_type, locale, state, expected_count) "
                        + "VALUES ('batch-token', 'TEACHER_ZIP', 'en', 'RUNNABLE', 2)"
                );
                statement.executeUpdate(
                    "INSERT INTO analysis (submission_id, source_artifact_id, project_name, provenance, "
                        + "report_schema_version, litterbox_artifact_version, locale, status) VALUES "
                        + "((SELECT id FROM submission WHERE share_token = 'batch-token'), 1, "
                        + "'failed.sb3', 'NEW', '1', 'synthetic', 'en', 'QUEUED'), "
                        + "((SELECT id FROM submission WHERE share_token = 'batch-token'), 1, "
                        + "'complete.sb3', 'NEW', '1', 'synthetic', 'en', 'QUEUED')"
                );
            }
        }
    }

    /**
     * The repositories and the migration describe one schema between them. This half drives the repositories against
     * the schema the half above just built, so a column either side gets wrong is a failure rather than a surprise.
     */
    @SuppressWarnings("checkstyle:MethodLength")
    private void assertRepositoriesAgreeWithTheSchema(
        final TestDatabase database,
        final TestRepositories repositories
    ) throws Exception {
        {
            final JdbcTemplate jdbc = database.jdbcTemplate();
            final AnalysisRepository analyses = new AnalysisRepository(
                repositories.of(Analyses.class), repositories.of(AnalysisMetrics.class),
                repositories.of(AnalysisJobs.class), repositories.of(Submissions.class),
                repositories.of(SubmissionEvents.class), ImmediateWork.database(),
                repositories.transactions()
            );
            final long batchId = jdbc.queryForObject(
                "SELECT id FROM submission WHERE share_token = 'batch-token'", Long.class
            );
            final List<Long> analysisIds = jdbc.queryForList(
                "SELECT id FROM analysis WHERE submission_id = ? ORDER BY id", Long.class, batchId
            );
            // An outcome is only ever recorded by the worker holding the job's lease, so each analysis needs one.
            for (final Long analysisId : analysisIds) {
                jdbc.update(
                    "INSERT INTO analysis_job (submission_id, analysis_id, state, lease_owner, lease_until) "
                        + "VALUES (?, ?, 'RUNNING', 'worker', DATE_ADD(CURRENT_TIMESTAMP(6), INTERVAL 1 MINUTE))",
                    batchId, analysisId
                );
            }
            final List<Long> jobIds = jdbc.queryForList(
                "SELECT id FROM analysis_job WHERE submission_id = ? ORDER BY analysis_id", Long.class, batchId
            );
            assertThat(
                analyses.completeIfOwned(
                    analysisIds.get(0), batchId, true, null, "SyntheticFailure", "synthetic",
                    "{\"status\":\"failed\"}", null, null, null, jobIds.get(0), WORKER
                ).block()
            ).isTrue();
            // The same worker handing in the same answer twice changes nothing the second time.
            assertThat(
                analyses.completeIfOwned(
                    analysisIds.get(0), batchId, true, null, "SyntheticFailure", "synthetic",
                    "{\"status\":\"failed\"}", null, null, null, jobIds.get(0), WORKER
                ).block()
            ).isFalse();
            assertThat(jdbc.queryForObject("SELECT state FROM submission WHERE id = ?", String.class, batchId))
                .isEqualTo("RUNNING");
            assertThat(
                jdbc.queryForMap(
                    "SELECT completed_count, failed_count FROM submission WHERE id = ?", batchId
                )
            ).containsEntry("completed_count", 0).containsEntry("failed_count", 1);
            assertThat(
                jdbc.queryForObject(
                    "SELECT COUNT(*) FROM submission_event WHERE submission_id = ?", Integer.class, batchId
                )
            ).isEqualTo(1);
            assertThat(
                analyses.completeIfOwned(
                    analysisIds.get(1), batchId, false, "{}", null, null, "{\"status\":\"completed\"}",
                    null, null, null, jobIds.get(1), WORKER
                ).block()
            ).isTrue();
            assertThat(jdbc.queryForObject("SELECT state FROM submission WHERE id = ?", String.class, batchId))
                .isEqualTo("PARTIAL");
            // The numbers are the database's and shared with every submission, so what they are is not the point;
            // that this submission collected two of them, in the order they happened, is.
            assertThat(
                jdbc.queryForList(
                    "SELECT sequence_no FROM submission_event WHERE submission_id = ? ORDER BY sequence_no", Long.class,
                    batchId
                )
            ).hasSize(2).doesNotHaveDuplicates().isSorted();
            jdbc.update(
                "INSERT INTO submission (share_token, source_type, locale, state, expected_count) "
                    + "VALUES ('cancel-token', 'UPLOAD', 'en', 'RUNNING', 1)"
            );
            final long cancelledSubmissionId = jdbc.queryForObject(
                "SELECT id FROM submission WHERE share_token = 'cancel-token'", Long.class
            );
            jdbc.update(
                "INSERT INTO analysis (submission_id, source_artifact_id, project_name, provenance, "
                    + "report_schema_version, litterbox_artifact_version, locale, status) "
                    + "VALUES (?, 1, 'cancelled.sb3', 'NEW', '1', 'synthetic', 'en', 'RUNNING')",
                cancelledSubmissionId
            );
            final long cancelledAnalysisId = jdbc.queryForObject(
                "SELECT id FROM analysis WHERE submission_id = ?", Long.class, cancelledSubmissionId
            );
            jdbc.update(
                "INSERT INTO analysis_job (submission_id, analysis_id, state, lease_owner, lease_until) "
                    + "VALUES (?, ?, 'RUNNING', 'worker', DATE_ADD(CURRENT_TIMESTAMP(6), INTERVAL 1 MINUTE))",
                cancelledSubmissionId, cancelledAnalysisId
            );
            final long cancelledJobId = jdbc.queryForObject(
                "SELECT id FROM analysis_job WHERE analysis_id = ?", Long.class, cancelledAnalysisId
            );
            final AnalysisJobRepository jobs = new AnalysisJobRepository(
                repositories.of(AnalysisJobs.class), repositories.of(Analyses.class),
                repositories.of(Submissions.class), repositories.of(SubmissionEvents.class),
                ImmediateWork.database(), repositories.transactions()
            );
            final SubmissionRepository submissions = new SubmissionRepository(
                repositories.of(Submissions.class), repositories.of(SubmissionEvents.class),
                repositories.of(AnalysisJobs.class), repositories.of(Analyses.class), ImmediateWork.database(),
                repositories.transactions()
            );
            submissions.cancelEverything(cancelledSubmissionId).block();
            // A worker that was already running this analysis when it was cancelled still has an answer to hand in.
            // The cancellation is what stands, and the answer is refused rather than recorded over it.
            assertThat(
                analyses.completeIfOwned(
                    cancelledAnalysisId, cancelledSubmissionId, false, "{}", null, null,
                    "{\"status\":\"completed\"}", null, null, null, cancelledJobId, WORKER
                ).block()
            ).isFalse();
            jobs.finish(cancelledJobId, WORKER, false).block();
            assertThat(
                jdbc.queryForObject(
                    "SELECT state FROM submission WHERE id = ?", String.class, cancelledSubmissionId
                )
            ).isEqualTo("CANCELLED");
            assertThat(
                jdbc.queryForObject(
                    "SELECT status FROM analysis WHERE id = ?", String.class, cancelledAnalysisId
                )
            ).isEqualTo("CANCELLED");
            assertThat(
                jdbc.queryForObject(
                    "SELECT state FROM analysis_job WHERE id = ?", String.class, cancelledJobId
                )
            ).isEqualTo("CANCELLED");
        }
    }
}
