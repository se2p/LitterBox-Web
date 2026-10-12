/*
 * Copyright (C) 2024-2026 LitterBox-Web contributors
 *
 * This file is part of LitterBox-Web.
 * Licenced under the EUPL-1.2 or later.
 *
 * SPDX-FileCopyrightText: 2024-2026 LitterBox-Web contributors
 * SPDX-License-Identifier: EUPL-1.2
 */
package de.uni_passau.fim.se2.litterbox_web.qlc;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

import org.jspecify.annotations.Nullable;

import de.uni_passau.fim.se2.litterbox.analytics.questions.ProgramDimension;
import de.uni_passau.fim.se2.litterbox.analytics.questions.QuestionType;
import de.uni_passau.fim.se2.litterbox.analytics.questions.ScopeOfFocus;

public record QuestionDTO(
    int id,
    QuestionType type,
    String name,
    String translatedFinderName,
    String questionText,
    String sprite,
    String scratchBlocksCode,
    ProgramDimension programDimension,
    ScopeOfFocus scopeOfFocus,
    @Nullable List<String> choices,
    @Nullable List<String> correctAnswers,
    @Nullable String hint
) {

    public QuestionDTO {
        choices = copy(choices);
        correctAnswers = copy(correctAnswers);
    }

    private static List<String> copy(final List<String> values) {
        return values == null ? null : Collections.unmodifiableList(new ArrayList<>(values));
    }

    public QuestionDTO withExplanation(final String explanation) {
        return new QuestionDTO(
            id, type, name, translatedFinderName, explanation, sprite, scratchBlocksCode,
            programDimension, scopeOfFocus, choices, correctAnswers, hint
        );
    }
}
