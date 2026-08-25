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

import java.util.Objects;
import java.util.concurrent.Callable;
import java.util.concurrent.RejectedExecutionException;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import de.uni_passau.fim.se2.litterbox_web.web_ui.support.LitterboxThreadPool;
import io.micrometer.core.instrument.MeterRegistry;
import jakarta.annotation.PreDestroy;
import reactor.core.publisher.Mono;

/** Isolates blocking artifact-store work from the event loop, the analysis workers and the database pool. */
@Component
public final class StorageExecutor implements StorageWork {

    private final LitterboxThreadPool executor;
    private final LitterboxThreadPool cleanup;

    public StorageExecutor(
        @Value("${litterbox.execution.storage-threads:4}") final int threads,
        @Value("${litterbox.execution.storage-queue-capacity:64}") final int queueCapacity,
        final MeterRegistry meterRegistry
    ) {
        executor = LitterboxThreadPool.bounded(
            "storage", threads, queueCapacity, meterRegistry, StorageCapacityExceededException::new
        );
        cleanup = LitterboxThreadPool.unbounded("storage-cleanup", 1, meterRegistry);
    }

    @Override
    public <T> Mono<T> submit(final Callable<T> task) {
        return executor.submit(task);
    }

    /**
     * {@inheritDoc}
     *
     * <p>
     * One thread, behind a queue that grows rather than refusing work. A pool that has already shut down refuses even
     * this, and the deletion then runs on the calling thread: the application is going away, and the alternative is
     * leaving the file on disk for good.
     *
     * <p>
     * Only that one refusal is retried, which is why it has a type of its own. A deletion that failed by throwing
     * {@link RejectedExecutionException} itself has already run, and running it again would be doing the work twice
     * rather than doing it at all.
     */
    @Override
    public Mono<Void> submitCleanup(final Runnable task) {
        Objects.requireNonNull(task, "task");
        return cleanup.<Void>submit(() -> {
            task.run();
            return null;
        }).onErrorResume(LitterboxThreadPool.ShutDownException.class, goingAway -> Mono.fromRunnable(task));
    }

    @PreDestroy
    public void shutdown() {
        executor.shutdown();
        cleanup.shutdown();
    }
}
