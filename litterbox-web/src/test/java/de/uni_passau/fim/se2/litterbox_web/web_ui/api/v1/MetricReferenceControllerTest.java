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

import java.util.List;

import org.junit.jupiter.api.Test;
import org.springframework.http.ResponseEntity;

import de.uni_passau.fim.se2.litterbox_web.web_ui.single_project.MetricReferenceService;
import de.uni_passau.fim.se2.litterbox_web.web_ui.single_project.MetricReferenceService.MetricBand;
import reactor.core.publisher.Mono;

class MetricReferenceControllerTest {

    @Test
    void publishesEachBandAndTellsTheBrowserHowLongItKeeps() {
        final MetricReferenceService service = mock(MetricReferenceService.class);
        when(service.bands()).thenReturn(Mono.just(List.of(new MetricBand("block_count", 512, 20.0, 90.0))));

        final ResponseEntity<MetricReferenceDto> response = new MetricReferenceController(service).reference().block();

        assertThat(response).isNotNull();
        assertThat(response.getStatusCode().is2xxSuccessful()).isTrue();
        assertThat(response.getHeaders().getCacheControl()).contains("max-age");
        assertThat(response.getBody().metrics()).containsExactly(
            new MetricReferenceDto.MetricBandDto("block_count", 512, 20.0, 90.0)
        );
    }

    @Test
    void answersWithAnEmptyComparisonRatherThanNothingAtAll() {
        final MetricReferenceService service = mock(MetricReferenceService.class);
        when(service.bands()).thenReturn(Mono.just(List.of()));

        final ResponseEntity<MetricReferenceDto> response = new MetricReferenceController(service).reference().block();

        assertThat(response).isNotNull();
        assertThat(response.getBody().metrics()).isEmpty();
    }
}
