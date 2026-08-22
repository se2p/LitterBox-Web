/*
 * Copyright (C) 2024-2026 LitterBox-Web contributors
 *
 * This file is part of LitterBox-Web.
 * Licenced under the EUPL-1.2 or later.
 *
 * SPDX-FileCopyrightText: 2024-2026 LitterBox-Web contributors
 * SPDX-License-Identifier: EUPL-1.2
 */
package de.uni_passau.fim.se2.litterbox_web.single_project;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ResponseStatusException;

import de.uni_passau.fim.se2.litterbox_web.persistence.AnalysisRepository;
import de.uni_passau.fim.se2.litterbox_web.persistence.SubmissionRepository;
import reactor.core.publisher.Mono;

/** Verifies that a share token owns the analysis targeted by a public write. */
@Component
public final class SubmissionWriteAuthorizer {

    private final SubmissionRepository submissions;
    private final AnalysisRepository analyses;

    public SubmissionWriteAuthorizer(
        final SubmissionRepository submissions,
        final AnalysisRepository analyses
    ) {
        this.submissions = submissions;
        this.analyses = analyses;
    }

    public Mono<Void> authorize(final String token, final long analysisId) {
        return submissions.findByToken(token)
            .switchIfEmpty(notFound())
            .flatMap(
                submission -> analyses.findById(analysisId)
                    .filter(analysis -> analysis.submissionId() == submission.id())
                    .switchIfEmpty(notFound())
            )
            .then();
    }

    private <T> Mono<T> notFound() {
        return Mono.error(new ResponseStatusException(HttpStatus.NOT_FOUND, "Analysis not found"));
    }
}
