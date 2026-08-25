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

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.time.Instant;
import java.util.List;
import java.util.Locale;

import org.junit.jupiter.api.Test;

import de.uni_passau.fim.se2.litterbox_web.web_ui.statistics.PublicStatisticsService;
import reactor.core.publisher.Mono;

class PublicStatisticsControllerTest {

    @Test
    void exposesThePublicResponseFromBothApiPrefixesWithCacheInstructions() {
        final PublicStatisticsService service = mock(PublicStatisticsService.class);
        final PublicStatisticsService.PublicStatistics statistics = new PublicStatisticsService.PublicStatistics(
            false, Instant.EPOCH, null, List.of(), List.of(), List.of()
        );
        when(service.statistics(Locale.ENGLISH)).thenReturn(Mono.just(statistics));

        final var response = new PublicStatisticsController(service).statistics("en").block();

        assertThat(response.getStatusCode().is2xxSuccessful()).isTrue();
        assertThat(response.getHeaders().getCacheControl()).contains("max-age");
        assertThat(response.getBody()).isEqualTo(
            new PublicStatisticsDto(
                1, false, Instant.EPOCH, null, List.of(), List.of(), List.of()
            )
        );
    }

    @Test
    void mapsTheSmoothedDistributionWithoutExposingExactFrequencies() {
        final PublicStatisticsService service = mock(PublicStatisticsService.class);
        final var distribution = new PublicStatisticsService.Distribution(
            "block_count", 50, 0, 5, 10, 15, 20, 25, 5, 0.1,
            List.of(
                new PublicStatisticsService.CurvePoint(0, 0.25),
                new PublicStatisticsService.CurvePoint(25, 1.0)
            )
        );
        final PublicStatisticsService.PublicStatistics statistics = new PublicStatisticsService.PublicStatistics(
            true, Instant.EPOCH,
            new PublicStatisticsService.Totals(50, 500, 100, 75),
            List.of(distribution), List.of(), List.of()
        );
        when(service.statistics(Locale.ENGLISH)).thenReturn(Mono.just(statistics));

        final PublicStatisticsDto body = new PublicStatisticsController(service).statistics("en").block().getBody();

        assertThat(body.distributions()).singleElement().satisfies(dto -> {
            assertThat(dto.metric()).isEqualTo("block_count");
            assertThat(dto.median()).isEqualTo(10);
            assertThat(dto.displayMaximum()).isEqualTo(25);
            assertThat(dto.points()).extracting(PublicStatisticsDto.CurvePoint::relativeDensity)
                .containsExactly(0.25, 1.0);
        });
    }
}
