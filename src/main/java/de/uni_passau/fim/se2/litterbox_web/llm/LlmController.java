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

import de.uni_passau.fim.se2.litterbox.ast.model.Program;
import de.uni_passau.fim.se2.litterbox_web.shared.JsonScratchProgram;
import de.uni_passau.fim.se2.litterbox_web.shared.dto.IssueDTO;

@RestController("llm")
public class LlmController {

    private final LlmService llmService;

    public LlmController(final LlmService llmService) {
        this.llmService = llmService;
    }

    @PostMapping("issue/explain")
    public IssueDTO getIssueExplanation(@RequestBody final IssueExplanationRequest request) {
        return llmService.getIssueExplanation(request.program, request.issue);
    }

    public record IssueExplanationRequest(@JsonScratchProgram Program program, IssueDTO issue) {
    }
}
