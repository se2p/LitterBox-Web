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

import java.util.List;
import java.util.Objects;

import de.uni_passau.fim.se2.litterbox.analytics.questions.QuestionType;

record StoredAssessmentQuestion(
    String questionId,
    String source,
    String originalQuestionId,
    String questionText,
    List<String> options,
    QuestionType questionType,
    String sprite,
    String scratchBlocks,
    String hint,
    String programDimension,
    String scopeOfFocus,
    Integer expectedAnswers,
    List<String> correctAnswers
) {

    StoredAssessmentQuestion {
        options = List.copyOf(Objects.requireNonNullElse(options, List.of()));
        correctAnswers = List.copyOf(Objects.requireNonNullElse(correctAnswers, List.of()));
    }

    boolean generated() {
        return AssessmentDtos.SOURCE_GENERATED.equals(source);
    }

    boolean markable() {
        return generated() || !correctAnswers.isEmpty();
    }
}
