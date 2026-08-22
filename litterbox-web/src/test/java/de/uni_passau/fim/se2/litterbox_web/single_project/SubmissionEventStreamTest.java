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
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.time.Duration;
import java.util.List;

import org.junit.jupiter.api.Test;

import de.uni_passau.fim.se2.litterbox_web.execution.AnalysisWork;
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

class SubmissionEventStreamTest {

    @Test
    @SuppressWarnings("checkstyle:LambdaBodyLength")
    void replaysAfterCursorAndContinuesWithNewDurableRows() {
        final SubmissionRepository submissions = mock(SubmissionRepository.class);
        final SubmissionEventRepository events = mock(SubmissionEventRepository.class);
        when(submissions.findByToken("synthetic-token")).thenReturn(
            Mono.just(
                new Submission(1, "synthetic-token", "TEACHER_ZIP", "en", "RUNNING", "ACTIVE", 2, 0, 0)
            )
        );
        when(events.findAfter(eq(1L), anyLong())).thenAnswer(invocation -> {
            final long cursor = invocation.getArgument(1);
            if (cursor < 1) {
                return Mono.just(
                    List.of(
                        new SubmissionEventRepository.SubmissionEvent(1, 1, "RUNNING", "{\"status\":\"processing\"}")
                    )
                );
            }
            if (cursor < 2) {
                return Mono.just(
                    List.of(
                        new SubmissionEventRepository.SubmissionEvent(1, 2, "DONE", "{\"status\":\"completed\"}")
                    )
                );
            }
            return Mono.just(List.of());
        });
        final SingleProjectApplicationService service = service(submissions, events);

        final var streamed = service.events("synthetic-token", 0).take(2).collectList()
            .block(Duration.ofSeconds(3));

        assertThat(streamed).hasSize(2);
        assertThat(streamed.get(0).id()).isEqualTo("1");
        assertThat(streamed.get(0).event()).isEqualTo("running");
        assertThat(streamed.get(1).id()).isEqualTo("2");
        assertThat(streamed.get(1).event()).isEqualTo("done");
    }

    private SingleProjectApplicationService service(
        final SubmissionRepository submissions,
        final SubmissionEventRepository events
    ) {
        return new SingleProjectApplicationService(
            mock(SingleProjectSubmissionService.class), submissions, events, mock(AnalysisRepository.class),
            mock(AnalysisJobRepository.class), mock(SourceArtifactAccess.class), mock(AssetRepository.class),
            mock(IssueFeedbackRepository.class), mock(QuizAnswerRepository.class), mock(AnalysisWork.class),
            mock(Scratch3ParserService.class), mock(ScratchProjectClient.class),
            mock(QlcService.class), mock(ProjectArchiveInspector.class), mock(TeacherBatchArchiveInspector.class),
            "synthetic"
        );
    }
}
