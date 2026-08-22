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

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.util.List;

import org.junit.jupiter.api.Test;

import de.uni_passau.fim.se2.litterbox_web.execution.AnalysisWork;
import de.uni_passau.fim.se2.litterbox_web.persistence.Analysis;
import de.uni_passau.fim.se2.litterbox_web.persistence.AnalysisJobRepository;
import de.uni_passau.fim.se2.litterbox_web.persistence.AnalysisRepository;
import de.uni_passau.fim.se2.litterbox_web.persistence.AssetRepository;
import de.uni_passau.fim.se2.litterbox_web.persistence.IssueFeedbackRepository;
import de.uni_passau.fim.se2.litterbox_web.persistence.QuizAnswerRepository;
import de.uni_passau.fim.se2.litterbox_web.persistence.SingleProjectSubmissionService;
import de.uni_passau.fim.se2.litterbox_web.persistence.SourceArtifactAccess;
import de.uni_passau.fim.se2.litterbox_web.persistence.Submission;
import de.uni_passau.fim.se2.litterbox_web.persistence.SubmissionEventRepository;
import de.uni_passau.fim.se2.litterbox_web.persistence.SubmissionRepository;
import de.uni_passau.fim.se2.litterbox_web.qlc.QlcService;
import de.uni_passau.fim.se2.litterbox_web.shared.Scratch3ParserService;
import reactor.core.publisher.Mono;

class StudioSubmissionServiceTest {

    private static final String LOCALE = "en";
    private static final String STUDIO_ID = "17";

    @Test
    void commitsStudioIngestionJobWithoutFetchingInTheRequestPath() {
        final SingleProjectSubmissionService submissions = mock(SingleProjectSubmissionService.class);
        final AnalysisJobRepository jobs = mock(AnalysisJobRepository.class);
        final ScratchProjectClient scratch = mock(ScratchProjectClient.class);
        final Submission submission = new Submission(
            11, "synthetic-token", "SCRATCH_STUDIO", LOCALE, "RUNNABLE", "ACTIVE", 0, 0, 0
        );
        when(submissions.createStudioRequest(STUDIO_ID, LOCALE, "request-key"))
            .thenReturn(Mono.just(new SingleProjectSubmissionService.CreatedStudio(submission)));
        when(jobs.enqueueStudio(11, STUDIO_ID)).thenReturn(Mono.empty());

        final var created = service(submissions, jobs, scratch)
            .submitStudio(STUDIO_ID, LOCALE, "request-key")
            .block();

        assertThat(created).isNotNull();
        assertThat(created.status()).isEqualTo("queued");
        verify(jobs).enqueueStudio(11, STUDIO_ID);
        verify(scratch, never()).downloadStudio(STUDIO_ID);
    }

    /**
     * The idempotency key is bound before the job is queued, so that a repeated request cannot start the work twice. A
     * request repeated because the first one failed in between therefore finds a submission with no job at all, and
     * used to be handed straight back as though it were running.
     */
    @Test
    void aRequestRepeatedAfterAFailureQueuesTheJobItNeverGot() {
        final SingleProjectSubmissionService submissions = mock(SingleProjectSubmissionService.class);
        final AnalysisJobRepository jobs = mock(AnalysisJobRepository.class);
        final ScratchProjectClient scratch = mock(ScratchProjectClient.class);
        final Submission stranded = new Submission(
            11, "synthetic-token", "SCRATCH_STUDIO", LOCALE, "STORED", "ACTIVE", 0, 0, 0
        );
        when(submissions.createStudioRequest(STUDIO_ID, LOCALE, "request-key"))
            .thenReturn(Mono.just(new SingleProjectSubmissionService.CreatedStudio(stranded)));
        when(jobs.enqueueStudio(11, STUDIO_ID)).thenReturn(Mono.empty());

        service(submissions, jobs, scratch).submitStudio(STUDIO_ID, LOCALE, "request-key").block();

        verify(jobs).enqueueStudio(11, STUDIO_ID);
    }

    /** A submission that has come to something has no work left, and asking for it again does not start any. */
    @Test
    void aRequestRepeatedAfterTheStudioFinishedQueuesNothing() {
        final SingleProjectSubmissionService submissions = mock(SingleProjectSubmissionService.class);
        final AnalysisJobRepository jobs = mock(AnalysisJobRepository.class);
        final ScratchProjectClient scratch = mock(ScratchProjectClient.class);
        final Submission finished = new Submission(
            11, "synthetic-token", "SCRATCH_STUDIO", LOCALE, "PARTIAL", "ACTIVE", 2, 1, 1
        );
        when(submissions.createStudioRequest(STUDIO_ID, LOCALE, "request-key"))
            .thenReturn(Mono.just(new SingleProjectSubmissionService.CreatedStudio(finished)));

        final var created = service(submissions, jobs, scratch)
            .submitStudio(STUDIO_ID, LOCALE, "request-key")
            .block();

        assertThat(created).isNotNull();
        verify(jobs, never()).enqueueStudio(11, STUDIO_ID);
    }

    @Test
    void terminalIngestionReplayDoesNotFetchOrRegressTheSubmission() {
        final SingleProjectSubmissionService submissions = mock(SingleProjectSubmissionService.class);
        final SubmissionRepository submissionRepository = mock(SubmissionRepository.class);
        final SubmissionEventRepository events = mock(SubmissionEventRepository.class);
        final AnalysisJobRepository jobs = mock(AnalysisJobRepository.class);
        final ScratchProjectClient scratch = mock(ScratchProjectClient.class);
        final Submission submission = new Submission(
            11, "synthetic-token", "SCRATCH_STUDIO", LOCALE, "PARTIAL", "ACTIVE", 2, 1, 1
        );
        final AnalysisJobRepository.Job job = new AnalysisJobRepository.Job(
            31, 11, null, "STUDIO_INGEST", STUDIO_ID, "RUNNING", false, 0, null
        );
        when(jobs.leaseOwned(31, "worker")).thenReturn(Mono.just(true));
        when(submissionRepository.findById(11)).thenReturn(Mono.just(submission));

        final Boolean failed = service(
            submissions, submissionRepository, events, jobs, scratch
        ).runJob(job, "worker").block();

        assertThat(failed).isFalse();
        verify(scratch, never()).listStudioProjectIds(STUDIO_ID);
        verify(submissionRepository, never()).markRunning(11);
    }

    @Test
    void recoveredStudioIngestionReusesExistingProjectWithoutDownloadingOrDuplicatingItsJob() {
        final SingleProjectSubmissionService submissions = mock(SingleProjectSubmissionService.class);
        final SubmissionRepository submissionRepository = mock(SubmissionRepository.class);
        final SubmissionEventRepository events = mock(SubmissionEventRepository.class);
        final AnalysisJobRepository jobs = mock(AnalysisJobRepository.class);
        final ScratchProjectClient scratch = mock(ScratchProjectClient.class);
        final Submission submission = new Submission(
            11, "synthetic-token", "SCRATCH_STUDIO", LOCALE, "RUNNING", "ACTIVE", 1, 0, 0
        );
        final Analysis analysis = new Analysis(41, 11, 21, "NEW", "1", "synthetic", LOCALE, "QUEUED", ".sb3");
        final AnalysisJobRepository.Job job = new AnalysisJobRepository.Job(
            31, 11, null, "STUDIO_INGEST", STUDIO_ID, "RUNNING", false, 2, null
        );
        when(jobs.leaseOwned(31, "worker")).thenReturn(Mono.just(true));
        when(jobs.cancellationRequested(31)).thenReturn(Mono.just(false));
        when(submissionRepository.findById(11)).thenReturn(Mono.just(submission));
        when(submissionRepository.markRunning(11)).thenReturn(Mono.empty());
        when(events.append(11, "RUNNING", "{\"status\":\"fetching-studio\"}")).thenReturn(Mono.empty());
        when(
            scratch.listStudioProjectIds(org.mockito.ArgumentMatchers.eq(STUDIO_ID), org.mockito.ArgumentMatchers.any())
        )
            .thenReturn(Mono.just(List.of("23")));
        when(submissionRepository.prepareBatch(11, 1)).thenReturn(Mono.empty());
        when(submissions.findStudioProject(11, "23")).thenReturn(Mono.just(analysis));
        when(jobs.enqueue(11, 41)).thenReturn(Mono.empty());

        final Boolean failed = service(
            submissions, submissionRepository, events, jobs, scratch
        ).runJob(job, "worker").block();

        assertThat(failed).isFalse();
        verify(jobs).enqueue(11, 41);
        verify(scratch, never()).downloadStudioProjects(List.of("23"));
        verify(submissions, never()).addBatchProject(
            org.mockito.ArgumentMatchers.anyLong(), org.mockito.ArgumentMatchers.any(),
            org.mockito.ArgumentMatchers.anyString(), org.mockito.ArgumentMatchers.anyString()
        );
    }

    private SingleProjectApplicationService service(
        final SingleProjectSubmissionService submissions,
        final AnalysisJobRepository jobs,
        final ScratchProjectClient scratch
    ) {
        return service(
            submissions, mock(SubmissionRepository.class), mock(SubmissionEventRepository.class), jobs, scratch
        );
    }

    private SingleProjectApplicationService service(
        final SingleProjectSubmissionService submissions,
        final SubmissionRepository submissionRepository,
        final SubmissionEventRepository submissionEvents,
        final AnalysisJobRepository jobs,
        final ScratchProjectClient scratch
    ) {
        return new SingleProjectApplicationService(
            submissions, submissionRepository, submissionEvents,
            mock(AnalysisRepository.class), jobs, mock(SourceArtifactAccess.class), mock(AssetRepository.class),
            mock(IssueFeedbackRepository.class), mock(QuizAnswerRepository.class), mock(AnalysisWork.class),
            mock(Scratch3ParserService.class), scratch,
            mock(QlcService.class), mock(ProjectArchiveInspector.class), mock(TeacherBatchArchiveInspector.class),
            "synthetic"
        );
    }
}
