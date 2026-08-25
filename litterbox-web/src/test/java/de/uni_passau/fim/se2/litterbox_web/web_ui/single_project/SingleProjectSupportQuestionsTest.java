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

import java.util.Arrays;
import java.util.List;

import org.junit.jupiter.api.Test;

import de.uni_passau.fim.se2.litterbox.analytics.questions.ProgramDimension;
import de.uni_passau.fim.se2.litterbox.analytics.questions.QuestionType;
import de.uni_passau.fim.se2.litterbox.analytics.questions.ScopeOfFocus;
import de.uni_passau.fim.se2.litterbox_web.qlc.QuestionDTO;

/**
 * Which generated questions this service is willing to put to a reader. A question it cannot mark is one it would ask
 * and then answer wrongly, so it is not exported at all.
 */
class SingleProjectSupportQuestionsTest {

    private static QuestionDTO question(final QuestionType type, final String... correctAnswers) {
        return new QuestionDTO(
            1, type, "SomeFinder", "Some finder", "How many sprites?", "Cat", "when green flag clicked",
            ProgramDimension.TEXT, ScopeOfFocus.ATOM, List.of("1", "2"),
            correctAnswers == null ? null : Arrays.asList(correctAnswers), null
        );
    }

    @Test
    void exportsAQuestionWithATypeAndAnExpectedAnswer() {
        assertThat(SingleProjectSupport.markable(question(QuestionType.MULTIPLE_CHOICE, "1"))).isTrue();
        assertThat(SingleProjectSupport.markable(question(QuestionType.FREE_TEXT, "green flag"))).isTrue();
    }

    @Test
    void withholdsAQuestionThatCarriesNoType() {
        // Marking switches on the type. Without one there is no rule to mark by, and answering it reached a switch
        // with no branch for it.
        assertThat(SingleProjectSupport.markable(question(null, "1"))).isFalse();
    }

    @Test
    void withholdsAQuestionWithNothingToMarkAgainst() {
        // Every answer to a question with no answer key is marked wrong, including the right one. Asking it is
        // worse than not asking it.
        assertThat(SingleProjectSupport.markable(question(QuestionType.NUMBER))).isFalse();
        assertThat(SingleProjectSupport.markable(question(QuestionType.NUMBER, (String) null))).isFalse();
        assertThat(SingleProjectSupport.markable(question(QuestionType.NUMBER, "  "))).isFalse();
    }

    @Test
    void withholdsNothingAtAll() {
        assertThat(SingleProjectSupport.markable(null)).isFalse();
    }
}
