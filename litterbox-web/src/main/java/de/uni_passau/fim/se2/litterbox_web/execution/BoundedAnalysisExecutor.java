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

import java.util.concurrent.Callable;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import de.uni_passau.fim.se2.litterbox_web.shared.BoundedWorkExecutor;
import io.micrometer.core.instrument.MeterRegistry;
import jakarta.annotation.PreDestroy;
import reactor.core.publisher.Mono;

/**
 * CPU-bound admission boundary. Work is never handed to Reactor's global scheduler.
 *
 * <p>
 * Bounded against the processors there are, and so carrying only work that occupies one. A queue deeper than the
 * machine can work through is a queue of requests nobody is waiting on any more, which is why a full one is refused
 * rather than lengthened.
 */
@Component
public final class BoundedAnalysisExecutor implements AnalysisWork {

    private final BoundedWorkExecutor executor;

    public BoundedAnalysisExecutor(
        @Value(
            "${litterbox.execution.analysis-threads:#{T(java.lang.Runtime).getRuntime().availableProcessors()}}"
        ) final int threads,
        @Value("${litterbox.execution.analysis-queue-capacity:32}") final int queueCapacity,
        final MeterRegistry meterRegistry
    ) {
        executor = BoundedWorkExecutor.bounded(
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
