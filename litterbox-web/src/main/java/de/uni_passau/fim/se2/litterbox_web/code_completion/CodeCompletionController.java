/*
 * Copyright (C) 2024-2026 LitterBox-Web contributors
 *
 * This file is part of LitterBox-Web.
 * Licenced under the EUPL-1.2 or later.
 *
 * SPDX-FileCopyrightText: 2024-2026 LitterBox-Web contributors
 * SPDX-License-Identifier: EUPL-1.2
 */
package de.uni_passau.fim.se2.litterbox_web.code_completion;

import org.springframework.context.annotation.Profile;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import de.uni_passau.fim.se2.litterbox_web.shared.Profiles;
import reactor.core.publisher.Mono;

@Profile(Profiles.CODE_COMPLETION)
@RestController
@RequestMapping("code-completion")
public class CodeCompletionController {

    private final CodeCompletionService codeCompletionService;

    public CodeCompletionController(final CodeCompletionService codeCompletionService) {
        this.codeCompletionService = codeCompletionService;
    }

    @PostMapping(value = "")
    public Mono<CodeCompletionService.CodeCompletionBlocks> getCodeCompletion(
        @RequestBody final CodeCompletionRequestDto codeCompletionRequest
    ) {
        return codeCompletionService.getCodeCompletionSuggestions(codeCompletionRequest);
    }
}
