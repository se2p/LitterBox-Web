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

    /**
     * Lists the injectors available for the authorized analysis.
     *
     * @param submissionToken submission token
     * @param analysisId      analysis identifier
     * @param locale          response locale
     * @return available injectors
     */
    Mono<List<AdvancedCapabilityDtos.InjectorView>> injectors(
        String submissionToken,
        long analysisId,
        String locale
    );

    /**
     * Returns the full injector catalogue for the authorized analysis.
     *
     * @param submissionToken submission token
     * @param analysisId      analysis identifier
     * @param locale          response locale
     * @return injector catalogue
     */
    Mono<AdvancedCapabilityDtos.InjectorCatalogueView> injectorCatalogue(
        String submissionToken,
        long analysisId,
        String locale
    );

    /**
     * Previews the selected mutations.
     *
     * @param submissionToken submission token
     * @param analysisId      analysis identifier
     * @param request         mutation request
     * @return mutation preview
     */
    Mono<AdvancedCapabilityDtos.InjectionPreview> preview(
        String submissionToken,
        long analysisId,
        AdvancedCapabilityDtos.InjectionRequest request
    );

    /**
     * Downloads one selected mutation.
     *
     * @param submissionToken submission token
     * @param analysisId      analysis identifier
     * @param request         download request
     * @return mutation archive
     */
    Mono<CapabilityContent> download(
        String submissionToken,
        long analysisId,
        AdvancedCapabilityDtos.InjectionDownloadRequest request
    );

    /**
     * Every mutation the given selection produces, each a complete project, gathered into one archive. Taking them one
     * at a time meant one preview, one choice and one download per mutation, which for a class set of faults is an
     * afternoon's clicking.
     *
     * @param submissionToken submission token
     * @param analysisId      analysis identifier
     * @param request         mutation request
     * @return mutation archive
     */
    Mono<CapabilityContent> downloadAll(
        String submissionToken,
        long analysisId,
        AdvancedCapabilityDtos.InjectionRequest request
    );
}
