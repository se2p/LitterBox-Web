/*
 * Copyright (C) 2024-2026 LitterBox-Web contributors
 *
 * This file is part of LitterBox-Web.
 * Licenced under the EUPL-1.2 or later.
 *
 * SPDX-FileCopyrightText: 2024-2026 LitterBox-Web contributors
 * SPDX-License-Identifier: EUPL-1.2
 */
package de.uni_passau.fim.se2.litterbox_web.llm;

import java.util.Locale;
import java.util.Optional;

import org.springframework.context.annotation.Lazy;
import org.springframework.context.annotation.Profile;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import de.uni_passau.fim.se2.litterbox.ast.model.Program;
import de.uni_passau.fim.se2.litterbox_web.shared.JsonScratchProgram;
import de.uni_passau.fim.se2.litterbox_web.shared.Profiles;
import de.uni_passau.fim.se2.litterbox_web.shared.dto.IssueDTO;
import reactor.core.publisher.Flux;

@Lazy
@RestController
@Profile(Profiles.LLM)
@RequestMapping("llm")
public class LlmController {

    private final LlmService llmService;
    private final RawLlmService rawLlmService;
    private final TutorialHintService tutorialHintService;

    public LlmController(
        final LlmService llmService,
        final RawLlmService rawLlmService,
        final TutorialHintService tutorialHintService
    ) {
        this.llmService = llmService;
        this.rawLlmService = rawLlmService;
        this.tutorialHintService = tutorialHintService;
    }

    @PostMapping("issue/explain")
    public IssueDTO getIssueExplanation(@RequestBody final LlmIssueRequest request) {
        return llmService.getIssueExplanation(request.locale, request.program, request.issue);
    }

    @PostMapping("issue/fix")
    public LlmIssueFixResponse getIssueFix(@RequestBody final LlmIssueRequest request) {
        final Program fixedProgram = llmService.fixIssue(request.locale, request.program, request.issue);

        return new LlmIssueFixResponse(fixedProgram);
    }

    @PostMapping("question")
    public String respondToQuestion(@RequestBody final QuestionRequest request) {
        return llmService.respondToQuestion(
            request.locale, request.program, request.spriteName().orElse(null), request.question
        );
    }

    /**
     * Accepts a provider-neutral hint request and streams SSE events back. The request format and upstream endpoint are
     * selected via {@code litterbox.llm.raw.api}.
     *
     * @param request The hint request containing the system and user prompts.
     * @return A reactive stream of raw SSE data lines forwarded verbatim from the upstream LLM provider. Each element
     *         is one SSE event string (e.g. {@code data: {...}\n\n}).
     */
    @PostMapping(
        value = "raw",
        produces = MediaType.TEXT_EVENT_STREAM_VALUE
    )
    public Flux<String> rawStream(@RequestBody final HintRequest request) {
        return rawLlmService.stream(request.systemPrompt(), request.userPrompt());
    }

    /**
     * Accepts a tutorial hint request, converts the Scratch program to ScratchBlocks server-side, and streams the SSE
     * response from the upstream LLM. Eliminates the extra {@code /converter/scratchblocks} round-trip previously
     * required by the GUI.
     *
     * @param request The tutorial hint request containing the Scratch program, failed/passed behaviour descriptions,
     *                and locale.
     * @return A reactive stream of raw SSE data lines forwarded verbatim from the upstream LLM provider.
     */
    @PostMapping(
        value = "tutorial",
        produces = MediaType.TEXT_EVENT_STREAM_VALUE
    )
    public Flux<String> tutorialHintStream(@RequestBody final TutorialHintRequest request) {
        return tutorialHintService.stream(
            request.program(), request.failedBehaviour(), request.passedBehaviours(), request.locale()
        );
    }

    public record HintRequest(String systemPrompt, String userPrompt) {
    }

    public record TutorialHintRequest(
        @JsonScratchProgram Program program,
        String failedBehaviour,
        String passedBehaviours,
        Locale locale
    ) {

        public TutorialHintRequest {
            if (locale == null) {
                locale = Locale.ENGLISH;
            }
        }
    }

    public record LlmIssueRequest(Locale locale, @JsonScratchProgram Program program, IssueDTO issue) {

        public LlmIssueRequest {
            if (locale == null) {
                locale = Locale.ENGLISH;
            }
        }
    }

    public record LlmIssueFixResponse(@JsonScratchProgram Program fixedProgram) {
    }

    public record QuestionRequest(
        Locale locale, @JsonScratchProgram Program program, Optional<String> spriteName, String question
    ) {

        public QuestionRequest {
            if (locale == null) {
                locale = Locale.ENGLISH;
            }
        }
    }
}
