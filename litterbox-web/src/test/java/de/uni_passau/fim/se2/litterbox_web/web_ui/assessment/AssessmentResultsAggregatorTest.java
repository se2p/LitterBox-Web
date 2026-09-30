/*
 * Copyright (C) 2024-2026 LitterBox-Web contributors
 *
 * This file is part of LitterBox-Web.
 * Licenced under the EUPL-1.2 or later.
 *
 * SPDX-FileCopyrightText: 2024-2026 LitterBox-Web contributors
 * SPDX-License-Identifier: EUPL-1.2
 */
package de.uni_passau.fim.se2.litterbox_web.web_ui.assessment;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Instant;
import java.util.List;

import org.junit.jupiter.api.Test;

import de.uni_passau.fim.se2.litterbox.analytics.questions.QuestionType;
import de.uni_passau.fim.se2.litterbox_web.shared.AnswerMatching;
import de.uni_passau.fim.se2.litterbox_web.shared.ChoiceAnswers;
import de.uni_passau.fim.se2.litterbox_web.web_ui.persistence.Assessment;
import de.uni_passau.fim.se2.litterbox_web.web_ui.persistence.AssessmentAnswerCount;
import de.uni_passau.fim.se2.litterbox_web.web_ui.persistence.AssessmentQuestionMark;
import tools.jackson.databind.json.JsonMapper;

class AssessmentResultsAggregatorTest {

    private static final String GENERATED_ID = "1";
    private static final String CUSTOM_ID = "2";
    private static final String CHOICES_ID = "3";
    private static final String YES_NO_ID = "4";
    private static final String REPEAT_TEN = "repeat 10";
    private static final String FOREVER = "forever";

    private static final QuestionType MULTIPLE_CHOICE = QuestionType.MULTIPLE_CHOICE;

    private static final StoredAssessmentQuestion GENERATED = new StoredAssessmentQuestion(
        GENERATED_ID, AssessmentDtos.SOURCE_GENERATED, "7", "Question one?", List.of(), MULTIPLE_CHOICE, null, null,
        null, null, null, 1, List.of()
    );

    private static final StoredAssessmentQuestion CUSTOM = new StoredAssessmentQuestion(
        CUSTOM_ID, AssessmentDtos.SOURCE_CUSTOM, null, "Question two?", List.of(), null, null, null, null, null, null,
        null, List.of()
    );

    private static final StoredAssessmentQuestion CHOICES = new StoredAssessmentQuestion(
        CHOICES_ID, AssessmentDtos.SOURCE_CUSTOM, null, "Which loop repeats forever?", List.of(REPEAT_TEN, FOREVER),
        MULTIPLE_CHOICE, null, null, null, null, null, 1, List.of(FOREVER)
    );

    private static final StoredAssessmentQuestion YES_NO = new StoredAssessmentQuestion(
        YES_NO_ID, AssessmentDtos.SOURCE_CUSTOM, null, "Does the cat move?", List.of(), QuestionType.YES_NO, null, null,
        null, null, null, 1, List.of("yes")
    );

    private static Assessment assessment(final int attempts) {
        return new Assessment(
            1, "public-token", "teacher-token", 7, "A quiz", null, "en", "{}", Assessment.OPEN,
            Instant.parse("2099-01-01T00:00:00Z"), attempts
        );
    }

    private static AssessmentDtos.ResultsView aggregate(
        final int attempts, final List<StoredAssessmentQuestion> questions, final List<AssessmentQuestionMark> marks
    ) {
        return AssessmentResultsAggregator.aggregate(
            assessment(attempts), Assessment.OPEN, questions, marks, List.of()
        );
    }

    @Test
    void countsAnsweredCorrectIncorrectAndNotMarkableSeparatelyPerQuestion() {
        final List<AssessmentQuestionMark> marks = List.of(
            new AssessmentQuestionMark(10, GENERATED_ID, true),
            new AssessmentQuestionMark(11, GENERATED_ID, true),
            new AssessmentQuestionMark(12, GENERATED_ID, false),
            new AssessmentQuestionMark(10, CUSTOM_ID, null),
            new AssessmentQuestionMark(11, CUSTOM_ID, null)
        );

        final AssessmentDtos.ResultsView results = aggregate(3, List.of(GENERATED, CUSTOM), marks);

        assertThat(results.title()).isEqualTo("A quiz");
        assertThat(results.status()).isEqualTo(Assessment.OPEN);
        assertThat(results.totalAttempts()).isEqualTo(3);
        assertThat(results.questions()).hasSize(2);
        assertThat(results.questions().get(0)).isEqualTo(
            new AssessmentDtos.QuestionResult(GENERATED_ID, "Question one?", 3, 2, 1, 0, List.of(), 0)
        );
        assertThat(results.questions().get(1)).isEqualTo(
            new AssessmentDtos.QuestionResult(CUSTOM_ID, "Question two?", 2, 0, 0, 2, List.of(), 0)
        );
    }

    @Test
    void reportsAQuestionNobodyAnsweredYetAsAllZeroesRatherThanOmittingIt() {
        final AssessmentDtos.ResultsView results = aggregate(5, List.of(GENERATED, CUSTOM), List.of());

        assertThat(results.totalAttempts()).isEqualTo(5);
        assertThat(results.questions()).containsExactly(
            new AssessmentDtos.QuestionResult(GENERATED_ID, "Question one?", 0, 0, 0, 0, List.of(), 0),
            new AssessmentDtos.QuestionResult(CUSTOM_ID, "Question two?", 0, 0, 0, 0, List.of(), 0)
        );
    }

    @Test
    void reportsTheStatusItWasHandedRatherThanReadingTheAssessmentsOwnColumn() {
        final AssessmentDtos.ResultsView results = AssessmentResultsAggregator.aggregate(
            assessment(1), Assessment.CLOSED, List.of(GENERATED), List.of(), List.of()
        );

        assertThat(results.status()).isEqualTo(Assessment.CLOSED);
    }

    @Test
    void neverCarriesTheTextOfAnAnswerIntoTheMarksItAggregates() {
        assertThat(AssessmentQuestionMark.class.getRecordComponents()).extracting(
            java.lang.reflect.RecordComponent::getName
        ).containsExactly("attemptId", "questionId", "correct");
    }

    @Test
    void talliesOnlyTheQuestionsWhoseAnswersAreChosenFromAListTheQuestionItselfPublished() {
        assertThat(AssessmentResultsAggregator.talliedQuestionIds(List.of(GENERATED, CUSTOM, CHOICES, YES_NO)))
            .containsExactly(CHOICES_ID, YES_NO_ID);
    }

    @Test
    void countsEachStoredOptionInTheOrderTheQuestionStoresThem() {
        final AssessmentDtos.ResultsView results = AssessmentResultsAggregator.aggregate(
            assessment(4), Assessment.OPEN, List.of(CHOICES), List.of(),
            List.of(
                new AssessmentAnswerCount(CHOICES_ID, FOREVER, 3),
                new AssessmentAnswerCount(CHOICES_ID, REPEAT_TEN, 1)
            )
        );

        assertThat(results.questions()).singleElement().satisfies(question -> {
            assertThat(question.answerTallies()).containsExactly(
                new AssessmentDtos.AnswerTally(REPEAT_TEN, 1),
                new AssessmentDtos.AnswerTally(FOREVER, 3)
            );
            assertThat(question.otherAnswers()).isZero();
        });
    }

    @Test
    void countsEveryChoiceASingleAnswerNamedAndComparesThemTheWayMarkingDoes() {
        final StoredAssessmentQuestion twoOfThem = new StoredAssessmentQuestion(
            CHOICES_ID, AssessmentDtos.SOURCE_CUSTOM, null, "Which two repeat?",
            List.of(FOREVER, REPEAT_TEN, "if then"), MULTIPLE_CHOICE, null, null, null, null, null, 2,
            List.of(FOREVER, REPEAT_TEN)
        );

        final AssessmentDtos.ResultsView results = AssessmentResultsAggregator.aggregate(
            assessment(2), Assessment.OPEN, List.of(twoOfThem), List.of(),
            List.of(
                new AssessmentAnswerCount(CHOICES_ID, String.join(ChoiceAnswers.SEPARATOR, FOREVER, REPEAT_TEN), 2),
                new AssessmentAnswerCount(CHOICES_ID, "  REPEAT   10 ", 1)
            )
        );

        assertThat(results.questions()).singleElement()
            .extracting(AssessmentDtos.QuestionResult::answerTallies)
            .isEqualTo(
                List.of(
                    new AssessmentDtos.AnswerTally(FOREVER, 2),
                    new AssessmentDtos.AnswerTally(REPEAT_TEN, 3),
                    new AssessmentDtos.AnswerTally("if then", 0)
                )
            );
    }

    @Test
    void countsAnAnswerContainingAnUnknownChoiceAsOtherEvenWhenItNamesAnOfferedChoiceToo() {
        final AssessmentDtos.QuestionResult question = AssessmentResultsAggregator.aggregate(
            assessment(1), Assessment.OPEN, List.of(CHOICES), List.of(),
            List.of(new AssessmentAnswerCount(CHOICES_ID, "forever|not-an-option", 2))
        ).questions().getFirst();

        assertThat(question.answerTallies()).containsExactly(
            new AssessmentDtos.AnswerTally(REPEAT_TEN, 0),
            new AssessmentDtos.AnswerTally(FOREVER, 0)
        );
        assertThat(question.otherAnswers()).isEqualTo(2);
    }

    @Test
    void countsFreeTextTypedIntoAChoiceQuestionAsAnOtherAndNeverLabelsATallyWithIt() {
        final String typed = "My name is Alice and I live at 14 Mill Lane";

        final AssessmentDtos.ResultsView results = AssessmentResultsAggregator.aggregate(
            assessment(3), Assessment.OPEN, List.of(CHOICES), List.of(),
            List.of(
                new AssessmentAnswerCount(CHOICES_ID, FOREVER, 1),
                new AssessmentAnswerCount(CHOICES_ID, typed, 2)
            )
        );

        final AssessmentDtos.QuestionResult question = results.questions().getFirst();
        assertThat(question.otherAnswers()).isEqualTo(2);
        assertThat(question.answerTallies()).containsExactly(
            new AssessmentDtos.AnswerTally(REPEAT_TEN, 0),
            new AssessmentDtos.AnswerTally(FOREVER, 1)
        );
        assertThat(question.answerTallies()).extracting(AssessmentDtos.AnswerTally::answer)
            .doesNotContain(typed);
        assertThat(JsonMapper.shared().writeValueAsString(results))
            .doesNotContain("Alice");
    }

    @Test
    void reportsAYesOrNoQuestionUnderTheTwoTokensMarkingItselfAnswersIn() {
        final AssessmentDtos.ResultsView results = AssessmentResultsAggregator.aggregate(
            assessment(5), Assessment.OPEN, List.of(YES_NO), List.of(),
            List.of(
                new AssessmentAnswerCount(YES_NO_ID, "yes", 2),
                new AssessmentAnswerCount(YES_NO_ID, "Ja", 1),
                new AssessmentAnswerCount(YES_NO_ID, "no", 1),
                new AssessmentAnswerCount(YES_NO_ID, "maybe", 1)
            )
        );

        assertThat(results.questions()).singleElement().satisfies(question -> {
            assertThat(question.answerTallies()).containsExactly(
                new AssessmentDtos.AnswerTally(AnswerMatching.YES, 3),
                new AssessmentDtos.AnswerTally(AnswerMatching.NO, 1)
            );
            assertThat(question.otherAnswers()).isEqualTo(1);
        });
    }

    @Test
    void talliesNothingForAChoiceQuestionThatOffersNoChoices() {
        final AssessmentDtos.ResultsView results = AssessmentResultsAggregator.aggregate(
            assessment(1), Assessment.OPEN, List.of(GENERATED), List.of(),
            List.of(new AssessmentAnswerCount(GENERATED_ID, "something a child wrote", 1))
        );

        assertThat(results.questions()).singleElement().satisfies(question -> {
            assertThat(question.answerTallies()).isEmpty();
            assertThat(question.otherAnswers()).isZero();
        });
    }

    @Test
    void scoresOnlyTheAttemptsThatAnsweredEveryMarkableQuestionAndCountsTheRestAsPartial() {
        final List<StoredAssessmentQuestion> questions = List.of(GENERATED, CUSTOM, CHOICES, YES_NO);
        final List<AssessmentQuestionMark> marks = List.of(
            new AssessmentQuestionMark(10, GENERATED_ID, true),
            new AssessmentQuestionMark(10, CHOICES_ID, true),
            new AssessmentQuestionMark(10, YES_NO_ID, true),
            new AssessmentQuestionMark(11, GENERATED_ID, true),
            new AssessmentQuestionMark(11, CHOICES_ID, false),
            new AssessmentQuestionMark(11, YES_NO_ID, false),
            new AssessmentQuestionMark(12, GENERATED_ID, true),
            new AssessmentQuestionMark(12, CUSTOM_ID, null),
            new AssessmentQuestionMark(12, CHOICES_ID, true)
        );

        final AssessmentDtos.ScoreDistribution scores = aggregate(4, questions, marks).scores();

        assertThat(scores.markableQuestions()).isEqualTo(3);
        assertThat(scores.completedAttempts()).isEqualTo(2);
        assertThat(scores.partialAttempts()).isEqualTo(1);
        assertThat(scores.counts()).containsExactly(0, 1, 0, 1);
    }

    @Test
    void countsOneBucketPerPossibleScoreEvenWhenNobodyHasAnsweredAnything() {
        final AssessmentDtos.ScoreDistribution scores = aggregate(0, List.of(GENERATED, CHOICES), List.of()).scores();

        assertThat(scores.markableQuestions()).isEqualTo(2);
        assertThat(scores.completedAttempts()).isZero();
        assertThat(scores.partialAttempts()).isZero();
        assertThat(scores.counts()).containsExactly(0, 0, 0);
    }

    @Test
    void scoresNobodyWhenNoQuestionCanBeMarkedAtAll() {
        final AssessmentDtos.ScoreDistribution scores = aggregate(
            2, List.of(CUSTOM), List.of(new AssessmentQuestionMark(10, CUSTOM_ID, null))
        ).scores();

        assertThat(scores.markableQuestions()).isZero();
        assertThat(scores.completedAttempts()).isZero();
        assertThat(scores.partialAttempts()).isZero();
        assertThat(scores.counts()).containsExactly(0);
    }
}
