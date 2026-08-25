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

import java.io.InputStream;
import java.util.Objects;

import org.springframework.stereotype.Service;

import reactor.core.publisher.Mono;

/** Combines metadata lookup and private byte retrieval for retained source artifacts. */
@Service
public class SourceArtifactAccess {

    private final SourceArtifactRepository repository;
    private final SourceArtifactStore store;
    private final StorageWork storageWork;

    public SourceArtifactAccess(
        final SourceArtifactRepository repository, final SourceArtifactStore store,
        final StorageWork storageWork
    ) {
        this.repository = Objects.requireNonNull(repository, "repository");
        this.store = Objects.requireNonNull(store, "store");
        this.storageWork = Objects.requireNonNull(storageWork, "storageWork");
    }

    public Mono<SourceArtifact> findById(final long id) {
        return repository.findById(id);
    }

    public Mono<SourceArtifactMetadata> findMetadataById(final long id) {
        return repository.findMetadataById(id);
    }

    /**
     * Opens the stored bytes on a thread bounded against the store rather than against the database.
     *
     * <p>
     * Nothing here holds a connection, and a store that has stopped answering must not be able to exhaust the database
     * pool and have the failure reported as the database running out of capacity.
     */
    public Mono<InputStream> open(final byte[] sha256) {
        Objects.requireNonNull(sha256, "sha256");
        return storageWork.submit(() -> store.open(sha256));
    }
}
