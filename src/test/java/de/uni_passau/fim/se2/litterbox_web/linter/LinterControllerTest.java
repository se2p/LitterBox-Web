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
package de.uni_passau.fim.se2.litterbox_web.linter;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;
import java.util.Map;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;

import de.uni_passau.fim.se2.litterbox_web.LitterboxWebIntegrationTest;
import de.uni_passau.fim.se2.litterbox_web.util.FixtureLoader;
import de.uni_passau.fim.se2.litterbox_web.util.RequestUtilService;

class LinterControllerTest extends LitterboxWebIntegrationTest {

    @Autowired
    private RequestUtilService requestUtilService;

    @Test
    void getIssues() throws Exception {
        final String programJson = FixtureLoader.loadFixture("tokenizingTest.json");

        final List<IssueInfo> issues = requestUtilService.postWithResponseBodyList(
            "/linter/analyze", programJson, IssueInfo.class, HttpStatus.OK
        );

        assertThat(issues)
            .hasSize(3)
            .anyMatch(issue -> "Sprite Naming".equals(issue.translatedFinderName()));
    }

    @Test
    void getIssuesGerman() throws Exception {
        final String programJson = FixtureLoader.loadFixture("tokenizingTest.json");

        final List<IssueInfo> issues = requestUtilService.postWithResponseBodyList(
            "/linter/analyze", programJson, Map.of("locale", "de"), IssueInfo.class, HttpStatus.OK
        );

        assertThat(issues)
            .hasSize(3)
            .anyMatch(issue -> "Bedeutungsloser Figurenname".equals(issue.translatedFinderName()));
    }
}
