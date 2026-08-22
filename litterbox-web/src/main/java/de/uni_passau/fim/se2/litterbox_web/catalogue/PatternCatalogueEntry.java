/*
 * Copyright (C) 2024-2026 LitterBox-Web contributors
 *
 * This file is part of LitterBox-Web.
 * Licenced under the EUPL-1.2 or later.
 *
 * SPDX-FileCopyrightText: 2024-2026 LitterBox-Web contributors
 * SPDX-License-Identifier: EUPL-1.2
 */
package de.uni_passau.fim.se2.litterbox_web.catalogue;

import java.util.List;
import java.util.Objects;

import de.uni_passau.fim.se2.litterbox.analytics.IssueType;

/** Presentation-neutral catalogue content for one finder and locale. */
public record PatternCatalogueEntry(
    String finderId,
    IssueType issueType,
    FinderBlockSet blockSet,
    String locale,
    String name,
    String hint,
    String instruction,
    List<WorkedExample> examples,
    boolean fallback
) {

    public PatternCatalogueEntry {
        finderId = Objects.requireNonNull(finderId);
        issueType = Objects.requireNonNull(issueType);
        blockSet = Objects.requireNonNull(blockSet);
        locale = Objects.requireNonNull(locale);
        name = Objects.requireNonNull(name);
        hint = Objects.requireNonNull(hint);
        instruction = Objects.requireNonNull(instruction);
        examples = List.copyOf(examples);
    }

    /** A labelled scratchblocks example. */
    public record WorkedExample(String label, String scratchblocks) {
    }
}
