/*
 * Copyright (C) 2024-2026 LitterBox-Web contributors
 *
 * This file is part of LitterBox-Web.
 * Licenced under the EUPL-1.2 or later.
 *
 * SPDX-FileCopyrightText: 2024-2026 LitterBox-Web contributors
 * SPDX-License-Identifier: EUPL-1.2
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
