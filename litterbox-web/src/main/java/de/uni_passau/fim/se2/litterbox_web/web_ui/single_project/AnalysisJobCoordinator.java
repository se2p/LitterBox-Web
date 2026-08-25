/*
 * Copyright (C) 2024-2026 LitterBox-Web contributors
 *
 * This file is part of LitterBox-Web.
 * Licenced under the EUPL-1.2 or later.
 *
 * SPDX-FileCopyrightText: 2024-2026 LitterBox-Web contributors
 * SPDX-License-Identifier: EUPL-1.2
 */
package de.uni_passau.fim.se2.litterbox_web.web_ui.single_project;

import java.time.Duration;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicInteger;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Profile;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import de.uni_passau.fim.se2.litterbox_web.web_ui.persistence.AnalysisJobRepository;
import de.uni_passau.fim.se2.litterbox_web.web_ui.support.WebUiProfiles;
import io.micrometer.core.instrument.MeterRegistry;
import io.micrometer.core.instrument.Timer;
import reactor.core.publisher.Flux;
import reactor.core.publisher.Mono;

@Component
@Profile(WebUiProfiles.PUBLIC_WEB)
@ConditionalOnProperty(
    prefix = "litterbox.jobs",
    name = "enabled",
    havingValue = "true"
)
public class AnalysisJobCoordinator {

    private static final String KIND_TAG = "kind";

    private final AnalysisJobRepository jobs;
    private final SingleProjectApplicationService runner;
    private final Duration leaseDuration;
    private final String workerId = UUID.randomUUID().toString();
    private final AtomicInteger inFlight = new AtomicInteger();
    private final AtomicBoolean reaping = new AtomicBoolean();
    private final int maximumInFlight;
    private final Duration retention;
    private final MeterRegistry metrics;

    public AnalysisJobCoordinator(
        final AnalysisJobRepository jobs,
        final SingleProjectApplicationService runner,
        @Value("${litterbox.jobs.lease-seconds:60}") final long leaseSeconds,
        @Value("${litterbox.jobs.max-in-flight:8}") final int maximumInFlight,
        @Value("${litterbox.jobs.retention-hours:168}") final long retentionHours,
        final MeterRegistry metrics
    ) {
        this.jobs = jobs;
        this.runner = runner;
        leaseDuration = Duration.ofSeconds(leaseSeconds);
        if (maximumInFlight < 1 || leaseSeconds < 1 || retentionHours < 1) {
            throw new IllegalArgumentException("Job limits and durations must be positive");
        }
        this.maximumInFlight = maximumInFlight;
        retention = Duration.ofHours(retentionHours);
        this.metrics = metrics;
        metrics.gauge("litterbox.jobs.in.flight", inFlight, AtomicInteger::get);
    }

    @Scheduled(fixedDelayString = "${litterbox.jobs.poll-millis:250}")
    public void dispatch() {
        if (!tryAcquire()) {
            return;
        }
        claimAndRun().doFinally(ignored -> inFlight.decrementAndGet()).subscribe(ignored -> {
        }, error -> {
            metrics.counter("litterbox.jobs.coordinator.errors").increment();
        });
    }

    /**
     * Claiming does not notice jobs that were cancelled while unheld or that ran out of attempts, because it looks only
     * for work it could run. Something still has to say what became of them, and this is it.
     */
    @Scheduled(fixedDelayString = "${litterbox.jobs.reap-millis:15000}")
    public void reap() {
        if (!reaping.compareAndSet(false, true)) {
            return;
        }
        jobs.reapAbandonedJobs().doFinally(ignored -> reaping.set(false)).subscribe(
            settled -> metrics.counter("litterbox.jobs.reaped").increment(settled),
            error -> metrics.counter("litterbox.jobs.reap.errors").increment()
        );
    }

    @Scheduled(fixedDelayString = "${litterbox.jobs.cleanup-millis:3600000}")
    public void cleanup() {
        jobs.deleteTerminalJobsOlderThan(retention).subscribe(
            removed -> metrics.counter("litterbox.jobs.removed").increment(removed),
            error -> metrics.counter("litterbox.jobs.cleanup.errors").increment()
        );
    }

    private Mono<Void> claimAndRun() {
        return jobs.claimNext(workerId, leaseDuration)
            .doOnNext(
                job -> {
                    metrics.counter("litterbox.jobs.claimed", KIND_TAG, job.kind()).increment();
                    if (job.reclaimed()) {
                        metrics.counter("litterbox.jobs.recovered", KIND_TAG, job.kind()).increment();
                    }
                }
            )
            .flatMap(this::runWithLease)
            .then();
    }

    private Mono<Void> runWithLease(final AnalysisJobRepository.Job job) {
        final Timer.Sample duration = Timer.start(metrics);
        final Mono<Boolean> outcome = runner.runJob(job, job.leaseToken())
            .doOnNext(
                failed -> metrics.counter(
                    failed ? "litterbox.jobs.failures" : "litterbox.jobs.completed", KIND_TAG, job.kind()
                ).increment()
            )
            .cache();
        final Duration renewalPeriod = leaseDuration.dividedBy(3);
        final Mono<Void> renewals = Flux.interval(renewalPeriod.isZero() ? Duration.ofSeconds(1) : renewalPeriod)
            .concatMap(ignored -> jobs.renew(job.id(), job.leaseToken(), leaseDuration))
            .handle((renewed, sink) -> {
                if (!renewed) {
                    sink.error(new AnalysisJobRepository.LeaseLostException());
                }
            })
            .takeUntilOther(outcome)
            .then();
        return Mono.when(outcome.then(), renewals)
            .then(outcome.flatMap(failed -> jobs.finish(job.id(), job.leaseToken(), failed)))
            .onErrorResume(
                AnalysisJobRepository.LeaseLostException.class,
                error -> {
                    metrics.counter("litterbox.jobs.lease.loss", KIND_TAG, job.kind()).increment();
                    return Mono.empty();
                }
            )
            .onErrorResume(
                error -> {
                    metrics.counter("litterbox.jobs.execution.errors", KIND_TAG, job.kind()).increment();
                    return jobs.retryAfterError(job.id(), job.leaseToken()).doOnNext(
                        retried -> metrics.counter(
                            retried ? "litterbox.jobs.retried" : "litterbox.jobs.retry.exhausted", KIND_TAG, job.kind()
                        ).increment()
                    ).then();
                }
            )
            .doFinally(ignored -> duration.stop(metrics.timer("litterbox.jobs.duration", KIND_TAG, job.kind())));
    }

    private boolean tryAcquire() {
        while (true) {
            final int current = inFlight.get();
            if (current >= maximumInFlight) {
                return false;
            }
            if (inFlight.compareAndSet(current, current + 1)) {
                metrics.counter("litterbox.jobs.in.flight.admitted").increment();
                return true;
            }
        }
    }
}
