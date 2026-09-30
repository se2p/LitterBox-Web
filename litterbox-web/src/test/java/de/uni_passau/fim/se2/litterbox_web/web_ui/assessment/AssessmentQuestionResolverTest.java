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
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.util.List;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;

import de.uni_passau.fim.se2.litterbox.analytics.questions.QuestionType;
import de.uni_passau.fim.se2.litterbox_web.web_ui.single_project.SingleProjectDtos;

class AssessmentQuestionResolverTest {

    private static final String GENERATED_ID = "7";
    private static final String GENERATED_ANSWER = "2";
    private static final String MULTIPLE_CHOICE_TYPE = "MULTIPLE_CHOICE";
    private static final String LOOP_QUESTION = "Which loop repeats forever?";
    private static final String CAT_QUESTION = "Does the cat move?";
    private static final String REPEAT_TEN = "repeat 10";
    private static final String FOREVER = "forever";
    private static final String IF_THEN = "if then";
    private static final String OPTION_A = "a";
    private static final String OPTION_B = "b";

    private static final SingleProjectDtos.QuizView GENERATED_QUESTION = new SingleProjectDtos.QuizView(
        GENERATED_ID, "How many sprites does this project have?", List.of("1", GENERATED_ANSWER, "3"),
        MULTIPLE_CHOICE_TYPE, null, null, null, null, null, 1
    );

    @Test
    void resolvesAGeneratedQuestionFromTheAnalysisRatherThanTheRequest() {
        final List<StoredAssessmentQuestion> resolved = AssessmentQuestionResolver.resolve(
            List.of(
                new AssessmentDtos.QuestionInput(
                    AssessmentDtos.SOURCE_GENERATED, GENERATED_ID, "ignored", null, null, null, null
                )
            ),
            List.of(GENERATED_QUESTION),
            List.of(new SingleProjectDtos.QuizAnswerKeyQuestion(GENERATED_ID, List.of(GENERATED_ANSWER))),
            new AssessmentCapabilitiesConfiguration()
        );

        assertThat(resolved).singleElement().satisfies(question -> {
            assertThat(question.source()).isEqualTo(AssessmentDtos.SOURCE_GENERATED);
            assertThat(question.originalQuestionId()).isEqualTo(GENERATED_ID);
            assertThat(question.questionText()).isEqualTo(GENERATED_QUESTION.question());
        });
    }

    @Test
    void rejectsAnEmptyQuestionList() {
        assertThatThrownBy(
            () -> AssessmentQuestionResolver
                .resolve(List.of(), List.of(), List.of(), new AssessmentCapabilitiesConfiguration())
        ).isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void rejectsMoreQuestionsThanTheConfiguredCeiling() {
        final AssessmentCapabilitiesConfiguration limits = new AssessmentCapabilitiesConfiguration();
        limits.setMaxQuestions(1);
        final List<AssessmentDtos.QuestionInput> inputs = List.of(
            new AssessmentDtos.QuestionInput(AssessmentDtos.SOURCE_CUSTOM, null, "One?", null, null, null, null),
            new AssessmentDtos.QuestionInput(AssessmentDtos.SOURCE_CUSTOM, null, "Two?", null, null, null, null)
        );

        assertThatThrownBy(() -> AssessmentQuestionResolver.resolve(inputs, List.of(), List.of(), limits))
            .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void rejectsAnUnknownQuestionSource() {
        final List<AssessmentDtos.QuestionInput> inputs = List.of(
            new AssessmentDtos.QuestionInput("HANDWRITTEN", null, "One?", null, null, null, null)
        );

        assertThatThrownBy(
            () -> AssessmentQuestionResolver
                .resolve(inputs, List.of(), List.of(), new AssessmentCapabilitiesConfiguration())
        ).isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void rejectsATeacherAuthoredQuestionWithNoText() {
        final List<AssessmentDtos.QuestionInput> blank = List.of(
            new AssessmentDtos.QuestionInput(AssessmentDtos.SOURCE_CUSTOM, null, " ", null, null, null, null)
        );
        final List<AssessmentDtos.QuestionInput> missing = List.of(
            new AssessmentDtos.QuestionInput(AssessmentDtos.SOURCE_CUSTOM, null, null, null, null, null, null)
        );
        final AssessmentCapabilitiesConfiguration limits = new AssessmentCapabilitiesConfiguration();

        assertThatThrownBy(() -> AssessmentQuestionResolver.resolve(blank, List.of(), List.of(), limits))
            .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> AssessmentQuestionResolver.resolve(missing, List.of(), List.of(), limits))
            .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void rejectsAReferenceToAGeneratedQuestionTheAnalysisNeverProduced() {
        final List<AssessmentDtos.QuestionInput> inputs = List.of(
            new AssessmentDtos.QuestionInput(AssessmentDtos.SOURCE_GENERATED, "99", null, null, null, null, null)
        );

        assertThatThrownBy(
            () -> AssessmentQuestionResolver.resolve(
                inputs, List.of(GENERATED_QUESTION), List.of(), new AssessmentCapabilitiesConfiguration()
            )
        ).isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void rejectsQuestionTextLongerThanTheConfiguredCeiling() {
        final AssessmentCapabilitiesConfiguration limits = new AssessmentCapabilitiesConfiguration();
        limits.setMaxQuestionTextLength(5);
        final List<AssessmentDtos.QuestionInput> inputs = List.of(
            new AssessmentDtos.QuestionInput(
                AssessmentDtos.SOURCE_CUSTOM, null, "Far too long a question", null, null, null, null
            )
        );

        assertThatThrownBy(() -> AssessmentQuestionResolver.resolve(inputs, List.of(), List.of(), limits))
            .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void resolvesACustomMultipleChoiceQuestionKeepingItsTypeOptionsAndExpectedAnswers() {
        final List<StoredAssessmentQuestion> resolved = AssessmentQuestionResolver.resolve(
            List.of(
                new AssessmentDtos.QuestionInput(
                    AssessmentDtos.SOURCE_CUSTOM, null, LOOP_QUESTION, MULTIPLE_CHOICE_TYPE,
                    List.of(REPEAT_TEN, FOREVER, IF_THEN), 1, List.of(FOREVER)
                )
            ),
            List.of(), List.of(), new AssessmentCapabilitiesConfiguration()
        );

        assertThat(resolved).singleElement().satisfies(question -> {
            assertThat(question.questionType()).isEqualTo(QuestionType.MULTIPLE_CHOICE);
            assertThat(question.options()).containsExactly(REPEAT_TEN, FOREVER, IF_THEN);
            assertThat(question.expectedAnswers()).isEqualTo(1);
            assertThat(question.correctAnswers()).containsExactly(FOREVER);
        });
    }

    @Test
    void refusesAChoiceQuestionExpectingADifferentNumberOfAnswersThanItNamesCorrectOnes() {
        assertThatThrownBy(
            () -> AssessmentQuestionResolver.resolve(
                List.of(
                    new AssessmentDtos.QuestionInput(
                        AssessmentDtos.SOURCE_CUSTOM, null, "Which two blocks repeat?", MULTIPLE_CHOICE_TYPE,
                        List.of(FOREVER, REPEAT_TEN, IF_THEN), 2, List.of(FOREVER)
                    )
                ),
                List.of(), List.of(), new AssessmentCapabilitiesConfiguration()
            )
        ).isInstanceOf(IllegalArgumentException.class).hasMessageContaining("as many answers as it names correct");
    }

    @Test
    void expectsAsManyAnswersAsTheTeacherNamedCorrectOnesWhenNotToldOtherwise() {
        final List<StoredAssessmentQuestion> resolved = AssessmentQuestionResolver.resolve(
            List.of(
                new AssessmentDtos.QuestionInput(
                    AssessmentDtos.SOURCE_CUSTOM, null, "Which two blocks repeat?", MULTIPLE_CHOICE_TYPE,
                    List.of(FOREVER, REPEAT_TEN, IF_THEN), null, List.of(FOREVER, REPEAT_TEN)
                )
            ),
            List.of(), List.of(), new AssessmentCapabilitiesConfiguration()
        );

        assertThat(resolved).singleElement().satisfies(question -> {
            assertThat(question.expectedAnswers()).isEqualTo(2);
            assertThat(question.correctAnswers()).containsExactly(FOREVER, REPEAT_TEN);
        });
    }

    @Test
    void refusesAChoiceQuestionWhoseExpectedAnswersCouldNotBeSentBackTogether() {
        final AssessmentCapabilitiesConfiguration limits = new AssessmentCapabilitiesConfiguration();
        final String longOption = OPTION_A.repeat(limits.getMaxAnswerLength() - 20);

        assertThatThrownBy(
            () -> AssessmentQuestionResolver.resolve(
                List.of(
                    new AssessmentDtos.QuestionInput(
                        AssessmentDtos.SOURCE_CUSTOM, null, "Which two scripts set the score?", MULTIPLE_CHOICE_TYPE,
                        List.of(longOption, longOption + OPTION_B, "short"), 2, null
                    )
                ),
                List.of(), List.of(), limits
            )
        ).isInstanceOf(IllegalArgumentException.class).hasMessageContaining("too long to send");
    }

    @Test
    void refusesAGeneratedChoiceQuestionWhoseExpectedAnswersCouldNotBeSentBackTogether() {
        final AssessmentCapabilitiesConfiguration limits = new AssessmentCapabilitiesConfiguration();
        limits.setMaxAnswerLength(120);
        limits.setMaxOptionLength(100);
        final String option = OPTION_A.repeat(70);
        final SingleProjectDtos.QuizView generated = new SingleProjectDtos.QuizView(
            GENERATED_ID, "Which two scripts set the score?", List.of(option, option + OPTION_B), MULTIPLE_CHOICE_TYPE,
            null, null, null, null, null, 2
        );

        assertThatThrownBy(
            () -> AssessmentQuestionResolver.resolve(
                List.of(
                    new AssessmentDtos.QuestionInput(
                        AssessmentDtos.SOURCE_GENERATED, GENERATED_ID, null, null, null, null, null
                    )
                ),
                List.of(generated), List.of(), limits
            )
        ).isInstanceOf(IllegalArgumentException.class).hasMessageContaining("too long to send");
    }

    @Test
    void acceptsALongOptionOnAQuestionExpectingOnlyOneOfThem() {
        final AssessmentCapabilitiesConfiguration limits = new AssessmentCapabilitiesConfiguration();
        final String longOption = OPTION_A.repeat(limits.getMaxAnswerLength());

        final List<StoredAssessmentQuestion> resolved = AssessmentQuestionResolver.resolve(
            List.of(
                new AssessmentDtos.QuestionInput(
                    AssessmentDtos.SOURCE_CUSTOM, null, "Which script sets the score?", MULTIPLE_CHOICE_TYPE,
                    List.of(longOption, "short"), 1, null
                )
            ),
            List.of(), List.of(), limits
        );

        assertThat(resolved).singleElement()
            .satisfies(question -> assertThat(question.options()).contains(longOption));
    }

    @Test
    void refusesAnAnswerOptionHoldingTheCharacterThatSeparatesAnswers() {
        assertThatThrownBy(
            () -> AssessmentQuestionResolver.resolve(
                List.of(
                    new AssessmentDtos.QuestionInput(
                        AssessmentDtos.SOURCE_CUSTOM, null, "Which block repeats?", MULTIPLE_CHOICE_TYPE,
                        List.of("forever | repeat 10", IF_THEN), 1, null
                    )
                ),
                List.of(), List.of(), new AssessmentCapabilitiesConfiguration()
            )
        ).isInstanceOf(IllegalArgumentException.class).hasMessageContaining("may not contain");
    }

    @Test
    void matchesAQuestionTypeCaseInsensitively() {
        final List<StoredAssessmentQuestion> resolved = AssessmentQuestionResolver.resolve(
            List.of(
                new AssessmentDtos.QuestionInput(
                    AssessmentDtos.SOURCE_CUSTOM, null, LOOP_QUESTION, "multiple_choice",
                    List.of(REPEAT_TEN, FOREVER), null, null
                )
            ),
            List.of(), List.of(), new AssessmentCapabilitiesConfiguration()
        );

        assertThat(resolved).singleElement()
            .extracting(StoredAssessmentQuestion::questionType)
            .isEqualTo(QuestionType.MULTIPLE_CHOICE);
    }

    @Test
    void rejectsAnswerOptionsOnAFreeTextQuestion() {
        final List<AssessmentDtos.QuestionInput> inputs = List.of(
            new AssessmentDtos.QuestionInput(
                AssessmentDtos.SOURCE_CUSTOM, null, "Explain the loop.", "FREE_TEXT", List.of(OPTION_A, OPTION_B), null,
                null
            )
        );

        assertThatThrownBy(
            () -> AssessmentQuestionResolver
                .resolve(inputs, List.of(), List.of(), new AssessmentCapabilitiesConfiguration())
        ).isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void rejectsAMultipleChoiceQuestionWithNoOptions() {
        final List<AssessmentDtos.QuestionInput> inputs = List.of(
            new AssessmentDtos.QuestionInput(
                AssessmentDtos.SOURCE_CUSTOM, null, LOOP_QUESTION, MULTIPLE_CHOICE_TYPE, null, null,
                null
            )
        );

        assertThatThrownBy(
            () -> AssessmentQuestionResolver
                .resolve(inputs, List.of(), List.of(), new AssessmentCapabilitiesConfiguration())
        ).isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void rejectsAnUnknownQuestionType() {
        final List<AssessmentDtos.QuestionInput> inputs = List.of(
            new AssessmentDtos.QuestionInput(
                AssessmentDtos.SOURCE_CUSTOM, null, LOOP_QUESTION, "ESSAY", null, null, null
            )
        );

        assertThatThrownBy(
            () -> AssessmentQuestionResolver
                .resolve(inputs, List.of(), List.of(), new AssessmentCapabilitiesConfiguration())
        ).isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void rejectsDuplicateAnswerOptions() {
        final List<AssessmentDtos.QuestionInput> inputs = List.of(
            new AssessmentDtos.QuestionInput(
                AssessmentDtos.SOURCE_CUSTOM, null, LOOP_QUESTION, MULTIPLE_CHOICE_TYPE,
                List.of(FOREVER, FOREVER), null, null
            )
        );

        assertThatThrownBy(
            () -> AssessmentQuestionResolver
                .resolve(inputs, List.of(), List.of(), new AssessmentCapabilitiesConfiguration())
        ).isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void rejectsAnswerOptionsThatDifferOnlyInCaseOrSpacing() {
        final List<AssessmentDtos.QuestionInput> inputs = List.of(
            new AssessmentDtos.QuestionInput(
                AssessmentDtos.SOURCE_CUSTOM, null, LOOP_QUESTION, MULTIPLE_CHOICE_TYPE,
                List.of("Yes", "yes"), null, null
            )
        );

        assertThatThrownBy(
            () -> AssessmentQuestionResolver
                .resolve(inputs, List.of(), List.of(), new AssessmentCapabilitiesConfiguration())
        ).isInstanceOf(IllegalArgumentException.class).hasMessageContaining("must differ from one another");
    }

    @Test
    void keepsAnswerOptionsExactlyAsTheTeacherTypedThem() {
        final List<StoredAssessmentQuestion> resolved = AssessmentQuestionResolver.resolve(
            List.of(
                new AssessmentDtos.QuestionInput(
                    AssessmentDtos.SOURCE_CUSTOM, null, LOOP_QUESTION, MULTIPLE_CHOICE_TYPE,
                    List.of("  Forever  ", "Repeat 10"), null, null
                )
            ),
            List.of(), List.of(), new AssessmentCapabilitiesConfiguration()
        );

        assertThat(resolved).singleElement()
            .extracting(StoredAssessmentQuestion::options)
            .isEqualTo(List.of("Forever", "Repeat 10"));
    }

    @Test
    void canonicalizesCorrectChoicesUsingTheOfferedOptionText() {
        final List<StoredAssessmentQuestion> resolved = AssessmentQuestionResolver.resolve(
            List.of(
                new AssessmentDtos.QuestionInput(
                    AssessmentDtos.SOURCE_CUSTOM, null, "Which city?", MULTIPLE_CHOICE_TYPE,
                    List.of("Paris", "London"), null, List.of("  paris  ")
                )
            ),
            List.of(), List.of(), new AssessmentCapabilitiesConfiguration()
        );

        assertThat(resolved).singleElement()
            .extracting(StoredAssessmentQuestion::correctAnswers)
            .isEqualTo(List.of("Paris"));
    }

    @Test
    void rejectsMoreAnswerOptionsThanTheConfiguredCeiling() {
        final AssessmentCapabilitiesConfiguration limits = new AssessmentCapabilitiesConfiguration();
        limits.setMaxOptions(2);
        final List<AssessmentDtos.QuestionInput> inputs = List.of(
            new AssessmentDtos.QuestionInput(
                AssessmentDtos.SOURCE_CUSTOM, null, LOOP_QUESTION, MULTIPLE_CHOICE_TYPE,
                List.of(OPTION_A, OPTION_B, "c"), null, null
            )
        );

        assertThatThrownBy(() -> AssessmentQuestionResolver.resolve(inputs, List.of(), List.of(), limits))
            .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void rejectsAnAnswerOptionLongerThanTheConfiguredCeiling() {
        final AssessmentCapabilitiesConfiguration limits = new AssessmentCapabilitiesConfiguration();
        limits.setMaxOptionLength(3);
        final List<AssessmentDtos.QuestionInput> inputs = List.of(
            new AssessmentDtos.QuestionInput(
                AssessmentDtos.SOURCE_CUSTOM, null, LOOP_QUESTION, MULTIPLE_CHOICE_TYPE,
                List.of("ab", FOREVER), null, null
            )
        );

        assertThatThrownBy(() -> AssessmentQuestionResolver.resolve(inputs, List.of(), List.of(), limits))
            .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void rejectsACorrectAnswerThatIsNotAmongTheOptions() {
        final List<AssessmentDtos.QuestionInput> inputs = List.of(
            new AssessmentDtos.QuestionInput(
                AssessmentDtos.SOURCE_CUSTOM, null, LOOP_QUESTION, MULTIPLE_CHOICE_TYPE,
                List.of(REPEAT_TEN, FOREVER), null, List.of("never")
            )
        );

        assertThatThrownBy(
            () -> AssessmentQuestionResolver
                .resolve(inputs, List.of(), List.of(), new AssessmentCapabilitiesConfiguration())
        ).isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void keepsTheAcceptedAnswersOfAFreeTextQuestion() {
        final List<StoredAssessmentQuestion> resolved = AssessmentQuestionResolver.resolve(
            List.of(
                new AssessmentDtos.QuestionInput(
                    AssessmentDtos.SOURCE_CUSTOM, null, "Which hat block starts the script?", null, null, null,
                    List.of("green flag", "when clicked", "green flag")
                )
            ),
            List.of(), List.of(), new AssessmentCapabilitiesConfiguration()
        );

        assertThat(resolved).singleElement().satisfies(question -> {
            assertThat(question.questionType()).isEqualTo(QuestionType.FREE_TEXT);
            assertThat(question.correctAnswers()).containsExactly("green flag", "when clicked");
            assertThat(question.options()).isEmpty();
        });
    }

    @Test
    void rejectsExpectedAnswersGreaterThanTheNumberOfOptions() {
        final List<AssessmentDtos.QuestionInput> inputs = List.of(
            new AssessmentDtos.QuestionInput(
                AssessmentDtos.SOURCE_CUSTOM, null, LOOP_QUESTION, MULTIPLE_CHOICE_TYPE,
                List.of(REPEAT_TEN, FOREVER), 3, null
            )
        );

        assertThatThrownBy(
            () -> AssessmentQuestionResolver
                .resolve(inputs, List.of(), List.of(), new AssessmentCapabilitiesConfiguration())
        ).isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void aGeneratedQuestionsShapeAndAnswersComeFromTheAnalysisRatherThanTheRequest() {
        final List<StoredAssessmentQuestion> resolved = AssessmentQuestionResolver.resolve(
            List.of(
                new AssessmentDtos.QuestionInput(
                    AssessmentDtos.SOURCE_GENERATED, GENERATED_ID, "ignored", "FREE_TEXT", List.of("ignored"), 99,
                    List.of("ignored")
                )
            ),
            List.of(GENERATED_QUESTION),
            List.of(new SingleProjectDtos.QuizAnswerKeyQuestion(GENERATED_ID, List.of(GENERATED_ANSWER))),
            new AssessmentCapabilitiesConfiguration()
        );

        assertThat(resolved).singleElement().satisfies(question -> {
            assertThat(question.questionType().name()).isEqualTo(GENERATED_QUESTION.questionType());
            assertThat(question.options()).isEqualTo(GENERATED_QUESTION.options());
            assertThat(question.expectedAnswers()).isEqualTo(GENERATED_QUESTION.expectedAnswers());
            assertThat(question.correctAnswers()).containsExactly(GENERATED_ANSWER);
        });
    }

    @Test
    void storesTheGeneratedAnswerKeyWhenPublishingAQuestion() {
        final List<StoredAssessmentQuestion> resolved = AssessmentQuestionResolver.resolve(
            List.of(
                new AssessmentDtos.QuestionInput(
                    AssessmentDtos.SOURCE_GENERATED, GENERATED_ID, null, null, null, null, null
                )
            ),
            List.of(GENERATED_QUESTION),
            List.of(new SingleProjectDtos.QuizAnswerKeyQuestion(GENERATED_ID, List.of(GENERATED_ANSWER))),
            new AssessmentCapabilitiesConfiguration()
        );

        assertThat(resolved).singleElement()
            .extracting(StoredAssessmentQuestion::correctAnswers)
            .isEqualTo(List.of(GENERATED_ANSWER));
    }

    @ParameterizedTest
    @CsvSource({ "YES_NO, Yes", "NUMBER, 3", "FREE_TEXT, the green flag" })
    void resolvesATeacherAuthoredQuestionOfEveryKindTheBuilderOffers(final String type, final String correctAnswer) {
        final List<StoredAssessmentQuestion> resolved = AssessmentQuestionResolver.resolve(
            List.of(custom(CAT_QUESTION, type, null, null, List.of(correctAnswer))),
            List.of(), List.of(), new AssessmentCapabilitiesConfiguration()
        );

        assertThat(resolved).singleElement().satisfies(question -> {
            assertThat(question.questionType()).isEqualTo(QuestionType.valueOf(type));
            assertThat(question.correctAnswers()).containsExactly(correctAnswer);
            assertThat(question.options()).isEmpty();
        });
    }

    @ParameterizedTest
    @CsvSource({ "MULTIPLE_CHOICE", "YES_NO", "NUMBER", "FREE_TEXT" })
    void resolvesAQuestionOfEveryKindThatNamesNoCorrectAnswerAtAll(final String type) {
        final List<String> options = choiceOptionsFor(type);
        final List<StoredAssessmentQuestion> resolved = AssessmentQuestionResolver.resolve(
            List.of(custom(CAT_QUESTION, type, options, null, null)),
            List.of(), List.of(), new AssessmentCapabilitiesConfiguration()
        );

        assertThat(resolved).singleElement().satisfies(question -> {
            assertThat(question.questionType()).isEqualTo(QuestionType.valueOf(type));
            assertThat(question.correctAnswers()).isEmpty();
            assertThat(question.markable()).isFalse();
        });
    }

    @Test
    void refusesAYesNoQuestionNamingBothAnswersAsCorrect() {
        assertThatThrownBy(
            () -> AssessmentQuestionResolver.resolve(
                List.of(custom(CAT_QUESTION, "YES_NO", null, null, List.of("Yes", "No"))),
                List.of(), List.of(), new AssessmentCapabilitiesConfiguration()
            )
        ).isInstanceOf(IllegalArgumentException.class).hasMessageContaining("one correct answer");
    }

    @Test
    void refusesAYesNoQuestionWhoseCorrectAnswerIsNeitherAYesNorANo() {
        assertThatThrownBy(
            () -> AssessmentQuestionResolver.resolve(
                List.of(custom(CAT_QUESTION, "YES_NO", null, null, List.of("maybe"))),
                List.of(), List.of(), new AssessmentCapabilitiesConfiguration()
            )
        ).isInstanceOf(IllegalArgumentException.class).hasMessageContaining("must be a yes or a no");
    }

    @Test
    void refusesANumericQuestionWhoseCorrectAnswerIsNotANumber() {
        assertThatThrownBy(
            () -> AssessmentQuestionResolver.resolve(
                List.of(custom("How many sprites?", "NUMBER", null, null, List.of("three"))),
                List.of(), List.of(), new AssessmentCapabilitiesConfiguration()
            )
        ).isInstanceOf(IllegalArgumentException.class).hasMessageContaining("must be a number");
    }

    @Test
    void refusesANumericQuestionNamingMoreThanOneCorrectAnswer() {
        assertThatThrownBy(
            () -> AssessmentQuestionResolver.resolve(
                List.of(custom("How many sprites?", "NUMBER", null, null, List.of("3", "4"))),
                List.of(), List.of(), new AssessmentCapabilitiesConfiguration()
            )
        ).isInstanceOf(IllegalArgumentException.class).hasMessageContaining("one correct answer");
    }

    @Test
    void refusesAFreeTextAnswerLongerThanTheConfiguredCeiling() {
        final AssessmentCapabilitiesConfiguration limits = new AssessmentCapabilitiesConfiguration();
        limits.setMaxOptionLength(5);

        assertThatThrownBy(
            () -> AssessmentQuestionResolver.resolve(
                List.of(custom("Explain the loop.", "FREE_TEXT", null, null, List.of("far too long an answer"))),
                List.of(), List.of(), limits
            )
        ).isInstanceOf(IllegalArgumentException.class).hasMessageContaining("correct answer is too long");
    }

    @Test
    void refusesMoreFreeTextAnswersThanTheConfiguredCeiling() {
        final AssessmentCapabilitiesConfiguration limits = new AssessmentCapabilitiesConfiguration();
        limits.setMaxOptions(2);

        assertThatThrownBy(
            () -> AssessmentQuestionResolver.resolve(
                List.of(custom("Explain the loop.", "FREE_TEXT", null, null, List.of(OPTION_A, OPTION_B, "c"))),
                List.of(), List.of(), limits
            )
        ).isInstanceOf(IllegalArgumentException.class).hasMessageContaining("Too many correct answers");
    }

    @ParameterizedTest
    @CsvSource({ "YES_NO", "NUMBER", "FREE_TEXT" })
    void refusesAnswerOptionsOnAnyKindThatIsNotMultipleChoice(final String type) {
        assertThatThrownBy(
            () -> AssessmentQuestionResolver.resolve(
                List.of(custom(CAT_QUESTION, type, List.of("Yes", "No"), null, null)),
                List.of(), List.of(), new AssessmentCapabilitiesConfiguration()
            )
        ).isInstanceOf(IllegalArgumentException.class).hasMessageContaining("Only a choice question");
    }

    @ParameterizedTest
    @CsvSource({ "YES_NO", "NUMBER", "FREE_TEXT" })
    void refusesAKindThatIsNotMultipleChoiceExpectingSeveralAnswers(final String type) {
        assertThatThrownBy(
            () -> AssessmentQuestionResolver.resolve(
                List.of(custom(CAT_QUESTION, type, null, 2, null)),
                List.of(), List.of(), new AssessmentCapabilitiesConfiguration()
            )
        ).isInstanceOf(IllegalArgumentException.class).hasMessageContaining("Only a multiple-choice question");
    }

    /**
     * Offers two loop blocks as answer options on a choice question and none on any other kind.
     *
     * @param type the question type the test resolves
     * @return the loop options for a multiple-choice question, otherwise {@code null}
     */
    private static List<String> choiceOptionsFor(final String type) {
        if (MULTIPLE_CHOICE_TYPE.equals(type)) {
            return List.of(FOREVER, REPEAT_TEN);
        }
        return null;
    }

    private static AssessmentDtos.QuestionInput custom(
        final String text, final String type, final List<String> options, final Integer expectedAnswers,
        final List<String> correctAnswers
    ) {
        return new AssessmentDtos.QuestionInput(
            AssessmentDtos.SOURCE_CUSTOM, null, text, type, options, expectedAnswers, correctAnswers
        );
    }
}
