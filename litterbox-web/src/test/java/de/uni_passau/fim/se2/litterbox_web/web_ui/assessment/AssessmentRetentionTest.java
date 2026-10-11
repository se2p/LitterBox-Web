/*
 * Copyright (C) 2024-2026 LitterBox-Web contributors
 *
 * This file is part of LitterBox-Web.
 * Licenced under the EUPL-1.2 or later.
 *
 * SPDX-FileCopyrightText: 2024-2026 LitterBox-Web contributors
 * SPDX-License-Identifier: EUPL-1.2
 */
package de.uni_passau.fim.se2.litterbox_web.web_ui.assessment;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import io.micrometer.core.instrument.MeterRegistry;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import reactor.core.publisher.Mono;
import reactor.core.publisher.Sinks;

class AssessmentRetentionTest {

    private AssessmentService assessments;
    private MeterRegistry metrics;
    private AssessmentRetention retention;

    @BeforeEach
    void setUp() {
        assessments = mock(AssessmentService.class);
        metrics = new SimpleMeterRegistry();
        retention = new AssessmentRetention(assessments, metrics);
    }

    @Test
    void countsWhatOneSweepRemoved() {
        when(assessments.removeExpired()).thenReturn(Mono.just(4));

        retention.removeExpired();

        assertThat(metrics.counter("litterbox.assessments.expired.removed").count()).isEqualTo(4);
        assertThat(metrics.counter("litterbox.assessments.expired.errors").count()).isZero();
    }

    @Test
    void countsASweepThatFailedRatherThanLettingItPassUnnoticed() {
        when(assessments.removeExpired()).thenReturn(Mono.error(new IllegalStateException("no database")));

        retention.removeExpired();

        assertThat(metrics.counter("litterbox.assessments.expired.errors").count()).isEqualTo(1);
        assertThat(metrics.counter("litterbox.assessments.expired.removed").count()).isZero();
    }

    @Test
    void refusesToStartASecondSweepWhileTheFirstIsStillRunning() {
        final Sinks.One<Integer> firstSweep = Sinks.one();
        when(assessments.removeExpired()).thenReturn(firstSweep.asMono());

        retention.removeExpired();
        retention.removeExpired();

        verify(assessments, times(1)).removeExpired();
    }

    @Test
    void sweepsAgainOnTheNextTickOnceTheFirstHasFinished() {
        final Sinks.One<Integer> firstSweep = Sinks.one();
        when(assessments.removeExpired()).thenReturn(firstSweep.asMono()).thenReturn(Mono.just(1));

        retention.removeExpired();
        firstSweep.tryEmitValue(2);
        retention.removeExpired();

        verify(assessments, times(2)).removeExpired();
        assertThat(metrics.counter("litterbox.assessments.expired.removed").count()).isEqualTo(3);
    }

    @Test
    void sweepsAgainAfterOneThatFailed() {
        when(assessments.removeExpired())
            .thenReturn(Mono.error(new IllegalStateException("no database"))).thenReturn(Mono.just(1));

        retention.removeExpired();
        retention.removeExpired();

        verify(assessments, times(2)).removeExpired();
        assertThat(metrics.counter("litterbox.assessments.expired.removed").count()).isEqualTo(1);
    }
}
