/*
 * Copyright (C) 2024 LitterBox-Web contributors
 *
 * This file is part of LitterBox-Web.
 * Licenced under the EUPL-1.2 or later.
 *
 * SPDX-FileCopyrightText: 2024 LitterBox-Web contributors
 * SPDX-License-Identifier: EUPL-1.2
 */
package de.uni_passau.fim.se2.litterbox_web.llm;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.when;

import java.io.IOException;
import java.util.List;
import java.util.Locale;
import java.util.Optional;
import java.util.Set;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.mockito.ArgumentCaptor;
import org.mockito.Mockito;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.test.context.bean.override.mockito.MockitoBean;

import de.uni_passau.fim.se2.litterbox.ast.ParsingException;
import de.uni_passau.fim.se2.litterbox.ast.model.ActorDefinition;
import de.uni_passau.fim.se2.litterbox.ast.model.Program;
import de.uni_passau.fim.se2.litterbox.ast.model.Script;
import de.uni_passau.fim.se2.litterbox.ast.model.event.GreenFlag;
import de.uni_passau.fim.se2.litterbox.ast.model.statement.spritemotion.MoveSteps;
import de.uni_passau.fim.se2.litterbox.llm.Conversation;
import de.uni_passau.fim.se2.litterbox.llm.LlmMessage;
import de.uni_passau.fim.se2.litterbox.llm.LlmMessageSender;
import de.uni_passau.fim.se2.litterbox.llm.api.LlmApi;
import de.uni_passau.fim.se2.litterbox_web.LitterboxWebIntegrationTest;
import de.uni_passau.fim.se2.litterbox_web.shared.LitterBoxAnalysisService;
import de.uni_passau.fim.se2.litterbox_web.shared.dto.IssueDTO;
import de.uni_passau.fim.se2.litterbox_web.util.FixtureLoader;
import de.uni_passau.fim.se2.litterbox_web.util.RequestUtilService;

class LlmControllerIntegrationTest extends LitterboxWebIntegrationTest {

    @MockitoBean
    private LlmApi llmApi;

    @Autowired
    private RequestUtilService requestUtilService;

    @Autowired
    private LitterBoxAnalysisService litterBoxAnalysisService;

    @BeforeEach
    void tearDown() {
        Mockito.reset(llmApi);
    }

    @Test
    void askQuestionAboutProgram() throws ParsingException, IOException {
        questionTest(null);
    }

    @Test
    void askQuestionAboutSprite() throws ParsingException, IOException {
        questionTest("boat");
    }

    private void questionTest(final String questionTarget) throws ParsingException, IOException {
        final Program program = FixtureLoader.loadProgramFixture("scratch_programs/boatRace.json");

        final ArgumentCaptor<String> llmRequest = ArgumentCaptor.forClass(String.class);
        when(llmApi.query(anyString(), llmRequest.capture())).thenReturn(conversation("llm response"));

        final LlmController.QuestionRequest request = new LlmController.QuestionRequest(
            program, Optional.ofNullable(questionTarget), "Dummy question"
        );
        final String response = requestUtilService.postWithResponseBody(
            "/llm/question", request, String.class, HttpStatus.OK
        );

        assertThat(llmRequest.getValue()).contains("Dummy question");
        if (questionTarget == null) {
            assertThat(llmRequest.getValue()).contains("//Sprite: Stage");
            assertThat(llmRequest.getValue()).contains("//Sprite: boat");
            assertThat(llmRequest.getValue()).contains("//Sprite: gate");
        }
        else {
            assertThat(llmRequest.getValue()).contains("//Sprite: boat");
            assertThat(llmRequest.getValue()).doesNotContain("//Sprite: Stage");
            assertThat(llmRequest.getValue()).doesNotContain("//Sprite: gate");
        }

        assertThat(response).isEqualTo("llm response");
    }

    @Test
    void explainIssue() throws ParsingException, IOException {
        final Program program = FixtureLoader.loadProgramFixture("scratch_programs/boatRace.json");
        final Set<IssueDTO> issues = litterBoxAnalysisService.getIssues(program, Locale.ENGLISH, "long_script");
        assertThat(issues).hasSize(1);
        IssueDTO issue = issues.stream().findAny().orElseThrow();

        final ArgumentCaptor<String> llmRequest = ArgumentCaptor.forClass(String.class);
        when(llmApi.query(anyString(), llmRequest.capture())).thenReturn(conversation("llm response"));

        final LlmController.LlmIssueRequest request = new LlmController.LlmIssueRequest(program, issue);
        final IssueDTO response = requestUtilService.postWithResponseBody(
            "/llm/issue/explain", request, IssueDTO.class, HttpStatus.OK
        );

        assertThat(llmRequest.getValue())
            .contains("//Sprite: boat", "The script is very long", "Explain how the faulty code affects");

        assertThat(response.hint()).contains(issue.hint(), "llm response");
        assertThat(response).usingRecursiveComparison().ignoringFields("hint").isEqualTo(issue);
    }

    @ParameterizedTest
    @ValueSource(strings = { "program", "sprite", "script" })
    void fixIssue(final String target) throws ParsingException, IOException {
        final Program program = FixtureLoader.loadProgramFixture("scratch_programs/boatRace.json");
        final Set<IssueDTO> issues = litterBoxAnalysisService.getIssues(program, Locale.ENGLISH, "long_script");
        assertThat(issues).hasSize(1);
        IssueDTO issue = issues.stream().findAny().orElseThrow();

        // artificially remove location information, by default sprite and script are known for this issue type
        if ("program".equals(target)) {
            issue = new IssueDTO(
                issue.id(), issue.type(), issue.name(), issue.translatedFinderName(), issue.hint(),
                null, null, issue.blockId(), null, ""
            );
        }
        else if ("sprite".equals(target)) {
            issue = new IssueDTO(
                issue.id(), issue.type(), issue.name(), issue.translatedFinderName(), issue.hint(),
                issue.sprite(), null, null, null, ""
            );
        }

        fixIssue(program, issue);
    }

    private void fixIssue(final Program program, final IssueDTO issue) {
        final ArgumentCaptor<String> llmRequest = ArgumentCaptor.forClass(String.class);
        when(llmApi.query(anyString(), llmRequest.capture())).thenReturn(conversation("""
            //Sprite: newSprite
            //Script: newScript
            when green flag clicked
            move (10) steps
            """.stripIndent()));

        final LlmController.LlmIssueRequest request = new LlmController.LlmIssueRequest(program, issue);
        final LlmController.LlmIssueFixResponse response = requestUtilService.postWithResponseBody(
            "/llm/issue/fix", request, LlmController.LlmIssueFixResponse.class, HttpStatus.OK
        );

        assertThat(llmRequest.getValue()).contains("//Sprite: boat", "The script is very long.", "Fix");

        final Program fixedProgram = response.fixedProgram();
        assertThat(fixedProgram.getActorDefinitionList().getDefinitions()).hasSize(4);

        final ActorDefinition newActor = fixedProgram.getActorDefinitionList().getActorDefinition("newSprite")
            .orElseThrow();
        assertThat(newActor.getScripts().getScriptList()).hasSize(1);

        final Script script = newActor.getScripts().getScript(0);
        assertThat(script.getEvent()).isInstanceOf(GreenFlag.class);
        assertThat(script.getStmtList().getStmts()).hasSize(1)
            .allSatisfy(stmt -> assertThat(stmt).isInstanceOf(MoveSteps.class));
    }

    private Conversation conversation(final String llmMessage) {
        return new Conversation(null, List.of(new LlmMessage.GenericLlmMessage(llmMessage, LlmMessageSender.MODEL)));
    }
}
