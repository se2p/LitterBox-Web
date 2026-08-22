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

import java.util.Map;

import org.junit.jupiter.api.Test;

import de.uni_passau.fim.se2.litterbox_web.execution.AnalysisWork;
import de.uni_passau.fim.se2.litterbox_web.persistence.Analysis;
import de.uni_passau.fim.se2.litterbox_web.persistence.AnalysisJobRepository;
import de.uni_passau.fim.se2.litterbox_web.persistence.AnalysisRepository;
import de.uni_passau.fim.se2.litterbox_web.persistence.AssetRepository;
import de.uni_passau.fim.se2.litterbox_web.persistence.IssueFeedbackRepository;
import de.uni_passau.fim.se2.litterbox_web.persistence.QuizAnswerRepository;
import de.uni_passau.fim.se2.litterbox_web.persistence.SingleProjectSubmissionService;
import de.uni_passau.fim.se2.litterbox_web.persistence.SourceArtifact;
import de.uni_passau.fim.se2.litterbox_web.persistence.SourceArtifactAccess;
import de.uni_passau.fim.se2.litterbox_web.persistence.SourceArtifactMetadata;
import de.uni_passau.fim.se2.litterbox_web.persistence.SubmissionEventRepository;
import de.uni_passau.fim.se2.litterbox_web.persistence.SubmissionRepository;
import de.uni_passau.fim.se2.litterbox_web.qlc.QlcService;
import de.uni_passau.fim.se2.litterbox_web.shared.Scratch3ParserService;
import reactor.core.publisher.Mono;

class BatchFailureJobTest {

    @Test
    void persistsAStoredChildFailureOnlyThroughTheChildJobsLease() {
        final AnalysisRepository analyses = mock(AnalysisRepository.class);
        final AnalysisJobRepository jobs = mock(AnalysisJobRepository.class);
        final SourceArtifactAccess artifacts = mock(SourceArtifactAccess.class);
        final byte[] digest = new byte[32];
        final Analysis analysis = new Analysis(
            9, 11, 7, "broken.sb3", "NEW", "1", "synthetic", "en", "QUEUED", ".sb3",
            null, null, null, null, null, digest, Map.of()
        );
        final AnalysisJobRepository.Job job = new AnalysisJobRepository.Job(
            31, 11, 9L, "ANALYSIS", null, "RUNNING", false, 0, null
        );
        when(jobs.leaseOwned(31, "worker")).thenReturn(Mono.just(true));
        when(analyses.findById(9)).thenReturn(Mono.just(analysis));
        when(artifacts.findById(7)).thenReturn(
            Mono.just(new SourceArtifact(7, digest, 12, "application/zip", "broken.sb3"))
        );
        when(artifacts.findMetadataById(7)).thenReturn(
            Mono.just(
                new SourceArtifactMetadata(
                    7, "TEACHER_CHILD", "{\"format\":\"batch-failure\",\"version\":1,"
                        + "\"failureType\":\"MalformedArchive\","
                        + "\"failureMessage\":\"Synthetic malformed archive\"}"
                )
            )
        );
        when(
            analyses.completeIfOwned(
                9, 11, true, null, "MalformedArchive", "Synthetic malformed archive",
                "{\"status\":\"failed\"}", null, null, null, 31, "worker"
            )
        ).thenReturn(Mono.just(true));

        final Boolean failed = service(analyses, jobs, artifacts).runJob(job, "worker").block();

        assertThat(failed).isTrue();
        verify(analyses).completeIfOwned(
            9, 11, true, null, "MalformedArchive", "Synthetic malformed archive",
            "{\"status\":\"failed\"}", null, null, null, 31, "worker"
        );
        verify(artifacts, never()).open(digest);
    }

    private SingleProjectApplicationService service(
        final AnalysisRepository analyses,
        final AnalysisJobRepository jobs,
        final SourceArtifactAccess artifacts
    ) {
        return new SingleProjectApplicationService(
            mock(SingleProjectSubmissionService.class), mock(SubmissionRepository.class),
            mock(SubmissionEventRepository.class), analyses, jobs, artifacts, mock(AssetRepository.class),
            mock(IssueFeedbackRepository.class), mock(QuizAnswerRepository.class), mock(AnalysisWork.class),
            mock(Scratch3ParserService.class), mock(ScratchProjectClient.class), mock(QlcService.class),
            mock(ProjectArchiveInspector.class), mock(TeacherBatchArchiveInspector.class), "synthetic"
        );
    }
}
