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

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.time.Duration;
import java.util.List;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.RejectedExecutionException;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicReference;

import org.junit.jupiter.api.Test;
import org.reactivestreams.Subscription;

import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import reactor.core.Disposable;
import reactor.core.publisher.BaseSubscriber;
import reactor.core.publisher.Mono;

/**
 * A pool being full and a task failing are different things, and both of them can arrive as a
 * {@link RejectedExecutionException}: the pool refuses with whatever its owner chose, and a task is free to throw one
 * of its own. Confusing the two reports a failed task as a capacity problem and counts it twice.
 */
class BoundedWorkExecutorTest {

    private static final Duration TIMEOUT = Duration.ofSeconds(5);

    private static final class TaskRejection extends RejectedExecutionException {

        private static final long serialVersionUID = 1L;
    }

    private static final class PoolFull extends RuntimeException {

        private static final long serialVersionUID = 1L;
    }

    @Test
    void keepsARejectedExecutionExceptionTheTaskItselfThrew() {
        final SimpleMeterRegistry metrics = new SimpleMeterRegistry();
        final BoundedWorkExecutor executor = BoundedWorkExecutor.bounded("task-threw", 1, 1, metrics, PoolFull::new);
        final TaskRejection thrown = new TaskRejection();

        try {
            assertThatThrownBy(() -> executor.submit(() -> {
                throw thrown;
            }).block(TIMEOUT))
                .as("the task's own exception is the answer, not a report that the pool is full")
                .isSameAs(thrown);

            assertThat(metrics.get("litterbox.task-threw.failures").counter().count()).isEqualTo(1);
            assertThat(metrics.find("litterbox.task-threw.rejections").counter())
                .as("nothing was refused: the task ran")
                .isNull();
        }
        finally {
            executor.shutdown();
        }
    }

    @Test
    void reportsAFullPoolAsTheConfiguredCapacityFailure() throws Exception {
        final SimpleMeterRegistry metrics = new SimpleMeterRegistry();
        final BoundedWorkExecutor executor = BoundedWorkExecutor.bounded("saturated", 1, 1, metrics, PoolFull::new);
        final CountDownLatch running = new CountDownLatch(1);
        final CountDownLatch release = new CountDownLatch(1);

        try {
            executor.submit(() -> {
                running.countDown();
                release.await();
                return "running";
            }).subscribe();
            assertThat(running.await(TIMEOUT.toSeconds(), TimeUnit.SECONDS)).isTrue();
            executor.submit(() -> "queued").subscribe();

            assertThatThrownBy(() -> executor.submit(() -> "refused").block(TIMEOUT))
                .isInstanceOf(PoolFull.class);

            assertThat(metrics.get("litterbox.saturated.rejections").counter().count()).isEqualTo(1);
            assertThat(metrics.find("litterbox.saturated.failures").counter())
                .as("a task that was never taken did not fail")
                .isNull();
        }
        finally {
            release.countDown();
            executor.shutdown();
        }
    }

    @Test
    void neverRunsATaskCancelledWhileItWasStillQueued() throws Exception {
        final SimpleMeterRegistry metrics = new SimpleMeterRegistry();
        final BoundedWorkExecutor executor = BoundedWorkExecutor.bounded("cancelled", 1, 4, metrics, PoolFull::new);
        final CountDownLatch running = new CountDownLatch(1);
        final CountDownLatch release = new CountDownLatch(1);
        final AtomicInteger queuedTaskRuns = new AtomicInteger();

        try {
            executor.submit(() -> {
                running.countDown();
                release.await();
                return "occupying the only thread";
            }).subscribe();
            assertThat(running.await(TIMEOUT.toSeconds(), TimeUnit.SECONDS)).isTrue();

            final var queued = executor.submit(queuedTaskRuns::incrementAndGet).subscribe();
            queued.dispose();
            release.countDown();
            // Anything still to be run has to pass through the one thread, so this arriving means the queue is empty.
            assertThat(executor.submit(() -> "afterwards").block(TIMEOUT)).isEqualTo("afterwards");

            assertThat(queuedTaskRuns.get())
                .as("a task cancelled before a thread reached it is never called")
                .isZero();
        }
        finally {
            release.countDown();
            executor.shutdown();
        }
    }

    /**
     * A subscriber is free to cancel from {@code onSubscribe}, which runs before the pool is ever asked for a thread.
     * Handing the task over anyway leaves an inert wrapper holding a place in a bounded queue that real work is waiting
     * for.
     */
    @Test
    void neverQueuesASubmissionCancelledBeforeItCouldBeHandedToThePool() throws Exception {
        final SimpleMeterRegistry metrics = new SimpleMeterRegistry();
        final BoundedWorkExecutor executor = BoundedWorkExecutor.bounded("cancel-race", 1, 1, metrics, PoolFull::new);
        final CountDownLatch running = new CountDownLatch(1);
        final CountDownLatch release = new CountDownLatch(1);
        final CountDownLatch realTaskRan = new CountDownLatch(1);
        final AtomicInteger cancelledTaskRuns = new AtomicInteger();
        final AtomicReference<Throwable> realTaskError = new AtomicReference<>();

        try {
            executor.submit(() -> {
                running.countDown();
                release.await();
                return "occupying the only thread";
            }).subscribe();
            assertThat(running.await(TIMEOUT.toSeconds(), TimeUnit.SECONDS)).isTrue();

            cancelWhileSubscribing(executor.submit(cancelledTaskRuns::incrementAndGet));

            assertThat(cancelledTaskRuns.get())
                .as("a submission given up before it was handed over is never called")
                .isZero();
            assertThat(metrics.get("litterbox.cancel-race.queue.depth").gauge().value())
                .as("and takes no place in the queue")
                .isZero();
            assertThat(metrics.find("litterbox.cancel-race.rejections").counter())
                .as("nothing was refused: the pool was never asked")
                .isNull();

            executor.submit(() -> {
                realTaskRan.countDown();
                return "real work";
            }).subscribe(ignored -> {
            }, realTaskError::set);
            release.countDown();

            assertThat(realTaskError.get())
                .as("the one queue slot was free, so real work was taken")
                .isNull();
            assertThat(realTaskRan.await(TIMEOUT.toSeconds(), TimeUnit.SECONDS)).isTrue();
        }
        finally {
            release.countDown();
            executor.shutdown();
        }
    }

    /**
     * The same cancellation, but arriving at a pool with nothing left to give. A caller that has already gone is not
     * owed a refusal, and counting one would report capacity trouble that no request suffered.
     */
    @Test
    void doesNotCountARefusalAgainstASubmissionThatWasAlreadyCancelled() throws Exception {
        final SimpleMeterRegistry metrics = new SimpleMeterRegistry();
        final BoundedWorkExecutor executor = BoundedWorkExecutor.bounded("cancel-full", 1, 1, metrics, PoolFull::new);
        final CountDownLatch running = new CountDownLatch(1);
        final CountDownLatch release = new CountDownLatch(1);
        final AtomicInteger cancelledTaskRuns = new AtomicInteger();
        final List<Throwable> uncaught = new CopyOnWriteArrayList<>();
        final Thread caller = Thread.currentThread();
        final Thread.UncaughtExceptionHandler previous = caller.getUncaughtExceptionHandler();
        caller.setUncaughtExceptionHandler((thread, error) -> uncaught.add(error));

        try {
            executor.submit(() -> {
                running.countDown();
                release.await();
                return "occupying the only thread";
            }).subscribe();
            assertThat(running.await(TIMEOUT.toSeconds(), TimeUnit.SECONDS)).isTrue();
            executor.submit(() -> "filling the only queue slot").subscribe();

            cancelWhileSubscribing(executor.submit(cancelledTaskRuns::incrementAndGet));

            assertThat(cancelledTaskRuns.get()).isZero();
            assertThat(metrics.find("litterbox.cancel-full.rejections").counter())
                .as("a caller that has gone is not turned away, so there is nothing to count")
                .isNull();
            assertThat(uncaught).isEmpty();
        }
        finally {
            caller.setUncaughtExceptionHandler(previous);
            release.countDown();
            executor.shutdown();
        }
    }

    /**
     * Subscribes and gives up at once, from inside {@code onSubscribe}, before the pool has been asked for anything.
     */
    private static <T> void cancelWhileSubscribing(final Mono<T> work) {
        work.subscribe(new BaseSubscriber<T>() {

            @Override
            protected void hookOnSubscribe(final Subscription subscription) {
                cancel();
            }
        });
    }

    /**
     * Saturation is an expected condition that callers are told about and handle. Reporting it a second time through
     * the thread's uncaught-exception handler turns every refused request under load into a stack trace in the log,
     * which is exactly when the log is least able to carry them.
     */
    @Test
    void doesNotAlsoReportAnExpectedRejectionAsAnUncaughtException() throws Exception {
        final SimpleMeterRegistry metrics = new SimpleMeterRegistry();
        final BoundedWorkExecutor executor = BoundedWorkExecutor.bounded("quiet", 1, 1, metrics, PoolFull::new);
        final CountDownLatch running = new CountDownLatch(1);
        final CountDownLatch release = new CountDownLatch(1);
        final List<Throwable> uncaught = new CopyOnWriteArrayList<>();
        // Only this thread's handler, so a test running beside this one is unaffected. The rejection is raised on
        // whichever thread subscribes, which is this one.
        final Thread caller = Thread.currentThread();
        final Thread.UncaughtExceptionHandler previous = caller.getUncaughtExceptionHandler();
        caller.setUncaughtExceptionHandler((thread, error) -> uncaught.add(error));

        try {
            executor.submit(() -> {
                running.countDown();
                release.await();
                return "running";
            }).subscribe();
            assertThat(running.await(TIMEOUT.toSeconds(), TimeUnit.SECONDS)).isTrue();
            executor.submit(() -> "queued").subscribe();

            assertThatThrownBy(() -> executor.submit(() -> "refused").block(TIMEOUT))
                .isInstanceOf(PoolFull.class);

            assertThat(uncaught)
                .as("a refusal the caller is told about is not also an uncaught exception")
                .isEmpty();
            assertThat(metrics.get("litterbox.quiet.rejections").counter().count()).isEqualTo(1);
        }
        finally {
            caller.setUncaughtExceptionHandler(previous);
            release.countDown();
            executor.shutdown();
        }
    }

    /**
     * A cancelled request must not take a statement already in flight down with it: interrupting a thread mid-query can
     * cost the connection.
     */
    @Test
    void leavesACallableAlreadyRunningAloneWhenItsSubscriptionIsCancelled() throws Exception {
        final BoundedWorkExecutor executor = BoundedWorkExecutor.bounded(
            "uninterrupted", 1, 1, new SimpleMeterRegistry(), PoolFull::new
        );
        final CountDownLatch running = new CountDownLatch(1);
        final CountDownLatch release = new CountDownLatch(1);
        final CountDownLatch finished = new CountDownLatch(1);
        final AtomicBoolean interrupted = new AtomicBoolean();

        try {
            final Disposable subscription = executor.submit(() -> {
                running.countDown();
                try {
                    release.await();
                }
                catch (InterruptedException interruption) {
                    interrupted.set(true);
                }
                // Reads and clears, so an interrupt raised outside the wait is caught too and the pool thread is not
                // left interrupted for whatever runs on it next.
                if (Thread.interrupted()) {
                    interrupted.set(true);
                }
                finished.countDown();
                return "ran to the end";
            }).subscribe();

            assertThat(running.await(TIMEOUT.toSeconds(), TimeUnit.SECONDS)).isTrue();
            // The callable is inside the wait, or about to enter it. Either way an interrupt raised here is seen: a
            // thread already waiting leaves it at once, and one not yet waiting finds the flag set when it arrives.
            subscription.dispose();
            release.countDown();

            assertThat(finished.await(TIMEOUT.toSeconds(), TimeUnit.SECONDS))
                .as("the callable finishes on its own terms")
                .isTrue();
            assertThat(interrupted.get())
                .as("a statement in flight is left to finish rather than being interrupted")
                .isFalse();
        }
        finally {
            release.countDown();
            executor.shutdown();
        }
    }

    @Test
    void refusesWithShutDownExceptionOnceAnUnboundedPoolHasStopped() {
        final BoundedWorkExecutor executor = BoundedWorkExecutor.unbounded(
            "stopped", 1, new SimpleMeterRegistry()
        );
        executor.shutdown();

        assertThatThrownBy(() -> executor.submit(() -> "too late").block(TIMEOUT))
            .isInstanceOf(BoundedWorkExecutor.ShutDownException.class);
    }

    @Test
    void doesNotDisguiseATaskRejectionAsAShutDown() {
        final BoundedWorkExecutor executor = BoundedWorkExecutor.unbounded(
            "still-running", 1, new SimpleMeterRegistry()
        );

        try {
            assertThatThrownBy(() -> executor.<String>submit(() -> {
                throw new TaskRejection();
            }).block(TIMEOUT))
                .as("a running pool never refused anything, so a caller must not read this as a shutdown")
                .isInstanceOf(TaskRejection.class)
                .isNotInstanceOf(BoundedWorkExecutor.ShutDownException.class);
        }
        finally {
            executor.shutdown();
        }
    }

    @Test
    void runsTheTaskOnlyWhenTheMonoIsSubscribedTo() {
        final BoundedWorkExecutor executor = BoundedWorkExecutor.bounded(
            "lazy", 1, 1, new SimpleMeterRegistry(), PoolFull::new
        );
        final AtomicInteger runs = new AtomicInteger();

        try {
            final Mono<Integer> work = executor.submit(runs::incrementAndGet);
            assertThat(runs.get()).isZero();

            assertThat(work.block(TIMEOUT)).isEqualTo(1);
            assertThat(work.block(TIMEOUT)).as("each subscription runs the task again").isEqualTo(2);
        }
        finally {
            executor.shutdown();
        }
    }
}
