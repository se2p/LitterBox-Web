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

import java.util.List;

import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;

import de.uni_passau.fim.se2.litterbox_web.util.TestDatabase;
import de.uni_passau.fim.se2.litterbox_web.web_ui.persistence.jpa.AnalysisMetrics;
import de.uni_passau.fim.se2.litterbox_web.web_ui.util.ImmediateWork;
import de.uni_passau.fim.se2.litterbox_web.web_ui.util.TestRepositories;

/**
 * The terciles are computed by the database, in a window function this project uses nowhere else.
 */
class MetricReferenceRepositoryIntegrationTest {

    private static final String BLOCK_COUNT = "block_count";

    @Test
    void reportsTheTercilesOfEachMeasurementOnceEnoughProjectsCarryIt() throws Exception {
        try (
            TestDatabase database = TestDatabase.freshSchema("metric_reference");
            TestRepositories repositories = new TestRepositories(database.migrated())
        ) {
            final JdbcTemplate jdbc = seeded(database.jdbcTemplate());
            final MetricReferenceRepository repository = new MetricReferenceRepository(
                repositories.of(AnalysisMetrics.class), ImmediateWork.database()
            );

            seed(jdbc, 1, 19, "DONE", BLOCK_COUNT);
            assertThat(repository.distributions(20).block()).isEmpty();

            // One project is still running and one failed; neither has been analysed to a
            // result, so neither belongs in what an analysed project comes to.
            seed(jdbc, 20, 90, "DONE", BLOCK_COUNT);
            seed(jdbc, 1000, 1000, "RUNNING", BLOCK_COUNT);
            seed(jdbc, 2000, 2000, "FAILED", BLOCK_COUNT);

            // A second, odd-sized sample for a second metric, so the quartile arithmetic is pinned for both an even
            // and an odd sample size rather than only the ninety values above.
            seed(jdbc, 1, 21, "DONE", "cyclomatic_complexity");

            final List<MetricReferenceRepository.MetricDistribution> distributions = repository.distributions(20)
                .block();

            assertThat(distributions).hasSize(2);
            final MetricReferenceRepository.MetricDistribution blocks = distributions.stream()
                .filter(distribution -> distribution.name().equals(BLOCK_COUNT))
                .findFirst()
                .orElseThrow();
            assertThat(blocks.sampleSize()).isEqualTo(90);
            assertThat(blocks.lowerBound()).isEqualTo(31.0);
            assertThat(blocks.upperBound()).isEqualTo(61.0);
            assertThat(blocks.minimum()).isEqualTo(1.0);
            assertThat(blocks.q1()).isEqualTo(23.0);
            assertThat(blocks.median()).isEqualTo(46.0);
            assertThat(blocks.q3()).isEqualTo(68.0);
            assertThat(blocks.maximum()).isEqualTo(90.0);

            final MetricReferenceRepository.MetricDistribution complexity = distributions.stream()
                .filter(distribution -> distribution.name().equals("cyclomatic_complexity"))
                .findFirst()
                .orElseThrow();
            assertThat(complexity.sampleSize()).isEqualTo(21);
            assertThat(complexity.lowerBound()).isEqualTo(8.0);
            assertThat(complexity.upperBound()).isEqualTo(15.0);
            assertThat(complexity.minimum()).isEqualTo(1.0);
            assertThat(complexity.q1()).isEqualTo(6.0);
            assertThat(complexity.median()).isEqualTo(11.0);
            assertThat(complexity.q3()).isEqualTo(16.0);
            assertThat(complexity.maximum()).isEqualTo(21.0);
        }
    }

    private JdbcTemplate seeded(final JdbcTemplate jdbc) {
        jdbc.update(
            "INSERT INTO submission (share_token, source_type, locale, state) "
                + "VALUES ('synthetic-token', 'UPLOAD', 'en', 'COMPLETED')"
        );
        jdbc.update(
            "INSERT INTO source_artifact (sha256, storage_key, byte_size, source_kind, retention_state) "
                + "VALUES (UNHEX(REPEAT('aa', 32)), 'synthetic/key', 0, 'UPLOAD', 'ACTIVE')"
        );
        return jdbc;
    }

    private void seed(final JdbcTemplate jdbc, final int from, final int to, final String status, final String metric) {
        for (int value = from; value <= to; value++) {
            jdbc.update(
                "INSERT INTO analysis (submission_id, source_artifact_id, project_name, provenance, "
                    + "report_schema_version, litterbox_artifact_version, locale, status) "
                    + "VALUES (1, 1, ?, 'NEW', '1', 'synthetic', 'en', ?)",
                "project-" + metric + "-" + value + ".sb3", status
            );
            // The connection is not held across statements, so LAST_INSERT_ID() would answer for a different one.
            jdbc.update(
                "INSERT INTO analysis_metric (analysis_id, name, value) "
                    + "SELECT MAX(id), ?, ? FROM analysis",
                metric, (double) value
            );
        }
    }
}
