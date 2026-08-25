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
import jakarta.persistence.Id;
import jakarta.persistence.Table;

/** Maps the {@code asset} table. Rows are read and written by the repositories; none escapes one. */
@Entity
@Table(name = "asset")
public class AssetEntity {

    @Id
    @Column(
        name = "sha256",
        columnDefinition = "BINARY(32)"
    )
    private byte[] sha256;

    @Column(name = "scratch_md5")
    private String scratchMd5;

    @Column(name = "extension")
    private String extension;

    @Column(name = "media_type")
    private String mediaType;

    @Column(name = "byte_size")
    private long byteSize;

    @Column(
        name = "content",
        columnDefinition = "LONGBLOB"
    )
    private byte[] content;

    public byte[] getSha256() {
        return sha256;
    }

    public void setSha256(final byte[] sha256) {
        this.sha256 = sha256;
    }

    public String getScratchMd5() {
        return scratchMd5;
    }

    public String getExtension() {
        return extension;
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

    public byte[] getContent() {
        return content;
    }

}
