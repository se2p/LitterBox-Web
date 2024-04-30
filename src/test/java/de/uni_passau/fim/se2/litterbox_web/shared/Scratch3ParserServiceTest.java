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
