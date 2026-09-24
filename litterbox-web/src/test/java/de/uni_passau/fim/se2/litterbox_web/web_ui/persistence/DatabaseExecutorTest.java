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

import java.time.Duration;
import java.util.List;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;

import org.junit.jupiter.api.Test;

import de.uni_passau.fim.se2.litterbox_web.web_ui.execution.BoundedAnalysisExecutor;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import reactor.core.publisher.Flux;

class DatabaseExecutorTest {

    @Test
    void runsBlockingWorkOnDatabaseThreads() {
        final DatabaseExecutor work = new DatabaseExecutor(1, 1, new SimpleMeterRegistry());
        final BoundedAnalysisExecutor analysis = new BoundedAnalysisExecutor(1, 1, new SimpleMeterRegistry());

        try {
            final String threadName = work.submit(() -> Thread.currentThread().getName()).block(Duration.ofSeconds(2));
            final String analysisThread = analysis.submit(() -> Thread.currentThread().getName())
                .block(Duration.ofSeconds(2));

            assertThat(threadName).startsWith("lb-db-");
            assertThat(analysisThread).startsWith("lb-analysis-");
            assertThat(threadName).isNotEqualTo(analysisThread);
        }
        finally {
            work.shutdown();
            analysis.shutdown();
        }
    }

    @Test
    void queuesWorkBeyondThreadCountInsteadOfRefusingIt() throws Exception {
        final DatabaseExecutor work = new DatabaseExecutor(1, 16, new SimpleMeterRegistry());
        final CountDownLatch started = new CountDownLatch(1);
        final CountDownLatch release = new CountDownLatch(1);
        try {
            work.submit(() -> {
                started.countDown();
                release.await();
                return -1;
            }).subscribe();
            assertThat(started.await(2, TimeUnit.SECONDS)).isTrue();

            final var waiting = Flux.range(0, 8)
                .flatMap(i -> work.submit(() -> i))
                .collectList()
                .toFuture();
            release.countDown();

            final List<Integer> results = waiting.get(2, TimeUnit.SECONDS);
            assertThat(results).containsExactlyInAnyOrder(0, 1, 2, 3, 4, 5, 6, 7);
        }
        finally {
            release.countDown();
            work.shutdown();
        }
    }
}
