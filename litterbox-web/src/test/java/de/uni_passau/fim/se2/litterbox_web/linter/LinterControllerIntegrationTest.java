/*
 * Copyright (C) 2024-2026 LitterBox-Web contributors
 *
 * This file is part of LitterBox-Web.
 * Licenced under the EUPL-1.2 or later.
 *
 * SPDX-FileCopyrightText: 2024-2026 LitterBox-Web contributors
 * SPDX-License-Identifier: EUPL-1.2
 */
package de.uni_passau.fim.se2.litterbox_web.linter;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.IOException;
import java.util.List;
import java.util.Set;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;

import de.uni_passau.fim.se2.litterbox.analytics.IssueType;
import de.uni_passau.fim.se2.litterbox.ast.ParsingException;
import de.uni_passau.fim.se2.litterbox.ast.model.Program;
import de.uni_passau.fim.se2.litterbox.ast.visitor.ScratchBlocksVisitor;
import de.uni_passau.fim.se2.litterbox_web.LitterboxWebIntegrationTest;
import de.uni_passau.fim.se2.litterbox_web.shared.dto.IssueDTO;
import de.uni_passau.fim.se2.litterbox_web.util.FixtureLoader;
import de.uni_passau.fim.se2.litterbox_web.util.RequestUtilService;

class LinterControllerIntegrationTest extends LitterboxWebIntegrationTest {

    private static final String DEFAULT_FIXTURE = "tokenizingTest.json";
    private static final String ANALYZE_URL = "/linter/analyze";

    @Autowired
    private RequestUtilService requestUtilService;

    @Test
    void getLitterboxAnalysis() throws Exception {
        final List<IssueDTO> issues = requestFeedback(DEFAULT_FIXTURE, "english");
        assertThat(issues).hasSize(5);
    }

    @Test
    void checkScratchBlocksFormat() throws Exception {
        final List<IssueDTO> issues = requestFeedback(DEFAULT_FIXTURE, "english");
        assertThat(issues).isNotEmpty();

        final IssueDTO issue = issues.stream().filter(i -> IssueType.BUG.equals(i.type())).findAny().orElseThrow();
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
        final List<IssueDTO> issues = requestFeedback(DEFAULT_FIXTURE, language);
        assertThat(issues).hasSize(5);

        final String issueName;
        if ("en".equals(language)) {
            issueName = "Sprite Naming";
        }
        else {
            issueName = "Bedeutungsloser Figurenname";
        }
        assertThat(issues).anyMatch(issue -> issueName.equals(issue.translatedFinderName()));
    }

    @Test
    void getIssuesAll() throws Exception {
        final Program program = FixtureLoader.loadProgramFixture(DEFAULT_FIXTURE);
        final LinterRequest request = new LinterRequest("en", "all", program);

        final List<IssueDTO> issues = requestUtilService.postWithResponseBodyList(
            ANALYZE_URL, request, IssueDTO.class, HttpStatus.OK
        );

        assertThat(issues)
            .hasSize(12)
            .anyMatch(issue -> "Sprite Naming".equals(issue.translatedFinderName()))
            .anyMatch(issue -> "xbZ^vS,ML7Dqi,H3G=rc".equals(issue.hatBlockId()));
    }

    @Test
    void onlySmellsAndBugsByDefault() throws Exception {
        final Program program = FixtureLoader.loadProgramFixture(DEFAULT_FIXTURE);
        final LinterRequest request = new LinterRequest(program);

        final List<IssueDTO> issues = requestUtilService.postWithResponseBodyList(
            ANALYZE_URL, request, IssueDTO.class, HttpStatus.OK
        );

        assertThat(issues)
            .hasSize(5)
            .allMatch(issue -> Set.of(IssueType.BUG, IssueType.SMELL).contains(issue.type()));
    }

    @Test
    void getIssuesGerman() throws Exception {
        final Program program = FixtureLoader.loadProgramFixture(DEFAULT_FIXTURE);

        final LinterRequest request = new LinterRequest("de", "all", program);
        final List<IssueDTO> issues = requestUtilService.postWithResponseBodyList(
            ANALYZE_URL, request, IssueDTO.class, HttpStatus.OK
        );

        assertThat(issues)
            .hasSize(12)
            .anyMatch(issue -> "Bedeutungsloser Figurenname".equals(issue.translatedFinderName()))
            .anyMatch(issue -> "xbZ^vS,ML7Dqi,H3G=rc".equals(issue.hatBlockId()));
    }

    @Test
    void getIssuesBugDetector() throws Exception {
        final Program program = FixtureLoader.loadProgramFixture(DEFAULT_FIXTURE);
        final LinterRequest request = new LinterRequest("de", "bugs", program);

        final List<IssueDTO> issues = requestUtilService.postWithResponseBodyList(
            ANALYZE_URL, request, IssueDTO.class, HttpStatus.OK
        );

        assertThat(issues)
            .hasSize(4)
            .allMatch(issue -> IssueType.BUG.equals(issue.type()));
    }

    private List<IssueDTO> requestFeedback(final String fixture, final String language)
        throws ParsingException, IOException {
        final Program program = FixtureLoader.loadProgramFixture(fixture);
        final LinterRequest request = new LinterRequest(language, "flaws", program);

        return requestUtilService.postWithResponseBodyList(
            ANALYZE_URL, request, IssueDTO.class, HttpStatus.OK
        );
    }
}
