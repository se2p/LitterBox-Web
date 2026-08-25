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

import java.util.concurrent.Callable;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import de.uni_passau.fim.se2.litterbox_web.shared.BoundedWorkExecutor;
import io.micrometer.core.instrument.MeterRegistry;
import jakarta.annotation.PreDestroy;
import reactor.core.publisher.Mono;

/**
 * Isolates the blocking JPA work the application does from both the event loop and the analysis workers.
 *
 * <p>
 * Bounded against what the database will hold open, and so carrying only work that occupies a connection. Reading and
 * writing the artifact store has its own bound in {@link BoundedStorageExecutor}.
 */
// todo: remove? see comments in package-info.java
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
