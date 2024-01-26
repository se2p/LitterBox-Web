/*
 * Copyright (C) 2024 LitterBox-Web contributors
 *
 * This file is part of LitterBox-Web.
 *
 * LitterBox-Web is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public Licence as published by
 * the Free Software Foundation, either version 3 of the Licence, or (at
 * your option) any later version.
 *
 * LitterBox-Web is distributed in the hope that it will be useful, but
 * WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU
 * General Public Licence for more details.
 *
 * You should have received a copy of the GNU General Public Licence
 * along with LitterBox-Web. If not, see <http://www.gnu.org/licenses/>.
 */
package de.uni_passau.fim.se2.litterbox_web.ml_preprocessing.tokenizer.controller;

import java.util.List;

import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import de.uni_passau.fim.se2.litterbox_web.ml_preprocessing.tokenizer.model.MaskedTokenizationRequest;
import de.uni_passau.fim.se2.litterbox_web.ml_preprocessing.tokenizer.service.TokenizerService;

@RestController
@RequestMapping("ml/masking-tokenizer/tokenize")
public class TokenizerController {

    private final TokenizerService tokenizerService;

    public TokenizerController(TokenizerService tokenizerService) {
        this.tokenizerService = tokenizerService;
    }

    @PostMapping("complete-program/expression-masking")
    public List<String> tokenizeMaskingExpression(@RequestBody final MaskedTokenizationRequest request) {
        return tokenizerService.tokenizeMaskingExpression(request.program(), request.blockId());
    }

    @PostMapping("complete-program/fixed-option-masking")
    public List<String> tokenizeMaskingFixedOption(@RequestBody final MaskedTokenizationRequest request) {
        return tokenizerService.tokenizeMaskingFixedOption(request.program(), request.blockId());
    }

    @PostMapping("statement-level/statement-masking")
    public List<String> tokenize(@RequestBody final MaskedTokenizationRequest request) {
        return tokenizerService.tokenizeStatementLevel(request.program(), request.blockId());
    }
}
