/*
 * Copyright (C) 2024-2026 LitterBox-Web contributors
 *
 * This file is part of LitterBox-Web.
 * Licenced under the EUPL-1.2 or later.
 *
 * SPDX-FileCopyrightText: 2024-2026 LitterBox-Web contributors
 * SPDX-License-Identifier: EUPL-1.2
 */
/* SPDX-License-Identifier: EUPL-1.2 */
package de.uni_passau.fim.se2.litterbox_web.persistence;

import static org.assertj.core.api.Assertions.assertThat;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.HexFormat;

import org.junit.jupiter.api.Test;

class LocalContentAddressedSourceArtifactStoreTest {

    @Test
    void storesBytesBySha256AndReopensThem() throws Exception {
        final Path root = Files.createTempDirectory("litterbox-artifacts-");
        final LocalContentAddressedSourceArtifactStore store = new LocalContentAddressedSourceArtifactStore(root);
        final byte[] source = "synthetic-project".getBytes(java.nio.charset.StandardCharsets.UTF_8);

        final SourceArtifactStore.StoredSourceArtifact artifact = store.put(
            new java.io.ByteArrayInputStream(source), "application/octet-stream", "project.sb3"
        );

        assertThat(artifact.byteSize()).isEqualTo(source.length);
        assertThat(HexFormat.of().formatHex(artifact.sha256())).hasSize(64);
        assertThat(store.open(artifact.sha256()).readAllBytes()).isEqualTo(source);
        assertThat(Files.walk(root).filter(Files::isRegularFile).count()).isEqualTo(1);
    }

    /** A request that is refused after its bytes have been read must leave the store as it found it. */
    @Test
    void leavesNothingBehindWhenStagedBytesAreNeverPromoted() throws Exception {
        final Path root = Files.createTempDirectory("litterbox-artifacts-");
        final LocalContentAddressedSourceArtifactStore store = new LocalContentAddressedSourceArtifactStore(root);
        final byte[] source = "abandoned-project".getBytes(java.nio.charset.StandardCharsets.UTF_8);

        try (
            SourceArtifactStore.StagedSourceArtifact staged = store.stage(
                new java.io.ByteArrayInputStream(source), "application/octet-stream", "project.sb3"
            )
        ) {
            assertThat(HexFormat.of().formatHex(staged.sha256())).hasSize(64);
        }

        assertThat(Files.walk(root).filter(Files::isRegularFile).count()).isZero();
    }

    /** The digest is known before the bytes are kept, which is what lets a caller decide whether to keep them. */
    @Test
    void hashesStagedBytesBeforeTheyArePromoted() throws Exception {
        final Path root = Files.createTempDirectory("litterbox-artifacts-");
        final LocalContentAddressedSourceArtifactStore store = new LocalContentAddressedSourceArtifactStore(root);
        final byte[] source = "kept-project".getBytes(java.nio.charset.StandardCharsets.UTF_8);

        final SourceArtifactStore.StoredSourceArtifact stored;
        final byte[] digest;
        try (
            SourceArtifactStore.StagedSourceArtifact staged = store.stage(
                new java.io.ByteArrayInputStream(source), "application/octet-stream", "project.sb3"
            )
        ) {
            digest = staged.sha256();
            assertThat(Files.walk(root).filter(Files::isRegularFile).count()).isEqualTo(1);
            stored = staged.promote();
        }

        assertThat(stored.sha256()).isEqualTo(digest);
        assertThat(stored.byteSize()).isEqualTo(source.length);
        assertThat(store.open(stored.sha256()).readAllBytes()).isEqualTo(source);
        assertThat(Files.walk(root).filter(Files::isRegularFile).count()).isEqualTo(1);
    }
}
