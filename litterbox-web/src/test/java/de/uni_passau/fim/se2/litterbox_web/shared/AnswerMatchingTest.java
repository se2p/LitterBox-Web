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
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.util.List;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.junit.jupiter.params.provider.ValueSource;

import de.uni_passau.fim.se2.litterbox.analytics.questions.QuestionType;

class AnswerMatchingTest {

    @Test
    void marksEverySelectedChoiceAndNoOtherAsACorrectMultipleChoiceAnswer() {
        final List<String> expected = List.of("Cat", "Ball");

        assertThat(AnswerMatching.matches(QuestionType.MULTIPLE_CHOICE, expected, "Cat|Ball")).isTrue();
        assertThat(AnswerMatching.matches(QuestionType.MULTIPLE_CHOICE, expected, " ball | CAT ")).isTrue();
        assertThat(AnswerMatching.matches(QuestionType.MULTIPLE_CHOICE, expected, "Cat")).isFalse();
        assertThat(AnswerMatching.matches(QuestionType.MULTIPLE_CHOICE, expected, "Cat|Ball|Dog")).isFalse();
    }

    @ParameterizedTest
    @CsvSource(
        {
            "3, 3, true", "3, 3.0, true", "3, ' 3 ', true", "3, 03, true",
            "3, 4, false", "3, three, false", "3, '', false"
        }
    )
    void marksANumberOnItsValueRatherThanItsSpelling(
        final String expected, final String answer, final boolean correct
    ) {
        assertThat(AnswerMatching.matches(QuestionType.NUMBER, List.of(expected), answer)).isEqualTo(correct);
    }

    @ParameterizedTest
    @CsvSource(
        {
            "yes, yes, true", "yes, Ja, true", "yes, TRUE, true", "yes, y, true", "Yes, sí, true",
            "no, nein, true", "no, nee, true", "no, 'non', true",
            "yes, no, false", "yes, maybe, false"
        }
    )
    void understandsYesAndNoInEveryLanguageThisServiceSpeaks(
        final String expected, final String answer, final boolean correct
    ) {
        assertThat(AnswerMatching.matches(QuestionType.YES_NO, List.of(expected), answer)).isEqualTo(correct);
    }

    @Test
    void findsAShortOrNumericFreeTextAnswerOnlyAsAWholeWord() {
        final List<String> three = List.of("3");

        assertThat(AnswerMatching.matches(QuestionType.FREE_TEXT, three, "there are 3 sprites")).isTrue();
        assertThat(AnswerMatching.matches(QuestionType.FREE_TEXT, three, "there are 13 sprites")).isFalse();
    }

    @Test
    void acceptsALongerFreeTextAnswerInsideAFullerSentence() {
        final List<String> phrase = List.of("green flag");

        assertThat(AnswerMatching.matches(QuestionType.FREE_TEXT, phrase, "when the GREEN   FLAG is clicked"))
            .isTrue();
        assertThat(AnswerMatching.matches(QuestionType.FREE_TEXT, phrase, "when the sprite is clicked")).isFalse();
    }

    @Test
    void acceptsAnyOneOfSeveralFreeTextAnswers() {
        final List<String> either = List.of("green flag", "when clicked");

        assertThat(AnswerMatching.matches(QuestionType.FREE_TEXT, either, "the green flag")).isTrue();
        assertThat(AnswerMatching.matches(QuestionType.FREE_TEXT, either, "when clicked")).isTrue();
        assertThat(AnswerMatching.matches(QuestionType.FREE_TEXT, either, "the space key")).isFalse();
    }

    @Test
    void doesNotMarkAQuestionWhoseAnswerKeyIsEmpty() {
        assertThat(AnswerMatching.matches(QuestionType.FREE_TEXT, List.of(), "anything")).isFalse();
        assertThat(AnswerMatching.matches(QuestionType.FREE_TEXT, null, "anything")).isFalse();
    }

    @Test
    void refusesAQuestionKindItHasNoRuleFor() {
        assertThatThrownBy(() -> AnswerMatching.matches(null, List.of("anything"), "anything"))
            .isInstanceOf(IllegalArgumentException.class);
    }

    @ParameterizedTest
    @ValueSource(strings = { "yes", "Ja", " TRUE ", "sí", "n", "nein", "non" })
    void readsEveryWordItMarksByAsAYesOrANo(final String value) {
        assertThat(AnswerMatching.yesNoValue(value)).isIn("yes", "no");
    }

    @ParameterizedTest
    @ValueSource(strings = { "maybe", "vielleicht", "", "1" })
    void readsNothingElseAsAYesOrANo(final String value) {
        assertThat(AnswerMatching.yesNoValue(value)).isNull();
    }

    @ParameterizedTest
    @CsvSource(
        {
            "3, true", "' -2.5 ', true", "1e3, true", "NaN, false", "Infinity, false", "-Infinity, false",
            "three, false", "'', false", "'3 sprites', false"
        }
    )
    void agreesWithItsOwnNumericComparisonAboutWhatANumberIs(final String value, final boolean number) {
        assertThat(AnswerMatching.isNumber(value)).isEqualTo(number);
        assertThat(AnswerMatching.isNumber(null)).isFalse();
        if (number) {
            assertThat(AnswerMatching.matches(QuestionType.NUMBER, List.of(value), value)).isTrue();
        }
    }
}
