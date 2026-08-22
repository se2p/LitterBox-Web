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

import java.util.Objects;
import java.util.concurrent.Callable;
import java.util.concurrent.RejectedExecutionException;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import de.uni_passau.fim.se2.litterbox_web.shared.BoundedWorkExecutor;
import io.micrometer.core.instrument.MeterRegistry;
import jakarta.annotation.PreDestroy;
import reactor.core.publisher.Mono;

/** Isolates blocking artifact-store work from the event loop, the analysis workers and the database pool. */
@Component
public final class BoundedStorageExecutor implements StorageWork {

    private final BoundedWorkExecutor executor;
    private final BoundedWorkExecutor cleanup;

    public BoundedStorageExecutor(
        @Value("${litterbox.execution.storage-threads:4}") final int threads,
        @Value("${litterbox.execution.storage-queue-capacity:64}") final int queueCapacity,
        final MeterRegistry meterRegistry
    ) {
        executor = BoundedWorkExecutor.bounded(
            "storage", threads, queueCapacity, meterRegistry, StorageCapacityExceededException::new
        );
        cleanup = BoundedWorkExecutor.unbounded("storage-cleanup", 1, meterRegistry);
    }

    @Override
    public <T> Mono<T> submit(final Callable<T> task) {
        return executor.submit(task);
    }

    /**
     * {@inheritDoc}
     *
     * <p>
     * One thread, and a queue that fills rather than refuses. A pool that has shut down refuses even this, and then it
     * is done on the calling thread — the application is going away, and the alternative is leaving the file behind for
     * good.
     */
    @Override
    public Mono<Void> submitCleanup(final Runnable task) {
        Objects.requireNonNull(task, "task");
        return cleanup.<Void>submit(() -> {
            task.run();
            return null;
        }).onErrorResume(RejectedExecutionException.class, goingAway -> Mono.fromRunnable(task));
    }

    @PreDestroy
    public void shutdown() {
        executor.shutdown();
        cleanup.shutdown();
    }
}
