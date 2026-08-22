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

/**
 * What reopening every copied project proved. The counts the plan already published are not repeated here: this says
 * only what the copying and the re-reading of it found, which nothing else can say.
 */
record LegacyArtifactVerificationEvidence(
    long reopenedArtifacts,
    long byteSizeMatches,
    long checksumMatches,
    long reanalysisSuccesses,
    long reanalysisParseFailures,
    String migratedReportVersion
) {

    static LegacyArtifactVerificationEvidence empty() {
        return new LegacyArtifactVerificationEvidence(0, 0, 0, 0, 0, "");
    }

    LegacyArtifactVerificationEvidence {
        migratedReportVersion = migratedReportVersion == null ? "" : migratedReportVersion;
    }
}
