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
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import java.util.List;

import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;

import de.uni_passau.fim.se2.litterbox_web.web_ui.assessment.AssessmentDtos;
import de.uni_passau.fim.se2.litterbox_web.web_ui.assessment.AssessmentService;
import de.uni_passau.fim.se2.litterbox_web.web_ui.capabilities.AdvancedCapabilityDtos;
import de.uni_passau.fim.se2.litterbox_web.web_ui.capabilities.CapabilityException;
import reactor.core.publisher.Mono;

class AssessmentControllerTest {

    private static final String SUBMISSION_TOKEN = "synthetic-submission-token";
    private static final String TEACHER_TOKEN = "synthetic-teacher-token";
    private static final String PUBLIC_TOKEN = "synthetic-public-token";

    private final AssessmentService service = mock(AssessmentService.class);
    private final AssessmentController controller = new AssessmentController(service);

    @Test
    void createRequiresABearerToken() {
        final AssessmentDtos.CreateAssessmentRequest request = new AssessmentDtos.CreateAssessmentRequest(
            1L, "Title", null, "en", List.of()
        );

        assertThatThrownBy(() -> controller.create(null, request))
            .isInstanceOfSatisfying(
                CapabilityException.class, error -> assertThat(error.code()).isEqualTo("authorization_required")
            );
        assertThatThrownBy(() -> controller.create("not-a-bearer-header", request))
            .isInstanceOfSatisfying(
                CapabilityException.class, error -> assertThat(error.code()).isEqualTo("authorization_required")
            );
        assertThatThrownBy(() -> controller.create("Bearer   ", request))
            .isInstanceOfSatisfying(
                CapabilityException.class, error -> assertThat(error.code()).isEqualTo("authorization_required")
            );
        verifyNoInteractions(service);
    }

    @Test
    void createPassesTheExtractedBearerToTheServiceAndReturnsCreated() {
        final AssessmentDtos.CreateAssessmentRequest request = new AssessmentDtos.CreateAssessmentRequest(
            1L, "Title", null, "en", List.of()
        );
        final AssessmentDtos.CreatedAssessment created = new AssessmentDtos.CreatedAssessment(
            1, PUBLIC_TOKEN, TEACHER_TOKEN
        );
        when(service.create(SUBMISSION_TOKEN, request)).thenReturn(Mono.just(created));

        final ResponseEntity<AssessmentDtos.CreatedAssessment> response = controller.create(
            "Bearer " + SUBMISSION_TOKEN, request
        ).block();

        assertThat(response).isNotNull();
        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.CREATED);
        assertThat(response.getHeaders().getCacheControl()).isEqualTo("no-store");
        assertThat(response.getBody()).isEqualTo(created);
        verify(service).create(SUBMISSION_TOKEN, request);
    }

    @Test
    void codeDelegatesToTheServiceAndReturnsOkWithNoStoreAndNosniff() {
        final AdvancedCapabilityDtos.ExportTargetsView targets = new AdvancedCapabilityDtos.ExportTargetsView(
            List.of(new AdvancedCapabilityDtos.ExportSpriteTargetView("Stage", true)), List.of()
        );
        when(service.code(PUBLIC_TOKEN)).thenReturn(Mono.just(targets));

        final ResponseEntity<AdvancedCapabilityDtos.ExportTargetsView> response = controller.code(PUBLIC_TOKEN)
            .block();

        assertThat(response).isNotNull();
        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(response.getHeaders().getCacheControl()).isEqualTo("no-store");
        assertThat(response.getHeaders().getFirst("X-Content-Type-Options")).isEqualTo("nosniff");
        assertThat(response.getBody()).isEqualTo(targets);
        verify(service).code(PUBLIC_TOKEN);
    }

    @Test
    void resultsRequiresABearerToken() {
        assertThatThrownBy(() -> controller.results(PUBLIC_TOKEN, null))
            .isInstanceOfSatisfying(
                CapabilityException.class, error -> assertThat(error.code()).isEqualTo("authorization_required")
            );
        verifyNoInteractions(service);
    }

    @Test
    void resultsPassesTheExtractedBearerToTheService() {
        final AssessmentDtos.ResultsView results = new AssessmentDtos.ResultsView(
            1, "A quiz", AssessmentDtos.STATUS_OPEN, "2099-01-01T00:00:00Z", 3,
            List.of(
                new AssessmentDtos.QuestionResult(
                    "1", "Which loop repeats forever?", 3, 2, 1, 0,
                    List.of(
                        new AssessmentDtos.AnswerTally("repeat 10", 1),
                        new AssessmentDtos.AnswerTally("forever", 2)
                    ),
                    0
                )
            ),
            new AssessmentDtos.ScoreDistribution(1, 3, 0, List.of(1, 2))
        );
        when(service.results(PUBLIC_TOKEN, TEACHER_TOKEN)).thenReturn(Mono.just(results));

        final ResponseEntity<AssessmentDtos.ResultsView> response = controller.results(
            PUBLIC_TOKEN, "Bearer " + TEACHER_TOKEN
        ).block();

        assertThat(response).isNotNull();
        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(response.getHeaders().getFirst("X-Content-Type-Options")).isEqualTo("nosniff");
        assertThat(response.getBody()).isEqualTo(results);
        verify(service).results(PUBLIC_TOKEN, TEACHER_TOKEN);
    }

    @Test
    void updateCarriesTheResetFlagThroughToTheService() {
        final AssessmentDtos.UpdateAssessmentRequest request = new AssessmentDtos.UpdateAssessmentRequest(
            null, null, true
        );
        final AssessmentDtos.AssessmentState state = new AssessmentDtos.AssessmentState(
            1, PUBLIC_TOKEN, AssessmentDtos.STATUS_OPEN, "2099-01-01T00:00:00Z", 1
        );
        when(service.update(PUBLIC_TOKEN, TEACHER_TOKEN, request)).thenReturn(Mono.just(state));

        final ResponseEntity<AssessmentDtos.AssessmentState> response = controller.update(
            PUBLIC_TOKEN, "Bearer " + TEACHER_TOKEN, request
        ).block();

        assertThat(response).isNotNull();
        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(response.getBody()).isEqualTo(state);
        verify(service).update(PUBLIC_TOKEN, TEACHER_TOKEN, request);
    }
}
