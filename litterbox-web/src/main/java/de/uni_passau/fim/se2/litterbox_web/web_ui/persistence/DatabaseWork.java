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

import reactor.core.publisher.Mono;

/**
 * Runs a blocking JDBC call somewhere other than the thread that asked for it.
 *
 * <p>
 * WebFlux subscribes a handler's {@code Mono} on a Netty event loop, and blocking one of those blocks every other
 * request it is carrying. Every repository in this package goes through here for that reason alone — see the package
 * documentation.
 *
 * <p>
 * An interface rather than the {@link BoundedDatabaseExecutor} class so that tests can run repositories inline instead
 * of standing up a thread pool.
 */
public interface DatabaseWork {

    /**
     * @param <T>  what the task produces
     * @param task the blocking call to run
     * @return the task's result, or an empty {@code Mono} if it returned {@code null}; an error signal if it threw or
     *         if there was no room for it
     */
    <T> Mono<T> submit(Callable<T> task);
}
