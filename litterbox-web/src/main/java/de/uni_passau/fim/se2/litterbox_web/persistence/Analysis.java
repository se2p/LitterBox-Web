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

import java.util.Map;
import java.util.TreeMap;

public record Analysis(
    long id,
    long submissionId,
    long sourceArtifactId,
    String projectName,
    String provenance,
    String reportSchemaVersion,
    String litterboxArtifactVersion,
    String locale,
    String status,
    String inputFormat,
    String reportJson,
    String failureType,
    String failureMessage,
    String detectorSet,
    String configurationJson,
    byte[] inputSha256,
    Map<String, Double> metrics
) {

    public Analysis {
        inputSha256 = inputSha256 == null ? null : inputSha256.clone();
        metrics = metrics == null ? Map.of() : java.util.Collections.unmodifiableMap(new TreeMap<>(metrics));
    }

    @Override
    public byte[] inputSha256() {
        return inputSha256 == null ? null : inputSha256.clone();
    }

    public Analysis(
        long id, long submissionId, long sourceArtifactId, String provenance,
        String reportSchemaVersion, String litterboxArtifactVersion, String locale, String status, String inputFormat
    ) {
        this(
            id, submissionId, sourceArtifactId, null, provenance, reportSchemaVersion, litterboxArtifactVersion, locale,
            status, inputFormat, null, null, null, null, null, null, Map.of()
        );
    }
}
