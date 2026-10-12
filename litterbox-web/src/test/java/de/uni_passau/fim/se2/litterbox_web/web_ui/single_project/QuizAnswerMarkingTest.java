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
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.util.List;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;

import de.uni_passau.fim.se2.litterbox.analytics.questions.QuestionType;
import de.uni_passau.fim.se2.litterbox_web.qlc.QuestionDTO;
import de.uni_passau.fim.se2.litterbox_web.web_ui.single_project.QuizAnswerMarking.InvalidQuizAnswerException;
import de.uni_passau.fim.se2.litterbox_web.web_ui.single_project.QuizAnswerMarking.StoredQuizQuestion;

/**
 * These rules decide whether a child is told they were right, and until this logic was lifted out of the single-project
 * service they could only be reached through a submission, an analysis and a stored report.
 */
class QuizAnswerMarkingTest {

    private static final String CAT = "Cat";
    private static final String DOG = "Dog";

    private static StoredQuizQuestion question(
        final QuestionType type, final List<String> choices, final String... correct
    ) {
        return new StoredQuizQuestion("1", type, "How many sprites?", choices, List.of(correct));
    }

    @Test
    void marksEverySelectedChoiceAndNoOtherAsACorrectMultipleChoiceAnswer() {
        final StoredQuizQuestion multiple = question(
            QuestionType.MULTIPLE_CHOICE, List.of(CAT, DOG, "Ball"), CAT, "Ball"
        );

        assertThat(QuizAnswerMarking.isCorrect(multiple, "Cat|Ball")).isTrue();
        // Order and spacing are how a keyboard behaves, not what a learner knows.
        assertThat(QuizAnswerMarking.isCorrect(multiple, " ball | CAT ")).isTrue();
        assertThat(QuizAnswerMarking.isCorrect(multiple, CAT)).isFalse();
        assertThat(QuizAnswerMarking.isCorrect(multiple, "Cat|Ball|Dog")).isFalse();
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
        assertThat(QuizAnswerMarking.isCorrect(question(QuestionType.NUMBER, List.of(), expected), answer))
            .isEqualTo(correct);
    }

    @ParameterizedTest
    @CsvSource(
        {
            "yes, yes, true", "yes, Ja, true", "yes, TRUE, true", "yes, y, true",
            "no, nein, true", "no, nee, true", "no, 'non', true",
            "yes, no, false", "yes, maybe, false"
        }
    )
    void understandsYesAndNoInEveryLanguageThisServiceSpeaks(
        final String expected, final String answer, final boolean correct
    ) {
        assertThat(QuizAnswerMarking.isCorrect(question(QuestionType.YES_NO, List.of(), expected), answer))
            .isEqualTo(correct);
    }

    @Test
    void findsAShortOrNumericFreeTextAnswerOnlyAsAWholeWord() {
        final StoredQuizQuestion three = question(QuestionType.FREE_TEXT, List.of(), "3");

        assertThat(QuizAnswerMarking.isCorrect(three, "there are 3 sprites")).isTrue();
        // Otherwise "3" would be found inside "13" and a wrong count marked right.
        assertThat(QuizAnswerMarking.isCorrect(three, "there are 13 sprites")).isFalse();
    }

    @Test
    void acceptsALongerFreeTextAnswerInsideAFullerSentence() {
        final StoredQuizQuestion phrase = question(QuestionType.FREE_TEXT, List.of(), "green flag");

        assertThat(QuizAnswerMarking.isCorrect(phrase, "when the GREEN   FLAG is clicked")).isTrue();
        assertThat(QuizAnswerMarking.isCorrect(phrase, "when the sprite is clicked")).isFalse();
    }

    @Test
    void refusesToMarkAQuestionWhoseAnswerKeyIsEmpty() {
        assertThat(QuizAnswerMarking.isCorrect(question(QuestionType.FREE_TEXT, List.of()), "anything")).isFalse();
    }

    @Test
    void refusesToMarkAQuestionThatCarriesNoType() {
        final StoredQuizQuestion untyped = question(null, List.of("Cat", "Dog"), "Cat");

        // There is no rule to mark it by. Reaching the switch with it used to raise a NullPointerException, which
        // reaches a reader as a server fault rather than as a rejected answer.
        assertThatThrownBy(() -> QuizAnswerMarking.isCorrect(untyped, "Cat"))
            .isInstanceOf(InvalidQuizAnswerException.class);
    }

    @Test
    void rejectsAnAnswerThatIsNotOneOfTheOfferedChoices() {
        final StoredQuizQuestion multiple = question(
            QuestionType.MULTIPLE_CHOICE, List.of(CAT, DOG), CAT
        );

        assertThatThrownBy(() -> QuizAnswerMarking.validateQuizAnswer(multiple, "Fish"))
            .isInstanceOf(InvalidQuizAnswerException.class);
        assertThatThrownBy(() -> QuizAnswerMarking.validateQuizAnswer(multiple, ""))
            .isInstanceOf(InvalidQuizAnswerException.class);
        // The same choice twice is not two answers.
        assertThatThrownBy(() -> QuizAnswerMarking.validateQuizAnswer(multiple, "Cat|cat"))
            .isInstanceOf(InvalidQuizAnswerException.class);
    }

    @Test
    void allowsSeveralChoicesOnlyWhereSeveralAreExpected() {
        final StoredQuizQuestion single = question(
            QuestionType.MULTIPLE_CHOICE, List.of(CAT, DOG), CAT
        );
        assertThatThrownBy(() -> QuizAnswerMarking.validateQuizAnswer(single, "Cat|Dog"))
            .isInstanceOf(InvalidQuizAnswerException.class);

        final StoredQuizQuestion several = question(
            QuestionType.MULTIPLE_CHOICE, List.of(CAT, DOG), CAT, DOG
        );
        QuizAnswerMarking.validateQuizAnswer(several, "Cat|Dog");
    }

    @Test
    void snapshotMarkingRejectsInvalidChoices() {
        assertThat(
            QuizAnswerPort.markSnapshot(
                QuestionType.MULTIPLE_CHOICE, List.of(CAT, DOG), List.of(CAT), CAT
            ).correct()
        ).isTrue();
        assertThatThrownBy(
            () -> QuizAnswerPort.markSnapshot(
                QuestionType.MULTIPLE_CHOICE, List.of(CAT, DOG), List.of(CAT), "Fish"
            )
        ).isInstanceOf(InvalidQuizAnswerException.class);
    }

    @Test
    void refusesAnAnswerToAQuestionThatIsNotTheOneTheReaderWasShown() {
        final StoredQuizQuestion key = question(QuestionType.MULTIPLE_CHOICE, List.of(CAT, DOG), CAT);
        final SingleProjectDtos.QuizView shown = new SingleProjectDtos.QuizView(
            "1", "A different question", List.of(CAT, DOG), "MULTIPLE_CHOICE",
            null, null, null, null, null, 1
        );

        assertThatThrownBy(() -> QuizAnswerMarking.validateStoredQuestion(shown, key))
            .isInstanceOf(InvalidQuizAnswerException.class);
    }

    @Test
    void handsBackTheExpectedAnswerWithTheVerdict() {
        final StoredQuizQuestion key = question(QuestionType.FREE_TEXT, List.of(), "green flag");

        final QuizAnswerPort.Verdict wrong = QuizAnswerMarking.evaluation(key, "the cat");

        // Told only "wrong", a learner has learnt nothing; the answer is disclosed in reply, never with the question.
        assertThat(wrong.correct()).isFalse();
        assertThat(wrong.correctAnswers()).containsExactly("green flag");
    }

    @Test
    void buildsAQuizViewWhenTheQuestionHasNoAnswerKey() {
        final QuestionDTO question = new QuestionDTO(
            1, QuestionType.FREE_TEXT, "name", "finder", "Question", null, null,
            null, null, List.of(), null, null
        );

        final SingleProjectDtos.QuizView view = QuizAnswerMarking.quizView(question);

        assertThat(view.expectedAnswers()).isEqualTo(1);
    }
}
