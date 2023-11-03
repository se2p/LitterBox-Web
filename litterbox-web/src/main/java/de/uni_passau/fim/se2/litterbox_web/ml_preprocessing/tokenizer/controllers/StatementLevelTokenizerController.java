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
import de.uni_passau.fim.se2.litterbox_web.ml_preprocessing.tokenizer.services.StatementLevelTokenizerService;

@RestController
@RequestMapping("tokenizer/statement-level/tokenize")
public class StatementLevelTokenizerController {

    private final StatementLevelTokenizerService statementLevelTokenizerService;

    public StatementLevelTokenizerController(StatementLevelTokenizerService statementLevelTokenizerService) {
        this.statementLevelTokenizerService = statementLevelTokenizerService;
    }

    @PostMapping("statement-masking")
    public List<String> tokenize(@RequestBody final MaskedTokenizationRequest request) {
        return statementLevelTokenizerService.tokenize(request.jsonProgram(), request.blockId());
    }

}
