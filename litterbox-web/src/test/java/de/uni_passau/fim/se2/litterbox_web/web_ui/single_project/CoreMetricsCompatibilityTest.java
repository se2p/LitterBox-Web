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
}
