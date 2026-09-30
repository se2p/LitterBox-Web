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

import java.util.List;
import java.util.regex.Pattern;

import de.uni_passau.fim.se2.litterbox.analytics.questions.QuestionType;

public final class AnswerMatching {

    public static final String YES = "yes";

    public static final String NO = "no";

    private AnswerMatching() {
    }

    /**
     * Decides whether a learner's answer counts as correct for a question of the given type.
     *
     * @param questionType how the answer is compared: choice set, numeric value, yes/no or free-text containment
     * @param expected     the accepted correct answers; a question without any cannot be answered correctly
     * @param answer       the learner's raw answer
     * @return {@code true} if the answer matches the expected answers under the rules of the question type
     * @throws IllegalArgumentException if no question type is given
     */
    public static boolean matches(final QuestionType questionType, final List<String> expected, final String answer) {
        if (questionType == null) {
            throw new IllegalArgumentException("A question needs a type to be marked");
        }
        if (expected == null || expected.isEmpty()) {
            return false;
        }
        return switch (questionType) {
            case MULTIPLE_CHOICE -> ChoiceAnswers.matches(expected, answer);
            case NUMBER -> numberMatches(expected.getFirst(), answer);
            case YES_NO -> yesNoMatches(expected.getFirst(), answer);
            case FREE_TEXT -> expected.stream().anyMatch(value -> freeTextMatches(value, answer));
        };
    }

    private static boolean numberMatches(final String expected, final String answer) {
        try {
            final double expectedNumber = Double.parseDouble(expected.trim());
            final double answerNumber = Double.parseDouble(answer.trim());
            return Double.isFinite(expectedNumber)
                && Double.isFinite(answerNumber)
                && Double.compare(answerNumber, expectedNumber) == 0;
        }
        catch (NumberFormatException error) {
            return false;
        }
    }

    /**
     * Checks whether a value can be marked as the answer to a numeric question.
     *
     * @param value the text to check, possibly surrounded by whitespace or {@code null}
     * @return {@code true} if the value parses to a finite number
     */
    public static boolean isNumber(final String value) {
        if (value == null) {
            return false;
        }
        try {
            return Double.isFinite(Double.parseDouble(value.trim()));
        }
        catch (NumberFormatException error) {
            return false;
        }
    }

    private static boolean yesNoMatches(final String expected, final String answer) {
        final String expectedValue = yesNoValue(expected);
        final String answerValue = yesNoValue(answer);
        return expectedValue != null && expectedValue.equals(answerValue);
    }

    /**
     * Maps the accepted spellings of yes and no, in several languages, onto a canonical value.
     *
     * @param value the text to interpret; case and surrounding whitespace are ignored
     * @return {@link #YES} or {@link #NO}, or {@code null} if the value is neither
     */
    public static String yesNoValue(final String value) {
        return switch (ChoiceAnswers.normalise(value)) {
            case "yes", "true", "y", "ja", "si", "sí" -> YES;
            case "no", "false", "n", "nein", "non", "nee" -> NO;
            default -> null;
        };
    }

    private static boolean freeTextMatches(final String expected, final String answer) {
        final String normalizedExpected = ChoiceAnswers.normalise(expected);
        final String normalizedAnswer = ChoiceAnswers.normalise(answer);
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
}
