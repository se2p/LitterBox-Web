/*
 * Copyright (C) 2024-2026 LitterBox-Web contributors
 *
 * This file is part of LitterBox-Web.
 * Licenced under the EUPL-1.2 or later.
 *
 * SPDX-FileCopyrightText: 2024-2026 LitterBox-Web contributors
 * SPDX-License-Identifier: EUPL-1.2
 */
package de.uni_passau.fim.se2.litterbox_web.persistence;

import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.nio.file.StandardOpenOption;
import java.security.MessageDigest;
import java.util.HexFormat;
import java.util.Objects;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

/** Synthetic/local content-addressed store used by development and tests. */
@Component
public final class LocalContentAddressedSourceArtifactStore implements SourceArtifactStore {

    private final Path root;

    @Autowired
    public LocalContentAddressedSourceArtifactStore(
        @Value("${litterbox.storage.root}") final String root
    ) throws IOException {
        this(Path.of(root));
    }

    public LocalContentAddressedSourceArtifactStore(final Path root) throws IOException {
        this.root = Objects.requireNonNull(root, "root").toAbsolutePath().normalize();
        Files.createDirectories(this.root);
    }

    @Override
    public StagedSourceArtifact stage(
        final InputStream source,
        final String mediaType,
        final String originalFilename
    ) throws IOException {
        Objects.requireNonNull(source, "source");
        final Path temporary = Files.createTempFile(root, ".artifact-", ".tmp");
        try {
            final MessageDigest digest = Digests.sha256();
            long size = 0;
            try (OutputStream output = Files.newOutputStream(temporary, StandardOpenOption.TRUNCATE_EXISTING)) {
                final byte[] buffer = new byte[8192];
                int read;
                while ((read = source.read(buffer)) >= 0) {
                    if (read == 0) {
                        continue;
                    }
                    output.write(buffer, 0, read);
                    digest.update(buffer, 0, read);
                    size += read;
                }
            }
            return new StagedFile(temporary, digest.digest(), size, mediaType, originalFilename);
        }
        catch (IOException | RuntimeException failure) {
            deleteQuietly(temporary);
            throw failure;
        }
    }

    /** Bytes written into the store's own directory but not yet addressed by their digest. */
    private final class StagedFile implements StagedSourceArtifact {

        private final Path temporary;
        private final byte[] sha256;
        private final long byteSize;
        private final String mediaType;
        private final String originalFilename;

        private StagedFile(
            final Path temporary,
            final byte[] sha256,
            final long byteSize,
            final String mediaType,
            final String originalFilename
        ) {
            this.temporary = temporary;
            this.sha256 = sha256;
            this.byteSize = byteSize;
            this.mediaType = mediaType;
            this.originalFilename = originalFilename;
        }

        @Override
        public byte[] sha256() {
            return sha256.clone();
        }

        @Override
        public StoredSourceArtifact promote() throws IOException {
            final Path destination = pathFor(sha256);
            Files.createDirectories(destination.getParent());
            // These bytes hash to what is already there, so the copy under this name is the one to give up.
            if (Files.exists(destination)) {
                Files.deleteIfExists(temporary);
            }
            else {
                try {
                    Files.move(temporary, destination, StandardCopyOption.ATOMIC_MOVE);
                }
                catch (java.nio.file.AtomicMoveNotSupportedException ignored) {
                    Files.move(temporary, destination);
                }
            }
            return new StoredSourceArtifact(sha256, byteSize, mediaType, originalFilename);
        }

        @Override
        public void close() {
            deleteQuietly(temporary);
        }
    }

    private static void deleteQuietly(final Path path) {
        try {
            Files.deleteIfExists(path);
        }
        catch (IOException ignored) {
            // A staged file left behind is waste, not a wrong answer, and saying so would replace the real outcome.
        }
    }

    @Override
    public InputStream open(final byte[] sha256) throws IOException {
        Objects.requireNonNull(sha256, "sha256");
        if (sha256.length != 32) {
            throw new IllegalArgumentException("SHA-256 digest must contain 32 bytes");
        }
        return Files.newInputStream(pathFor(sha256), StandardOpenOption.READ);
    }

    private Path pathFor(final byte[] sha256) {
        final String hex = HexFormat.of().formatHex(sha256);
        return root.resolve(hex.substring(0, 2)).resolve(hex.substring(2));
    }
}
