/*
 * Copyright (C) 2024 LitterBox-Web contributors
 *
 * This file is part of LitterBox-Web.
 * Licenced under the EUPL-1.2 or later.
 *
 * SPDX-FileCopyrightText: 2024 LitterBox-Web contributors
 * SPDX-License-Identifier: EUPL-1.2
 */
package de.uni_passau.fim.se2.litterbox_web.ml_preprocessing.tokenizer;

import java.util.List;

import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("ml/masking-tokenizer/tokenize")
public class TokenizerController {

    private final TokenizerService tokenizerService;

    public TokenizerController(TokenizerService tokenizerService) {
        this.tokenizerService = tokenizerService;
    }

    @PostMapping("complete-program/block-masking")
    public List<String> tokenizeMaskingExpression(@RequestBody final MaskedTokenizationRequest request) {
        return tokenizerService.tokenizeMaskingBlock(request.program(), request.blockId());
    }

    @PostMapping("complete-program/fixed-option-masking")
    public List<String> tokenizeMaskingFixedOption(@RequestBody final MaskedTokenizationRequest request) {
        return tokenizerService.tokenizeMaskingFixedOption(request.program(), request.blockId());
    }

    @PostMapping("statement-level/block-masking")
    public List<String> tokenize(@RequestBody final MaskedTokenizationRequest request) {
        return tokenizerService.tokenizeStatementLevel(request.program(), request.blockId());
    }
}
