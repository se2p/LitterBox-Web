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

import java.util.Arrays;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.stream.Collectors;

public final class ChoiceAnswers {

    public static final String SEPARATOR = "|";

    private ChoiceAnswers() {
    }

    public static String normalise(final String value) {
        if (value == null) {
            return "";
        }
        return value.trim().replaceAll("\\s+", " ").toLowerCase(Locale.ROOT);
    }

    public static Set<String> selected(final String answer) {
        return Set.copyOf(choices(answer));
    }

    /**
     * Splits a submitted choice answer into its individual choices.
     *
     * @param answer the learner's answer with choices joined by {@link #SEPARATOR}; may be {@code null}
     * @return the normalised, non-empty choices in the order given, keeping repeats; empty for a {@code null} answer
     */
    public static List<String> choices(final String answer) {
        if (answer == null) {
            return List.of();
        }
        return Arrays.stream(answer.split("\\" + SEPARATOR, -1))
            .map(ChoiceAnswers::normalise)
            .filter(value -> !value.isEmpty())
            .toList();
    }

    /**
     * Checks if the submitted answer matches the expected choices.
     *
     * @param expected the expected choices
     * @param answer   the learner's answer with choices joined by {@link #SEPARATOR}
     * @return {@code true} if the submitted choices exactly match the expected choices (after normalisation);
     *         {@code false} otherwise
     */
    public static boolean matches(final List<String> expected, final String answer) {
        if (expected == null || expected.isEmpty()) {
            return false;
        }
        final List<String> submitted = choices(answer);
        final Set<String> distinct = Set.copyOf(submitted);
        return distinct.size() == submitted.size()
            && distinct.equals(expected.stream().map(ChoiceAnswers::normalise).collect(Collectors.toSet()));
    }
}
