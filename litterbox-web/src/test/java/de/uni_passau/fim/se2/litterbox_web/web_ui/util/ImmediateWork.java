/*
 * Copyright (C) 2024-2026 LitterBox-Web contributors
 *
 * This file is part of LitterBox-Web.
 * Licenced under the EUPL-1.2 or later.
 *
 * SPDX-FileCopyrightText: 2024-2026 LitterBox-Web contributors
 * SPDX-License-Identifier: EUPL-1.2
 */
package de.uni_passau.fim.se2.litterbox_web.web_ui.util;

import java.util.concurrent.Callable;

import de.uni_passau.fim.se2.litterbox_web.web_ui.persistence.DatabaseWork;
import de.uni_passau.fim.se2.litterbox_web.web_ui.persistence.StorageWork;
import reactor.core.publisher.Mono;

/**
 * Runs the work a repository hands off on whichever thread asked for it.
 *
 * <p>
 * A test wants the bounded pools out of the way, not modelled: what it is asking about is the writing, and a pool in
 * between only decides which thread the writing happens on. The work still runs when the returned {@code Mono} is
 * subscribed to and not before, which is what the real executors do and what a repository is written against.
 */
public final class ImmediateWork {

    private ImmediateWork() {
    }

    /** Database work, run where it was submitted. */
    public static DatabaseWork database() {
        return new DatabaseWork() {

            @Override
            public <T> Mono<T> submit(final Callable<T> task) {
                return Mono.fromCallable(task);
            }
        };
    }

    /** Storage work, run where it was submitted, cleanup included. */
    public static StorageWork storage() {
        return new StorageWork() {

            @Override
            public <T> Mono<T> submit(final Callable<T> task) {
                return Mono.fromCallable(task);
            }

            @Override
            public Mono<Void> submitCleanup(final Runnable task) {
                return Mono.fromRunnable(task);
            }
        };
    }
}
