/*
 * Copyright (C) 2024-2026 LitterBox-Web contributors
 *
 * This file is part of LitterBox-Web.
 * Licenced under the EUPL-1.2 or later.
 *
 * SPDX-FileCopyrightText: 2024-2026 LitterBox-Web contributors
 * SPDX-License-Identifier: EUPL-1.2
 */
package de.uni_passau.fim.se2.litterbox_web.web_ui.persistence;

import java.util.List;
import java.util.Objects;

/** An assessment together with its marks and answer counts, all read from one database snapshot. */
public record AssessmentResultsSnapshot(
    Assessment assessment, List<AssessmentQuestionMark> marks, List<AssessmentAnswerCount> answerCounts
) {

    public AssessmentResultsSnapshot {
        Objects.requireNonNull(assessment, "assessment");
        marks = List.copyOf(marks);
        answerCounts = List.copyOf(answerCounts);
    }
}
