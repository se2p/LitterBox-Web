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

import java.io.Serial;
import java.util.Objects;
import java.util.Queue;
import java.util.concurrent.ArrayBlockingQueue;
import java.util.concurrent.BlockingQueue;
import java.util.concurrent.Callable;
import java.util.concurrent.LinkedBlockingQueue;
import java.util.concurrent.RejectedExecutionException;
import java.util.concurrent.ThreadPoolExecutor;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.function.Supplier;

import io.micrometer.core.instrument.MeterRegistry;
import io.micrometer.core.instrument.Timer;
import reactor.core.Disposable;
import reactor.core.Exceptions;
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
     * Once shut down it refuses everything with {@link ShutDownException}, which is the one case a caller still has to
     * answer for.
     *
     * @param name          what this pool is called, in thread names and in the meters it publishes
     * @param threads       how many threads run at once
     * @param meterRegistry where this pool's meters are published
     * @return a pool that queues without limit until it is shut down
     */
    public static BoundedWorkExecutor unbounded(
        final String name, final int threads, final MeterRegistry meterRegistry
    ) {
        return new BoundedWorkExecutor(
            name, threads, new LinkedBlockingQueue<>(), meterRegistry, () -> new ShutDownException(name)
        );
    }

    /**
     * What an {@link #unbounded} pool refuses with once it has been shut down.
     *
     * <p>
     * A type of its own so that a caller falling back to doing the work itself can tell this apart from a
     * {@link RejectedExecutionException} its own task threw, which is not a reason to run that task again.
     */
    public static final class ShutDownException extends RejectedExecutionException {

        @Serial
        private static final long serialVersionUID = 1L;

        ShutDownException(final String name) {
            super(name + " executor has shut down");
        }
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

    /**
     * Runs the task on this pool.
     *
     * <p>
     * Nothing happens until the returned {@code Mono} is subscribed to, and every subscription runs the task again.
     * Cancelling before a thread has taken the task means it is never called and its place in the queue is given back;
     * cancelling after it has begun lets it finish, because interrupting a statement in flight can cost the connection.
     *
     * <p>
     * The pool is handed the task directly rather than through a Reactor {@code Scheduler}. A scheduler reports a
     * refusal to the thread's uncaught-exception handler on its way out, and a full pool is an expected answer here
     * that the caller is already told about — one stack trace per refused request, precisely when there are most of
     * them, is not worth the shorter method.
     *
     * @param <T>  what the task produces
     * @param task the blocking call to run
     * @return the task's result, an empty {@code Mono} if it returned {@code null}, or an error signal carrying either
     *         what the task threw or what this pool throws when full
     */
    public <T> Mono<T> submit(final Callable<T> task) {
        Objects.requireNonNull(task, "task");
        return Mono.create(sink -> hand(sink, task));
    }

    /**
     * Hands one submission to the pool, or does not, depending on when the subscriber gave up.
     *
     * <p>
     * A subscriber may cancel from {@code onSubscribe}, which runs before this does, so the task can already be claimed
     * by the time it would be handed over. Cancellation and the handover are ordered against each other in three
     * places: before submitting, so an abandoned task is never queued at all; after submitting, in case cancellation
     * arrived while the task was going in; and in {@link PendingTask#dispose()} itself, which covers cancellation
     * arriving after that. Between them no interleaving leaves a task sitting in the queue that nothing will ever want.
     */
    private <T> void hand(final MonoSink<T> sink, final Callable<T> task) {
        final PendingTask<T> pending = new PendingTask<>(sink, task);
        sink.onCancel(pending);
        if (pending.isDisposed()) {
            return;
        }
        try {
            executor.execute(pending);
            // Claimed since the check above: either cancelled, or already taken by a worker. Removing is worth trying
            // for the first and harmless for the second, which is no longer in the queue to be found.
            if (pending.isDisposed()) {
                executor.remove(pending);
            }
        }
        catch (RejectedExecutionException refused) {
            // Nothing ran, so being claimed here can only mean cancelled, and a caller that has gone is neither told
            // the pool was full nor counted as having been turned away. Answered rather than rethrown otherwise, so
            // nothing else hears about a refusal the caller has been given.
            if (!pending.isDisposed()) {
                sink.error(rejected());
            }
        }
    }

    /**
     * One submission, and the claim that decides between running it and cancelling it.
     *
     * <p>
     * Whichever of {@link #run()} and {@link #dispose()} claims it first settles the matter: a task cancelled while it
     * was still queued is never called, and one already running is never disturbed.
     */
    private final class PendingTask<T> implements Runnable, Disposable {

        private final AtomicBoolean claimed = new AtomicBoolean();
        private final MonoSink<T> sink;
        private final Callable<T> task;

        private PendingTask(final MonoSink<T> sink, final Callable<T> task) {
            this.sink = sink;
            this.task = task;
        }

        @Override
        public void run() {
            if (!claimed.compareAndSet(false, true)) {
                return;
            }
            try {
                sink.success(measured(task));
            }
            catch (Throwable failure) {
                Exceptions.throwIfFatal(failure);
                sink.error(failure);
            }
        }

        @Override
        public void dispose() {
            if (claimed.compareAndSet(false, true)) {
                // Nothing has run it, so the place it is holding in a bounded queue is worth giving back now.
                executor.remove(this);
            }
        }

        @Override
        public boolean isDisposed() {
            return claimed.get();
        }
    }

    private <T> T measured(final Callable<T> task) throws Exception {
        final Timer.Sample sample = Timer.start(meterRegistry);
        try {
            final T result = task.call();
            meterRegistry.counter(metricPrefix + "completed").increment();
            return result;
        }
        catch (Exception failure) {
            meterRegistry.counter(metricPrefix + "failures").increment();
            throw failure;
        }
        finally {
            sample.stop(meterRegistry.timer(metricPrefix + "duration"));
        }
    }

    private RuntimeException rejected() {
        meterRegistry.counter(metricPrefix + "rejections").increment();
        return whenFull.get();
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
