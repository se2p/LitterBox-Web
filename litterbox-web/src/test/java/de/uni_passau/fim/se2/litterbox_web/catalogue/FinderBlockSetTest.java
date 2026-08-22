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

import static org.assertj.core.api.Assertions.assertThat;

import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;

import org.junit.jupiter.api.Test;

import de.uni_passau.fim.se2.litterbox.analytics.IssueFinder;
import de.uni_passau.fim.se2.litterbox.analytics.IssueTool;
import de.uni_passau.fim.se2.litterbox.analytics.mblock.AbstractRobotFinder;
import de.uni_passau.fim.se2.litterbox.utils.FinderGroup;

class FinderBlockSetTest {

    @Test
    void partitionsEveryActiveFinderFromAuthoritativeCoreMetadata() {
        final Map<String, FinderBlockSet> actual = new PatternCatalogueService().entries(Locale.ENGLISH).stream()
            .collect(Collectors.toMap(PatternCatalogueEntry::finderId, PatternCatalogueEntry::blockSet));
        final Set<String> quantum = IssueTool.getFinders(FinderGroup.QUANTUM).stream()
            .map(IssueFinder::getName)
            .collect(Collectors.toSet());
        final Set<String> mblock = IssueTool.getFinders(FinderGroup.ALL).stream()
            .filter(AbstractRobotFinder.class::isInstance)
            .map(IssueFinder::getName)
            .collect(Collectors.toSet());
        final Set<String> scratch = actual.keySet().stream()
            .filter(finderId -> !quantum.contains(finderId) && !mblock.contains(finderId))
            .collect(Collectors.toSet());

        assertThat(quantum).isNotEmpty().doesNotContainAnyElementsOf(mblock);
        assertThat(mblock).isNotEmpty();
        assertThat(scratch).isNotEmpty();
        assertThat(actual).hasSize(IssueTool.getAllFinderNames().size());
        assertThat(actual).allSatisfy(
            (finderId, blockSet) -> assertBlockSet(finderId, blockSet, quantum, mblock)
        );
    }

    private static void assertBlockSet(
        final String finderId,
        final FinderBlockSet blockSet,
        final Set<String> quantum,
        final Set<String> mblock
    ) {
        if (quantum.contains(finderId)) {
            assertThat(blockSet).isEqualTo(FinderBlockSet.QSCRATCH);
        }
        else if (mblock.contains(finderId)) {
            assertThat(blockSet).isEqualTo(FinderBlockSet.MBLOCK);
        }
        else {
            assertThat(blockSet).isEqualTo(FinderBlockSet.SCRATCH);
        }
    }
}
