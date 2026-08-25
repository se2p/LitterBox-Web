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

import java.util.Arrays;

/** Public metadata for an immutable source artifact; storage keys are deliberately omitted. */
public record SourceArtifact(long id, byte[] sha256, long byteSize, String mediaType, String originalFilename) {

    public SourceArtifact {
        sha256 = sha256.clone();
    }

    @Override
    public byte[] sha256() {
        return sha256.clone();
    }

    @Override
    public boolean equals(final Object other) {
        if (!(other instanceof SourceArtifact artifact)) {
            return false;
        }
        return id == artifact.id && byteSize == artifact.byteSize
            && java.util.Objects.equals(mediaType, artifact.mediaType)
            && java.util.Objects.equals(originalFilename, artifact.originalFilename)
            && Arrays.equals(sha256, artifact.sha256);
    }

    @Override
    public int hashCode() {
        return java.util.Objects.hash(id, byteSize, mediaType, originalFilename, Arrays.hashCode(sha256));
    }
}
