/*
 * Copyright (C) 2024-2026 LitterBox-Web contributors
 *
 * This file is part of LitterBox-Web.
 * Licenced under the EUPL-1.2 or later.
 *
 * SPDX-FileCopyrightText: 2024-2026 LitterBox-Web contributors
 * SPDX-License-Identifier: EUPL-1.2
 */
package de.uni_passau.fim.se2.litterbox_web.web_ui.api.v1;

import de.uni_passau.fim.se2.litterbox_web.web_ui.assessment.AssessmentCapabilitiesConfiguration;

public record AssessmentLimitsDto(
    int maxQuestions,
    int maxTitleLength,
    int maxInstructionsLength,
    int maxQuestionTextLength,
    int maxAnswerGuideLength,
    int maxOptions,
    int maxOptionLength,
    int maxAnswerLength
) {

    static AssessmentLimitsDto of(final AssessmentCapabilitiesConfiguration configuration) {
        return new AssessmentLimitsDto(
            configuration.getMaxQuestions(), configuration.getMaxTitleLength(),
            configuration.getMaxInstructionsLength(), configuration.getMaxQuestionTextLength(),
            configuration.getMaxAnswerGuideLength(), configuration.getMaxOptions(),
            configuration.getMaxOptionLength(), configuration.getMaxAnswerLength()
        );
    }
}
