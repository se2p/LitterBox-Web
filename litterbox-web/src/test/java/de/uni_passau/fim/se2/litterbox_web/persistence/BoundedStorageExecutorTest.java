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

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Duration;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;

import org.junit.jupiter.api.Test;

import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import reactor.core.publisher.Mono;

/**
 * Storage work is bounded separately from database work, and this is what says the two bounds are separate. A store
 * that has stopped answering must exhaust its own pool and be reported as its own, rather than occupying the threads
 * that hold database connections and having unrelated queries refused for want of a database that is sitting idle.
 */
class BoundedStorageExecutorTest {

    @Test
    void runsBlockingWorkOnStorageThreadsRatherThanDatabaseOnes() {
        final BoundedStorageExecutor storage = new BoundedStorageExecutor(1, 1, new SimpleMeterRegistry());
        final BoundedDatabaseExecutor database = new BoundedDatabaseExecutor(1, 1, new SimpleMeterRegistry());

        try {
            final String storageThread = storage.submit(() -> Thread.currentThread().getName())
                .block(Duration.ofSeconds(2));
            final String databaseThread = database.submit(() -> Thread.currentThread().getName())
                .block(Duration.ofSeconds(2));

            assertThat(storageThread).startsWith("litterbox-storage-");
            assertThat(databaseThread).startsWith("litterbox-database-");
            assertThat(storageThread).isNotEqualTo(databaseThread);
        }
        finally {
            storage.shutdown();
            database.shutdown();
        }
    }

    @Test
    void rejectsWhenBoundedStoragePoolIsFullAndLeavesTheDatabasePoolAlone() throws Exception {
        final SimpleMeterRegistry metrics = new SimpleMeterRegistry();
        final BoundedStorageExecutor storage = new BoundedStorageExecutor(1, 1, metrics);
        final BoundedDatabaseExecutor database = new BoundedDatabaseExecutor(1, 1, metrics);
        final CountDownLatch started = new CountDownLatch(1);
        final CountDownLatch release = new CountDownLatch(1);
        try {
            storage.submit(() -> {
                started.countDown();
                release.await();
                return "running";
            }).subscribe();
            assertThat(started.await(2, TimeUnit.SECONDS)).isTrue();
            storage.submit(() -> "queued").subscribe();

            final String result = storage.submit(() -> "rejected")
                .onErrorResume(StorageCapacityExceededException.class, ignored -> Mono.just("busy"))
                .block(Duration.ofSeconds(2));

            assertThat(result).isEqualTo("busy");
            assertThat(metrics.get("litterbox.storage.rejections").counter().count()).isEqualTo(1);
            assertThat(metrics.find("litterbox.database.rejections").counter())
                .as("a store that cannot keep up is not the database running out of capacity")
                .isNull();
            assertThat(database.submit(() -> "answered").block(Duration.ofSeconds(2))).isEqualTo("answered");
        }
        finally {
            release.countDown();
            storage.shutdown();
            database.shutdown();
        }
        assertThat(metrics.get("litterbox.storage.duration").timer().count()).isEqualTo(2);
    }

    /**
     * Cleanup cannot be shed the way work can. A request refused for want of storage capacity never happened; a
     * deletion refused is a file left on the disk with nothing that will ever come back for it — and it is refused
     * exactly when the store is slow, which is when it matters most. Falling back to doing it here instead put
     * filesystem work on whichever thread finished the request, which is a database thread as often as not, and gave
     * back the coupling the separate pool was made to remove.
     */
    @Test
    void deletesStagedBytesOnItsOwnThreadEvenWhileTheStoragePoolIsFull() throws Exception {
        final SimpleMeterRegistry metrics = new SimpleMeterRegistry();
        final BoundedStorageExecutor storage = new BoundedStorageExecutor(1, 1, metrics);
        final CountDownLatch started = new CountDownLatch(1);
        final CountDownLatch release = new CountDownLatch(1);
        final java.util.concurrent.atomic.AtomicReference<String> deletedOn = new java.util.concurrent.atomic.AtomicReference<>();
        try {
            storage.submit(() -> {
                started.countDown();
                release.await();
                return "running";
            }).subscribe();
            assertThat(started.await(2, TimeUnit.SECONDS)).isTrue();
            storage.submit(() -> "queued").subscribe();
            // Nothing more will be taken by the working pool now.
            assertThat(
                storage.submit(() -> "rejected")
                    .onErrorResume(StorageCapacityExceededException.class, ignored -> Mono.just("busy"))
                    .block(Duration.ofSeconds(2))
            ).isEqualTo("busy");

            storage.submitCleanup(() -> deletedOn.set(Thread.currentThread().getName()))
                .block(Duration.ofSeconds(2));

            assertThat(deletedOn.get())
                .as("a deletion is neither refused nor handed back to the thread that asked for it")
                .startsWith("litterbox-storage-cleanup-");
            assertThat(deletedOn.get()).isNotEqualTo(Thread.currentThread().getName());
        }
        finally {
            release.countDown();
            storage.shutdown();
        }
    }
}
