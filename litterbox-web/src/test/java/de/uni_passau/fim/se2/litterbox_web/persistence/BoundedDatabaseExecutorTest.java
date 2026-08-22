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

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Duration;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;

import org.junit.jupiter.api.Test;

import de.uni_passau.fim.se2.litterbox_web.execution.BoundedAnalysisExecutor;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import reactor.core.publisher.Mono;

class BoundedDatabaseExecutorTest {

    @Test
    void runsBlockingWorkOnDatabaseThreads() {
        final BoundedDatabaseExecutor work = new BoundedDatabaseExecutor(1, 1, new SimpleMeterRegistry());
        final BoundedAnalysisExecutor analysis = new BoundedAnalysisExecutor(1, 1, new SimpleMeterRegistry());

        try {
            final String threadName = work.submit(() -> Thread.currentThread().getName()).block(Duration.ofSeconds(2));
            final String analysisThread = analysis.submit(() -> Thread.currentThread().getName())
                .block(Duration.ofSeconds(2));

            assertThat(threadName).startsWith("litterbox-database-");
            assertThat(analysisThread).startsWith("litterbox-analysis-");
            assertThat(threadName).isNotEqualTo(analysisThread);
        }
        finally {
            work.shutdown();
            analysis.shutdown();
        }
    }

    @Test
    void rejectsWhenBoundedDatabasePoolIsFullAndRecordsMetric() throws Exception {
        final SimpleMeterRegistry metrics = new SimpleMeterRegistry();
        final BoundedDatabaseExecutor work = new BoundedDatabaseExecutor(1, 1, metrics);
        final CountDownLatch started = new CountDownLatch(1);
        final CountDownLatch release = new CountDownLatch(1);
        try {
            work.submit(() -> {
                started.countDown();
                release.await();
                return "running";
            }).subscribe();
            assertThat(started.await(2, TimeUnit.SECONDS)).isTrue();
            work.submit(() -> "queued").subscribe();
            final String result = work.submit(() -> "rejected")
                .onErrorResume(DatabaseCapacityExceededException.class, ignored -> Mono.just("busy"))
                .block(Duration.ofSeconds(2));
            assertThat(result).isEqualTo("busy");
            assertThat(metrics.get("litterbox.database.rejections").counter().count()).isEqualTo(1);
            assertThat(metrics.find("litterbox.database.duration").timer()).isNull();
        }
        finally {
            release.countDown();
            work.shutdown();
        }
        assertThat(metrics.get("litterbox.database.duration").timer().count()).isEqualTo(2);
    }
}
