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
 * Separate from {@link DatabaseWork} because it is a separate resource. Both are bounded, and what each bound is for
 * differs: the database pool is sized against the connections the database will hold open, and running file copying
 * through it meant a handful of large concurrent uploads could fill it and have unrelated queries refused for want of
 * database capacity while the database itself sat idle.
 */
public interface StorageWork {

    <T> Mono<T> submit(Callable<T> task);

    /**
     * Undoes something the store has already done — deleting a file read aside and then not kept — on a thread of the
     * store's own, and refuses nothing.
     *
     * <p>
     * Cleanup cannot be shed the way work can. A request refused for want of storage capacity is a request that did not
     * happen; a deletion refused is a file left on the disk with nothing that will ever come back for it, and the store
     * being slow is exactly when that starts to matter. Running it on whichever thread happened to finish the request
     * instead is what the separate pool exists to prevent: that thread is as often as not a database one, and then a
     * store that has stopped answering occupies the database's capacity after all.
     *
     * <p>
     * So this has capacity of its own that fills only with work already accounted for — one deletion per request in
     * flight, and requests in flight are bounded elsewhere.
     */
    Mono<Void> submitCleanup(Runnable task);
}
