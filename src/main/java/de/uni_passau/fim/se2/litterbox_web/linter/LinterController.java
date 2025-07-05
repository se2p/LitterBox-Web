/*
 * Copyright (C) 2024 LitterBox-Web contributors
 *
 * This file is part of LitterBox-Web.
 * Licenced under the EUPL-1.2 or later.
 *
 * SPDX-FileCopyrightText: 2024 LitterBox-Web contributors
 * SPDX-License-Identifier: EUPL-1.2
 */
package de.uni_passau.fim.se2.litterbox_web.linter;

import java.util.List;

import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import de.uni_passau.fim.se2.litterbox.ast.model.Program;
import de.uni_passau.fim.se2.litterbox_web.shared.Scratch3ParserService;
import de.uni_passau.fim.se2.litterbox_web.shared.dto.IssueDTO;

@RestController
@RequestMapping("/linter")
public class LinterController {

    private final Scratch3ParserService parserService;

    private final LinterService linterService;

    public LinterController(
        final Scratch3ParserService parserService,
        final LinterService linterService
    ) {
        this.parserService = parserService;
        this.linterService = linterService;
    }

    /**
     * Analyses a Scratch 3 program using LitterBox and returns the found issues.
     *
     * @param projectJson A Scratch 3 program in json file format.
     * @param locale      Language/locale used for analysis
     * @param detectors   Programm analyzer detectors for filtering found issues.
     * @return The found LitterBox issues.
     */
    @PostMapping("analyze")
    public List<IssueDTO> analyze(
        @RequestParam(
            value = "locale",
            required = false,
            defaultValue = "en"
        ) String locale,
        @RequestParam(
            value = "detectors",
            required = false,
            defaultValue = "all"
        ) String detectors,
        @RequestBody String projectJson
    ) {
        final Program program = parserService.parseFromString(projectJson);
        return linterService.getIssues(program, locale, detectors);
    }
}
