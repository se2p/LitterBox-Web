/*
 * Copyright (C) 2024-2026 LitterBox-Web contributors
 *
 * This file is part of LitterBox-Web.
 * Licenced under the EUPL-1.2 or later.
 *
 * SPDX-FileCopyrightText: 2024-2026 LitterBox-Web contributors
 * SPDX-License-Identifier: EUPL-1.2
 */
package de.uni_passau.fim.se2.litterbox_web.web_ui.persistence;

import java.io.Closeable;
import java.io.IOException;
import java.io.InputStream;

public interface SourceArtifactStore {

    /**
     * Reads the bytes aside and hashes them without yet making them part of the store.
     *
     * <p>
     * Whether a request may keep its bytes is not decided until the digest is known, because an idempotency key bound
     * to different bytes refuses the request, and a refused request should leave nothing behind. Staging is what lets
     * the digest be computed before anything durable is written.
     */
    StagedSourceArtifact stage(InputStream source, String mediaType, String originalFilename) throws IOException;

    InputStream open(byte[] sha256) throws IOException;

    /** Stages and keeps in one step, for content nothing is going to reconsider once it has been read. */
    default StoredSourceArtifact put(
        final InputStream source, final String mediaType, final String originalFilename
    ) throws IOException {
        try (StagedSourceArtifact staged = stage(source, mediaType, originalFilename)) {
            return staged.promote();
        }
    }

    /**
     * Bytes read aside and hashed, which the store keeps only if asked to.
     *
     * <p>
     * Closing a staged artifact that was never promoted discards it; closing one that was promoted does nothing. A
     * caller can therefore close unconditionally and let {@link #promote()} decide the outcome.
     */
    interface StagedSourceArtifact extends Closeable {

        byte[] sha256();

        /** Makes the staged bytes part of the store, addressed by their digest. */
        StoredSourceArtifact promote() throws IOException;

        /** Discards the staged bytes unless they were promoted. Never throws; this is cleanup, not an outcome. */
        @Override
        void close();
    }

    record StoredSourceArtifact(byte[] sha256, long byteSize, String mediaType, String originalFilename) {

        public StoredSourceArtifact {
            sha256 = sha256.clone();
        }

        @Override
        public byte[] sha256() {
            return sha256.clone();
        }
    }
}
