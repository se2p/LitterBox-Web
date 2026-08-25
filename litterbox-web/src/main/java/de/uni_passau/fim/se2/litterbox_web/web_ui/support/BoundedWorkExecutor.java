/*
 * Copyright (C) 2024-2026 LitterBox-Web contributors
 *
 * This file is part of LitterBox-Web.
 * Licenced under the EUPL-1.2 or later.
 *
 * SPDX-FileCopyrightText: 2024-2026 LitterBox-Web contributors
 * SPDX-License-Identifier: EUPL-1.2
 */
package de.uni_passau.fim.se2.litterbox_web.web_ui.support;

import java.util.Objects;
import java.util.Queue;
import java.util.concurrent.ArrayBlockingQueue;
import java.util.concurrent.BlockingQueue;
import java.util.concurrent.Callable;
import java.util.concurrent.LinkedBlockingQueue;
import java.util.concurrent.RejectedExecutionException;
import java.util.concurrent.ThreadPoolExecutor;
import java.util.concurrent.TimeUnit;
import java.util.function.Supplier;

import io.micrometer.core.instrument.MeterRegistry;
import io.micrometer.core.instrument.Timer;
import reactor.core.publisher.Mono;
import reactor.core.publisher.MonoSink;

/**
 * A pool of threads that blocking work is handed to, bounded, measured, and shut down with the application.
 */
public final class BoundedWorkExecutor {

    private static final long SHUTDOWN_SECONDS = 5;

    private final ThreadPoolExecutor executor;
    private final MeterRegistry meterRegistry;
    private final String metricPrefix;
    private final Supplier<RuntimeException> whenFull;

    /**
     * A pool that refuses work once its queue is full.
     *
     * @param name          what this pool is called, in thread names and in the meters it publishes
     * @param threads       how many threads run at once
     * @param queueCapacity how much work may wait for one
     * @param whenFull      what a caller is told when neither a thread nor a place in the queue is free
     */
    public static BoundedWorkExecutor bounded(
        final String name,
        final int threads,
        final int queueCapacity,
        final MeterRegistry meterRegistry,
        final Supplier<RuntimeException> whenFull
    ) {
        if (queueCapacity < 1) {
            throw new IllegalArgumentException(name + " executor sizes must be positive");
        }
        return new BoundedWorkExecutor(
            name, threads, new ArrayBlockingQueue<>(queueCapacity), meterRegistry, whenFull
        );
    }

    /**
     * A pool for work that must not be refused, and so waits however long it has to.
     *
     * <p>
     * Unbounded only in the sense that it does not turn work away. What may be handed to it is bounded elsewhere — it
     * takes the undoing of work already begun, and there can be no more of that at once than there is work in flight.
     * Once shut down it refuses everything, which is the one case a caller still has to answer for.
     */
    public static BoundedWorkExecutor unbounded(
        final String name, final int threads, final MeterRegistry meterRegistry
    ) {
        return new BoundedWorkExecutor(
            name, threads, new LinkedBlockingQueue<>(), meterRegistry,
            () -> new RejectedExecutionException(name + " executor has shut down")
        );
    }

    private BoundedWorkExecutor(
        final String name,
        final int threads,
        final BlockingQueue<Runnable> queue,
        final MeterRegistry meterRegistry,
        final Supplier<RuntimeException> whenFull
    ) {
        Objects.requireNonNull(name, "name");
        if (threads < 1) {
            throw new IllegalArgumentException(name + " executor sizes must be positive");
        }
        this.meterRegistry = Objects.requireNonNull(meterRegistry, "meterRegistry");
        this.whenFull = Objects.requireNonNull(whenFull, "whenFull");
        metricPrefix = "litterbox." + name + ".";
        executor = new ThreadPoolExecutor(
            threads,
            threads,
            0L,
            TimeUnit.MILLISECONDS,
            queue,
            Thread.ofPlatform().name("litterbox-" + name + "-", 0).factory(),
            new ThreadPoolExecutor.AbortPolicy()
        );
        meterRegistry.gauge(metricPrefix + "queue.depth", executor.getQueue(), Queue::size);
        meterRegistry.gauge(metricPrefix + "active", executor, ThreadPoolExecutor::getActiveCount);
    }

    public <T> Mono<T> submit(final Callable<T> task) {
        Objects.requireNonNull(task, "task");
        return Mono.create(sink -> submitTask(sink, task));
    }

    private <T> void submitTask(final MonoSink<T> sink, final Callable<T> task) {
        try {
            executor.execute(() -> executeTask(sink, task));
        }
        catch (RejectedExecutionException exception) {
            meterRegistry.counter(metricPrefix + "rejections").increment();
            sink.error(whenFull.get());
        }
    }

    private <T> void executeTask(final MonoSink<T> sink, final Callable<T> task) {
        final Timer.Sample sample = Timer.start(meterRegistry);
        try {
            sink.success(task.call());
            meterRegistry.counter(metricPrefix + "completed").increment();
        }
        catch (Exception exception) {
            meterRegistry.counter(metricPrefix + "failures").increment();
            sink.error(exception);
        }
        finally {
            sample.stop(meterRegistry.timer(metricPrefix + "duration"));
        }
    }

    public void shutdown() {
        executor.shutdown();
        try {
            if (!executor.awaitTermination(SHUTDOWN_SECONDS, TimeUnit.SECONDS)) {
                executor.shutdownNow();
            }
        }
        catch (InterruptedException interrupted) {
            Thread.currentThread().interrupt();
            executor.shutdownNow();
        }
    }
}
