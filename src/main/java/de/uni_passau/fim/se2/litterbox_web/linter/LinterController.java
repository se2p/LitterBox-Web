/*
 * Copyright (C) 2024 LitterBox-Web contributors
 *
 * This file is part of LitterBox-Web.
 *
 * SPDX-FileCopyrightText: 2024 LitterBox-Web contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
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
package de.uni_passau.fim.se2.litterbox_web.linter;

import java.util.List;

import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import de.uni_passau.fim.se2.litterbox.ast.model.Program;
import de.uni_passau.fim.se2.litterbox_web.shared.Scratch3ParserService;

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
     * @return The found LitterBox issues.
     */
    @PostMapping("analyze")
    public List<IssueInfo> analyze(@RequestBody String projectJson) {
        final Program program = parserService.parseFromString(projectJson);
        return linterService.getIssues(program);
    }
}
