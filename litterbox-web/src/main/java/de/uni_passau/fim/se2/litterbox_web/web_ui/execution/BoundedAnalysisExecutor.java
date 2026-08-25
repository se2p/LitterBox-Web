/*
 * Copyright (C) 2024-2026 LitterBox-Web contributors
 *
 * This file is part of LitterBox-Web.
 * Licenced under the EUPL-1.2 or later.
 *
 * SPDX-FileCopyrightText: 2024-2026 LitterBox-Web contributors
 * SPDX-License-Identifier: EUPL-1.2
 */
package de.uni_passau.fim.se2.litterbox_web.web_ui.execution;

import java.util.concurrent.Callable;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import de.uni_passau.fim.se2.litterbox_web.web_ui.support.LitterboxThreadPool;
import io.micrometer.core.instrument.MeterRegistry;
import jakarta.annotation.PreDestroy;
import reactor.core.publisher.Mono;

/**
 * CPU-bound admission boundary for the analyses the site's own pages wait on.
 *
 * <p>
 * Bounded against the processors there are, and so carrying only work that occupies one. A full queue is refused rather
 * than lengthened because the caller is a browser that has already been waiting: a place further back in the queue is
 * not what it asked for, and by the time the work ran nobody would still be there for the answer.
 *
 * <p>
 * That reasoning is about browsers, and holds for nothing else. The endpoints outside {@code web_ui} answer machines
 * that are perfectly happy to wait, and refusing them work because a queue is momentarily full is a worse answer than a
 * slow one — which is why this is here rather than in {@code shared}, and why nothing outside this package may reach
 * it.
 */
@Component
public final class BoundedAnalysisExecutor implements AnalysisWork {

    private final LitterboxThreadPool executor;

    public BoundedAnalysisExecutor(
        @Value(
            "${litterbox.execution.analysis-threads:#{T(java.lang.Runtime).getRuntime().availableProcessors()}}"
        ) final int threads,
        @Value("${litterbox.execution.analysis-queue-capacity:32}") final int queueCapacity,
        final MeterRegistry meterRegistry
    ) {
        executor = LitterboxThreadPool.bounded(
            "analysis", threads, queueCapacity, meterRegistry, AnalysisCapacityExceededException::new
        );
    }

    @Override
    public <T> Mono<T> submit(final Callable<T> task) {
        return executor.submit(task);
    }

    @PreDestroy
    public void shutdown() {
        executor.shutdown();
    }
}
