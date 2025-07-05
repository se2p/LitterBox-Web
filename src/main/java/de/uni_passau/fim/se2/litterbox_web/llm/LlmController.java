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

import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

import de.uni_passau.fim.se2.litterbox.analytics.Issue;
import de.uni_passau.fim.se2.litterbox.ast.model.Program;
import de.uni_passau.fim.se2.litterbox_web.shared.JsonScratchProgram;

@RestController("llm")
public class LlmController {

    private final LlmService llmService;

    public LlmController(final LlmService llmService) {
        this.llmService = llmService;
    }

    @PostMapping("issue/explain")
    public String getIssueExplanation(@RequestBody final IssueExplanationRequest request) {
        return llmService.getIssueExplanation(request.program, request.sprite, request.issue);
    }

    // todo: we probably need some issue DTO here, since the regular Issue object contains all kinds of other stuff we
    // we might not really need (and which the GUI might not even have, e.g. the LitterBox AST of the script)
    // rel?: TutorialIssueInfo
    public record IssueExplanationRequest(@JsonScratchProgram Program program, String sprite, Issue issue) {
    }
}
