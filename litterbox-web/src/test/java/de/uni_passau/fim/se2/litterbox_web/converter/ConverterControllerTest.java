/*
 * Copyright (C) 2024-2026 LitterBox-Web contributors
 *
 * This file is part of LitterBox-Web.
 * Licenced under the EUPL-1.2 or later.
 *
 * SPDX-FileCopyrightText: 2024-2026 LitterBox-Web contributors
 * SPDX-License-Identifier: EUPL-1.2
 */
package de.uni_passau.fim.se2.litterbox_web.converter;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;

import de.uni_passau.fim.se2.litterbox_web.LitterboxWebIntegrationTest;
import de.uni_passau.fim.se2.litterbox_web.util.FixtureLoader;
import de.uni_passau.fim.se2.litterbox_web.util.RequestUtilService;

class ConverterControllerTest extends LitterboxWebIntegrationTest {

    @Autowired
    private RequestUtilService requestUtilService;

    @Test
    void convertToScratchblocks() throws Exception {
        final String programJson = FixtureLoader.loadFixture("tokenizingTest.json");
        final String scratchBlocks = requestUtilService.postWithResponseBody(
            "/converter/scratchblocks", programJson, String.class, HttpStatus.OK
        );

        assertThat(scratchBlocks)
            .contains(
                "//Script: xbZ^vS,ML7Dqi,H3G=rc" + System.lineSeparator() +
                    "when green flag clicked" + System.lineSeparator() +
                    "move (pick random (1) to (10)) steps"
            );
    }
}
