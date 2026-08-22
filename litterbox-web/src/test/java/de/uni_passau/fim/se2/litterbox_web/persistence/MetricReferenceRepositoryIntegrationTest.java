/*
 * Copyright (C) 2024-2026 LitterBox-Web contributors
 *
 * This file is part of LitterBox-Web.
 * Licenced under the EUPL-1.2 or later.
 *
 * SPDX-FileCopyrightText: 2024-2026 LitterBox-Web contributors
 * SPDX-License-Identifier: EUPL-1.2
 */
package de.uni_passau.fim.se2.litterbox_web.persistence;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;

import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;

import de.uni_passau.fim.se2.litterbox_web.persistence.jpa.AnalysisMetrics;
import de.uni_passau.fim.se2.litterbox_web.util.ImmediateWork;
import de.uni_passau.fim.se2.litterbox_web.util.TestDatabase;
import de.uni_passau.fim.se2.litterbox_web.util.TestRepositories;

/**
 * The terciles are computed by the database, in a window function this project uses nowhere else. Whether that
 * expression means what it is meant to is not something a mocked {@link JdbcTemplate} can answer.
 */
class MetricReferenceRepositoryIntegrationTest {

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

            // Nineteen projects describe whoever happened to submit something rather than what a project usually
            // comes to, and a child told their project is unusual deserves better evidence than that.
            seed(jdbc, 1, 19, "DONE");
            assertThat(repository.distributions(20).block()).isEmpty();

            // Ninety completed projects whose block counts are 1..90, so the terciles fall on the thirty-first and
            // the sixty-first value. One project is still running and one failed; neither has been analysed to a
            // result, so neither belongs in what an analysed project comes to.
            seed(jdbc, 20, 90, "DONE");
            seed(jdbc, 1000, 1000, "RUNNING");
            seed(jdbc, 2000, 2000, "FAILED");

            final List<MetricReferenceRepository.MetricDistribution> distributions = repository.distributions(20)
                .block();

            assertThat(distributions).hasSize(1);
            final MetricReferenceRepository.MetricDistribution blocks = distributions.getFirst();
            assertThat(blocks.name()).isEqualTo("block_count");
            assertThat(blocks.sampleSize()).isEqualTo(90);
            assertThat(blocks.lowerBound()).isEqualTo(31.0);
            assertThat(blocks.upperBound()).isEqualTo(61.0);
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

    /**
     * One analysis per value in the range, each measured as having that many blocks.
     *
     * <p>
     * Named, as a batch's projects are. A hundred measured projects arrive as a batch or as a hundred submissions,
     * never as a hundred nameless analyses of one submission, and the distribution is meant to describe the first.
     */
    private void seed(final JdbcTemplate jdbc, final int from, final int to, final String status) {
        for (int blocks = from; blocks <= to; blocks++) {
            jdbc.update(
                "INSERT INTO analysis (submission_id, source_artifact_id, project_name, provenance, "
                    + "report_schema_version, litterbox_artifact_version, locale, status) "
                    + "VALUES (1, 1, ?, 'NEW', '1', 'synthetic', 'en', ?)",
                "project-" + blocks + ".sb3", status
            );
            // The connection is not held across statements, so LAST_INSERT_ID() would answer for a different one.
            jdbc.update(
                "INSERT INTO analysis_metric (analysis_id, name, value) "
                    + "SELECT MAX(id), 'block_count', ? FROM analysis",
                (double) blocks
            );
        }
    }
}
