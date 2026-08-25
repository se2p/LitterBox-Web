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

import java.util.concurrent.Callable;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import de.uni_passau.fim.se2.litterbox_web.web_ui.support.BoundedWorkExecutor;
import io.micrometer.core.instrument.MeterRegistry;
import jakarta.annotation.PreDestroy;
import reactor.core.publisher.Mono;

/**
 * The pool the repositories in this package run their blocking JDBC calls on.
 *
 * <p>
 * Sized against the JDBC connection pool rather than the machine, because every task here occupies a connection for as
 * long as it runs and queueing beyond that only waits for one. Reading and writing the artifact store blocks on a disk
 * instead and has its own pool in {@link BoundedStorageExecutor}.
 */
@Component
public final class BoundedDatabaseExecutor implements DatabaseWork {

    private final BoundedWorkExecutor executor;

    public BoundedDatabaseExecutor(
        @Value("${litterbox.execution.database-threads:8}") final int threads,
        @Value("${litterbox.execution.database-queue-capacity:64}") final int queueCapacity,
        final MeterRegistry meterRegistry
    ) {
        executor = BoundedWorkExecutor.bounded(
            "database", threads, queueCapacity, meterRegistry, DatabaseCapacityExceededException::new
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
