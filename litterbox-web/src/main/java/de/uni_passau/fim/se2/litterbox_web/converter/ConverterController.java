/*
 * Copyright (C) 2024-2026 LitterBox-Web contributors
 *
 * This file is part of LitterBox-Web.
 * Licenced under the EUPL-1.2 or later.
 *
 * SPDX-FileCopyrightText: 2024-2026 LitterBox-Web contributors
 * SPDX-License-Identifier: EUPL-1.2
 */
package de.uni_passau.fim.se2.litterbox_web.converter;

import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import de.uni_passau.fim.se2.litterbox.analytics.ProgramScratchBlocksAnalyzer;
import de.uni_passau.fim.se2.litterbox_web.shared.Scratch3ParserService;
import reactor.core.publisher.Mono;

@RestController
@RequestMapping("/converter")
public class ConverterController {

    private final Scratch3ParserService parserService;

    public ConverterController(final Scratch3ParserService parserService) {
        this.parserService = parserService;
    }

    /**
     * Converts a project into ScratchBlocks format.
     *
     * @param projectJson A Scratch project JSON.
     * @return The same project, but in ScratchBlocks format.
     */
    @PostMapping("scratchblocks")
    public Mono<String> scratchBlocks(@RequestBody String projectJson) {
        return Mono
            .fromSupplier(() -> parserService.parseFromString(projectJson))
            .map(program -> {
                final ProgramScratchBlocksAnalyzer scratchBlocksAnalyzer = new ProgramScratchBlocksAnalyzer();
                return scratchBlocksAnalyzer.analyze(program);
            });
    }
}
