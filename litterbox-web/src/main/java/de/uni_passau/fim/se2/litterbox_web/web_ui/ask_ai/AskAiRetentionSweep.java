/*
 * Copyright (C) 2024-2026 LitterBox-Web contributors
 *
 * This file is part of LitterBox-Web.
 * Licenced under the EUPL-1.2 or later.
 *
 * SPDX-FileCopyrightText: 2024-2026 LitterBox-Web contributors
 * SPDX-License-Identifier: EUPL-1.2
 */
package de.uni_passau.fim.se2.litterbox_web.web_ui.ask_ai;

import java.time.Clock;
import java.time.Instant;
import java.util.List;
import java.util.Objects;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.function.Supplier;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import de.uni_passau.fim.se2.litterbox_web.web_ui.persistence.AskAiConversationRepository;
import io.micrometer.core.instrument.MeterRegistry;
import reactor.core.publisher.Flux;
import reactor.core.publisher.Mono;

/** Expires conversations, reclaims abandoned turns, and deletes retained transcripts in bounded batches. */
@Component
public class AskAiRetentionSweep {

    private static final String SWEPT_COUNTER = "litterbox.ask.ai.swept";

    private static final Logger log = LoggerFactory.getLogger(AskAiRetentionSweep.class);

    private final AskAiConversationRepository repository;
    private final MeterRegistry metrics;
    private final AskAiConfigurationProperties.Sweep limits;
    private final Clock clock;
    private final AtomicBoolean sweeping = new AtomicBoolean();

    @Autowired
    public AskAiRetentionSweep(
        final AskAiConversationRepository repository,
        final MeterRegistry metrics,
        final AskAiConfigurationProperties configuration
    ) {
        this(repository, metrics, configuration.getSweep(), Clock.systemUTC());
    }

    AskAiRetentionSweep(
        final AskAiConversationRepository repository,
        final MeterRegistry metrics,
        final AskAiConfigurationProperties.Sweep limits,
        final Clock clock
    ) {
        this.repository = Objects.requireNonNull(repository, "repository");
        this.metrics = Objects.requireNonNull(metrics, "metrics");
        this.limits = Objects.requireNonNull(limits, "limits");
        this.clock = Objects.requireNonNull(clock, "clock");
    }

    /** Subscribes rather than blocks so the shared scheduler thread is free while the run is in flight. */
    @Scheduled(
        fixedDelayString = "${litterbox.ask-ai.sweep.interval-millis:900000}",
        initialDelayString = "${litterbox.ask-ai.sweep.initial-delay-millis:60000}"
    )
    public void sweep() {
        if (!sweeping.compareAndSet(false, true)) {
            return;
        }
        sweepOnce().doFinally(signal -> sweeping.set(false)).subscribe(
            ignored -> {
            },
            error -> log.warn("Ask AI retention sweep failed: {}", error.toString())
        );
    }

    /** Runs expiry, stale-turn recovery, and transcript deletion sequentially. */
    Mono<Void> sweepOnce() {
        final Instant now = clock.instant();
        final Instant stopBy = now.plus(limits.getMaxRun());
        final int batch = limits.getBatch();
        final Instant pendingCutoff = now.minus(limits.getPendingTurnTimeout());
        return drain("expired", "conversations", stopBy, () -> repository.closeExpired(now, batch))
            .then(drain("abandoned", "turns", stopBy, () -> repository.reclaimStalePendingTurns(pendingCutoff, batch)))
            .then(drain("retired", "conversations", stopBy, () -> repository.deletePastRetention(now, batch)));
    }

    /** Takes full batches until one comes back short, the batch limit is reached, or the run is out of time. */
    private Mono<Void> drain(
        final String deadline, final String swept, final Instant stopBy, final Supplier<Mono<Integer>> step
    ) {
        return Flux.range(1, limits.getMaxBatches())
            .concatMap(round -> step.get())
            .takeUntil(rows -> rows < limits.getBatch() || !clock.instant().isBefore(stopBy))
            .collectList()
            .doOnNext(rounds -> record(deadline, swept, rounds))
            .then();
    }

    private void record(final String deadline, final String swept, final List<Integer> rounds) {
        final int rows = rounds.stream().mapToInt(Integer::intValue).sum();
        if (rows > 0) {
            metrics.counter(SWEPT_COUNTER, "deadline", deadline).increment(rows);
            log.info("Ask AI retention sweep: {} {} {}", rows, swept, deadline);
        }
        if (!rounds.isEmpty() && rounds.getLast() >= limits.getBatch()) {
            log.warn(
                "Ask AI retention sweep hit its own limit while walking {} and left work behind; "
                    + "raise litterbox.ask-ai.sweep.batch or litterbox.ask-ai.sweep.max-batches",
                deadline
            );
        }
    }
}
