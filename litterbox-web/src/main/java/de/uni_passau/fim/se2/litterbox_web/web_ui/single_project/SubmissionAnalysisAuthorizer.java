/*
 * Copyright (C) 2024-2026 LitterBox-Web contributors
 *
 * This file is part of LitterBox-Web.
 * Licenced under the EUPL-1.2 or later.
 *
 * SPDX-FileCopyrightText: 2024-2026 LitterBox-Web contributors
 * SPDX-License-Identifier: EUPL-1.2
 */
package de.uni_passau.fim.se2.litterbox_web.web_ui.single_project;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ResponseStatusException;

import de.uni_passau.fim.se2.litterbox_web.web_ui.persistence.Analysis;
import de.uni_passau.fim.se2.litterbox_web.web_ui.persistence.AnalysisRepository;
import de.uni_passau.fim.se2.litterbox_web.web_ui.persistence.SubmissionRepository;
import reactor.core.publisher.Mono;

/**
 * Resolves the analysis a share token is allowed to reach.
 *
 * <p>
 * The rule is which submission a token stands for and which analyses hang off it, so it needs both rows looked up and
 * cannot be written as a path rule in the security configuration. Keeping it in one component is what makes every
 * endpoint that reaches an analysis by share token — reads and writes alike — apply the same one.
 */
@Component
public final class SubmissionAnalysisAuthorizer {

    private final SubmissionRepository submissions;
    private final AnalysisRepository analyses;

    public SubmissionAnalysisAuthorizer(
        final SubmissionRepository submissions,
        final AnalysisRepository analyses
    ) {
        this.submissions = submissions;
        this.analyses = analyses;
    }

    /**
     * The analysis with this id, if the token stands for the submission that owns it.
     *
     * <p>
     * Empty when the token is unusable, unknown, or names a submission the analysis does not belong to. Which of those
     * it was is deliberately not distinguished, and callers decide what to report.
     *
     * @param token      the share token the request presented
     * @param analysisId the analysis the request is asking about
     * @return the analysis, or empty if this token may not reach it
     */
    public Mono<Analysis> ownedAnalysis(final String token, final long analysisId) {
        if (token == null || token.isBlank() || analysisId < 1) {
            return Mono.empty();
        }
        return submissions.findByToken(token)
            .flatMap(
                submission -> analyses.findById(analysisId)
                    .filter(analysis -> analysis.submissionId() == submission.id())
            );
    }

    /**
     * Fails with {@code 404} unless the token owns the analysis.
     *
     * @param token      the share token the request presented
     * @param analysisId the analysis the request is asking about
     * @return an empty {@code Mono} when the token owns the analysis
     */
    public Mono<Void> authorize(final String token, final long analysisId) {
        return ownedAnalysis(token, analysisId)
            .switchIfEmpty(Mono.error(new ResponseStatusException(HttpStatus.NOT_FOUND, "Analysis not found")))
            .then();
    }
}
