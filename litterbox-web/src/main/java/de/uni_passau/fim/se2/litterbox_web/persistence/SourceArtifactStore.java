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

import java.io.Closeable;
import java.io.IOException;
import java.io.InputStream;

public interface SourceArtifactStore {

    /**
     * Reads the bytes aside and hashes them without yet making them part of the store.
     *
     * <p>
     * What a request is allowed to keep is not decided until its digest is known: an idempotency key already bound to
     * different bytes refuses the request, and a request that is refused should leave nothing behind. Staging is what
     * lets the digest be read before anything durable has been written under it.
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
     * Bytes read aside and hashed, which the store will keep only if asked to.
     *
     * <p>
     * Closing a staged artifact that was never promoted discards it. Closing one that was promoted does nothing, so a
     * caller can close unconditionally and let the decision be made by whether {@link #promote()} was reached.
     */
    interface StagedSourceArtifact extends Closeable {

        byte[] sha256();

        /** Makes the staged bytes part of the store, addressed by their digest. */
        StoredSourceArtifact promote() throws IOException;

        /** Discards the staged bytes unless they were promoted. Never throws: it is cleanup, not an outcome. */
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
