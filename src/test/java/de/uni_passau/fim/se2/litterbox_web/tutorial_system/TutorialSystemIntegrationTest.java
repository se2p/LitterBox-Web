/*
 * Copyright (C) 2024 LitterBox-Web contributors
 *
 * This file is part of LitterBox-Web.
 * Licenced under the EUPL-1.2 or later.
 *
 * SPDX-FileCopyrightText: 2024 LitterBox-Web contributors
 * SPDX-License-Identifier: EUPL-1.2
 */
package de.uni_passau.fim.se2.litterbox_web.tutorial_system;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;

import de.uni_passau.fim.se2.litterbox.ast.model.Program;
import de.uni_passau.fim.se2.litterbox_web.LitterboxWebIntegrationTest;
import de.uni_passau.fim.se2.litterbox_web.tutorial_system.code_analyzer.model.TutorialIssueInfo;
import de.uni_passau.fim.se2.litterbox_web.tutorial_system.code_analyzer.model.TutorialRequest;
import de.uni_passau.fim.se2.litterbox_web.util.FixtureLoader;
import de.uni_passau.fim.se2.litterbox_web.util.RequestUtilService;

class TutorialSystemIntegrationTest extends LitterboxWebIntegrationTest {

    @Autowired
    private RequestUtilService requestUtilService;

    @Test
    void getLitterboxAnalysis() throws Exception {
        final Program program = FixtureLoader.loadProgramFixture("tokenizingTest.json");
        final TutorialRequest request = new TutorialRequest("english", "all", program);

        final List<TutorialIssueInfo> issues = requestUtilService.postWithResponseBodyList(
            "/tutorial-system/generate-feedback", request, TutorialIssueInfo.class, HttpStatus.OK
        );
        assertThat(issues).hasSize(3);
    }

    @ParameterizedTest
    @ValueSource(strings = { "de", "en" })
    void selectLanguageForResponse(final String language) throws Exception {
        final Program program = FixtureLoader.loadProgramFixture("tokenizingTest.json");
        final TutorialRequest request = new TutorialRequest(language, "all", program);

        final List<TutorialIssueInfo> issues = requestUtilService.postWithResponseBodyList(
            "/tutorial-system/generate-feedback", request, TutorialIssueInfo.class, HttpStatus.OK
        );
        assertThat(issues).hasSize(3);

        final String issueName;
        if ("en".equals(language)) {
            issueName = "Sprite Naming";
        }
        else {
            issueName = "Bedeutungsloser Figurenname";
        }
        assertThat(issues).anyMatch(issue -> issueName.equals(issue.name()));
    }
}
