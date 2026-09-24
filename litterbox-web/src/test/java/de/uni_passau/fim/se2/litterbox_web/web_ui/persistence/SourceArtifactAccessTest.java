/*
 * Copyright (C) 2024-2026 LitterBox-Web contributors
 *
 * This file is part of LitterBox-Web.
 * Licenced under the EUPL-1.2 or later.
 *
 * SPDX-FileCopyrightText: 2024-2026 LitterBox-Web contributors
 * SPDX-License-Identifier: EUPL-1.2
 */
package de.uni_passau.fim.se2.litterbox_web.web_ui.persistence;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.util.Map;

import org.junit.jupiter.api.Test;

import reactor.core.publisher.Mono;

class SourceArtifactAccessTest {

    private static final long SUBMISSION_ID = 11;
    private static final long ARTIFACT_ID = 7;

    private final SourceArtifactRepository repository = mock(SourceArtifactRepository.class);
    private final SubmissionArtifactRepository links = mock(SubmissionArtifactRepository.class);
    private final SourceArtifactAccess access = new SourceArtifactAccess(
        repository, links, mock(SourceArtifactStore.class), mock(StorageWork.class)
    );

    SourceArtifactAccessTest() {
        when(repository.findById(ARTIFACT_ID)).thenReturn(
            Mono.just(new SourceArtifact(ARTIFACT_ID, new byte[32], 12, "application/zip", "first-uploader.sb3"))
        );
    }

    @Test
    void namesTheArtifactAsThisSubmissionUploadedIt() {
        when(links.findOriginalFilename(SUBMISSION_ID, ARTIFACT_ID)).thenReturn(Mono.just("mine.sb3"));

        assertThat(access.findForAnalysis(analysis(null)).block().originalFilename()).isEqualTo("mine.sb3");
    }

    @Test
    void prefersTheNameABatchGaveTheProject() {
        assertThat(access.findForAnalysis(analysis("child.sb3")).block().originalFilename())
            .isEqualTo("child.sb3");
        verify(links, never()).findOriginalFilename(SUBMISSION_ID, ARTIFACT_ID);
    }

    @Test
    void namesNothingRatherThanAnotherUploadersFileForLinksThatKeptNoName() {
        when(links.findOriginalFilename(SUBMISSION_ID, ARTIFACT_ID)).thenReturn(Mono.empty());

        assertThat(access.findForAnalysis(analysis(null)).block().originalFilename()).isNull();
        assertThat(access.submittedName(analysis(null)).block()).isNull();
    }

    private static Analysis analysis(final String projectName) {
        return new Analysis(
            9, SUBMISSION_ID, ARTIFACT_ID, projectName, "NEW", "1", "synthetic", "en", "QUEUED", ".sb3",
            null, null, null, null, null, new byte[32], Map.of()
        );
    }
}
