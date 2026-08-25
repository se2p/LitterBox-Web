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

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.util.Objects;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;

import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Repository;

import de.uni_passau.fim.se2.litterbox_web.web_ui.persistence.entity.SourceArtifactEntity;
import de.uni_passau.fim.se2.litterbox_web.web_ui.persistence.jpa.SourceArtifacts;
import reactor.core.publisher.Mono;

@Repository
public class SourceArtifactRepository {

    private final SourceArtifacts artifacts;
    private final DatabaseWork databaseWork;
    private final StorageWork storageWork;
    private final SourceArtifactStore store;

    public SourceArtifactRepository(
        final SourceArtifacts artifacts, final DatabaseWork databaseWork, final StorageWork storageWork,
        final SourceArtifactStore store
    ) {
        this.artifacts = Objects.requireNonNull(artifacts, "artifacts");
        this.databaseWork = Objects.requireNonNull(databaseWork, "databaseWork");
        this.storageWork = Objects.requireNonNull(storageWork, "storageWork");
        this.store = Objects.requireNonNull(store, "store");
    }

    /**
     * Records what a stored artifact is.
     *
     * <p>
     * A bundle fetched from Scratch carries its manifest inside itself, and reading it means opening the stored file
     * and walking the archive. That is read on a storage thread, so a slow store cannot occupy the database's bounded
     * capacity for as long as it takes to find the entry.
     */
    public Mono<SourceArtifact> register(final SourceArtifactWrite artifact) {
        Objects.requireNonNull(artifact, "artifact");
        return bundleManifest(artifact)
            .map(artifact::withManifest)
            .defaultIfEmpty(artifact)
            .flatMap(described -> databaseWork.submit(() -> registerInDatabase(described)));
    }

    /** The manifest packed into the stored bundle, and nothing at all unless this artifact is one. */
    private Mono<String> bundleManifest(final SourceArtifactWrite artifact) {
        if (!"SCRATCH_URL".equals(artifact.sourceKind())) {
            return Mono.empty();
        }
        return storageWork.submit(() -> manifestJson(artifact));
    }

    /**
     * The same file uploaded twice is one artifact. Which of the two uploads it is said to have come from can still
     * change: a project fetched from Scratch knows things about itself that a bare upload of the same bytes did not.
     */
    private SourceArtifact registerInDatabase(final SourceArtifactWrite artifact) {
        final String manifestJson = artifact.manifestJson();
        final SourceArtifactEntity entity = new SourceArtifactEntity();
        entity.setSha256(artifact.sha256());
        entity.setStorageKey(artifact.storageKey());
        entity.setOriginalFilename(artifact.originalFilename());
        entity.setMediaType(artifact.mediaType());
        entity.setByteSize(artifact.byteSize());
        entity.setSourceKind(artifact.sourceKind());
        entity.setManifestJson(manifestJson);
        entity.setRetentionState("ACTIVE");
        try {
            return toArtifact(artifacts.saveAndFlush(entity));
        }
        catch (DataIntegrityViolationException alreadyStored) {
            return reconcileExisting(artifact, manifestJson, alreadyStored);
        }
    }

    private SourceArtifact reconcileExisting(
        final SourceArtifactWrite artifact,
        final String manifestJson,
        final DataIntegrityViolationException alreadyStored
    ) {
        final SourceArtifactEntity stored = artifacts.findBySha256(artifact.sha256())
            .orElseThrow(() -> alreadyStored);
        if ("SCRATCH_URL".equals(artifact.sourceKind()) || "BATCH_FAILURE".equals(artifact.sourceKind())) {
            stored.setSourceKind(artifact.sourceKind());
            stored.setManifestJson(manifestJson);
            artifacts.saveAndFlush(stored);
        }
        return new SourceArtifact(
            stored.getId(), artifact.sha256(), stored.getByteSize(), stored.getMediaType(),
            stored.getOriginalFilename()
        );
    }

    private String manifestJson(final SourceArtifactWrite artifact) throws IOException {
        try (InputStream source = store.open(artifact.sha256()); ZipInputStream zip = new ZipInputStream(source)) {
            ZipEntry entry;
            while ((entry = zip.getNextEntry()) != null) {
                if ("litterbox/manifest.json".equals(entry.getName())) {
                    final ByteArrayOutputStream output = new ByteArrayOutputStream();
                    final byte[] buffer = new byte[8192];
                    int read;
                    while ((read = zip.read(buffer)) >= 0) {
                        if (output.size() + read > 1024 * 1024) {
                            throw new IllegalArgumentException("Scratch source manifest is too large");
                        }
                        output.write(buffer, 0, read);
                    }
                    return output.toString(java.nio.charset.StandardCharsets.UTF_8);
                }
            }
        }
        throw new IllegalArgumentException("Scratch source bundle has no manifest");
    }

    /** The artifact some earlier request kept these exact bytes as, if one has been recorded yet. */
    public Mono<SourceArtifact> findBySha256(final byte[] sha256) {
        Objects.requireNonNull(sha256, "sha256");
        return databaseWork.submit(
            () -> artifacts.findBySha256(sha256).map(SourceArtifactRepository::toArtifact).orElse(null)
        );
    }

    public Mono<SourceArtifact> findById(final long id) {
        return databaseWork.submit(
            () -> artifacts.findById(id).map(SourceArtifactRepository::toArtifact).orElse(null)
        );
    }

    public Mono<SourceArtifactMetadata> findMetadataById(final long id) {
        return databaseWork.submit(
            () -> artifacts.findById(id)
                .map(
                    stored -> new SourceArtifactMetadata(
                        stored.getId(), stored.getSourceKind(), stored.getManifestJson()
                    )
                )
                .orElse(null)
        );
    }

    private static SourceArtifact toArtifact(final SourceArtifactEntity entity) {
        return new SourceArtifact(
            entity.getId(), entity.getSha256(), entity.getByteSize(), entity.getMediaType(),
            entity.getOriginalFilename()
        );
    }

    public record SourceArtifactWrite(
        byte[] sha256,
        String storageKey,
        String originalFilename,
        String mediaType,
        long byteSize,
        String sourceKind,
        String manifestJson
    ) {

        public SourceArtifactWrite {
            if (sha256 == null || sha256.length != 32) {
                throw new IllegalArgumentException("SHA-256 digest must contain 32 bytes");
            }
            if (byteSize < 0) {
                throw new IllegalArgumentException("byteSize must not be negative");
            }
            Objects.requireNonNull(storageKey, "storageKey");
            Objects.requireNonNull(sourceKind, "sourceKind");
            sha256 = sha256.clone();
        }

        /** The same artifact, described by the manifest that was read out of the bundle rather than supplied. */
        SourceArtifactWrite withManifest(final String manifest) {
            return new SourceArtifactWrite(
                sha256, storageKey, originalFilename, mediaType, byteSize, sourceKind, manifest
            );
        }

        @Override
        public byte[] sha256() {
            return sha256.clone();
        }
    }
}
