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

import java.util.List;

import reactor.core.publisher.Mono;

/** Internal implementation port for mutation previews and complete derived archives. */
public interface FaultInjectionCapability {

    Mono<List<AdvancedCapabilityDtos.InjectorView>> injectors(
        String submissionToken,
        long analysisId,
        String locale
    );

    Mono<AdvancedCapabilityDtos.InjectorCatalogueView> injectorCatalogue(
        String submissionToken,
        long analysisId,
        String locale
    );

    Mono<AdvancedCapabilityDtos.InjectionPreview> preview(
        String submissionToken,
        long analysisId,
        AdvancedCapabilityDtos.InjectionRequest request
    );

    Mono<CapabilityContent> download(
        String submissionToken,
        long analysisId,
        AdvancedCapabilityDtos.InjectionDownloadRequest request
    );

    /**
     * Every mutation the given selection produces, each a complete project, gathered into one archive. Taking them one
     * at a time meant one preview, one choice and one download per mutation, which for a class set of faults is an
     * afternoon's clicking.
     */
    Mono<CapabilityContent> downloadAll(
        String submissionToken,
        long analysisId,
        AdvancedCapabilityDtos.InjectionRequest request
    );
}
