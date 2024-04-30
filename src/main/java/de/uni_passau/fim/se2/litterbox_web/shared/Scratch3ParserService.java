/*
 * Copyright (C) 2024 LitterBox-Web contributors
 *
 * This file is part of LitterBox-Web.
 * Licenced under the EUPL-1.2 or later.
 *
 * SPDX-FileCopyrightText: 2024 LitterBox-Web contributors
 * SPDX-License-Identifier: EUPL-1.2
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
 * {@link ScratchProgramConverter} for more details.
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
