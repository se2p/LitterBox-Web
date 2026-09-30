/*
 * Copyright (C) 2024-2026 LitterBox-Web contributors
 *
 * This file is part of LitterBox-Web.
 * Licenced under the EUPL-1.2 or later.
 *
 * SPDX-FileCopyrightText: 2024-2026 LitterBox-Web contributors
 * SPDX-License-Identifier: EUPL-1.2
 */
package de.uni_passau.fim.se2.litterbox_web.web_ui.capabilities;

import java.util.Locale;
import java.util.Set;

import de.uni_passau.fim.se2.litterbox_web.web_ui.persistence.Analysis;
import reactor.core.publisher.Mono;

/** Internal implementation port for bounded text exports. */
public interface ProgramExportCapability {

    /** Source formats supported by this capability. */
    Set<String> SUPPORTED_SOURCE_FORMATS = Set.of(".sb3", ".mblock");

    default Mono<AdvancedCapabilityDtos.ExportTargetsView> targets(
        final String submissionToken,
        final long analysisId
    ) {
        return Mono.error(CapabilityException.unavailable());
    }

    /**
     * Returns the export targets for an analysis whose access has already been checked by another capability.
     *
     * @param analysis the already authorized analysis
     * @return the formats the analysis can be exported to; unavailable unless an implementation overrides this
     */
    default Mono<AdvancedCapabilityDtos.ExportTargetsView> targets(final Analysis analysis) {
        return Mono.error(CapabilityException.unavailable());
    }

    Mono<CapabilityContent> export(
        String submissionToken,
        long analysisId,
        AdvancedCapabilityDtos.ExportRequest request
    );

    /**
     * Whether projects of the given source format can be exported.
     *
     * @param inputFormat the analysis's source format, with or without a leading dot and in any case; may be null
     * @return {@code true} if the format is one of {@link #SUPPORTED_SOURCE_FORMATS}
     */
    static boolean isExportable(final String inputFormat) {
        return SUPPORTED_SOURCE_FORMATS.contains(normalizedSourceFormat(inputFormat));
    }

    private static String normalizedSourceFormat(final String format) {
        if (format == null) {
            return "";
        }
        final String normalized = format.toLowerCase(Locale.ROOT);
        if (normalized.startsWith(".")) {
            return normalized;
        }
        return "." + normalized;
    }
}
