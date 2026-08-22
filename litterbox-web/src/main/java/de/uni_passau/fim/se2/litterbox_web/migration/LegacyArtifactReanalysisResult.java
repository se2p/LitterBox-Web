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

import java.util.Objects;

/**
 * @param analysisVersion which analyser read the copied artifact
 * @param parsed          whether it turned out to be a project that analyser can still read, which is reported rather
 *                        than thrown
 */
record LegacyArtifactReanalysisResult(String analysisVersion, boolean parsed) {

    LegacyArtifactReanalysisResult {
        Objects.requireNonNull(analysisVersion, "analysisVersion");
    }
}
