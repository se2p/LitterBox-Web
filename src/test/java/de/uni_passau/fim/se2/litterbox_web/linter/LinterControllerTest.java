/*
 * Copyright (C) 2024 LitterBox-Web contributors
 *
 * This file is part of LitterBox-Web.
 * Licenced under the EUPL-1.2 or later.
 *
 * SPDX-FileCopyrightText: 2024 LitterBox-Web contributors
 * SPDX-License-Identifier: EUPL-1.2
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
            .hasSize(10)
            .anyMatch(issue -> "Sprite Naming".equals(issue.translatedFinderName()))
            .anyMatch(issue -> "xbZ^vS,ML7Dqi,H3G=rc".equals(issue.hatBlockId()));
    }

    @Test
    void getIssuesGerman() throws Exception {
        final String programJson = FixtureLoader.loadFixture("tokenizingTest.json");

        final List<IssueInfo> issues = requestUtilService.postWithResponseBodyList(
            "/linter/analyze", programJson, Map.of("locale", "de"), IssueInfo.class, HttpStatus.OK
        );

        assertThat(issues)
            .hasSize(10)
            .anyMatch(issue -> "Bedeutungsloser Figurenname".equals(issue.translatedFinderName()))
            .anyMatch(issue -> "xbZ^vS,ML7Dqi,H3G=rc".equals(issue.hatBlockId()));
    }

    @Test
    void getIssuesBugDetector() throws Exception {
        final String programJson = FixtureLoader.loadFixture("tokenizingTest.json");

        final List<IssueInfo> issues = requestUtilService.postWithResponseBodyList(
            "/linter/analyze", programJson, Map.of("locale", "de", "detectors", "bugs"), IssueInfo.class, HttpStatus.OK
        );

        assertThat(issues)
            .hasSize(2)
            .allMatch(issue -> issue.issueType().equals("BUG"));
    }
}
