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
import static org.awaitility.Awaitility.await;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.web.multipart.MultipartFile;

import de.uni_passau.fim.se2.litterbox_web.LitterboxWebIntegrationTest;

class TemporaryFileServiceTest extends LitterboxWebIntegrationTest {

    @Autowired
    private TemporaryFileService temporaryFileService;

    @Test
    void createTemporaryFile() throws IOException {
        final MultipartFile fileContent = createTestFile("test.sb3");
        final Path file = temporaryFileService.createTemporaryFile(fileContent, Duration.ofSeconds(1));
        assertThat(file).exists().hasSize(4);
        assertThat(file.getFileName().toString()).endsWith("test.sb3");
    }

    @Test
    void createTemporaryFileCustomSuffix() throws IOException {
        final MultipartFile fileContent = createTestFile("ignored.sb3");
        final Path file = temporaryFileService.createTemporaryFile(fileContent, "custom.txt", Duration.ofSeconds(1));
        assertThat(file).exists().hasSize(4);
        assertThat(file.getFileName().toString()).endsWith("custom.txt");
    }

    @Test
    void cleanUpTemporaryFile() throws IOException {
        final MultipartFile fileContent = createTestFile("test_shortlived.sb3");
        final Path file = temporaryFileService.createTemporaryFile(fileContent, Duration.ofMillis(500));

        await().atMost(Duration.ofSeconds(5)).until(() -> !Files.exists(file));

        assertThat(file).doesNotExist();
    }

    private MultipartFile createTestFile(final String name) {
        return new MockMultipartFile(name, new byte[] { 0, 1, 2, 3 });
    }
}
