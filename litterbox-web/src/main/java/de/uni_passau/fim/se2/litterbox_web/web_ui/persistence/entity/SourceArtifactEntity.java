/*
 * Copyright (C) 2024-2026 LitterBox-Web contributors
 *
 * This file is part of LitterBox-Web.
 * Licenced under the EUPL-1.2 or later.
 *
 * SPDX-FileCopyrightText: 2024-2026 LitterBox-Web contributors
 * SPDX-License-Identifier: EUPL-1.2
 */
package de.uni_passau.fim.se2.litterbox_web.web_ui.persistence.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

/** Maps the {@code source_artifact} table. Rows are read and written by the repositories; none escapes one. */
@Entity
@Table(name = "source_artifact")
public class SourceArtifactEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "id")
    private Long id;

    @Column(
        name = "sha256",
        columnDefinition = "BINARY(32)"
    )
    private byte[] sha256;

    @Column(name = "storage_key")
    private String storageKey;

    @Column(name = "original_filename")
    private String originalFilename;

    @Column(name = "media_type")
    private String mediaType;

    @Column(name = "byte_size")
    private long byteSize;

    @Column(name = "source_kind")
    private String sourceKind;

    @Column(
        name = "manifest_json",
        columnDefinition = "LONGTEXT"
    )
    private String manifestJson;

    @Column(name = "retention_state")
    private String retentionState;

    public Long getId() {
        return id;
    }

    public void setId(final Long id) {
        this.id = id;
    }

    public byte[] getSha256() {
        return sha256;
    }

    public void setSha256(final byte[] sha256) {
        this.sha256 = sha256;
    }

    public String getOriginalFilename() {
        return originalFilename;
    }

    public void setOriginalFilename(final String originalFilename) {
        this.originalFilename = originalFilename;
    }

    public String getMediaType() {
        return mediaType;
    }

    public void setMediaType(final String mediaType) {
        this.mediaType = mediaType;
    }

    public long getByteSize() {
        return byteSize;
    }

    public void setByteSize(final long byteSize) {
        this.byteSize = byteSize;
    }

    public String getSourceKind() {
        return sourceKind;
    }

    public void setSourceKind(final String sourceKind) {
        this.sourceKind = sourceKind;
    }

    public String getManifestJson() {
        return manifestJson;
    }

    public void setManifestJson(final String manifestJson) {
        this.manifestJson = manifestJson;
    }

    public String getRetentionState() {
        return retentionState;
    }

    public void setRetentionState(final String retentionState) {
        this.retentionState = retentionState;
    }

    public void setStorageKey(final String storageKey) {
        this.storageKey = storageKey;
    }

}
