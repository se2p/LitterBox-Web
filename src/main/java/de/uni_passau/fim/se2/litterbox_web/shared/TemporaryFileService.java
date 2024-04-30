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
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.time.ZonedDateTime;
import java.util.UUID;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.system.ApplicationTemp;
import org.springframework.scheduling.TaskScheduler;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

/**
 * Manages temporary files that will be automatically deleted after some time.
 * <p>
 * Note: please use temporary files only when really necessary. For example, LitterBox can also parse the project JSON
 * directly from a String instead of having to read from an SB3. Alternatively, you can make use of the automatic Spring
 * JSON to object conversion as outlined in {@link ScratchProgramConverter} to process parsed programs directly.
 */
@Service
public class TemporaryFileService {

    private static final Logger log = LoggerFactory.getLogger(TemporaryFileService.class);

    private final TaskScheduler taskScheduler;

    private final ApplicationTemp applicationTemp = new ApplicationTemp();

    public TemporaryFileService(final TaskScheduler taskScheduler) {
        this.taskScheduler = taskScheduler;
    }

    /**
     * Creates a temporary file with a unique file name that will be deleted automatically after the given delay.
     *
     * @param file     Some received file content.
     * @param lifetime The duration after which the file will be deleted.
     * @return The path to the temporary file.
     * @throws IOException In case creating the file fails.
     */
    public Path createTemporaryFile(final MultipartFile file, final Duration lifetime) throws IOException {
        return createTemporaryFile(file, file.getName(), lifetime);
    }

    /**
     * Creates a temporary file with a unique file name that will be deleted automatically after the given delay.
     *
     * @param file     Some received file content.
     * @param filename The filename suffix that should be used when saving the file. Will be prepended with some unique
     *                 prefix.
     * @param lifetime The duration after which the file will be deleted.
     * @return The path to the temporary file.
     * @throws IOException In case creating the file fails.
     */
    public Path createTemporaryFile(
        final MultipartFile file, final String filename, final Duration lifetime
    ) throws IOException {
        final Path targetFile = applicationTemp.getDir().toPath().resolve(generateUniqueFilename(filename));
        file.transferTo(targetFile);

        scheduleDeletion(targetFile, lifetime);

        return targetFile;
    }

    private Path generateUniqueFilename(final String baseFilename) {
        return Path.of(UUID.randomUUID() + "-" + baseFilename);
    }

    private void scheduleDeletion(final Path file, final Duration delay) {
        taskScheduler.schedule(() -> {
            try {
                Files.deleteIfExists(file);
            }
            catch (IOException e) {
                log.warn("Could not delete temporary file {}!", file, e);
            }
        }, ZonedDateTime.now().plus(delay).toInstant());
    }
}
