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

import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.codec.ServerSentEvent;
import org.springframework.stereotype.Service;

import de.uni_passau.fim.se2.litterbox_web.qlc.QlcService;
import de.uni_passau.fim.se2.litterbox_web.shared.Scratch3ParserService;
import de.uni_passau.fim.se2.litterbox_web.web_ui.execution.AnalysisWork;
import de.uni_passau.fim.se2.litterbox_web.web_ui.persistence.AnalysisJobRepository;
import de.uni_passau.fim.se2.litterbox_web.web_ui.persistence.AnalysisRepository;
import de.uni_passau.fim.se2.litterbox_web.web_ui.persistence.AssetRepository;
import de.uni_passau.fim.se2.litterbox_web.web_ui.persistence.IssueFeedbackRepository;
import de.uni_passau.fim.se2.litterbox_web.web_ui.persistence.QuizAnswerRepository;
import de.uni_passau.fim.se2.litterbox_web.web_ui.persistence.SingleProjectSubmissionService;
import de.uni_passau.fim.se2.litterbox_web.web_ui.persistence.SourceArtifactAccess;
import de.uni_passau.fim.se2.litterbox_web.web_ui.persistence.SubmissionEventRepository;
import de.uni_passau.fim.se2.litterbox_web.web_ui.persistence.SubmissionRepository;
import reactor.core.publisher.Flux;
import reactor.core.publisher.Mono;

@Service
public class SingleProjectApplicationService {

    private final SingleProjectReportMapper reports = new SingleProjectReportMapper();
    private final SingleProjectIntake intake;
    private final ScratchProjectClient scratch;
    private final SingleProjectReader reader;
    private final SingleProjectFeedback responses;
    private final AnalysisRunner runner;

    public SingleProjectApplicationService(
        final SingleProjectSubmissionService submissions,
        final SubmissionRepository submissionRepository,
        final SubmissionEventRepository submissionEvents,
        final AnalysisRepository analyses,
        final AnalysisJobRepository jobs,
        final SourceArtifactAccess sourceArtifacts,
        final AssetRepository assets,
        final IssueFeedbackRepository feedback,
        final QuizAnswerRepository quizAnswers,
        final AnalysisWork analysisWork,
        final Scratch3ParserService parser,
        final ScratchProjectClient scratch,
        final QlcService qlc,
        final ProjectArchiveInspector archiveInspector,
        final TeacherBatchArchiveInspector teacherArchives,
        @Value("${litterbox.version:unknown}") final String litterboxVersion
    ) {
        this.scratch = scratch;
        this.intake = new SingleProjectIntake(
            submissions, submissionRepository, analyses, jobs, sourceArtifacts, scratch, analysisWork, reports,
            litterboxVersion
        );
        this.reader = new SingleProjectReader(
            submissionRepository, submissionEvents, analyses, sourceArtifacts, assets, analysisWork, parser,
            archiveInspector, reports
        );
        this.responses = new SingleProjectFeedback(
            submissionRepository, analyses, sourceArtifacts, feedback, quizAnswers,
            analysisWork, parser, archiveInspector, qlc, reports
        );
        this.runner = new AnalysisRunner(
            submissions, submissionRepository, submissionEvents, analyses, jobs, sourceArtifacts, assets,
            analysisWork, parser, scratch, qlc, archiveInspector, teacherArchives, reports, litterboxVersion
        );
    }

    public Mono<SingleProjectDtos.CreatedSubmission> submitUpload(
        final byte[] bytes,
        final String filename,
        final String locale,
        final String idempotencyKey
    ) {
        return intake.submitUpload(bytes, filename, locale, idempotencyKey);
    }

    public Mono<SingleProjectDtos.CreatedSubmission> submitScratchUrl(
        final String projectUrl,
        final String locale,
        final String idempotencyKey
    ) {
        return intake.submitScratchUrl(projectUrl, locale, idempotencyKey);
    }

    public Mono<SingleProjectDtos.CreatedSubmission> submitQuestionUpload(
        final byte[] bytes,
        final String filename,
        final String locale,
        final String idempotencyKey
    ) {
        return intake.submitQuestionUpload(bytes, filename, locale, idempotencyKey);
    }

    public Mono<SingleProjectDtos.CreatedSubmission> submitQuestionScratchUrl(
        final String projectUrl,
        final String locale,
        final String idempotencyKey
    ) {
        return intake.submitQuestionScratchUrl(projectUrl, locale, idempotencyKey);
    }

    public Mono<SingleProjectDtos.CreatedSubmission> reuse(
        final String token,
        final String analysis,
        final String locale,
        final String idempotencyKey
    ) {
        return intake.reuse(token, analysis, locale, idempotencyKey);
    }

    public Mono<SingleProjectDtos.CreatedSubmission> submitTeacherZip(
        final byte[] bytes,
        final String filename,
        final String locale,
        final String idempotencyKey
    ) {
        return intake.submitTeacherZip(bytes, filename, locale, idempotencyKey);
    }

    public Mono<SingleProjectDtos.CreatedSubmission> submitStudio(
        final String studio,
        final String locale,
        final String idempotencyKey
    ) {
        return intake.submitStudio(studio, locale, idempotencyKey);
    }

    /** Reads a studio's own description of itself, so its size can be named before the run is started. */
    public Mono<SingleProjectDtos.StudioSummaryView> studioSummary(final String studioId) {
        return scratch.studioSummary(studioId).map(
            summary -> new SingleProjectDtos.StudioSummaryView(
                summary.studioId(), summary.title(), summary.readable(), summary.projects()
            )
        );
    }

    public Mono<SingleProjectDtos.SubmissionView> find(final String token) {
        return reader.find(token);
    }

    public Mono<Void> feedback(
        final long analysisId,
        final SingleProjectDtos.FeedbackRequest request
    ) {
        return responses.feedback(analysisId, request);
    }

    public Mono<Void> cancel(final String token) {
        return responses.cancel(token);
    }

    public Mono<SingleProjectDtos.QuizAnswerResult> quizAnswer(
        final long analysisId,
        final SingleProjectDtos.QuizAnswerRequest request
    ) {
        return responses.quizAnswer(analysisId, request);
    }

    public Mono<SingleProjectDtos.AssetContent> asset(final String token, final String sha256) {
        return reader.asset(token, sha256);
    }

    public Flux<ServerSentEvent<String>> events(final String token, final long lastSequence) {
        return reader.events(token, lastSequence);
    }

    public Mono<ReportDownload> report(final String token) {
        return reader.report(token);
    }

    public Mono<ReportDownload> report(final String token, final long analysisId) {
        return reader.report(token, analysisId);
    }

    public Mono<Boolean> runJob(final AnalysisJobRepository.Job job, final String workerId) {
        return runner.runJob(job, workerId);
    }

}
