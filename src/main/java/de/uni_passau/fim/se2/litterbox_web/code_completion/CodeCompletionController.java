/*
 * Copyright (C) 2024 LitterBox-Web contributors
 *
 * This file is part of LitterBox-Web.
 * Licenced under the EUPL-1.2 or later.
 *
 * SPDX-FileCopyrightText: 2024 LitterBox-Web contributors
 * SPDX-License-Identifier: EUPL-1.2
 */
package de.uni_passau.fim.se2.litterbox_web.code_completion;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.annotation.Profile;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import de.uni_passau.fim.se2.litterbox.ast.model.Program;
import de.uni_passau.fim.se2.litterbox_web.shared.Profiles;
import de.uni_passau.fim.se2.litterbox_web.shared.Scratch3ParserService;
import reactor.core.publisher.Mono;

@Profile(Profiles.CODE_COMPLETION)
@RestController
@RequestMapping("code-completion")
public class CodeCompletionController {

    private static final Logger log = LoggerFactory.getLogger(CodeCompletionController.class);

    private final CodeCompletionService codeCompletionService;
    private final Scratch3ParserService parserService;

    public CodeCompletionController(
        final CodeCompletionService codeCompletionService, Scratch3ParserService parserService
    ) {
        this.codeCompletionService = codeCompletionService;
        this.parserService = parserService;
    }

    @PostMapping(value = "")
    public Mono<CodeCompletionService.CodeCompletionBlocks> getCodeCompletion(
        @RequestBody final String programJson,
        @RequestParam(
            value = "model",
            required = false,
            defaultValue = "TRANSFORMER"
        ) final CodeCompletionModelConfig.CodeCompletionModelType model,
        @RequestParam(
            value = "topk",
            required = false,
            defaultValue = "5"
        ) final int topkPredictions
    ) {
        final Program program = parserService.parseFromString(programJson);
        return codeCompletionService.getCodeCompletionSuggestions(program, model, topkPredictions);
    }
}
