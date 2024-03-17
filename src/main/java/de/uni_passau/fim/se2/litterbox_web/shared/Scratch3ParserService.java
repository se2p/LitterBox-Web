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
package de.uni_passau.fim.se2.litterbox_web.shared;

import java.io.IOException;
import java.nio.file.Path;

import org.springframework.stereotype.Service;

import de.uni_passau.fim.se2.litterbox.ast.ParsingException;
import de.uni_passau.fim.se2.litterbox.ast.model.Program;
import de.uni_passau.fim.se2.litterbox.ast.parser.Scratch3Parser;
import de.uni_passau.fim.se2.litterbox_web.shared.exceptions.IOStatusException;
import de.uni_passau.fim.se2.litterbox_web.shared.exceptions.ParseStatusException;

/**
 * Provides methods to parse Scratch SB3 and project JSON files.
 * <p>
 * Please use an automatic conversion from Scratch JSON into a program object instead if possible. See
 * {@link de.uni_passau.fim.se2.litterbox_web.model.ScratchProgramConverter} for more details.
 */
@Service
public class Scratch3ParserService {

    private final Scratch3Parser parser = new Scratch3Parser();

    /**
     * Parses a Scratch SB3 or JSON file.
     *
     * @param file A Scratch SB3 or project JSON.
     * @return The parsed program.
     */
    public Program parseFromFile(final Path file) throws ParseStatusException {
        try {
            return parser.parseFile(file.toFile());
        }
        catch (ParsingException | NullPointerException e) {
            throw new ParseStatusException("Could not parse Scratch project!", e);
        }
        catch (IOException e) {
            throw new IOStatusException("Could not read Scratch project.", e);
        }
    }

    /**
     * Parses a project JSON.
     * <p>
     * Uses a default name for the project name. If you need to customise it, use
     * {@link #parseFromString(String, String)} instead.
     *
     * @param projectJson A Scratch 3 project JSON.
     * @return The parsed program.
     */
    public Program parseFromString(final String projectJson) throws ParseStatusException {
        return parseFromString("Scratch project", projectJson);
    }

    /**
     * Parses a project JSON.
     *
     * @param programName A name for the parsed program.
     * @param projectJson A Scratch 3 project JSON.
     * @return The parsed program.
     */
    public Program parseFromString(final String programName, final String projectJson) throws ParseStatusException {
        try {
            return parser.parseString(programName, projectJson);
        }
        catch (ParsingException | NullPointerException e) {
            throw new ParseStatusException("Could not parse Scratch project!", e);
        }
    }
}
