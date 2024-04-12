/*
 * Copyright (C) 2024 LitterBox-Web contributors
 *
 * This file is part of LitterBox-Web.
 *
 * SPDX-FileCopyrightText: 2024 LitterBox-Web contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * LitterBox-Web is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public Licence as published by
 * the Free Software Foundation, either version 3 of the Licence, or (at
 * your option) any later version.
 *
 * LitterBox-Web is distributed in the hope that it will be useful, but
 * WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU
 * General Public Licence for more details.
 *
 * You should have received a copy of the GNU General Public Licence
 * along with LitterBox-Web. If not, see <http://www.gnu.org/licenses/>.
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
        final String scratchBlocks = requestUtilService.postWithResponseBodyString(
            "/converter/scratchblocks", programJson, HttpStatus.OK, null
        );

        assertThat(scratchBlocks)
            .contains("""
                //Script: xbZ^vS,ML7Dqi,H3G=rc
                when green flag clicked
                move (pick random (1) to (10)) steps""");
    }
}
