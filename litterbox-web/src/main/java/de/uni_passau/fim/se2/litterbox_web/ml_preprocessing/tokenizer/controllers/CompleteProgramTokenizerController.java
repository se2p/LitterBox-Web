/*
 * Copyright (C) 2023 LitterBox-Web contributors
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
package de.uni_passau.fim.se2.litterbox_web.ml_preprocessing.tokenizer.controllers;

import java.util.List;

import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import de.uni_passau.fim.se2.litterbox_web.ml_preprocessing.tokenizer.models.MaskedTokenizationRequest;
import de.uni_passau.fim.se2.litterbox_web.ml_preprocessing.tokenizer.services.CompleteProgramTokenizerService;

@RestController
@RequestMapping("tokenizer/complete-program/tokenize")
public class CompleteProgramTokenizerController {

    private final CompleteProgramTokenizerService completeProgramTokenizerService;

    public CompleteProgramTokenizerController(CompleteProgramTokenizerService completeProgramTokenizerService) {
        this.completeProgramTokenizerService = completeProgramTokenizerService;
    }

    @PostMapping("expression-masking")
    public List<String> tokenizeMaskingExpression(@RequestBody final MaskedTokenizationRequest request) {
        return completeProgramTokenizerService.tokenizeMaskingExpression(request.jsonProgram(), request.blockId());
    }

    @PostMapping("fixed-option-masking")
    public List<String> tokenizeMaskingFixedOption(@RequestBody final MaskedTokenizationRequest request) {
        return completeProgramTokenizerService.tokenizeMaskingFixedOption(request.jsonProgram(), request.blockId());
    }

}
