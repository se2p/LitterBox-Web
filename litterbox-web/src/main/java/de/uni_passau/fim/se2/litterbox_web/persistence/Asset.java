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

public record Asset(
    byte[] sha256, String scratchMd5, String extension, String mediaType, long byteSize, byte[] content
) {

    public Asset {
        sha256 = sha256.clone();
        content = content == null ? null : content.clone();
    }

    @Override
    public byte[] sha256() {
        return sha256.clone();
    }

    @Override
    public byte[] content() {
        return content == null ? null : content.clone();
    }
}
