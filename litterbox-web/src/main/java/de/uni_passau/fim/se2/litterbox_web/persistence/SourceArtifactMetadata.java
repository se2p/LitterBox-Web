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

import java.util.Objects;

/** Private provenance metadata associated with retained source bytes. */
public record SourceArtifactMetadata(long artifactId, String sourceKind, String manifestJson) {

    public SourceArtifactMetadata {
        Objects.requireNonNull(sourceKind, "sourceKind");
    }
}
