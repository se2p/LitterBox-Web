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
package de.uni_passau.fim.se2.litterbox_web.util;

import java.io.IOException;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.nio.file.Path;

import org.springframework.core.io.DefaultResourceLoader;
import org.springframework.core.io.Resource;
import org.springframework.core.io.ResourceLoader;
import org.springframework.util.FileCopyUtils;

import de.uni_passau.fim.se2.litterbox.ast.ParsingException;
import de.uni_passau.fim.se2.litterbox.ast.model.Program;
import de.uni_passau.fim.se2.litterbox.ast.parser.Scratch3Parser;

public class FixtureLoader {

    private static final ResourceLoader RESOURCE_LOADER = new DefaultResourceLoader();
    private static final Scratch3Parser PARSER = new Scratch3Parser();

    private FixtureLoader() {
        throw new IllegalCallerException("utility class");
    }

    /**
     * Loads a fixture file content from {@code resources/fixtures/${fileName}}.
     *
     * @param fileName The path to the fixture within the {@code resources/fixtures/} directory.
     * @return The content of the file.
     * @throws IOException In case reading the file fails.
     */
    public static String loadFixture(final String fileName) throws IOException {
        final Resource resource = RESOURCE_LOADER.getResource(Path.of("fixtures").resolve(fileName).toString());
        try (var reader = new InputStreamReader(resource.getInputStream(), StandardCharsets.UTF_8)) {
            return FileCopyUtils.copyToString(reader);
        }
    }

    /**
     * Loads a fixture from {@code resources/fixtures/${fileName}} and parses it as Scratch 3 program.
     *
     * @param fileName The path to the fixture within the {@code resources/fixtures/} directory.
     * @return The fixture parsed as Scratch program.
     * @throws IOException      In case reading the file fails.
     * @throws ParsingException In case parsing the file as Scratch program fails.
     */
    public static Program loadProgramFixture(final String fileName) throws IOException, ParsingException {
        final Resource resource = RESOURCE_LOADER.getResource(Path.of("fixtures").resolve(fileName).toString());
        try (var reader = new InputStreamReader(resource.getInputStream(), StandardCharsets.UTF_8)) {
            final String fileContent = FileCopyUtils.copyToString(reader);
            return PARSER.parseString(fileName, fileContent);
        }
    }
}
