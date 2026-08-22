/*
 * Copyright (C) 2024-2026 LitterBox-Web contributors
 *
 * This file is part of LitterBox-Web.
 * Licenced under the EUPL-1.2 or later.
 *
 * SPDX-FileCopyrightText: 2024-2026 LitterBox-Web contributors
 * SPDX-License-Identifier: EUPL-1.2
 */
package de.uni_passau.fim.se2.litterbox_web.capabilities;

import reactor.core.publisher.Mono;

/** Internal implementation port for bounded text exports. */
public interface ProgramExportCapability {

    default Mono<AdvancedCapabilityDtos.ExportTargetsView> targets(
        final String submissionToken,
        final long analysisId
    ) {
        return Mono.error(CapabilityException.unavailable());
    }

    Mono<CapabilityContent> export(
        String submissionToken,
        long analysisId,
        AdvancedCapabilityDtos.ExportRequest request
    );
}
