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

import java.io.IOException;
import java.util.List;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;

import de.uni_passau.fim.se2.litterbox.ast.ParsingException;
import de.uni_passau.fim.se2.litterbox.ast.model.Program;
import de.uni_passau.fim.se2.litterbox.ast.visitor.ScratchBlocksVisitor;
import de.uni_passau.fim.se2.litterbox_web.LitterboxWebIntegrationTest;
import de.uni_passau.fim.se2.litterbox_web.util.FixtureLoader;
import de.uni_passau.fim.se2.litterbox_web.util.RequestUtilService;

class TutorialSystemIntegrationTest extends LitterboxWebIntegrationTest {

    @Autowired
    private RequestUtilService requestUtilService;

    @Test
    void getLitterboxAnalysis() throws Exception {
        final List<TutorialIssueInfo> issues = requestFeedback("tokenizingTest.json", "english");
        assertThat(issues).hasSize(3);
    }

    @Test
    void checkScratchBlocksFormat() throws Exception {
        final List<TutorialIssueInfo> issues = requestFeedback("tokenizingTest.json", "english");
        assertThat(issues).isNotEmpty();

        final TutorialIssueInfo issue = issues.getFirst();
        final String scratchBlocksCode = issue.scratchBlocksCode();
        assertThat(scratchBlocksCode)
            .doesNotContain(ScratchBlocksVisitor.SCRATCHBLOCKS_START)
            .doesNotContain(ScratchBlocksVisitor.SCRATCHBLOCKS_END)
            // comment indicating bug location
            .contains("// ⇦  \uD83D\uDC1B")
            .contains("when green flag clicked");
    }

    @ParameterizedTest
    @ValueSource(strings = { "de", "en" })
    void selectLanguageForResponse(final String language) throws Exception {
        final List<TutorialIssueInfo> issues = requestFeedback("tokenizingTest.json", language);
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

    private List<TutorialIssueInfo> requestFeedback(final String fixture, final String language)
        throws ParsingException, IOException {
        final Program program = FixtureLoader.loadProgramFixture(fixture);
        final TutorialRequest request = new TutorialRequest(language, "flaws", program);

        return requestUtilService.postWithResponseBodyList(
            "/tutorial-system/generate-feedback", request, TutorialIssueInfo.class, HttpStatus.OK
        );
    }
}
