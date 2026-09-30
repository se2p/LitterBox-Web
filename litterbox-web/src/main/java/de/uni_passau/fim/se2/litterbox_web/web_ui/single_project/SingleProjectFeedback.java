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
import org.springframework.web.server.ResponseStatusException;

import de.uni_passau.fim.se2.litterbox_web.web_ui.persistence.Analysis;
import de.uni_passau.fim.se2.litterbox_web.web_ui.persistence.AnalysisRepository;
import de.uni_passau.fim.se2.litterbox_web.web_ui.persistence.IssueFeedbackReaction;
import de.uni_passau.fim.se2.litterbox_web.web_ui.persistence.IssueFeedbackRepository;
import de.uni_passau.fim.se2.litterbox_web.web_ui.persistence.QuizAnswerRepository;
import de.uni_passau.fim.se2.litterbox_web.web_ui.persistence.SubmissionRepository;
import reactor.core.publisher.Mono;

/** Handles learner feedback, quiz answers, and cancellation requests. */
class SingleProjectFeedback {

    private static final int MAX_QUIZ_ANSWER_LENGTH = 255;
    private static final String ANALYSIS_NOT_FOUND = "Analysis not found";

    private final SubmissionRepository submissionRepository;
    private final AnalysisRepository analyses;
    private final IssueFeedbackRepository feedback;
    private final QuizAnswerRepository quizAnswers;
    private final QuizAnswerPort quizAnswerPort;
    private final SingleProjectReportMapper reports;

    SingleProjectFeedback(
        final SubmissionRepository submissionRepository,
        final AnalysisRepository analyses,
        final IssueFeedbackRepository feedback,
        final QuizAnswerRepository quizAnswers,
        final QuizAnswerPort quizAnswerPort,
        final SingleProjectReportMapper reports
    ) {
        this.submissionRepository = submissionRepository;
        this.analyses = analyses;
        this.feedback = feedback;
        this.quizAnswers = quizAnswers;
        this.quizAnswerPort = quizAnswerPort;
        this.reports = reports;
    }

    Mono<Void> feedback(
        final long analysisId,
        final SingleProjectDtos.FeedbackRequest request
    ) {
        if (!validFeedbackRequest(request)) {
            return Mono.error(new ResponseStatusException(HttpStatus.BAD_REQUEST, "Feedback fields are required"));
        }
        final IssueFeedbackReaction reaction;
        try {
            reaction = IssueFeedbackReaction.fromWireValue(request.reaction());
        }
        catch (IllegalArgumentException error) {
            return Mono.error(new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid feedback reaction"));
        }
        return analyses.findById(analysisId)
            .switchIfEmpty(Mono.error(new ResponseStatusException(HttpStatus.NOT_FOUND, ANALYSIS_NOT_FOUND)))
            .flatMap(analysis -> {
                final StoredAnalysis stored = reports.storedAnalysis(analysis);
                final boolean finderPresent = stored.issues().stream()
                    .anyMatch(issue -> request.finderId().equals(issue.finderId()));
                if (!finderPresent) {
                    return Mono.error(new ResponseStatusException(HttpStatus.BAD_REQUEST, "Unknown finder id"));
                }
                return feedback.upsert(analysisId, request.finderId(), reaction);
            });
    }

    /**
     * The submission, its jobs, its analyses and the event that says so are cancelled in one transaction, so a
     * cancellation either takes effect entirely or not at all, and asking twice is safe.
     */
    Mono<Void> cancel(final String token) {
        return submissionRepository.findByToken(token)
            .switchIfEmpty(Mono.error(new ResponseStatusException(HttpStatus.NOT_FOUND, "Submission not found")))
            .flatMap(submission -> submissionRepository.cancelEverything(submission.id()))
            .then();
    }

    Mono<SingleProjectDtos.QuizAnswerResult> quizAnswer(
        final long analysisId,
        final SingleProjectDtos.QuizAnswerRequest request
    ) {
        if (!validQuizRequest(request)) {
            return Mono.error(new ResponseStatusException(HttpStatus.BAD_REQUEST, "Quiz fields are required"));
        }
        return quizAnswerPort.mark(analysisId, request.questionId(), request.answer())
            .onErrorMap(
                QuizAnswerPort.AnalysisNotFoundException.class,
                error -> new ResponseStatusException(HttpStatus.NOT_FOUND, ANALYSIS_NOT_FOUND, error)
            )
            .onErrorMap(
                QuizAnswerPort.UnmarkableAnswerException.class,
                error -> new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid quiz answer", error)
            )
            .flatMap(
                verdict -> quizAnswers.record(
                    analysisId, request.questionId(), request.answer(), verdict.correct()
                ).thenReturn(
                    new SingleProjectDtos.QuizAnswerResult(
                        request.questionId(), verdict.correct(), verdict.correctAnswers()
                    )
                )
            );
    }

    /** Returns generated answer keys after authorizing the owning submission. */
    Mono<SingleProjectDtos.QuizAnswerKeyView> quizAnswerKey(final long analysisId, final String bearerToken) {
        if (bearerToken == null || bearerToken.isBlank()) {
            return Mono.error(new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Submission token required"));
        }
        return analyses.findById(analysisId)
            .switchIfEmpty(Mono.error(new ResponseStatusException(HttpStatus.NOT_FOUND, ANALYSIS_NOT_FOUND)))
            .flatMap(analysis -> requireOwningSubmission(bearerToken, analysis))
            .flatMap(quizAnswerPort::answerKey)
            .onErrorMap(
                QuizAnswerPort.AnalysisNotFoundException.class,
                error -> new ResponseStatusException(HttpStatus.NOT_FOUND, ANALYSIS_NOT_FOUND, error)
            )
            .map(questions -> new SingleProjectDtos.QuizAnswerKeyView(SingleProjectDtos.SCHEMA_VERSION, questions));
    }

    private Mono<Analysis> requireOwningSubmission(final String bearerToken, final Analysis analysis) {
        return SubmissionAnalysisAuthorizer.requireOwningCompletedAnalysis(
            submissionRepository, bearerToken, analysis,
            () -> new ResponseStatusException(HttpStatus.NOT_FOUND, ANALYSIS_NOT_FOUND),
            () -> new ResponseStatusException(HttpStatus.CONFLICT, "Analysis is not ready")
        );
    }

    private static boolean validFeedbackRequest(final SingleProjectDtos.FeedbackRequest request) {
        if (request == null || request.finderId() == null || request.finderId().isBlank()) {
            return false;
        }
        return request.reaction() != null && !request.reaction().isBlank();
    }

    private static boolean validQuizRequest(final SingleProjectDtos.QuizAnswerRequest request) {
        if (request == null || request.questionId() == null || request.questionId().isBlank()) {
            return false;
        }
        if (request.answer() == null || request.answer().isBlank()) {
            return false;
        }
        return request.answer().length() <= MAX_QUIZ_ANSWER_LENGTH;
    }

}
