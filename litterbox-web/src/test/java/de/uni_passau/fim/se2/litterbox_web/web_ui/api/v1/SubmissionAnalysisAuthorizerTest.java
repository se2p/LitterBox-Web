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

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

import de.uni_passau.fim.se2.litterbox_web.web_ui.persistence.Analysis;
import de.uni_passau.fim.se2.litterbox_web.web_ui.persistence.AnalysisRepository;
import de.uni_passau.fim.se2.litterbox_web.web_ui.persistence.Submission;
import de.uni_passau.fim.se2.litterbox_web.web_ui.persistence.SubmissionRepository;
import de.uni_passau.fim.se2.litterbox_web.web_ui.single_project.SubmissionAnalysisAuthorizer;
import reactor.core.publisher.Mono;

class SubmissionAnalysisAuthorizerTest {

    private static final String TOKEN = "synthetic-token";
    private static final long SUBMISSION_ID = 42L;
    private static final long ANALYSIS_ID = 84L;

    @Test
    void authorizesAnAnalysisOwnedByTheTokenSubmission() {
        final SubmissionRepository submissions = mock(SubmissionRepository.class);
        final AnalysisRepository analyses = mock(AnalysisRepository.class);
        final Submission submission = submission();
        final Analysis analysis = analysis(SUBMISSION_ID);
        when(submissions.findByToken(TOKEN)).thenReturn(Mono.just(submission));
        when(analyses.findById(ANALYSIS_ID)).thenReturn(Mono.just(analysis));

        final SubmissionAnalysisAuthorizer authorizer = new SubmissionAnalysisAuthorizer(submissions, analyses);

        assertDoesNotThrow(() -> authorizer.authorize(TOKEN, ANALYSIS_ID).block());
    }

    @Test
    void hidesAnAnalysisOwnedByAnotherSubmission() {
        final SubmissionRepository submissions = mock(SubmissionRepository.class);
        final AnalysisRepository analyses = mock(AnalysisRepository.class);
        final Submission submission = submission();
        final Analysis analysis = analysis(SUBMISSION_ID + 1);
        when(submissions.findByToken(TOKEN)).thenReturn(Mono.just(submission));
        when(analyses.findById(ANALYSIS_ID)).thenReturn(Mono.just(analysis));

        final SubmissionAnalysisAuthorizer authorizer = new SubmissionAnalysisAuthorizer(submissions, analyses);
        final ResponseStatusException error = assertThrows(
            ResponseStatusException.class,
            () -> authorizer.authorize(TOKEN, ANALYSIS_ID).block()
        );

        assertEquals(HttpStatus.NOT_FOUND, error.getStatusCode());
    }

    private Submission submission() {
        return new Submission(
            SUBMISSION_ID, TOKEN, "LOCAL_UPLOAD", "en", "COMPLETED", "ACTIVE", 1, 1, 0
        );
    }

    private Analysis analysis(final long submissionId) {
        return new Analysis(
            ANALYSIS_ID, submissionId, 1L, "synthetic", "1", "1.13-SNAPSHOT", "en", "DONE", "sb3"
        );
    }
}
