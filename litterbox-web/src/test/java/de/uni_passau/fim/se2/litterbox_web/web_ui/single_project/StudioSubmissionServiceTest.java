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

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.nio.charset.StandardCharsets;
import java.util.List;

import org.junit.jupiter.api.Test;

import de.uni_passau.fim.se2.litterbox_web.qlc.QlcService;
import de.uni_passau.fim.se2.litterbox_web.shared.Scratch3ParserService;
import de.uni_passau.fim.se2.litterbox_web.web_ui.execution.AnalysisWork;
import de.uni_passau.fim.se2.litterbox_web.web_ui.persistence.Analysis;
import de.uni_passau.fim.se2.litterbox_web.web_ui.persistence.AnalysisJobRepository;
import de.uni_passau.fim.se2.litterbox_web.web_ui.persistence.AnalysisRepository;
import de.uni_passau.fim.se2.litterbox_web.web_ui.persistence.AssetRepository;
import de.uni_passau.fim.se2.litterbox_web.web_ui.persistence.IssueFeedbackRepository;
import de.uni_passau.fim.se2.litterbox_web.web_ui.persistence.QuizAnswerRepository;
import de.uni_passau.fim.se2.litterbox_web.web_ui.persistence.SingleProjectSubmissionService;
import de.uni_passau.fim.se2.litterbox_web.web_ui.persistence.SourceArtifact;
import de.uni_passau.fim.se2.litterbox_web.web_ui.persistence.SourceArtifactAccess;
import de.uni_passau.fim.se2.litterbox_web.web_ui.persistence.Submission;
import de.uni_passau.fim.se2.litterbox_web.web_ui.persistence.SubmissionEventRepository;
import de.uni_passau.fim.se2.litterbox_web.web_ui.persistence.SubmissionRepository;
import reactor.core.publisher.Mono;

class StudioSubmissionServiceTest {

    private static final String SYNTHETIC_TOKEN = "synthetic-token";
    private static final String STUDIO_TYPE = "SCRATCH_STUDIO";
    private static final String STATUS_ACTIVE = "ACTIVE";
    private static final String REQUEST_KEY = "request-key";

    private static final String LOCALE = "en";
    private static final String STUDIO_ID = "17";

    @Test
    void commitsStudioIngestionJobWithoutFetchingInTheRequestPath() {
        final SingleProjectSubmissionService submissions = mock(SingleProjectSubmissionService.class);
        final AnalysisJobRepository jobs = mock(AnalysisJobRepository.class);
        final ScratchProjectClient scratch = mock(ScratchProjectClient.class);
        final Submission submission = new Submission(
            11, SYNTHETIC_TOKEN, STUDIO_TYPE, LOCALE, "RUNNABLE", STATUS_ACTIVE, 0, 0, 0
        );
        when(submissions.createStudioRequest(STUDIO_ID, LOCALE, REQUEST_KEY))
            .thenReturn(Mono.just(new SingleProjectSubmissionService.CreatedStudio(submission)));
        when(jobs.enqueueStudio(11, STUDIO_ID)).thenReturn(Mono.empty());

        final var created = service(submissions, jobs, scratch)
            .submitStudio(STUDIO_ID, LOCALE, REQUEST_KEY)
            .block();

        assertThat(created).isNotNull();
        assertThat(created.status()).isEqualTo("queued");
        verify(jobs).enqueueStudio(11, STUDIO_ID);
        verify(scratch, never()).downloadStudio(STUDIO_ID);
    }

    @Test
    void commitsAValidatedProjectUrlListWithoutFetchingInTheRequestPath() {
        final SingleProjectSubmissionService submissions = mock(SingleProjectSubmissionService.class);
        final AnalysisJobRepository jobs = mock(AnalysisJobRepository.class);
        final ScratchProjectClient scratch = mock(ScratchProjectClient.class);
        final Submission submission = new Submission(
            11, SYNTHETIC_TOKEN, "SCRATCH_URL_LIST", LOCALE, "RUNNABLE", STATUS_ACTIVE, 0, 0, 0
        );
        final SourceArtifact artifact = new SourceArtifact(19, new byte[32], 5, "text/plain", "projects.txt");
        when(submissions.createProjectListRequest(List.of("23", "24"), "projects.txt", LOCALE, REQUEST_KEY))
            .thenReturn(Mono.just(new SingleProjectSubmissionService.CreatedBatchRequest(submission, artifact)));
        when(jobs.enqueueProjectList(11, 19)).thenReturn(Mono.empty());

        final byte[] list = ("https://scratch.mit.edu/projects/23/\n"
            + "https://www.scratch.mit.edu/projects/24\n"
            + "https://scratch.mit.edu/projects/23").getBytes(StandardCharsets.UTF_8);
        final var created = service(submissions, jobs, scratch)
            .submitProjectList(list, "projects.txt", LOCALE, REQUEST_KEY)
            .block();

        assertThat(created).isNotNull();
        verify(jobs).enqueueProjectList(11, 19);
        verify(scratch, never()).downloadStudioProjects(org.mockito.ArgumentMatchers.anyList());
    }

    @Test
    void rejectsAProjectListContainingANonScratchUrl() {
        final byte[] list = "https://example.org/projects/23".getBytes(StandardCharsets.UTF_8);

        assertThatThrownBy(
            () -> service(
                mock(SingleProjectSubmissionService.class), mock(AnalysisJobRepository.class),
                mock(ScratchProjectClient.class)
            ).submitProjectList(list, "projects.txt", LOCALE, REQUEST_KEY).block()
        ).hasMessageContaining("Invalid Scratch project URL");
    }

    /**
     * The idempotency key is bound before the job is queued, so that a repeated request cannot start the work twice.
     */
    @Test
    void aRequestRepeatedAfterAFailureQueuesTheJobItNeverGot() {
        final SingleProjectSubmissionService submissions = mock(SingleProjectSubmissionService.class);
        final AnalysisJobRepository jobs = mock(AnalysisJobRepository.class);
        final ScratchProjectClient scratch = mock(ScratchProjectClient.class);
        final Submission stranded = new Submission(
            11, SYNTHETIC_TOKEN, STUDIO_TYPE, LOCALE, "STORED", STATUS_ACTIVE, 0, 0, 0
        );
        when(submissions.createStudioRequest(STUDIO_ID, LOCALE, REQUEST_KEY))
            .thenReturn(Mono.just(new SingleProjectSubmissionService.CreatedStudio(stranded)));
        when(jobs.enqueueStudio(11, STUDIO_ID)).thenReturn(Mono.empty());

        service(submissions, jobs, scratch).submitStudio(STUDIO_ID, LOCALE, REQUEST_KEY).block();

        verify(jobs).enqueueStudio(11, STUDIO_ID);
    }

    @Test
    void aRequestRepeatedAfterTheStudioFinishedQueuesNothing() {
        final SingleProjectSubmissionService submissions = mock(SingleProjectSubmissionService.class);
        final AnalysisJobRepository jobs = mock(AnalysisJobRepository.class);
        final ScratchProjectClient scratch = mock(ScratchProjectClient.class);
        final Submission finished = new Submission(
            11, SYNTHETIC_TOKEN, STUDIO_TYPE, LOCALE, "PARTIAL", STATUS_ACTIVE, 2, 1, 1
        );
        when(submissions.createStudioRequest(STUDIO_ID, LOCALE, REQUEST_KEY))
            .thenReturn(Mono.just(new SingleProjectSubmissionService.CreatedStudio(finished)));

        final var created = service(submissions, jobs, scratch)
            .submitStudio(STUDIO_ID, LOCALE, REQUEST_KEY)
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
            11, SYNTHETIC_TOKEN, STUDIO_TYPE, LOCALE, "PARTIAL", STATUS_ACTIVE, 2, 1, 1
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
            11, SYNTHETIC_TOKEN, STUDIO_TYPE, LOCALE, "RUNNING", STATUS_ACTIVE, 1, 0, 0
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
            mock(QuizAnswerPort.class), "synthetic"
        );
    }
}
