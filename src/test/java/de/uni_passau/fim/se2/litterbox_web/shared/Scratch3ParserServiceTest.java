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

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.annotation.Autowired;

import de.uni_passau.fim.se2.litterbox.ast.model.Program;
import de.uni_passau.fim.se2.litterbox_web.LitterboxWebIntegrationTest;
import de.uni_passau.fim.se2.litterbox_web.shared.exceptions.IOStatusException;
import de.uni_passau.fim.se2.litterbox_web.shared.exceptions.ParseStatusException;
import de.uni_passau.fim.se2.litterbox_web.util.FixtureLoader;

class Scratch3ParserServiceTest extends LitterboxWebIntegrationTest {

    @Autowired
    private Scratch3ParserService parserService;

    @ParameterizedTest
    @ValueSource(strings = { "non-existing.sb3", "non-existing.json" })
    void handleErrorNonExistingFile(final String filename) {
        final Path file = Path.of(filename);
        assertThatThrownBy(() -> parserService.parseFromFile(file))
            .isInstanceOf(IOStatusException.class);
    }

    @Test
    void handleErrorInvalidFile(@TempDir final Path tempDir) throws IOException {
        final Path tempFile = tempDir.resolve("invalid.json");
        Files.writeString(tempFile, "{\"invalidScratchProject\":2}");

        assertThatThrownBy(() -> parserService.parseFromFile(tempFile))
            .isInstanceOf(ParseStatusException.class);
    }

    @Test
    void handleInvalidStringInput() {
        assertThatThrownBy(() -> parserService.parseFromString("custom-name", "{invalidJson}"))
            .isInstanceOf(ParseStatusException.class);
    }

    @Test
    void parseValidFileFromString() throws IOException {
        final String input = FixtureLoader.loadFixture("tokenizingTest.json");

        final Program program = parserService.parseFromString("custom-name", input);
        assertThat(program).isNotNull();
        assertThat(program.getIdent().getName()).isEqualTo("custom-name");
    }

    @Test
    void parseValidFileFromStringSettingDefaultName() throws IOException {
        final String input = FixtureLoader.loadFixture("tokenizingTest.json");

        final Program program = parserService.parseFromString(input);
        assertThat(program).isNotNull();
        assertThat(program.getIdent().getName()).isNotNull().isNotBlank();
    }
}
