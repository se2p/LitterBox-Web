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
import java.util.concurrent.SynchronousQueue;
import java.util.concurrent.ThreadPoolExecutor;
import java.util.concurrent.TimeUnit;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import jakarta.annotation.PreDestroy;
import reactor.core.publisher.Mono;
import reactor.core.scheduler.Scheduler;
import reactor.core.scheduler.Schedulers;

/**
 * The pool the repositories in this package run their blocking JDBC calls on.
 */
@Component
public final class DatabaseExecutor implements DatabaseWork {

    private final Scheduler executor;

    public DatabaseExecutor(@Value("${spring.datasource.hikari.maximum-pool-size:8}") final int threads) {
        executor = Schedulers.fromExecutor(
            new ThreadPoolExecutor(
                threads,
                threads,
                0L,
                TimeUnit.SECONDS,
                new SynchronousQueue<>(),
                Thread.ofPlatform().name("lb-db-").factory(),
                new ThreadPoolExecutor.AbortPolicy()
            )
        );
    }

    @Override
    public <T> Mono<T> submit(final Callable<T> task) {
        return Mono.fromCallable(task).subscribeOn(executor);
    }

    @PreDestroy
    public void shutdown() {
        executor.dispose();
    }
}
