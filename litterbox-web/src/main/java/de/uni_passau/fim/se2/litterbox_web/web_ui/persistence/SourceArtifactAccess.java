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
public final class SourceArtifactAccess {

    private final SourceArtifactRepository repository;
    private final SubmissionArtifactRepository links;
    private final SourceArtifactStore store;
    private final StorageWork storageWork;

    public SourceArtifactAccess(
        final SourceArtifactRepository repository, final SubmissionArtifactRepository links,
        final SourceArtifactStore store, final StorageWork storageWork
    ) {
        this.repository = Objects.requireNonNull(repository, "repository");
        this.links = Objects.requireNonNull(links, "links");
        this.store = Objects.requireNonNull(store, "store");
        this.storageWork = Objects.requireNonNull(storageWork, "storageWork");
    }

    public Mono<SourceArtifact> findById(final long id) {
        return repository.findById(id);
    }

    /**
     * The artifact an analysis reads, under the name its own submission gave it, or under no name at all.
     *
     * <p>
     * Identical bytes are stored once, under the name of whichever submission stored them first, which may be someone
     * else's file name. It is never shown in place of this submission's. See {@link #submittedName}.
     *
     * @param analysis the analysis
     * @return the artifact it reads, named as its submission named it
     */
    public Mono<SourceArtifact> findForAnalysis(final Analysis analysis) {
        Objects.requireNonNull(analysis, "analysis");
        return repository.findById(analysis.sourceArtifactId()).flatMap(
            artifact -> submittedName(analysis).map(artifact::named).defaultIfEmpty(artifact.named(null))
        );
    }

    /**
     * What the reader called the project an analysis is of: the name a batch gave it, or else the name its submission
     * linked the artifact under. Nothing for a link made before names were kept, because the only name left then is the
     * artifact's, and that may be another reader's.
     *
     * @param analysis the analysis
     * @return the name, or nothing where none was kept
     */
    public Mono<String> submittedName(final Analysis analysis) {
        if (analysis.projectName() != null && !analysis.projectName().isBlank()) {
            return Mono.just(analysis.projectName());
        }
        return links.findOriginalFilename(analysis.submissionId(), analysis.sourceArtifactId());
    }

    /**
     * Returns retained metadata without opening the stored content.
     *
     * @param id artifact identifier
     * @return retained metadata
     */
    public Mono<SourceArtifactMetadata> findMetadataById(final long id) {
        return repository.findMetadataById(id);
    }

    /**
     * Opens the stored bytes on a thread bounded against the store rather than against the database.
     *
     * <p>
     * Nothing here holds a connection, and a store that has stopped answering must not be able to exhaust the database
     * pool and have the failure reported as the database running out of capacity.
     *
     * @param sha256 digest identifying the stored bytes
     * @return asynchronous stream over the stored bytes
     */
    public Mono<InputStream> open(final byte[] sha256) {
        Objects.requireNonNull(sha256, "sha256");
        return storageWork.submit(() -> store.open(sha256));
    }
}
