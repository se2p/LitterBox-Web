/*
 * Copyright (C) 2024-2026 LitterBox-Web contributors
 *
 * This file is part of LitterBox-Web.
 * Licenced under the EUPL-1.2 or later.
 *
 * SPDX-FileCopyrightText: 2024-2026 LitterBox-Web contributors
 * SPDX-License-Identifier: EUPL-1.2
 */
package de.uni_passau.fim.se2.litterbox_web.execution;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Duration;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;

import org.junit.jupiter.api.Test;

import io.micrometer.core.instrument.simple.SimpleMeterRegistry;

class BoundedAnalysisExecutorTest {

    @Test
    void rejectsWhenTheBoundedPoolAndQueueAreFull() throws Exception {
        final SimpleMeterRegistry metrics = new SimpleMeterRegistry();
        final BoundedAnalysisExecutor work = new BoundedAnalysisExecutor(1, 1, metrics);
        final CountDownLatch started = new CountDownLatch(1);
        final CountDownLatch release = new CountDownLatch(1);
        try {
            work.submit(() -> {
                started.countDown();
                release.await();
                return "first";
            }).subscribe();
            assertThat(started.await(2, TimeUnit.SECONDS)).isTrue();
            work.submit(() -> "queued").subscribe();

            final var rejected = work.submit(() -> "rejected").onErrorResume(
                AnalysisCapacityExceededException.class, ignored -> reactor.core.publisher.Mono.just("busy")
            ).block(Duration.ofSeconds(2));
            assertThat(rejected).isEqualTo("busy");
            assertThat(metrics.get("litterbox.analysis.rejections").counter().count()).isEqualTo(1);
            assertThat(metrics.find("litterbox.analysis.duration").timer()).isNull();
        }
        finally {
            release.countDown();
            work.shutdown();
        }
        assertThat(metrics.get("litterbox.analysis.duration").timer().count()).isEqualTo(2);
    }
}
