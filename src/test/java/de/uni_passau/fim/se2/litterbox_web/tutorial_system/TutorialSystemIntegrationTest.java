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
import java.util.Map;
import java.util.Set;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;

import com.fasterxml.jackson.annotation.JsonInclude;
import com.fasterxml.jackson.annotation.JsonProperty;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;

import de.uni_passau.fim.se2.litterbox.analytics.IssueType;
import de.uni_passau.fim.se2.litterbox.ast.model.Program;
import de.uni_passau.fim.se2.litterbox_web.LitterboxWebIntegrationTest;
import de.uni_passau.fim.se2.litterbox_web.shared.ScratchProgramConverter;
import de.uni_passau.fim.se2.litterbox_web.tutorial_system.code_analyzer.model.TutorialRequest;
import de.uni_passau.fim.se2.litterbox_web.util.FixtureLoader;
import de.uni_passau.fim.se2.litterbox_web.util.RequestUtilService;

class TutorialSystemIntegrationTest extends LitterboxWebIntegrationTest {

    @Autowired
    private RequestUtilService requestUtilService;

    @Autowired
    private ObjectMapper objectMapper;

    @Test
    void getLitterboxAnalysis() throws Exception {
        final Program programJson = FixtureLoader.loadProgramFixture("tokenizingTest.json");
        final TutorialRequest request = new TutorialRequest("english", "all", getProgramAsJson(programJson));

        final ReportDTO issues = requestUtilService.postWithResponseBody(
            "/tutorial-system/checker/generate-feedback", request, ReportDTO.class, HttpStatus.OK
        );
        assertThat(issues.issues).hasSize(3);
    }

    @ParameterizedTest
    @ValueSource(strings = { "german", "english" })
    void selectLanguageForResponse(final String language) throws Exception {
        final Program programJson = FixtureLoader.loadProgramFixture("tokenizingTest.json");
        final TutorialRequest request = new TutorialRequest(language, "all", getProgramAsJson(programJson));

        final ReportDTO issues = requestUtilService.postWithResponseBody(
            "/tutorial-system/checker/generate-feedback", request, ReportDTO.class, HttpStatus.OK
        );
        assertThat(issues.issues).hasSize(3);

        final String issueName;
        if ("english".equals(language)) {
            issueName = "Sprite Naming";
        }
        else {
            issueName = "Bedeutungsloser Figurenname";
        }
        assertThat(issues.issues).anyMatch(issue -> issueName.equals(issue.name()));
    }

    private JsonNode getProgramAsJson(final Program program) throws JsonProcessingException {
        final String json = new ScratchProgramConverter.SerializeConverter().convert(program);
        return objectMapper.readTree(json);
    }

    // todo: make relevant parts in LitterBox public
    private record ReportDTO(
        Map<String, Double> metrics,
        List<IssueDTO> issues
    ) {
    }

    @JsonInclude(JsonInclude.Include.NON_NULL)
    private record IssueDTO(
        int id,
        String finder,
        String name,
        IssueType type,
        int severity,
        String sprite,
        String issueLocationBlockId,
        @JsonProperty("duplicate-of") Set<Integer> duplicateOf,
        @JsonProperty("subsumed-by") Set<Integer> subsumedBy,
        @JsonProperty("coupled-to") Set<Integer> coupledTo,
        @JsonProperty("similar-to") List<SimilarIssue> similarTo,
        String hint,
        List<String> costumes,
        int currentCostume,
        @JsonProperty("code") String scratchBlocksCode,
        @JsonProperty("refactoring") String refactoringScratchBlocksCode
    ) {
    }

    private record SimilarIssue(int id, double distance) {
    }
}
