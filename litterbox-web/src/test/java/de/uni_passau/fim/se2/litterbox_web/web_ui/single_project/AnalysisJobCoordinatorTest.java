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
import static org.mockito.ArgumentMatchers.anyBoolean;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.time.Duration;

import org.junit.jupiter.api.Test;

import de.uni_passau.fim.se2.litterbox_web.web_ui.persistence.AnalysisJobRepository;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import reactor.core.publisher.Mono;

class AnalysisJobCoordinatorTest {

    @Test
    void doesNotAccumulateClaimsBeyondTheConfiguredInFlightLimit() {
        final AnalysisJobRepository jobs = mock(AnalysisJobRepository.class);
        final SingleProjectApplicationService runner = mock(SingleProjectApplicationService.class);
        when(jobs.claimNext(anyString(), eq(Duration.ofSeconds(60)))).thenReturn(Mono.never());
        final AnalysisJobCoordinator coordinator = new AnalysisJobCoordinator(
            jobs, runner, 60, 2, 1, new SimpleMeterRegistry()
        );

        coordinator.dispatch();
        coordinator.dispatch();
        coordinator.dispatch();
        coordinator.dispatch();

        verify(jobs, times(2)).claimNext(anyString(), eq(Duration.ofSeconds(60)));
    }

    @Test
    void leaseLossDoesNotFinishTheStaleJob() {
        final AnalysisJobRepository jobs = mock(AnalysisJobRepository.class);
        final SingleProjectApplicationService runner = mock(SingleProjectApplicationService.class);
        final SimpleMeterRegistry metrics = new SimpleMeterRegistry();
        final AnalysisJobRepository.Job job = new AnalysisJobRepository.Job(
            7, 11, 13L, "ANALYSIS", null, "RUNNING", false, 1, "worker:lease"
        );
        when(jobs.claimNext(anyString(), eq(Duration.ofSeconds(1)))).thenReturn(Mono.just(job));
        when(runner.runJob(eq(job), anyString())).thenReturn(Mono.never());
        when(jobs.renew(eq(7L), anyString(), eq(Duration.ofSeconds(1)))).thenReturn(Mono.just(false));
        final AnalysisJobCoordinator coordinator = new AnalysisJobCoordinator(
            jobs, runner, 1, 1, 1, metrics
        );

        coordinator.dispatch();
        Mono.delay(Duration.ofMillis(700)).block();

        verify(jobs, never()).finish(anyLong(), anyString(), anyBoolean());
        assertThat(metrics.counter("litterbox.jobs.lease.loss", "kind", "ANALYSIS").count()).isEqualTo(1.0);
    }
}
