/*
 * Copyright (C) 2024-2026 LitterBox-Web contributors
 *
 * This file is part of LitterBox-Web.
 * Licenced under the EUPL-1.2 or later.
 *
 * SPDX-FileCopyrightText: 2024-2026 LitterBox-Web contributors
 * SPDX-License-Identifier: EUPL-1.2
 */
package de.uni_passau.fim.se2.litterbox_web.single_project;

import java.util.Arrays;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.regex.Pattern;
import java.util.stream.Collectors;

import de.uni_passau.fim.se2.litterbox.analytics.questions.QuestionType;
import de.uni_passau.fim.se2.litterbox_web.qlc.QuestionDTO;

/**
 * Whether an answer to a generated question is right, and what the right answer was.
 *
 * Nothing here reaches a database, a file or a clock: given a question and what a learner typed, the verdict is the
 * same every time.
 *
 * The rules are deliberately generous where being strict would punish a learner for spelling rather than for
 * understanding, and strict where a loose reading would mark a wrong answer right.
 */
final class QuizAnswerMarking {

    private QuizAnswerMarking() {
    }

    /** Raised for an answer that cannot be marked at all, as opposed to one that is simply wrong. */
    static final class InvalidQuizAnswerException extends IllegalArgumentException {

        InvalidQuizAnswerException(final String message) {
            super(message);
        }
    }

    /** A question as it is put to a reader, with nothing in it that would give the answer away. */
    record StoredQuizQuestion(
        String questionId,
        QuestionType type,
        String question,
        List<String> choices,
        List<String> correctAnswers
    ) {

        StoredQuizQuestion {
            choices = choices == null ? List.of() : List.copyOf(choices);
            correctAnswers = correctAnswers == null ? List.of() : List.copyOf(correctAnswers);
        }
    }

    record QuizEvaluation(boolean correct, List<String> correctAnswers) {

        QuizEvaluation {
            correctAnswers = correctAnswers == null ? List.of() : List.copyOf(correctAnswers);
        }
    }

    static SingleProjectDtos.QuizView quizView(final QuestionDTO question) {
        return new SingleProjectDtos.QuizView(
            Integer.toString(question.id()),
            question.questionText(),
            question.choices() == null ? List.of() : question.choices(),
            question.type() == null ? null : question.type().name(),
            question.sprite(),
            question.scratchBlocksCode(),
            question.hint(),
            question.programDimension() == null ? null : question.programDimension().name(),
            question.scopeOfFocus() == null ? null : question.scopeOfFocus().name(),
            question.correctAnswers() == null ? 1 : Math.max(1, question.correctAnswers().size())
        );
    }

    static StoredQuizQuestion storedQuizQuestion(final QuestionDTO question) {
        return new StoredQuizQuestion(
            Integer.toString(question.id()), question.type(), question.questionText(),
            question.choices(), question.correctAnswers()
        );
    }

    /**
     * The expected answer travels back with the verdict, because a learner who is told only "wrong" has learnt nothing.
     * It is disclosed in response to an answer, never alongside the question.
     */
    static QuizEvaluation evaluation(final StoredQuizQuestion question, final String answer) {
        return new QuizEvaluation(isCorrect(question, answer), question.correctAnswers());
    }

    static void validateStoredQuestion(
        final SingleProjectDtos.QuizView generatedQuestion,
        final StoredQuizQuestion answerKey
    ) {
        if (
            !generatedQuestion.question().equals(answerKey.question())
                || !generatedQuestion.options().equals(answerKey.choices())
        ) {
            throw new InvalidQuizAnswerException("Quiz question does not match the saved analysis");
        }
    }

    static void validateQuizAnswer(final StoredQuizQuestion question, final String answer) {
        final List<String> choices = question.choices() == null ? List.of() : question.choices();
        if (choices.isEmpty()) {
            return;
        }
        final List<String> selected = Arrays.stream(answer.split("\\|", -1))
            .map(String::trim)
            .filter(value -> !value.isEmpty())
            .toList();
        if (!validChoices(selected, choices)) {
            throw new InvalidQuizAnswerException("Answer is not one of the generated choices");
        }
        if (expectsOneChoice(question) && selected.size() != 1) {
            throw new InvalidQuizAnswerException("Answer contains multiple choices");
        }
    }

    private static boolean validChoices(final List<String> selected, final List<String> choices) {
        if (selected.isEmpty()) {
            return false;
        }
        if (selected.stream().anyMatch(value -> choices.stream().noneMatch(choice -> sameAnswer(choice, value)))) {
            return false;
        }
        return selected.stream().map(QuizAnswerMarking::normalizeAnswer).distinct().count() == selected.size();
    }

    /**
     * Whether exactly one of the choices may be selected. Every kind but multiple choice takes a single answer, and a
     * multiple-choice question with only one expected answer is asking for one too.
     */
    private static boolean expectsOneChoice(final StoredQuizQuestion question) {
        final List<String> correctAnswers = question.correctAnswers() == null ? List.of() : question.correctAnswers();
        return question.type() != QuestionType.MULTIPLE_CHOICE || correctAnswers.size() <= 1;
    }

    static boolean isCorrect(final StoredQuizQuestion question, final String answer) {
        // Without a type there is no rule to mark by, and the switch below has no branch for it. An answer that
        // cannot be marked is not a wrong answer, so this is refused rather than scored.
        if (question.type() == null) {
            throw new InvalidQuizAnswerException("Question carries no type and cannot be marked");
        }
        final List<String> expected = question.correctAnswers() == null ? List.of() : question.correctAnswers();
        if (expected.isEmpty()) {
            return false;
        }
        return switch (question.type()) {
            case MULTIPLE_CHOICE -> {
                final Set<String> selected = Arrays.stream(answer.split("\\|", -1))
                    .map(QuizAnswerMarking::normalizeAnswer)
                    .filter(value -> !value.isEmpty())
                    .collect(Collectors.toSet());
                final Set<String> correct = expected.stream()
                    .map(QuizAnswerMarking::normalizeAnswer)
                    .collect(Collectors.toSet());
                yield selected.equals(correct);
            }
            case NUMBER -> numericAnswerMatches(expected.getFirst(), answer);
            case YES_NO -> yesNoAnswerMatches(expected.getFirst(), answer);
            case FREE_TEXT -> expected.stream().anyMatch(value -> freeTextAnswerMatches(value, answer));
        };
    }

    private static boolean numericAnswerMatches(final String expected, final String answer) {
        try {
            return Double.compare(Double.parseDouble(answer.trim()), Double.parseDouble(expected.trim())) == 0;
        }
        catch (NumberFormatException error) {
            return false;
        }
    }

    private static boolean yesNoAnswerMatches(final String expected, final String answer) {
        final String expectedValue = yesNoValue(expected);
        final String answerValue = yesNoValue(answer);
        return expectedValue != null && expectedValue.equals(answerValue);
    }

    /** Yes and no in the four languages this service speaks, and the ways a keyboard tends to shorten them. */
    private static String yesNoValue(final String value) {
        return switch (normalizeAnswer(value)) {
            case "yes", "true", "y", "ja", "si", "sí" -> "yes";
            case "no", "false", "n", "nein", "non", "nee" -> "no";
            default -> null;
        };
    }

    /**
     * Free text is marked on what it says, not on how it is written. A short or numeric answer has to appear as a whole
     * word, so that "3" is not found inside "13"; a longer one may sit anywhere in a fuller sentence.
     */
    private static boolean freeTextAnswerMatches(final String expected, final String answer) {
        final String normalizedExpected = normalizeAnswer(expected);
        final String normalizedAnswer = normalizeAnswer(answer);
        if (normalizedExpected.isEmpty()) {
            return false;
        }
        if (normalizedExpected.equals(normalizedAnswer)) {
            return true;
        }
        if (normalizedExpected.length() <= 2 || normalizedExpected.matches("-?\\d+(\\.\\d+)?")) {
            return Pattern.compile(
                ".*\\b" + Pattern.quote(normalizedExpected) + "\\b.*"
            ).matcher(normalizedAnswer).matches();
        }
        return normalizedAnswer.contains(normalizedExpected);
    }

    private static boolean sameAnswer(final String first, final String second) {
        return normalizeAnswer(first).equals(normalizeAnswer(second));
    }

    private static String normalizeAnswer(final String value) {
        return value == null ? "" : value.trim().replaceAll("\\s+", " ").toLowerCase(Locale.ROOT);
    }
}
