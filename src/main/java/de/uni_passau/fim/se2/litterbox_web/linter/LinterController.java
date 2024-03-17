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

import java.io.IOException;
import java.nio.file.Path;
import java.time.Duration;
import java.util.List;

import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestPart;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import de.uni_passau.fim.se2.litterbox.ast.model.Program;
import de.uni_passau.fim.se2.litterbox_web.shared.Scratch3ParserService;
import de.uni_passau.fim.se2.litterbox_web.shared.TemporaryFileService;

@RestController
@RequestMapping("/linter")
public class LinterController {

    private final TemporaryFileService temporaryFileService;

    private final Scratch3ParserService parserService;

    private final LinterService linterService;

    public LinterController(
        final TemporaryFileService temporaryFileService,
        final Scratch3ParserService parserService,
        final LinterService linterService
    ) {
        this.temporaryFileService = temporaryFileService;
        this.parserService = parserService;
        this.linterService = linterService;
    }

    /**
     * Analyses a Scratch 3 program using LitterBox and returns the found issues.
     *
     * @param sb3file A Scratch 3 program in sb3 file format.
     * @return The found LitterBox issues.
     * @throws IOException In case processing the file fails.
     */
    // todo: possible to receive only the project.json instead of the full SB33? -> see issue #8
    @PostMapping("analyze")
    public List<IssueInfo> analyze(@RequestPart("file") MultipartFile sb3file) throws IOException {
        final Path tempFile = temporaryFileService.createTemporaryFile(sb3file, "project.sb3", Duration.ofSeconds(600));
        final Program program = parserService.parseFromFile(tempFile);
        return linterService.getIssues(program);
    }
}
