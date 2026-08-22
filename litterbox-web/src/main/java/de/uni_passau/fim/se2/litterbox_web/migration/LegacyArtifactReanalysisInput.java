/*
 * Copyright (C) 2024-2026 LitterBox-Web contributors
 *
 * This file is part of LitterBox-Web.
 * Licenced under the EUPL-1.2 or later.
 *
 * SPDX-FileCopyrightText: 2024-2026 LitterBox-Web contributors
 * SPDX-License-Identifier: EUPL-1.2
 */
package de.uni_passau.fim.se2.litterbox_web.migration;

import java.io.InputStream;
import java.nio.file.Path;
import java.util.Objects;

/**
 * @param originalFilename the name the project was uploaded under. Stored artifacts are addressed by content, so the
 *                         path says nothing about what kind of file this is, and the parser decides that by extension.
 */
record LegacyArtifactReanalysisInput(
    Path storagePath,
    InputStream bytes,
    String originalFilename
) {

    LegacyArtifactReanalysisInput {
        Objects.requireNonNull(storagePath, "storagePath");
        Objects.requireNonNull(bytes, "bytes");
    }
}
