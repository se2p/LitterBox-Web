/*
 * Copyright (C) 2024-2026 LitterBox-Web contributors
 *
 * This file is part of LitterBox-Web.
 * Licenced under the EUPL-1.2 or later.
 *
 * SPDX-FileCopyrightText: 2024-2026 LitterBox-Web contributors
 * SPDX-License-Identifier: EUPL-1.2
 */
package de.uni_passau.fim.se2.litterbox_web.web_ui.api.v1;

import java.util.Locale;
import java.util.Objects;

import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import de.uni_passau.fim.se2.litterbox_web.web_ui.statistics.PublicStatisticsService;
import reactor.core.publisher.Mono;

/** Public, deliberately delayed and anonymised statistics. */
@RestController
@RequestMapping({ ApiV1.BASE_PATH, ApiV1.WEB_BASE_PATH })
public final class PublicStatisticsController {

    private final PublicStatisticsService service;

    public PublicStatisticsController(final PublicStatisticsService service) {
        this.service = Objects.requireNonNull(service, "service");
    }

    @GetMapping("/statistics/public")
    public Mono<ResponseEntity<PublicStatisticsDto>> statistics(
        @RequestParam(defaultValue = "en") final String locale
    ) {
        final String publicLocale = ApiV1.SUPPORTED_LOCALES.contains(locale) ? locale : "en";
        return service.statistics(Locale.of(publicLocale)).map(this::response);
    }

    private ResponseEntity<PublicStatisticsDto> response(
        final PublicStatisticsService.PublicStatistics statistics
    ) {
        return ResponseEntity.ok()
            .cacheControl(CacheControl.maxAge(PublicStatisticsService.CACHE_TTL))
            .body(dto(statistics));
    }

    private PublicStatisticsDto dto(final PublicStatisticsService.PublicStatistics statistics) {
        final PublicStatisticsDto.Totals totals = statistics.totals() == null
            ? null
            : new PublicStatisticsDto.Totals(
                statistics.totals().projects(), statistics.totals().blocks(),
                statistics.totals().scripts(), statistics.totals().sprites()
            );
        return new PublicStatisticsDto(
            ApiV1.SCHEMA_VERSION, statistics.available(), statistics.generatedAt(), totals,
            statistics.distributions().stream().map(
                distribution -> new PublicStatisticsDto.Distribution(
                    distribution.metric(), distribution.sampleSize(), distribution.minimum(), distribution.p25(),
                    distribution.median(), distribution.p75(), distribution.p95(), distribution.displayMaximum(),
                    distribution.zeroCount(), distribution.zeroPrevalence(),
                    distribution.points().stream().map(
                        point -> new PublicStatisticsDto.CurvePoint(
                            point.value(), point.relativeDensity()
                        )
                    ).toList()
                )
            ).toList(),
            statistics.findingGroups().stream().map(
                group -> new PublicStatisticsDto.FindingGroup(
                    group.type(), group.findings().stream().map(
                        finding -> new PublicStatisticsDto.Finding(
                            finding.finderId(), finding.name(), finding.projectsAffected(), finding.occurrences(),
                            finding.prevalence()
                        )
                    ).toList()
                )
            ).toList(),
            statistics.blockCategories().stream().map(
                category -> new PublicStatisticsDto.BlockCategory(
                    category.metric(), category.projectsUsing(), category.prevalence(), category.blocks(),
                    category.blockShare()
                )
            ).toList()
        );
    }
}
