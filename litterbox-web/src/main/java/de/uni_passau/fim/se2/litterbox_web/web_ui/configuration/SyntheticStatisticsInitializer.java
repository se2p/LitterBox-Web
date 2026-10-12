/*
 * Copyright (C) 2024-2026 LitterBox-Web contributors
 *
 * This file is part of LitterBox-Web.
 * Licenced under the EUPL-1.2 or later.
 *
 * SPDX-FileCopyrightText: 2024-2026 LitterBox-Web contributors
 * SPDX-License-Identifier: EUPL-1.2
 */
package de.uni_passau.fim.se2.litterbox_web.web_ui.configuration;

import java.util.ArrayList;
import java.util.List;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Profile;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import de.uni_passau.fim.se2.litterbox_web.web_ui.statistics.PublicStatisticsService;
import de.uni_passau.fim.se2.litterbox_web.web_ui.support.WebUiProfiles;

/** Gives an explicitly opted-in local deployment enough synthetic aggregate data to exercise every public chart. */
@Component
@Profile(WebUiProfiles.PUBLIC_WEB)
@ConditionalOnProperty(
    prefix = "litterbox.statistics.synthetic-demo",
    name = "enabled",
    havingValue = "true"
)
public class SyntheticStatisticsInitializer implements ApplicationRunner {

    private static final long BASE_PROJECTS = 12;
    private static final String SPRITE_COUNT = "sprite_count";
    private static final String SCRIPT_COUNT = "script_count";
    private static final String BLOCK_COUNT = "block_count";
    private static final String BUG_COUNT = "bug_count";
    private static final String SMELL_COUNT = "smell_count";
    private static final String PERFUME_COUNT = "perfume_count";
    private static final String INTERPROCEDURAL_COMPLEXITY = "interprocedural_cyclomatic_complexity";
    private static final String MOST_COMPLEX_SCRIPT = "most_complex_script";
    private static final String MAX_NESTED_BLOCK_COUNT = "max_nested_block_count";
    private static final String LONGEST_SCRIPT = "length_longest_script";
    private static final String PROCEDURE_COUNT = "procedure_count";
    private static final String VARIABLE_COUNT = "variable_count";

    private final JdbcTemplate database;
    private final long scale;
    private final long projects;

    public SyntheticStatisticsInitializer(
        final JdbcTemplate database,
        @Value(
            "${litterbox.statistics.minimum-public-sample-size:"
                + PublicStatisticsService.DEFAULT_MINIMUM_SAMPLE_SIZE + "}"
        ) final int minimumSampleSize
    ) {
        if (minimumSampleSize < 1) {
            throw new IllegalArgumentException("Minimum public sample size must be positive");
        }
        this.database = database;
        this.scale = Math.ceilDiv(minimumSampleSize, BASE_PROJECTS);
        this.projects = BASE_PROJECTS * scale;
    }

    @Override
    @Transactional
    public void run(final ApplicationArguments arguments) {
        final Long existing = database.queryForObject("SELECT COUNT(*) FROM statistics_total", Long.class);
        if (existing == null || existing != 0) {
            return;
        }
        database.update(
            "INSERT INTO statistics_total "
                + "(singleton, projects, finding_projects, block_category_projects, blocks, scripts, sprites, "
                + "synthetic) VALUES (1, ?, ?, ?, ?, ?, ?, TRUE)",
            projects, projects, projects, 1_640 * scale, 142 * scale, 58 * scale
        );
        distributions();
        findings();
        blockCategories();
    }

    private void distributions() {
        final List<Distribution> rows = distributionRows();
        database.batchUpdate(
            "INSERT INTO statistics_distribution (metric, metric_value, count) VALUES (?, ?, ?)",
            rows,
            rows.size(),
            (statement, row) -> {
                statement.setString(1, row.metric());
                statement.setLong(2, row.value());
                statement.setLong(3, row.count() * scale);
            }
        );
    }

    private static List<Distribution> distributionRows() {
        final List<Distribution> rows = new ArrayList<>(projectSizeDistributionRows());
        rows.addAll(findingDistributionRows());
        rows.addAll(codeStructureDistributionRows());
        return List.copyOf(rows);
    }

    private static List<Distribution> projectSizeDistributionRows() {
        return List.of(
            distribution(SPRITE_COUNT, 1, 1),
            distribution(SPRITE_COUNT, 2, 2),
            distribution(SPRITE_COUNT, 3, 2),
            distribution(SPRITE_COUNT, 4, 2),
            distribution(SPRITE_COUNT, 5, 1),
            distribution(SPRITE_COUNT, 6, 1),
            distribution(SPRITE_COUNT, 7, 1),
            distribution(SPRITE_COUNT, 9, 1),
            distribution(SPRITE_COUNT, 12, 1),
            distribution(SCRIPT_COUNT, 1, 1),
            distribution(SCRIPT_COUNT, 3, 1),
            distribution(SCRIPT_COUNT, 5, 1),
            distribution(SCRIPT_COUNT, 6, 1),
            distribution(SCRIPT_COUNT, 8, 1),
            distribution(SCRIPT_COUNT, 9, 1),
            distribution(SCRIPT_COUNT, 10, 1),
            distribution(SCRIPT_COUNT, 12, 1),
            distribution(SCRIPT_COUNT, 15, 1),
            distribution(SCRIPT_COUNT, 18, 1),
            distribution(SCRIPT_COUNT, 23, 1),
            distribution(SCRIPT_COUNT, 32, 1),
            distribution(BLOCK_COUNT, 10, 1),
            distribution(BLOCK_COUNT, 25, 1),
            distribution(BLOCK_COUNT, 40, 1),
            distribution(BLOCK_COUNT, 60, 1),
            distribution(BLOCK_COUNT, 85, 1),
            distribution(BLOCK_COUNT, 100, 1),
            distribution(BLOCK_COUNT, 120, 1),
            distribution(BLOCK_COUNT, 140, 1),
            distribution(BLOCK_COUNT, 170, 1),
            distribution(BLOCK_COUNT, 220, 1),
            distribution(BLOCK_COUNT, 280, 1),
            distribution(BLOCK_COUNT, 390, 1)
        );
    }

    private static List<Distribution> findingDistributionRows() {
        return List.of(
            distribution(BUG_COUNT, 0, 2),
            distribution(BUG_COUNT, 1, 3),
            distribution(BUG_COUNT, 2, 3),
            distribution(BUG_COUNT, 3, 2),
            distribution(BUG_COUNT, 5, 2),
            distribution(SMELL_COUNT, 0, 3),
            distribution(SMELL_COUNT, 1, 3),
            distribution(SMELL_COUNT, 2, 3),
            distribution(SMELL_COUNT, 4, 2),
            distribution(SMELL_COUNT, 7, 1),
            distribution(PERFUME_COUNT, 0, 1),
            distribution(PERFUME_COUNT, 1, 3),
            distribution(PERFUME_COUNT, 2, 4),
            distribution(PERFUME_COUNT, 3, 2),
            distribution(PERFUME_COUNT, 5, 2)
        );
    }

    private static List<Distribution> codeStructureDistributionRows() {
        return List.of(
            distribution(INTERPROCEDURAL_COMPLEXITY, 1, 1),
            distribution(INTERPROCEDURAL_COMPLEXITY, 3, 2),
            distribution(INTERPROCEDURAL_COMPLEXITY, 6, 3),
            distribution(INTERPROCEDURAL_COMPLEXITY, 10, 3),
            distribution(INTERPROCEDURAL_COMPLEXITY, 18, 2),
            distribution(INTERPROCEDURAL_COMPLEXITY, 35, 1),
            distribution(MOST_COMPLEX_SCRIPT, 1, 1),
            distribution(MOST_COMPLEX_SCRIPT, 4, 2),
            distribution(MOST_COMPLEX_SCRIPT, 8, 3),
            distribution(MOST_COMPLEX_SCRIPT, 14, 3),
            distribution(MOST_COMPLEX_SCRIPT, 24, 2),
            distribution(MOST_COMPLEX_SCRIPT, 45, 1),
            distribution(MAX_NESTED_BLOCK_COUNT, 0, 2),
            distribution(MAX_NESTED_BLOCK_COUNT, 1, 3),
            distribution(MAX_NESTED_BLOCK_COUNT, 3, 3),
            distribution(MAX_NESTED_BLOCK_COUNT, 6, 2),
            distribution(MAX_NESTED_BLOCK_COUNT, 10, 1),
            distribution(MAX_NESTED_BLOCK_COUNT, 18, 1),
            distribution(LONGEST_SCRIPT, 1, 1),
            distribution(LONGEST_SCRIPT, 4, 2),
            distribution(LONGEST_SCRIPT, 9, 2),
            distribution(LONGEST_SCRIPT, 15, 3),
            distribution(LONGEST_SCRIPT, 24, 2),
            distribution(LONGEST_SCRIPT, 38, 1),
            distribution(LONGEST_SCRIPT, 62, 1),
            distribution(PROCEDURE_COUNT, 0, 5),
            distribution(PROCEDURE_COUNT, 1, 3),
            distribution(PROCEDURE_COUNT, 2, 2),
            distribution(PROCEDURE_COUNT, 4, 1),
            distribution(PROCEDURE_COUNT, 7, 1),
            distribution(VARIABLE_COUNT, 0, 2),
            distribution(VARIABLE_COUNT, 1, 2),
            distribution(VARIABLE_COUNT, 2, 3),
            distribution(VARIABLE_COUNT, 4, 3),
            distribution(VARIABLE_COUNT, 7, 1),
            distribution(VARIABLE_COUNT, 12, 1)
        );
    }

    private void findings() {
        final List<Finding> rows = List.of(
            finding("message_never_sent", "bug", 8, 12),
            finding("missing_loop_sensing", "bug", 6, 8),
            finding("type_error", "bug", 4, 5),
            finding("unused_variables", "smell", 7, 11),
            finding("nested_loops", "smell", 4, 6),
            finding("unnecessary_if", "smell", 3, 4),
            finding("initialisation_of_position", "perfume", 9, 10),
            finding("loop_sensing", "perfume", 7, 9),
            finding("correct_broadcast", "perfume", 5, 5)
        );
        database.batchUpdate(
            "INSERT INTO statistics_finding "
                + "(finder_id, issue_type, projects_affected, occurrences) VALUES (?, ?, ?, ?)",
            rows,
            rows.size(),
            (statement, row) -> {
                statement.setString(1, row.finderId());
                statement.setString(2, row.issueType());
                statement.setLong(3, row.projectsAffected() * scale);
                statement.setLong(4, row.occurrences() * scale);
            }
        );
    }

    private void blockCategories() {
        final List<Category> rows = List.of(
            category("motion_block_count", 11, 260), category("looks_block_count", 10, 210),
            category("sound_block_count", 7, 70), category("events_block_count", 12, 190),
            category("control_block_count", 9, 300), category("sensing_block_count", 8, 150),
            category("operators_block_count", 8, 200), category("variables_block_count", 6, 170),
            category("my_blocks_block_count", 3, 40), category("other_block_count", 5, 50)
        );
        database.batchUpdate(
            "INSERT INTO statistics_block_category (metric, projects_using, blocks) VALUES (?, ?, ?)",
            rows,
            rows.size(),
            (statement, row) -> {
                statement.setString(1, row.metric());
                statement.setLong(2, row.projectsUsing() * scale);
                statement.setLong(3, row.blocks() * scale);
            }
        );
    }

    private static Distribution distribution(final String metric, final long value, final long count) {
        return new Distribution(metric, value, count);
    }

    private static Finding finding(
        final String finderId,
        final String issueType,
        final long projectsAffected,
        final long occurrences
    ) {
        return new Finding(finderId, issueType, projectsAffected, occurrences);
    }

    private static Category category(final String metric, final long projectsUsing, final long blocks) {
        return new Category(metric, projectsUsing, blocks);
    }

    private record Distribution(String metric, long value, long count) {
    }

    private record Finding(String finderId, String issueType, long projectsAffected, long occurrences) {
    }

    private record Category(String metric, long projectsUsing, long blocks) {
    }

}
