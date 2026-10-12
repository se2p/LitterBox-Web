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

import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.stream.Collectors;

import de.uni_passau.fim.se2.litterbox.analytics.questions.QuestionType;
import de.uni_passau.fim.se2.litterbox_web.shared.AnswerMatching;
import de.uni_passau.fim.se2.litterbox_web.shared.ChoiceAnswers;
import de.uni_passau.fim.se2.litterbox_web.web_ui.single_project.SingleProjectDtos;

final class AssessmentQuestionResolver {

    private AssessmentQuestionResolver() {
    }

    static List<StoredAssessmentQuestion> resolve(
        final List<AssessmentDtos.QuestionInput> inputs,
        final List<SingleProjectDtos.QuizView> generatedQuestions,
        final List<SingleProjectDtos.QuizAnswerKeyQuestion> generatedAnswerKeys,
        final AssessmentCapabilitiesConfiguration limits
    ) {
        if (inputs.isEmpty()) {
            throw new IllegalArgumentException("An assessment needs at least one question");
        }
        if (inputs.size() > limits.getMaxQuestions()) {
            throw new IllegalArgumentException("Too many questions for one assessment");
        }
        final Map<String, SingleProjectDtos.QuizView> byId = generatedQuestions.stream()
            .collect(Collectors.toMap(SingleProjectDtos.QuizView::questionId, question -> question, (a, b) -> a));
        final Map<String, List<String>> answerKeysById = generatedAnswerKeys.stream().collect(
            Collectors.toMap(
                SingleProjectDtos.QuizAnswerKeyQuestion::questionId,
                SingleProjectDtos.QuizAnswerKeyQuestion::correctAnswers,
                (a, b) -> a
            )
        );
        final List<StoredAssessmentQuestion> resolved = new ArrayList<>(inputs.size());
        for (int index = 0; index < inputs.size(); index++) {
            resolved.add(
                resolve(inputs.get(index), byId, answerKeysById, limits, Integer.toString(index + 1))
            );
        }
        return List.copyOf(resolved);
    }

    private static StoredAssessmentQuestion resolve(
        final AssessmentDtos.QuestionInput input,
        final Map<String, SingleProjectDtos.QuizView> generatedQuestions,
        final Map<String, List<String>> generatedAnswerKeys,
        final AssessmentCapabilitiesConfiguration limits,
        final String assessmentQuestionId
    ) {
        if (AssessmentDtos.SOURCE_GENERATED.equals(input.source())) {
            return resolveGenerated(input, generatedQuestions, generatedAnswerKeys, limits, assessmentQuestionId);
        }
        if (AssessmentDtos.SOURCE_CUSTOM.equals(input.source())) {
            return resolveCustom(input, limits, assessmentQuestionId);
        }
        throw new IllegalArgumentException("Unknown question source: " + input.source());
    }

    private static StoredAssessmentQuestion resolveGenerated(
        final AssessmentDtos.QuestionInput input,
        final Map<String, SingleProjectDtos.QuizView> generatedQuestions,
        final Map<String, List<String>> generatedAnswerKeys,
        final AssessmentCapabilitiesConfiguration limits,
        final String assessmentQuestionId
    ) {
        final String questionId = input.questionId();
        if (questionId == null || questionId.isBlank()) {
            throw new IllegalArgumentException("A generated question must reference a question id");
        }
        final SingleProjectDtos.QuizView question = generatedQuestions.get(questionId);
        if (question == null) {
            throw new IllegalArgumentException("Unknown generated question: " + questionId);
        }
        requireAnswerCanBeSent(question.options(), question.expectedAnswers(), limits);
        final List<String> correctAnswers = generatedAnswerKeys.get(question.questionId());
        if (correctAnswers == null || correctAnswers.isEmpty()) {
            throw new IllegalArgumentException("A generated question has no answer key");
        }
        return new StoredAssessmentQuestion(
            assessmentQuestionId, AssessmentDtos.SOURCE_GENERATED, question.questionId(), question.question(),
            question.options(), questionType(question.questionType()), question.sprite(), question.scratchBlocks(),
            question.hint(), question.programDimension(), question.scopeOfFocus(), question.expectedAnswers(),
            correctAnswers
        );
    }

    private static StoredAssessmentQuestion resolveCustom(
        final AssessmentDtos.QuestionInput input,
        final AssessmentCapabilitiesConfiguration limits,
        final String assessmentQuestionId
    ) {
        final String text = questionText(input.questionText(), limits);
        final QuestionType questionType = questionType(input.questionType());
        final List<String> options = options(input.options(), limits);
        requireOptionsMatchType(options, questionType);
        final List<String> correctAnswers = correctAnswers(input.correctAnswers(), options, questionType, limits);
        final Integer expectedAnswers = expectedAnswers(input.expectedAnswers(), options, correctAnswers);
        requireAnswerCanBeSent(options, expectedAnswers, limits);
        return new StoredAssessmentQuestion(
            assessmentQuestionId, AssessmentDtos.SOURCE_CUSTOM, null, text, options, questionType, null, null, null,
            null, null, expectedAnswers, correctAnswers
        );
    }

    private static String questionText(final String requested, final AssessmentCapabilitiesConfiguration limits) {
        if (requested == null || requested.trim().isEmpty()) {
            throw new IllegalArgumentException("A teacher-authored question must have text");
        }
        final String text = requested.trim();
        if (text.length() > limits.getMaxQuestionTextLength()) {
            throw new IllegalArgumentException("Question text is too long");
        }
        return text;
    }

    private static void requireOptionsMatchType(final List<String> options, final QuestionType questionType) {
        final boolean chooses = questionType == QuestionType.MULTIPLE_CHOICE;
        if (chooses && options.isEmpty()) {
            throw new IllegalArgumentException("A choice question must carry its answer options");
        }
        if (!chooses && !options.isEmpty()) {
            throw new IllegalArgumentException("Only a choice question may carry answer options");
        }
    }

    private static QuestionType questionType(final String requested) {
        if (requested == null || requested.isBlank()) {
            return QuestionType.FREE_TEXT;
        }
        try {
            return QuestionType.valueOf(requested.trim().toUpperCase(Locale.ROOT));
        }
        catch (IllegalArgumentException error) {
            throw new IllegalArgumentException("Unsupported question type: " + requested, error);
        }
    }

    private static List<String> options(
        final List<String> requested, final AssessmentCapabilitiesConfiguration limits
    ) {
        if (requested == null) {
            return List.of();
        }
        final List<String> trimmed = requested.stream().filter(option -> option != null && !option.isBlank())
            .map(String::trim).toList();
        if (trimmed.size() > limits.getMaxOptions()) {
            throw new IllegalArgumentException("Too many answer options for one question");
        }
        requireEachShorterThan(trimmed, limits.getMaxOptionLength(), "An answer option is too long");
        final Set<String> normalised = trimmed.stream().map(ChoiceAnswers::normalise).collect(Collectors.toSet());
        if (normalised.size() != trimmed.size()) {
            throw new IllegalArgumentException("Answer options must differ from one another");
        }
        if (trimmed.stream().anyMatch(option -> option.contains(ChoiceAnswers.SEPARATOR))) {
            throw new IllegalArgumentException(
                "An answer option may not contain '" + ChoiceAnswers.SEPARATOR + "'"
            );
        }
        return trimmed;
    }

    private static List<String> correctAnswers(
        final List<String> requested, final List<String> options, final QuestionType questionType,
        final AssessmentCapabilitiesConfiguration limits
    ) {
        if (requested == null || requested.isEmpty()) {
            return List.of();
        }
        final List<String> trimmed = requested.stream().filter(answer -> answer != null && !answer.isBlank())
            .map(String::trim).distinct().toList();
        if (trimmed.isEmpty()) {
            return List.of();
        }
        return switch (questionType) {
            case MULTIPLE_CHOICE -> requireAnswersAreOptions(trimmed, options);
            case YES_NO -> requireOneYesOrNo(trimmed);
            case NUMBER -> requireOneNumber(trimmed);
            case FREE_TEXT -> requireAcceptableFreeText(trimmed, limits);
        };
    }

    private static List<String> requireAnswersAreOptions(final List<String> answers, final List<String> options) {
        final List<String> canonical = new ArrayList<>(answers.size());
        for (final String answer : answers) {
            final String normalizedAnswer = ChoiceAnswers.normalise(answer);
            final String option = options.stream()
                .filter(candidate -> ChoiceAnswers.normalise(candidate).equals(normalizedAnswer))
                .findFirst()
                .orElseThrow(
                    () -> new IllegalArgumentException("Every correct answer must be one of the answer options")
                );
            if (!canonical.contains(option)) {
                canonical.add(option);
            }
        }
        return List.copyOf(canonical);
    }

    private static List<String> requireOneYesOrNo(final List<String> answers) {
        if (answers.size() != 1) {
            throw new IllegalArgumentException("A yes/no question has one correct answer");
        }
        if (AnswerMatching.yesNoValue(answers.getFirst()) == null) {
            throw new IllegalArgumentException("The correct answer to a yes/no question must be a yes or a no");
        }
        return answers;
    }

    private static List<String> requireOneNumber(final List<String> answers) {
        if (answers.size() != 1) {
            throw new IllegalArgumentException("A numeric question has one correct answer");
        }
        if (!AnswerMatching.isNumber(answers.getFirst())) {
            throw new IllegalArgumentException("The correct answer to a numeric question must be a number");
        }
        return answers;
    }

    private static List<String> requireAcceptableFreeText(
        final List<String> answers, final AssessmentCapabilitiesConfiguration limits
    ) {
        if (answers.size() > limits.getMaxOptions()) {
            throw new IllegalArgumentException("Too many correct answers for one question");
        }
        requireEachShorterThan(answers, limits.getMaxOptionLength(), "A correct answer is too long");
        return answers;
    }

    private static void requireEachShorterThan(final List<String> values, final int maxLength, final String message) {
        if (values.stream().anyMatch(value -> value.length() > maxLength)) {
            throw new IllegalArgumentException(message);
        }
    }

    private static Integer expectedAnswers(
        final Integer requested, final List<String> options, final List<String> correctAnswers
    ) {
        if (options.isEmpty()) {
            if (requested == null) {
                return null;
            }
            return requireSingleAnswer(requested);
        }
        final int expected = Objects.requireNonNullElseGet(requested, () -> defaultExpected(correctAnswers));
        if (expected < 1 || expected > options.size()) {
            throw new IllegalArgumentException("A question cannot expect more answers than it offers choices");
        }
        if (!correctAnswers.isEmpty() && correctAnswers.size() != expected) {
            throw new IllegalArgumentException(
                "A question must expect exactly as many answers as it names correct ones"
            );
        }
        return expected;
    }

    private static int defaultExpected(final List<String> correctAnswers) {
        if (correctAnswers.isEmpty()) {
            return 1;
        }
        return correctAnswers.size();
    }

    private static void requireAnswerCanBeSent(
        final List<String> options, final Integer expectedAnswers, final AssessmentCapabilitiesConfiguration limits
    ) {
        if (options.isEmpty()) {
            return;
        }
        final int expected = Objects.requireNonNullElse(expectedAnswers, 1);
        final int longest = options.stream().sorted(Comparator.comparingInt(String::length).reversed())
            .limit(expected).mapToInt(String::length).sum() + (expected - 1);
        if (longest > limits.getMaxAnswerLength()) {
            throw new IllegalArgumentException("The answers this question expects are together too long to send");
        }
    }

    private static Integer requireSingleAnswer(final int requested) {
        if (requested != 1) {
            throw new IllegalArgumentException("Only a multiple-choice question expects more than one answer");
        }
        return 1;
    }
}
