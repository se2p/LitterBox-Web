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

import java.io.IOException;
import java.util.List;

import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

import de.uni_passau.fim.se2.litterbox.ast.model.Program;
import de.uni_passau.fim.se2.litterbox_web.execution.AnalysisWork;
import de.uni_passau.fim.se2.litterbox_web.persistence.Analysis;
import de.uni_passau.fim.se2.litterbox_web.persistence.AnalysisRepository;
import de.uni_passau.fim.se2.litterbox_web.persistence.IssueFeedbackReaction;
import de.uni_passau.fim.se2.litterbox_web.persistence.IssueFeedbackRepository;
import de.uni_passau.fim.se2.litterbox_web.persistence.QuizAnswerRepository;
import de.uni_passau.fim.se2.litterbox_web.persistence.SourceArtifactAccess;
import de.uni_passau.fim.se2.litterbox_web.persistence.SubmissionRepository;
import de.uni_passau.fim.se2.litterbox_web.qlc.QlcService;
import de.uni_passau.fim.se2.litterbox_web.qlc.QuestionDTO;
import de.uni_passau.fim.se2.litterbox_web.shared.Scratch3ParserService;
import reactor.core.publisher.Mono;

/**
 * What a reader sends back: whether a finding was useful, an answer to a generated question, and the wish to stop an
 * analysis that is still running.
 *
 * Marking an answer is pure and lives in QuizAnswerMarking; what is here is the work of getting to the question that
 * was actually asked — which means regenerating it the same way the stored report did, because a report written before
 * answer keys were kept does not carry one.
 */
class SingleProjectFeedback {

    private static final int MAX_QUIZ_ANSWER_LENGTH = 255;

    private final SubmissionRepository submissionRepository;
    private final AnalysisRepository analyses;
    private final SourceArtifactAccess sourceArtifacts;
    private final IssueFeedbackRepository feedback;
    private final QuizAnswerRepository quizAnswers;
    private final AnalysisWork analysisWork;
    private final Scratch3ParserService parser;
    private final ProjectArchiveInspector archiveInspector;
    private final QlcService qlc;
    private final SingleProjectReportMapper reports;

    SingleProjectFeedback(
        final SubmissionRepository submissionRepository,
        final AnalysisRepository analyses,
        final SourceArtifactAccess sourceArtifacts,
        final IssueFeedbackRepository feedback,
        final QuizAnswerRepository quizAnswers,
        final AnalysisWork analysisWork,
        final Scratch3ParserService parser,
        final ProjectArchiveInspector archiveInspector,
        final QlcService qlc,
        final SingleProjectReportMapper reports
    ) {
        this.submissionRepository = submissionRepository;
        this.analyses = analyses;
        this.sourceArtifacts = sourceArtifacts;
        this.feedback = feedback;
        this.quizAnswers = quizAnswers;
        this.analysisWork = analysisWork;
        this.parser = parser;
        this.archiveInspector = archiveInspector;
        this.qlc = qlc;
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
            .switchIfEmpty(Mono.error(new ResponseStatusException(HttpStatus.NOT_FOUND, "Analysis not found")))
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
        return analyses.findById(analysisId)
            .switchIfEmpty(Mono.error(new ResponseStatusException(HttpStatus.NOT_FOUND, "Analysis not found")))
            .flatMap(analysis -> answerQuizForAnalysis(analysis, request))
            .onErrorMap(
                QuizAnswerMarking.InvalidQuizAnswerException.class,
                error -> new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid quiz answer", error)
            )
            .flatMap(
                result -> quizAnswers.record(
                    analysisId, request.questionId(), request.answer(), result.correct()
                ).thenReturn(
                    new SingleProjectDtos.QuizAnswerResult(
                        request.questionId(), result.correct(), result.correctAnswers()
                    )
                )
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

    private Mono<QuizAnswerMarking.QuizEvaluation> answerQuizForAnalysis(
        final Analysis analysis,
        final SingleProjectDtos.QuizAnswerRequest request
    ) {
        final StoredAnalysis stored = reports.storedAnalysis(analysis);
        final SingleProjectDtos.QuizView generatedQuestion = stored.quiz().stream()
            .filter(question -> request.questionId().equals(question.questionId()))
            .findFirst()
            .orElseThrow(() -> new QuizAnswerMarking.InvalidQuizAnswerException("Unknown quiz question"));
        final QuizAnswerMarking.StoredQuizQuestion answerKey = stored.quizAnswerKeys().stream()
            .filter(question -> request.questionId().equals(question.questionId()))
            .findFirst()
            .orElse(null);
        if (answerKey != null) {
            QuizAnswerMarking.validateStoredQuestion(generatedQuestion, answerKey);
            QuizAnswerMarking.validateQuizAnswer(answerKey, request.answer());
            return Mono.just(QuizAnswerMarking.evaluation(answerKey, request.answer()));
        }
        return sourceArtifacts.findById(analysis.sourceArtifactId())
            .switchIfEmpty(
                Mono.error(new ResponseStatusException(HttpStatus.NOT_FOUND, "Source artifact not found"))
            )
            .flatMap(artifact -> evaluateQuizFromArtifact(artifact, analysis, generatedQuestion, request));
    }

    private Mono<QuizAnswerMarking.QuizEvaluation> evaluateQuizFromArtifact(
        final de.uni_passau.fim.se2.litterbox_web.persistence.SourceArtifact artifact,
        final Analysis analysis,
        final SingleProjectDtos.QuizView generatedQuestion,
        final SingleProjectDtos.QuizAnswerRequest request
    ) {
        return sourceArtifacts.open(artifact.sha256()).flatMap(
            stream -> Mono.using(
                () -> stream,
                owned -> analysisWork.submit(
                    () -> evaluateQuizAnswer(
                        SingleProjectSupport.readLimited(owned, SingleProjectSupport.MAX_PROJECT_BYTES),
                        artifact.originalFilename(), analysis, generatedQuestion, request
                    )
                ),
                SingleProjectSupport::closeQuietly
            )
        );
    }

    private QuizAnswerMarking.QuizEvaluation evaluateQuizAnswer(
        final byte[] bytes,
        final String filename,
        final Analysis analysis,
        final SingleProjectDtos.QuizView generatedQuestion,
        final SingleProjectDtos.QuizAnswerRequest request
    ) throws IOException {
        if (!request.questionId().matches("[1-9][0-9]{0,8}")) {
            throw new QuizAnswerMarking.InvalidQuizAnswerException("Unknown quiz question");
        }
        final int questionId = Integer.parseInt(request.questionId());
        final Program program = SingleProjectSupport
            .parseStoredProgram(parser, archiveInspector, bytes, filename, analysis.inputFormat());
        // Reports stored before answer keys were kept have to be regenerated the same way the report itself was,
        // or the question the reader is looking at is simply not among the ones regenerated here.
        final List<QuestionDTO> questions = SingleProjectSupport.generateQuestions(qlc, program, analysis.locale());
        final QuestionDTO question = questions.stream()
            .filter(candidate -> candidate.id() == questionId)
            .findFirst()
            .orElseThrow(() -> new QuizAnswerMarking.InvalidQuizAnswerException("Unknown quiz question"));
        final QuizAnswerMarking.StoredQuizQuestion answerKey = QuizAnswerMarking.storedQuizQuestion(question);
        QuizAnswerMarking.validateStoredQuestion(generatedQuestion, answerKey);
        QuizAnswerMarking.validateQuizAnswer(answerKey, request.answer());
        return QuizAnswerMarking.evaluation(answerKey, request.answer());
    }

}
