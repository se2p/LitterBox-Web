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

import java.nio.file.Path;
import java.util.List;
import java.util.Map;

import org.junit.jupiter.api.Test;

import de.uni_passau.fim.se2.litterbox.ast.model.Program;
import de.uni_passau.fim.se2.litterbox.ast.parser.Scratch3Parser;
import de.uni_passau.fim.se2.litterbox.utils.IssueTranslatorFactory;

class StructuredReportAssemblerTest {

    private static final List<String> EXTENDED_DIMENSIONS = List.of(
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

    @Test
    void assemblesBothCtRubricsWithoutChangingScores() throws Exception {
        final Program program = new Scratch3Parser().parseFile(
            Path.of("src/test/resources/fixtures/scratch_programs/extendedCt.json").toFile()
        );

        final Map<String, Double> metrics = new StructuredReportAssembler().create(
            program,
            List.of(),
            IssueTranslatorFactory.getIssueTranslator(java.util.Locale.ENGLISH)
        ).metrics();

        assertThat(metrics.keySet()).contains(
            "ct_score",
            "ct_score_abstraction",
            "ct_extended_score",
            "ct_extended_score_average"
        );
        assertThat(metrics.keySet()).containsAll(EXTENDED_DIMENSIONS);

        final double total = EXTENDED_DIMENSIONS.stream().mapToDouble(metrics::get).sum();
        assertThat(metrics.get("ct_extended_score")).isEqualTo(total);
        assertThat(metrics.get("ct_extended_score_average")).isEqualTo(total / EXTENDED_DIMENSIONS.size());
        assertThat(metrics.get("ct_extended_score_flow_control")).isEqualTo(4.0);
        assertThat(metrics.get("ct_score_flow_control")).isEqualTo(2.0);
        assertThat(metrics.get("ct_extended_score_abstraction")).isEqualTo(2.0);
        assertThat(metrics.get("ct_score_abstraction")).isEqualTo(3.0);
        assertThat(metrics.get("ct_extended_score_logic")).isZero();
        assertThat(metrics.get("ct_extended_score_math_operators")).isZero();
    }

}
