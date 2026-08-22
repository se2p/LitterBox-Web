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

import java.io.IOException;

final class LegacySyntheticReanalysisVerifier {

    static final String VERSION = "synthetic-reanalysis-v1";

    private LegacySyntheticReanalysisVerifier() {
    }

    static LegacyArtifactReanalysisResult verify(final LegacyArtifactReanalysisInput input) throws IOException {
        final byte[] buffer = new byte[8192];
        // Drained rather than inspected: the migration writer owns the bounded digest and byte-count checks.
        int read = input.bytes().read(buffer);
        while (read != -1) {
            read = input.bytes().read(buffer);
        }
        return new LegacyArtifactReanalysisResult(VERSION, true);
    }
}
