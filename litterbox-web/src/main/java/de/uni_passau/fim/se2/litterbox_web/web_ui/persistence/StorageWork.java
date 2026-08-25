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
 * Blocking work against the artifact store: reading a request's bytes aside, hashing them, and moving them into place.
 *
 * <p>
 * Separate from {@link DatabaseWork} because it bounds a different resource. The database pool is sized against the
 * connections the database will hold open; when file copying ran through it, a handful of large concurrent uploads
 * could fill it and have unrelated queries refused for want of database capacity while the database itself sat idle.
 */
public interface StorageWork {

    <T> Mono<T> submit(Callable<T> task);

    /**
     * Deletes a file that was read aside and then not kept, on a thread of the store's own. Never refuses work.
     *
     * <p>
     * Cleanup cannot be shed the way new work can. A request refused for want of storage capacity simply did not
     * happen, but a refused deletion is a file left on disk that nothing will ever come back for — and a slow store is
     * exactly when that starts to matter. Running it on whichever thread finished the request is what this separate
     * pool avoids: that thread is often a database one, and then a store that has stopped answering occupies database
     * capacity after all.
     *
     * <p>
     * Its queue only ever holds work that is already accounted for: one deletion per request in flight, and requests in
     * flight are bounded elsewhere.
     *
     * @param task A clean-up task to be submitted to the worker pool.
     * @return The task result.
     */
    Mono<Void> submitCleanup(Runnable task);
}
