/*
 * Copyright (C) 2024-2026 LitterBox-Web contributors
 *
 * This file is part of LitterBox-Web.
 * Licenced under the EUPL-1.2 or later.
 *
 * SPDX-FileCopyrightText: 2024-2026 LitterBox-Web contributors
 * SPDX-License-Identifier: EUPL-1.2
 */
package de.uni_passau.fim.se2.litterbox_web.web_ui.catalogue;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.Objects;

/**
 * Reads catalogue documents from a directory so that a test can hand the loader a handful of files it wrote itself.
 * Production only ever reads the checked-in resources off the classpath; this exists purely so a malformed or partial
 * catalogue can be described in a test without shipping one.
 */
final class PathResourceSource implements PatternCatalogueLoader.ResourceSource {

    private final Path root;

    PathResourceSource(final Path root) {
        this.root = Objects.requireNonNull(root);
    }

    @Override
    public List<PatternCatalogueLoader.ResourceDocument> resources(final String directory) throws IOException {
        final Path resourceDirectory = root.resolve(directory);
        if (!Files.isDirectory(resourceDirectory)) {
            return List.of();
        }
        try (var paths = Files.list(resourceDirectory)) {
            return paths.filter(path -> Files.isRegularFile(path) && path.toString().endsWith(".json"))
                .sorted()
                .map(path -> {
                    try {
                        return new PatternCatalogueLoader.ResourceDocument(
                            path.toString(), Files.readAllBytes(path)
                        );
                    }
                    catch (IOException exception) {
                        throw new UncheckedIOException(exception);
                    }
                })
                .toList();
        }
        catch (UncheckedIOException exception) {
            throw exception.getCause();
        }
    }
}
