/*
 * Copyright (C) 2024 LitterBox-Web contributors
 *
 * This file is part of LitterBox-Web.
 * Licenced under the EUPL-1.2 or later.
 *
 * SPDX-FileCopyrightText: 2024 LitterBox-Web contributors
 * SPDX-License-Identifier: EUPL-1.2
 */
package de.uni_passau.fim.se2.litterbox_web.tutorial_system.code_analyzer.model;

import de.uni_passau.fim.se2.litterbox.analytics.IssueType;

public record TutorialIssueInfo(
    String name,
    String hint,
    String sprite,
    String costume,
    IssueType type,
    String scratchBlocksCode
) {
}
