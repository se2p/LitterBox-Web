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
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.time.Duration;

import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.web.reactive.function.client.WebClientResponseException;
import org.springframework.web.server.ResponseStatusException;

import de.uni_passau.fim.se2.litterbox_web.web_ui.single_project.SingleProjectApplicationService;
import de.uni_passau.fim.se2.litterbox_web.web_ui.single_project.SingleProjectDtos;
import de.uni_passau.fim.se2.litterbox_web.web_ui.single_project.SubmissionAnalysisAuthorizer;
import reactor.core.publisher.Mono;

class StudioSummaryEndpointTest {

    private static final String STUDIO_ID = "17";

    private final SingleProjectApplicationService service = mock(SingleProjectApplicationService.class);
    private final SingleProjectController controller = new SingleProjectController(
        service, mock(SubmissionAnalysisAuthorizer.class)
    );

    @Test
    void answersWhatTheStudioHoldsWithoutStartingARun() {
        when(service.studioSummary(STUDIO_ID)).thenReturn(
            Mono.just(new SingleProjectDtos.StudioSummaryView(STUDIO_ID, "Klasse 8b", true, 24))
        );

        final var summary = controller.studio(STUDIO_ID).block(Duration.ofSeconds(5));

        assertThat(summary).isNotNull();
        assertThat(summary.title()).isEqualTo("Klasse 8b");
        assertThat(summary.readable()).isTrue();
        assertThat(summary.projects()).isEqualTo(24);
    }

    /** A studio id that names nothing is the caller's mistake to correct, not a fault of this service. */
    @Test
    void reportsAnUnknownStudioAsNotFoundRatherThanAsAnUpstreamFailure() {
        when(service.studioSummary(STUDIO_ID)).thenReturn(
            Mono.error(
                WebClientResponseException.create(
                    HttpStatus.NOT_FOUND.value(), "Not Found", null, new byte[0], null
                )
            )
        );

        assertThatThrownBy(() -> controller.studio(STUDIO_ID).block(Duration.ofSeconds(5)))
            .isInstanceOf(ResponseStatusException.class)
            .extracting(error -> ((ResponseStatusException) error).getStatusCode())
            .isEqualTo(HttpStatus.NOT_FOUND);
    }

    @Test
    void leavesUpstreamOutagesAsFailuresInsteadOfPretendingTheStudioIsMissing() {
        when(service.studioSummary(STUDIO_ID)).thenReturn(
            Mono.error(
                WebClientResponseException.create(
                    HttpStatus.BAD_GATEWAY.value(), "Bad Gateway", null, new byte[0], null
                )
            )
        );

        assertThatThrownBy(() -> controller.studio(STUDIO_ID).block(Duration.ofSeconds(5)))
            .isInstanceOf(WebClientResponseException.class);
    }
}
