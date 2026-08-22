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

import java.sql.Types;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

final class LegacySchemaContract {

    static final List<String> TABLES = List
        .of("programme", "statistiken", "feedback", "fragen", "extId", "nachrichten");
    static final List<String> STATISTIKEN_COLUMNS = List.of(
        ("id program perfumes smells bugs block_count ct_score_average ct_score ct_score_abstraction "
            + "ct_score_data_representation ct_score_flow_control ct_score_logic ct_score_parallelization "
            + "ct_score_synchronization ct_score_user_interactivity control_block_count events_block_count "
            + "halstead_difficulty halstead_effort halstead_length halstead_size halstead_volume hat_count "
            + "interprocedural_cyclomatic_complexity inside_control_control_stmt_count "
            + "inside_control_events_stmt_count inside_control_looks_stmt_count inside_control_motion_stmt_count "
            + "inside_control_my_blocks_stmt_count inside_control_pen_stmt_count inside_control_sensing_stmt_count "
            + "inside_control_sound_stmt_count inside_control_variables_stmt_count length_longest_script "
            + "looks_block_count most_complex_script motion_block_count my_blocks_block_count operators_block_count "
            + "pen_block_count procedure_count script_count sensing_block_count sound_block_count statement_count "
            + "top_level_control_stmt_count sprite_count using_pen top_level_events_stmt_count "
            + "top_level_looks_stmt_count top_level_motion_stmt_count top_level_my_blocks_stmt_count "
            + "top_level_pen_stmt_count top_level_sensing_stmt_count top_level_sound_stmt_count "
            + "top_level_variables_stmt_count variables_block_count weighted_method_count_strict "
            + "weighted_method_count views loves favorites remixes author created avg_block_statement_count "
            + "avg_script_width_count avg_variable_length_count backdrop_count boolean_operation_count "
            + "category_entropy cohesion costume_count interprocedural_slice_coverage "
            + "list_block_count_only_direct_list music_block_count nested_block_count stacked_statement_count "
            + "token_entropy translate_block_count undefined_block_count variable_count "
            + "variables_block_count_only_direct_variable ambient_light_block_count robot_auriga_counter "
            + "battery_block_count robot_codey_counter color_detection_block_count distance_block_count "
            + "gear_potentiometer_block_count gyro_block_count line_following_block_count loudness_block_count "
            + "m_block_count robot_mcore_counter robot_megapi_counter real_codey_program real_mcore_program "
            + "real_robot_program robot_code_finder rocky_light_used shaking_strength_block_count").split(" ")
    );
    static final Set<String> STATISTICS_METADATA = Set.of(
        "id", "program", "views", "loves", "favorites", "remixes", "author", "created"
    );
    static final Set<String> STATIC_METRIC_NAMES = statisticsMetricNames();
    static final Map<String, Table> CONTRACT = contract();

    private LegacySchemaContract() {
    }

    private static Map<String, Table> contract() {
        final Map<String, Table> tables = new LinkedHashMap<>();
        tables.put(
            "programme", table(
                column("id", Kind.INTEGRAL),
                column("token", Kind.CHARACTER),
                column("gender", Kind.TEXT),
                column("scratchUsername", Kind.TEXT),
                column("file", Kind.TEXT),
                column("url", Kind.TEXT),
                column("description", Kind.CHARACTER),
                column("institution", Kind.CHARACTER),
                column("litterbox", Kind.TEXT),
                column("ip", Kind.TEXT),
                column("time", Kind.TEMPORAL)
            )
        );
        tables.put("statistiken", statisticsTable());
        tables.put(
            "feedback", table(
                column("id", Kind.INTEGRAL),
                column("program", Kind.INTEGRAL),
                column("pattern", Kind.CHARACTER),
                column("reaction", Kind.INTEGRAL),
                column("time", Kind.TEMPORAL)
            )
        );
        tables.put(
            "fragen", table(
                column("id", Kind.INTEGRAL),
                column("programName", Kind.CHARACTER),
                column("question", Kind.CHARACTER),
                column("answer", Kind.CHARACTER),
                column("correct", Kind.TEXT),
                column("time", Kind.TEMPORAL)
            )
        );
        tables.put(
            "extId", table(
                column("id", Kind.INTEGRAL),
                column("extId", Kind.CHARACTER),
                column("timestamp", Kind.TEMPORAL)
            )
        );
        tables.put(
            "nachrichten", table(
                column("id", Kind.INTEGRAL),
                column("age", Kind.CHARACTER),
                column("mail", Kind.CHARACTER),
                column("gender", Kind.CHARACTER),
                column("subject", Kind.CHARACTER),
                column("message", Kind.CHARACTER),
                column("ip", Kind.CHARACTER)
            )
        );
        return Map.copyOf(tables);
    }

    private static Table statisticsTable() {
        final List<Column> columns = new ArrayList<>();
        for (String name : STATISTIKEN_COLUMNS) {
            final Kind kind;
            if (
                Set.of("id", "program", "perfumes", "smells", "bugs", "views", "loves", "favorites", "remixes")
                    .contains(name)
            ) {
                kind = Kind.INTEGRAL;
            }
            else if ("author".equals(name)) {
                kind = Kind.CHARACTER;
            }
            else if ("created".equals(name)) {
                kind = Kind.TEMPORAL;
            }
            else {
                kind = Kind.NUMERIC;
            }
            columns.add(column(name, kind));
        }
        return new Table(List.copyOf(columns));
    }

    private static Set<String> statisticsMetricNames() {
        final java.util.TreeSet<String> names = new java.util.TreeSet<>(STATISTIKEN_COLUMNS);
        names.removeAll(STATISTICS_METADATA);
        return Set.copyOf(names);
    }

    private static Table table(final Column... columns) {
        return new Table(List.of(columns));
    }

    private static Column column(final String name, final Kind kind) {
        return new Column(name, kind);
    }

    record Table(List<Column> columns) {
    }

    record Column(String name, Kind kind) {
    }

    enum Kind {

        INTEGRAL(Set.of(Types.TINYINT, Types.SMALLINT, Types.INTEGER, Types.BIGINT)),
        NUMERIC(
            Set.of(
                Types.TINYINT, Types.SMALLINT, Types.INTEGER, Types.BIGINT, Types.FLOAT, Types.REAL,
                Types.DOUBLE, Types.NUMERIC, Types.DECIMAL
            )
        ),
        CHARACTER(
            Set.of(
                Types.CHAR, Types.VARCHAR, Types.LONGVARCHAR, Types.NCHAR, Types.NVARCHAR,
                Types.LONGNVARCHAR, Types.CLOB, Types.NCLOB
            )
        ),
        TEXT(
            Set.of(
                Types.CHAR, Types.VARCHAR, Types.LONGVARCHAR, Types.NCHAR, Types.NVARCHAR,
                Types.LONGNVARCHAR, Types.CLOB, Types.NCLOB
            )
        ),
        TEMPORAL(Set.of(Types.TIMESTAMP, Types.TIMESTAMP_WITH_TIMEZONE, Types.DATE));

        private final Set<Integer> acceptedTypes;

        Kind(final Set<Integer> acceptedTypes) {
            this.acceptedTypes = acceptedTypes;
        }

        boolean accepts(final int sqlType) {
            return acceptedTypes.contains(sqlType);
        }
    }
}
