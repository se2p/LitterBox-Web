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

import static org.assertj.core.api.Assertions.assertThat;

import java.time.LocalDate;

import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;

import de.uni_passau.fim.se2.litterbox_web.util.TestDatabase;
import de.uni_passau.fim.se2.litterbox_web.web_ui.util.TestRepositories;
import jakarta.persistence.EntityManager;

class StatisticsRepositoryIntegrationTest {

    private static final String REPORT = "{\"project\":\"synthetic\"}";

    @Test
    void readsTheScalarReportReturnedByMariaDb() {
        try (
            TestDatabase database = TestDatabase.freshSchema("statistics_repository").migrated();
            TestRepositories repositories = new TestRepositories(database);
            EntityManager entityManager = repositories.entityManagerFactory().createEntityManager()
        ) {
            final long analysisId = insertAnalysis(database.jdbcTemplate(), "report");
            entityManager.getTransaction().begin();
            final StatisticsRepository.AnalysisRow result = new StatisticsRepository(entityManager)
                .analysis(analysisId);
            entityManager.getTransaction().commit();

            assertThat(result.reportJson()).isEqualTo(REPORT);
            assertThat(result.legacy()).isFalse();
        }
    }

    @Test
    void makesMigratedAnalysesEligibleAfterCurrentAnalyses() {
        try (
            TestDatabase database = TestDatabase.freshSchema("statistics_legacy_eligibility").migrated();
            TestRepositories repositories = new TestRepositories(database);
            EntityManager entityManager = repositories.entityManagerFactory().createEntityManager()
        ) {
            final long legacyAnalysisId = insertAnalysis(database.jdbcTemplate(), "legacy");
            final long currentAnalysisId = insertAnalysis(database.jdbcTemplate(), "current");
            database.jdbcTemplate().update(
                "UPDATE analysis SET provenance = 'LEGACY', detector_set = NULL, "
                    + "completed_at = '2026-08-13 12:00:00' WHERE id = ?",
                legacyAnalysisId
            );
            database.jdbcTemplate().update(
                "UPDATE analysis SET completed_at = '2026-08-13 12:00:00' WHERE id = ?",
                currentAnalysisId
            );
            final StatisticsRepository repository = new StatisticsRepository(entityManager);

            entityManager.getTransaction().begin();
            assertThat(repository.eligibleAnalysisIds(LocalDate.of(2026, 8, 14), 10))
                .containsExactly(currentAnalysisId, legacyAnalysisId);
            assertThat(repository.claim(legacyAnalysisId, LocalDate.of(2026, 8, 14))).isTrue();
            assertThat(repository.analysis(legacyAnalysisId).legacy()).isTrue();
            entityManager.getTransaction().commit();
        }
    }

    @Test
    void storesIndependentComparableProjectCounts() {
        try (
            TestDatabase database = TestDatabase.freshSchema("statistics_sample_counts").migrated();
            TestRepositories repositories = new TestRepositories(database);
            EntityManager entityManager = repositories.entityManagerFactory().createEntityManager()
        ) {
            final StatisticsRepository repository = new StatisticsRepository(entityManager);

            entityManager.getTransaction().begin();
            repository.addTotals(25, 6, 2, false, true);
            final StatisticsRepository.Totals totals = repository.snapshot().totals();
            entityManager.getTransaction().commit();

            assertThat(totals.projects()).isEqualTo(1);
            assertThat(totals.findingProjects()).isZero();
            assertThat(totals.blockCategoryProjects()).isEqualTo(1);
        }
    }

    private static long insertAnalysis(final JdbcTemplate jdbc, final String suffix) {
        final String token = "statistics-repository-" + suffix;
        final String storageKey = "statistics/" + suffix + ".sb3";
        jdbc.update(
            "INSERT INTO submission (share_token, source_type, locale, state) VALUES (?, 'UPLOAD', 'en', 'DONE')",
            token
        );
        final long submissionId = jdbc.queryForObject(
            "SELECT id FROM submission WHERE share_token = ?", Long.class, token
        );
        jdbc.update(
            "INSERT INTO source_artifact (sha256, storage_key, byte_size, source_kind, retention_state) "
                + "VALUES (UNHEX(SHA2(?, 256)), ?, 1, 'PROJECT', 'ACTIVE')",
            "statistics-repository-" + suffix, storageKey
        );
        final long artifactId = jdbc.queryForObject(
            "SELECT id FROM source_artifact WHERE storage_key = ?", Long.class, storageKey
        );
        jdbc.update(
            "INSERT INTO analysis (submission_id, source_artifact_id, provenance, report_schema_version, "
                + "litterbox_artifact_version, detector_set, locale, report_json, status, from_creation, completed_at) "
                + "VALUES (?, ?, 'NEW', '1', 'test', 'all', 'en', ?, 'DONE', TRUE, CURRENT_TIMESTAMP(6))",
            submissionId, artifactId, REPORT
        );
        return jdbc.queryForObject(
            "SELECT id FROM analysis WHERE submission_id = ?", Long.class, submissionId
        );
    }
}
