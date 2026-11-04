/*
 * Copyright (C) 2024-2026 LitterBox-Web contributors
 *
 * This file is part of LitterBox-Web.
 * Licenced under the EUPL-1.2 or later.
 *
 * SPDX-FileCopyrightText: 2024-2026 LitterBox-Web contributors
 * SPDX-License-Identifier: EUPL-1.2
 */
package de.uni_passau.fim.se2.litterbox_web.web_ui.single_project;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.HashSet;
import java.util.List;

import org.junit.jupiter.api.Test;

import de.uni_passau.fim.se2.litterbox.analytics.ProgramMetricAnalyzer;

class CoreMetricsCompatibilityTest {

    @Test
    void coreProvidesTheConceptMetricsShownToTeachers() {
        final var metricNames = new ProgramMetricAnalyzer().getAnalyzers().stream()
            .map(metric -> metric.getName())
            .toList();

        assertThat(metricNames).contains(
            "sequence_count", "loop_count", "conditional_count", "broadcast_count", "clone_count"
        );
    }

    @Test
    void coreProvidesClassicAndExtendedComputationalThinkingMetrics() {
        final List<String> metricNames = new ProgramMetricAnalyzer().getMetricNames();

        assertThat(metricNames).contains(
            "ct_score",
            "ct_score_abstraction",
            "ct_score_data_representation",
            "ct_score_flow_control",
            "ct_score_logic",
            "ct_score_parallelization",
            "ct_score_synchronization",
            "ct_score_user_interactivity",
            "ct_extended_score",
            "ct_extended_score_average",
            "ct_extended_score_abstraction",
            "ct_extended_score_data_representation",
            "ct_extended_score_flow_control",
            "ct_extended_score_logic",
            "ct_extended_score_math_operators",
            "ct_extended_score_motion",
            "ct_extended_score_parallelization",
            "ct_extended_score_synchronization",
            "ct_extended_score_user_interactivity"
        );
        assertThat(new HashSet<>(metricNames)).hasSameSizeAs(metricNames);
    }
}
