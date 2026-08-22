/*
 * Copyright (C) 2024-2026 LitterBox-Web contributors
 *
 * This file is part of LitterBox-Web.
 * Licenced under the EUPL-1.2 or later.
 *
 * SPDX-FileCopyrightText: 2024-2026 LitterBox-Web contributors
 * SPDX-License-Identifier: EUPL-1.2
 */
package de.uni_passau.fim.se2.litterbox_web.single_project;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Objects;
import java.util.concurrent.atomic.AtomicReference;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import de.uni_passau.fim.se2.litterbox_web.persistence.MetricReferenceRepository;
import reactor.core.publisher.Mono;

/**
 * What the measurements of an analysed project usually come to here. A count on a result page means nothing to someone
 * who has never seen another project's counts, and this is what lets the page say whether forty blocks is a lot rather
 * than leaving a child to guess.
 */
@Service
public class MetricReferenceService {

    /**
     * Below this many projects the terciles describe whoever happened to submit something rather than anything worth
     * calling usual, and a comparison drawn from a handful of projects would be a confident-sounding guess.
     */
    public static final int MINIMUM_SAMPLE_SIZE = 20;

    /**
     * The answer moves by one project at a time and is read once per result page. Recomputing it per reader would rank
     * every stored measurement to tell the next child what it told the last one.
     */
    public static final Duration CACHE_TTL = Duration.ofMinutes(10);

    private final MetricReferenceRepository repository;
    private final Clock clock;
    private final AtomicReference<CachedBands> cache = new AtomicReference<>();

    @Autowired
    public MetricReferenceService(final MetricReferenceRepository repository) {
        this(repository, Clock.systemUTC());
    }

    MetricReferenceService(final MetricReferenceRepository repository, final Clock clock) {
        this.repository = Objects.requireNonNull(repository, "repository");
        this.clock = Objects.requireNonNull(clock, "clock");
    }

    public Mono<List<MetricBand>> bands() {
        final Instant now = clock.instant();
        final CachedBands cached = cache.get();
        if (cached != null && cached.expiresAt().isAfter(now)) {
            return Mono.just(cached.bands());
        }
        return repository.distributions(MINIMUM_SAMPLE_SIZE)
            .map(
                distributions -> distributions.stream()
                    .map(
                        distribution -> new MetricBand(
                            distribution.name(), distribution.sampleSize(),
                            distribution.lowerBound(), distribution.upperBound()
                        )
                    )
                    .toList()
            )
            // A deployment whose database is briefly unreachable should lose the comparison, not the result page
            // that carries it; the reader still gets every number, just without a word for it.
            .onErrorReturn(List.of())
            .doOnNext(bands -> cache.set(new CachedBands(bands, now.plus(CACHE_TTL))));
    }

    /**
     * @param sampleSize how many completed analyses the bounds were taken from, so a reader can be told what the
     *                   comparison is against rather than being asked to trust the word "usual"
     * @param lowerBound the value a third of those projects come under
     * @param upperBound the value two thirds of them come under
     */
    public record MetricBand(String name, long sampleSize, double lowerBound, double upperBound) {

        public MetricBand {
            Objects.requireNonNull(name, "name");
        }
    }

    private record CachedBands(List<MetricBand> bands, Instant expiresAt) {
    }
}
