/*
 * Copyright (C) 2024-2026 LitterBox-Web contributors
 *
 * This file is part of LitterBox-Web.
 * Licenced under the EUPL-1.2 or later.
 *
 * SPDX-FileCopyrightText: 2024-2026 LitterBox-Web contributors
 * SPDX-License-Identifier: EUPL-1.2
 */
package de.uni_passau.fim.se2.litterbox_web.web_ui.ask_ai;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import de.uni_passau.fim.se2.litterbox_web.web_ui.persistence.AskAiConversationRepository;
import io.micrometer.core.instrument.MeterRegistry;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import reactor.core.publisher.Mono;

class AskAiRetentionSweepTest {

    private static final Instant NOW = Instant.parse("2026-08-18T09:00:00Z");
    private static final Duration PENDING_TIMEOUT = Duration.ofMinutes(15);
    private static final Instant PENDING_CUTOFF = NOW.minus(PENDING_TIMEOUT);
    private final AskAiConversationRepository repository = mock(AskAiConversationRepository.class);
    private final MeterRegistry metrics = new SimpleMeterRegistry();
    private final Clock clock = Clock.fixed(NOW, ZoneOffset.UTC);

    @BeforeEach
    void nothingIsDueUnlessATestSaysSo() {
        when(repository.closeExpired(any(), anyInt())).thenReturn(Mono.just(0));
        when(repository.reclaimStalePendingTurns(any(), anyInt())).thenReturn(Mono.just(0));
        when(repository.deletePastRetention(any(), anyInt())).thenReturn(Mono.just(0));
    }

    @Test
    void walksEveryDeadlineAgainstTheSameMoment() {
        when(repository.closeExpired(eq(NOW), anyInt())).thenReturn(Mono.just(2));
        when(repository.deletePastRetention(eq(NOW), anyInt())).thenReturn(Mono.just(5));
        when(repository.reclaimStalePendingTurns(eq(PENDING_CUTOFF), anyInt())).thenReturn(Mono.just(1));

        sweep(50).sweepOnce().block();

        verify(repository, times(1)).closeExpired(NOW, 50);
        verify(repository, times(1)).deletePastRetention(NOW, 50);
        verify(repository, times(1)).reclaimStalePendingTurns(PENDING_CUTOFF, 50);
        assertThat(metrics.counter("litterbox.ask.ai.swept", "deadline", "expired").count()).isEqualTo(2);
        assertThat(metrics.counter("litterbox.ask.ai.swept", "deadline", "retired").count()).isEqualTo(5);
        assertThat(metrics.counter("litterbox.ask.ai.swept", "deadline", "abandoned").count()).isEqualTo(1);
    }

    @Test
    void keepsTakingBatchesUntilOneComesBackShort() {
        when(repository.deletePastRetention(eq(NOW), eq(200)))
            .thenReturn(Mono.just(200))
            .thenReturn(Mono.just(200))
            .thenReturn(Mono.just(37));

        sweep(200).sweepOnce().block();

        verify(repository, times(3)).deletePastRetention(NOW, 200);
        assertThat(metrics.counter("litterbox.ask.ai.swept", "deadline", "retired").count()).isEqualTo(437);
    }

    @Test
    void givesEachDeadlineItsOwnRoomWithinARun() {
        when(repository.closeExpired(eq(NOW), eq(10))).thenReturn(Mono.just(10));
        when(repository.deletePastRetention(eq(NOW), eq(10))).thenReturn(Mono.just(10));

        sweepWithLimit(10, 3).sweepOnce().block();

        verify(repository, times(3)).closeExpired(NOW, 10);
        verify(repository, times(3)).deletePastRetention(NOW, 10);
    }

    @Test
    void aFailedSweepIsSwallowedByTheScheduledEntryPoint() {
        when(repository.closeExpired(any(), anyInt())).thenReturn(Mono.error(new IllegalStateException("no database")));

        sweep(50).sweep();

        verify(repository, times(1)).closeExpired(NOW, 50);
        verify(repository, never()).deletePastRetention(any(), anyInt());
    }

    private AskAiRetentionSweep sweep(final int batch) {
        return sweepWithLimit(batch, 50);
    }

    private AskAiRetentionSweep sweepWithLimit(final int batch, final int maxBatches) {
        final AskAiConfigurationProperties.Sweep limits = new AskAiConfigurationProperties.Sweep();
        limits.setBatch(batch);
        limits.setMaxBatches(maxBatches);
        return new AskAiRetentionSweep(repository, metrics, limits, clock);
    }
}
