/*
 * Copyright (C) 2024-2026 LitterBox-Web contributors
 *
 * This file is part of LitterBox-Web.
 * Licenced under the EUPL-1.2 or later.
 *
 * SPDX-FileCopyrightText: 2024-2026 LitterBox-Web contributors
 * SPDX-License-Identifier: EUPL-1.2
 */
package de.uni_passau.fim.se2.litterbox_web.shared;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;

import org.junit.jupiter.api.Test;

class ChoiceAnswersTest {

    private static final String CHOICE_A = "A";
    private static final String CHOICE_B = "B";
    private static final String CHOICE_CAT = "Cat";
    private static final String CHOICE_BALL = "Ball";

    @Test
    void matchesTheExpectedChoicesInAnyOrderIgnoringCaseAndSpacing() {
        assertThat(ChoiceAnswers.matches(List.of(CHOICE_CAT, CHOICE_BALL), " ball | CAT ")).isTrue();
    }

    @Test
    void doesNotMatchARepeatedChoiceEvenWhenItIsTheOnlyExpectedOne() {
        assertThat(ChoiceAnswers.matches(List.of(CHOICE_A), CHOICE_A + "|" + CHOICE_A)).isFalse();
        assertThat(ChoiceAnswers.matches(List.of(CHOICE_A, CHOICE_B), CHOICE_A + "|" + CHOICE_B + "|a")).isFalse();
    }

    @Test
    void doesNotMatchIncompleteExtraOrMissingAnswers() {
        assertThat(ChoiceAnswers.matches(List.of(CHOICE_A, CHOICE_B), CHOICE_A)).isFalse();
        assertThat(ChoiceAnswers.matches(List.of(CHOICE_A), CHOICE_A + "|" + CHOICE_B)).isFalse();
        assertThat(ChoiceAnswers.matches(List.of(CHOICE_A), null)).isFalse();
        assertThat(ChoiceAnswers.matches(List.of(), CHOICE_A)).isFalse();
    }
}
