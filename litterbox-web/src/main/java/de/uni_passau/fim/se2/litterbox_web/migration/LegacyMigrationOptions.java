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

import java.nio.file.Path;
import java.util.Map;
import java.util.Objects;

/**
 * @param legacyReportRoot the directory the old site wrote its analysis reports into. The legacy
 *                         {@code programme.litterbox} column holds the name of a file in it, not the report itself, so
 *                         the report can only be read with this root in hand.
 */
public record LegacyMigrationOptions(
    String locale,
    String litterboxArtifactVersion,
    Path artifactStoreRoot,
    Path legacyReportRoot,
    Map<String, String> approvedSchoolTypes,
    Map<Long, String> tokenResolutions,
    Map<Long, Long> questionResolutions,
    Map<Long, SourceMapping> sourceMappings
) {

    public LegacyMigrationOptions {
        Objects.requireNonNull(locale, "locale");
        Objects.requireNonNull(litterboxArtifactVersion, "litterboxArtifactVersion");
        Objects.requireNonNull(artifactStoreRoot, "artifactStoreRoot");
        Objects.requireNonNull(legacyReportRoot, "legacyReportRoot");
        approvedSchoolTypes = Map.copyOf(Objects.requireNonNull(approvedSchoolTypes, "approvedSchoolTypes"));
        tokenResolutions = Map.copyOf(Objects.requireNonNull(tokenResolutions, "tokenResolutions"));
        questionResolutions = Map.copyOf(Objects.requireNonNull(questionResolutions, "questionResolutions"));
        sourceMappings = Map.copyOf(Objects.requireNonNull(sourceMappings, "sourceMappings"));
    }

    public record SourceMapping(Path path, String expectedSha256) {

        public SourceMapping {
            Objects.requireNonNull(path, "path");
            Objects.requireNonNull(expectedSha256, "expectedSha256");
            if (!expectedSha256.matches("[0-9a-fA-F]{64}")) {
                throw new IllegalArgumentException("expectedSha256 must contain 64 hexadecimal characters");
            }
            expectedSha256 = expectedSha256.toLowerCase(java.util.Locale.ROOT);
        }
    }
}
