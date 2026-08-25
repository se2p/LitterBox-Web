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

/** One finding as it was written down: everything a result page needs to draw it again without re-analysing. */
record StoredIssue(
    int id,
    String finderId,
    String finderName,
    String type,
    String hint,
    String sprite,
    String blockId,
    String costume,
    String scratchblocks,
    List<Integer> duplicates,
    List<Integer> subsumedBy,
    List<Integer> coupledWith,
    int severity,
    List<String> costumes,
    int currentCostume,
    String refactoringScratchblocks,
    List<SingleProjectDtos.SimilarIssueView> similarTo,
    String thumbnailHash
) {

    StoredIssue {
        duplicates = duplicates == null ? List.of() : List.copyOf(duplicates);
        subsumedBy = subsumedBy == null ? List.of() : List.copyOf(subsumedBy);
        coupledWith = coupledWith == null ? List.of() : List.copyOf(coupledWith);
        costumes = costumes == null ? List.of() : List.copyOf(costumes);
        similarTo = similarTo == null ? List.of() : List.copyOf(similarTo);
    }
}
