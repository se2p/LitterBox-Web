/*
 * Copyright (C) 2024-2026 LitterBox-Web contributors
 *
 * This file is part of LitterBox-Web.
 * Licenced under the EUPL-1.2 or later.
 *
 * SPDX-FileCopyrightText: 2024-2026 LitterBox-Web contributors
 * SPDX-License-Identifier: EUPL-1.2
 */
package de.uni_passau.fim.se2.litterbox_web.api.v1;

import java.util.Objects;

import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import de.uni_passau.fim.se2.litterbox_web.single_project.MetricReferenceService;
import reactor.core.publisher.Mono;

/**
 * What the measurements of an analysed project usually come to, so a result page can call a number ordinary or unusual
 * instead of leaving a child to work out for themselves whether forty blocks is a lot.
 */
@RestController
@RequestMapping({ ApiV1.BASE_PATH, ApiV1.WEB_BASE_PATH })
public class MetricReferenceController {

    private final MetricReferenceService service;

    public MetricReferenceController(final MetricReferenceService service) {
        this.service = Objects.requireNonNull(service, "service");
    }

    @GetMapping("/metrics/reference")
    public Mono<ResponseEntity<MetricReferenceDto>> reference() {
        return service.bands()
            .map(this::referenceResponse);
    }

    private ResponseEntity<MetricReferenceDto> referenceResponse(
        final java.util.List<MetricReferenceService.MetricBand> bands
    ) {
        return ResponseEntity.ok()
            .cacheControl(CacheControl.maxAge(MetricReferenceService.CACHE_TTL))
            .body(
                new MetricReferenceDto(
                    bands.stream()
                        .map(
                            band -> new MetricReferenceDto.MetricBandDto(
                                band.name(), band.sampleSize(), band.lowerBound(), band.upperBound()
                            )
                        )
                        .toList()
                )
            );
    }
}
