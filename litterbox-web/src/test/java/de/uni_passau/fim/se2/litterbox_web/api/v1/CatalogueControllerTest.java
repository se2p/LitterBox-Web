/*
 * Copyright (C) 2024-2026 LitterBox-Web contributors
 *
 * This file is part of LitterBox-Web.
 * Licenced under the EUPL-1.2 or later.
 *
 * SPDX-FileCopyrightText: 2024-2026 LitterBox-Web contributors
 * SPDX-License-Identifier: EUPL-1.2
 */
package de.uni_passau.fim.se2.litterbox_web.api.v1;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

import de.uni_passau.fim.se2.litterbox_web.single_project.SingleProjectDtos;

class CatalogueControllerTest {

    @Test
    void exposesCuratedCatalogueForEveryPublicLocale() {
        final CatalogueController controller = new CatalogueController();
        for (String locale : new String[] { "de", "en", "es", "nl" }) {
            final var entries = controller.catalogue(locale);
            assertThat(entries).isNotEmpty();
            assertThat(entries).extracting(SingleProjectDtos.CatalogueView::id).doesNotHaveDuplicates();
            assertThat(entries).allMatch(entry -> entry.issueType() != null);
            assertThat(entries).allMatch(entry -> !entry.fallback());

            final SingleProjectDtos.CatalogueView curated = entries.stream()
                .filter(entry -> entry.id().equals("blocking_if_else"))
                .findFirst()
                .orElseThrow();
            // The kind of finding comes from the finder itself, so the catalogue cannot contradict a report. How
            // severe an occurrence is belongs to the occurrence and is not answered here at all.
            assertThat(curated.issueType()).isEqualTo("bug");
            assertThat(curated.examples()).isNotEmpty();
            assertThat(curated.locale()).isEqualTo(locale);
            assertThat(curated.fallback()).isFalse();
        }
    }

    @Test
    void separatesRobotPatternsFromScratchPatterns() {
        final var entries = new CatalogueController().catalogue("en");

        assertThat(entries).allMatch(entry -> entry.platform().equals("scratch") || entry.platform().equals("mblock"));
        // Both sides have to be populated, or a filter offering the choice would lead the reader into an empty list.
        assertThat(entries).anyMatch(entry -> entry.platform().equals("mblock"));
        assertThat(entries).anyMatch(entry -> entry.platform().equals("scratch"));
        assertThat(entries).filteredOn(entry -> entry.id().equals("motor_low_power"))
            .singleElement()
            .matches(entry -> entry.platform().equals("mblock"));
        assertThat(entries).filteredOn(entry -> entry.id().equals("blocking_if_else"))
            .singleElement()
            .matches(entry -> entry.platform().equals("scratch"));
    }

    @Test
    void exposesTheSpecificBlockEcosystemForEveryPattern() {
        final var entries = new CatalogueController().catalogue("en");

        assertThat(entries).allMatch(
            entry -> entry.blockSet().equals("scratch")
                || entry.blockSet().equals("qscratch")
                || entry.blockSet().equals("mblock")
        );
        assertThat(entries).filteredOn(entry -> entry.id().equals("blocking_if_else"))
            .singleElement()
            .matches(entry -> entry.blockSet().equals("scratch"));
        assertThat(entries).filteredOn(entry -> entry.id().equals("missing_quantum_measure_simple"))
            .singleElement()
            .matches(entry -> entry.blockSet().equals("qscratch"));
        assertThat(entries).filteredOn(entry -> entry.id().equals("motor_low_power"))
            .singleElement()
            .matches(entry -> entry.blockSet().equals("mblock"));
    }
}
