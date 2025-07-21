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

import java.util.Optional;

import org.springframework.context.annotation.Lazy;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import de.uni_passau.fim.se2.litterbox.ast.model.Program;
import de.uni_passau.fim.se2.litterbox_web.shared.JsonScratchProgram;
import de.uni_passau.fim.se2.litterbox_web.shared.dto.IssueDTO;

@Lazy
@RestController
@RequestMapping("llm")
public class LlmController {

    private final LlmService llmService;

    public LlmController(final LlmService llmService) {
        this.llmService = llmService;
    }

    @PostMapping("issue/explain")
    public IssueDTO getIssueExplanation(@RequestBody final LlmIssueRequest request) {
        return llmService.getIssueExplanation(request.program, request.issue);
    }

    @PostMapping("issue/fix")
    public LlmIssueFixResponse getIssueFix(@RequestBody final LlmIssueRequest request) {
        final Program fixedProgram = llmService.fixIssue(request.program, request.issue);

        return new LlmIssueFixResponse(fixedProgram);
    }

    @PostMapping("question")
    public String respondToQuestion(@RequestBody final QuestionRequest request) {
        return llmService.respondToQuestion(request.program, request.spriteName().orElse(null), request.question);
    }

    public record LlmIssueRequest(@JsonScratchProgram Program program, IssueDTO issue) {
    }

    public record LlmIssueFixResponse(@JsonScratchProgram Program fixedProgram) {
    }

    public record QuestionRequest(@JsonScratchProgram Program program, Optional<String> spriteName, String question) {
    }
}
