/*
 * Copyright (C) 2024-2026 LitterBox-Web contributors
 *
 * This file is part of LitterBox-Web.
 * Licenced under the EUPL-1.2 or later.
 *
 * SPDX-FileCopyrightText: 2024-2026 LitterBox-Web contributors
 * SPDX-License-Identifier: EUPL-1.2
 */
package de.uni_passau.fim.se2.litterbox_web.migration;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.junit.jupiter.api.Assumptions.assumeTrue;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

/**
 * A store that cannot be written is the operator's own machine talking, and the migration answered it with "aggregate
 * verification failed" and nothing else: no path, no reason, and the cause dropped on the way out. What the filesystem
 * said has to reach the log, or a store that may not be written and one that has no room left are the same message and
 * the only way to tell them apart is to guess.
 */
class LegacyArtifactStoreDiagnosticTest {

    @TempDir
    private Path parent;

    private LegacyMigrationTestDatabase schemas;
    private Path locked;

    @BeforeEach
    void lockTheStore() throws Exception {
        locked = Files.createDirectory(parent.resolve("locked"));
        assumeTrue(locked.toFile().setWritable(false), "the filesystem must be able to refuse a write");
        assumeTrue(!Files.isWritable(locked), "running as root proves nothing here");
        schemas = new LegacyMigrationTestDatabase();
        schemas.loadSchema();
        schemas.loadData();
    }

    @AfterEach
    void unlockTheStore() {
        locked.toFile().setWritable(true);
        if (schemas != null) {
            schemas.close();
        }
    }

    @Test
    void namesTheStoreAndWhatTheFilesystemSaidAboutIt() {
        final Path store = locked.resolve("artifacts");

        assertThatThrownBy(() -> harness().migrate(schemas.options(store)))
            .isInstanceOf(LegacyMigrationException.class)
            .satisfies(thrown -> {
                final LegacyMigrationException refusal = (LegacyMigrationException) thrown;
                assertThat(refusal.diagnostics()).singleElement().satisfies(diagnostic -> {
                    assertThat(diagnostic.code()).isEqualTo("ARTIFACT_STORE_UNAVAILABLE");
                    assertThat(diagnostic.detail())
                        .as("the operator is told which directory and what was wrong with it")
                        .contains(store.toString())
                        .doesNotContain("aggregate verification failed");
                });
                assertThat(refusal.getCause())
                    .as("what the filesystem said survives as far as the log")
                    .isInstanceOf(IOException.class);
            });
    }

    private LegacyMigrationHarness harness() {
        return new LegacyMigrationHarness(schemas.source(), schemas.target());
    }
}
