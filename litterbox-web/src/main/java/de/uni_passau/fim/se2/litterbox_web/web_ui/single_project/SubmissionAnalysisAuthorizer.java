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

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.function.Supplier;

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

    /**
     * Checks that the bearer token owns the analysis's submission and that the analysis has completed.
     *
     * @param submissions the repository used to look up the analysis's submission
     * @param bearerToken the share token the request presented
     * @param analysis    the analysis the request is asking about
     * @param notFound    supplies the error raised when the submission is missing or the token does not own it
     * @param notReady    supplies the error raised when the token owns the analysis but it has not completed yet
     * @return the analysis when the token owns it and it has completed, otherwise an error from the matching supplier
     */
    public static Mono<Analysis> requireOwningCompletedAnalysis(
        final SubmissionRepository submissions,
        final String bearerToken,
        final Analysis analysis,
        final Supplier<? extends RuntimeException> notFound,
        final Supplier<? extends RuntimeException> notReady
    ) {
        return submissions.findById(analysis.submissionId())
            .switchIfEmpty(Mono.error(notFound.get()))
            .flatMap(
                submission -> ownedCompletedAnalysis(
                    matchesBearer(bearerToken, submission.shareToken()), analysis, notFound, notReady
                )
            );
    }

    private static Mono<Analysis> ownedCompletedAnalysis(
        final boolean owned,
        final Analysis analysis,
        final Supplier<? extends RuntimeException> notFound,
        final Supplier<? extends RuntimeException> notReady
    ) {
        if (!owned) {
            return Mono.error(notFound.get());
        }
        if (!analysis.isCompleted()) {
            return Mono.error(notReady.get());
        }
        return Mono.just(analysis);
    }

    /**
     * Compares a presented token with the expected one in constant time, so how far a wrong guess misses a real token
     * is not itself something a guess can learn.
     *
     * @param bearerToken the token the request presented
     * @param expected    the token that grants access
     * @return {@code true} if both tokens are identical
     */
    public static boolean matchesBearer(final String bearerToken, final String expected) {
        return MessageDigest.isEqual(
            expected.getBytes(StandardCharsets.UTF_8), bearerToken.getBytes(StandardCharsets.UTF_8)
        );
    }
}
