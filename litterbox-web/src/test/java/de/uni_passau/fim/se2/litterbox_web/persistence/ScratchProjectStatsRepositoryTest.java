/*
 * Copyright (C) 2024-2026 LitterBox-Web contributors
 *
 * This file is part of LitterBox-Web.
 * Licenced under the EUPL-1.2 or later.
 *
 * SPDX-FileCopyrightText: 2024-2026 LitterBox-Web contributors
 * SPDX-License-Identifier: EUPL-1.2
 */
package de.uni_passau.fim.se2.litterbox_web.persistence;

import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;

import java.time.Instant;

import org.junit.jupiter.api.Test;

import de.uni_passau.fim.se2.litterbox_web.persistence.jpa.ScratchProjectStatistics;
import de.uni_passau.fim.se2.litterbox_web.util.ImmediateWork;

class ScratchProjectStatsRepositoryTest {

    @Test
    void persistsApprovedStatisticsAndVerbatimUsernameFromTheRetainedManifest() {
        final ScratchProjectStatistics statistics = mock(ScratchProjectStatistics.class);
        final ScratchProjectStatsRepository repository = new ScratchProjectStatsRepository(
            statistics, ImmediateWork.database()
        );
        final String manifest = "{\"format\":\"scratch-project-bundle\",\"version\":2,"
            + "\"authorUsername\":\"Case_User\",\"fetchedAt\":\"2026-08-04T10:15:30Z\","
            + "\"upstreamTimestamps\":{\"history.created\":\"2020-01-02T03:04:05Z\"},"
            + "\"statistics\":{\"views\":12,\"loves\":3,\"favorites\":2,\"remixes\":1}}";

        repository.upsertFromManifest(42, manifest).block();

        verify(statistics).upsert(
            42L, 12L, 3L, 2L, 1L, "Case_User", "SCRATCH_API",
            Instant.parse("2020-01-02T03:04:05Z"),
            Instant.parse("2026-08-04T10:15:30Z")
        );
    }

    @Test
    void rejectsInvalidStatisticsInsteadOfCoercingThem() {
        final ScratchProjectStatistics statistics = mock(ScratchProjectStatistics.class);
        final ScratchProjectStatsRepository repository = new ScratchProjectStatsRepository(
            statistics, ImmediateWork.database()
        );
        final String manifest = "{\"format\":\"scratch-project-bundle\",\"version\":2,"
            + "\"fetchedAt\":\"2026-08-04T10:15:30Z\",\"statistics\":{\"views\":\"12\"}}";

        assertThatThrownBy(() -> repository.upsertFromManifest(42, manifest).block())
            .isInstanceOf(IllegalArgumentException.class)
            .hasMessageContaining("statistics");
        verifyNoInteractions(statistics);
    }
}
