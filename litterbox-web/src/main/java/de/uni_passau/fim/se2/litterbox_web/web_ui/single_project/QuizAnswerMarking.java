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

import java.util.List;
import java.util.Set;
import java.util.stream.Collectors;

import de.uni_passau.fim.se2.litterbox.analytics.questions.QuestionType;
import de.uni_passau.fim.se2.litterbox_web.qlc.QuestionDTO;
import de.uni_passau.fim.se2.litterbox_web.shared.AnswerMatching;
import de.uni_passau.fim.se2.litterbox_web.shared.ChoiceAnswers;

final class QuizAnswerMarking {

    private QuizAnswerMarking() {
    }

    static final class InvalidQuizAnswerException extends IllegalArgumentException {

        InvalidQuizAnswerException(final String message) {
            super(message);
        }
    }

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

    static QuizAnswerPort.Verdict evaluation(final StoredQuizQuestion question, final String answer) {
        return new QuizAnswerPort.Verdict(isCorrect(question, answer), question.correctAnswers());
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
        if (question.choices().isEmpty()) {
            return;
        }
        final List<String> selected = ChoiceAnswers.choices(answer);
        if (!validChoices(selected, question.choices())) {
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
        final Set<String> offered = choices.stream().map(ChoiceAnswers::normalise).collect(Collectors.toSet());
        return offered.containsAll(selected) && Set.copyOf(selected).size() == selected.size();
    }

    private static boolean expectsOneChoice(final StoredQuizQuestion question) {
        return question.type() != QuestionType.MULTIPLE_CHOICE || question.correctAnswers().size() <= 1;
    }

    static boolean isCorrect(final StoredQuizQuestion question, final String answer) {
        if (question.type() == null) {
            throw new InvalidQuizAnswerException("Question carries no type and cannot be marked");
        }
        return AnswerMatching.matches(question.type(), question.correctAnswers(), answer);
    }
}
