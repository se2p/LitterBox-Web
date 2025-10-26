/*
 * Copyright (C) 2024 LitterBox-Web contributors
 *
 * This file is part of LitterBox-Web.
 * Licenced under the EUPL-1.2 or later.
 *
 * SPDX-FileCopyrightText: 2024 LitterBox-Web contributors
 * SPDX-License-Identifier: EUPL-1.2
 */
package de.uni_passau.fim.se2.litterbox_web.shared.dto;

import org.jspecify.annotations.Nullable;

import de.uni_passau.fim.se2.litterbox.analytics.IssueType;

public record IssueDTO(
    int id,
    IssueType type,
    String name,
    String translatedFinderName,
    String hint,
    String sprite,
    @Nullable String hatBlockId,
    @Nullable String blockId,
    @Nullable String costume,
    String scratchBlocksCode
) {

    public IssueDTO withExplanation(final String explanation) {
        return new IssueDTO(
            id, type, name, translatedFinderName, explanation, sprite, hatBlockId, blockId, costume, scratchBlocksCode
        );
    }
}
