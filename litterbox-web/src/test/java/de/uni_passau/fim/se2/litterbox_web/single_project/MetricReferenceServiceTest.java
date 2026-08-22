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

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoMoreInteractions;
import static org.mockito.Mockito.when;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.util.List;

import org.junit.jupiter.api.Test;

import de.uni_passau.fim.se2.litterbox_web.persistence.MetricReferenceRepository;
import de.uni_passau.fim.se2.litterbox_web.persistence.MetricReferenceRepository.MetricDistribution;
import reactor.core.publisher.Mono;

class MetricReferenceServiceTest {

    private static final Instant START = Instant.parse("2026-08-09T10:00:00Z");

    @Test
    void reportsWhatEachMeasurementUsuallyComesToAndHowManyProjectsSaidSo() {
        final MetricReferenceRepository repository = mock(MetricReferenceRepository.class);
        when(repository.distributions(MetricReferenceService.MINIMUM_SAMPLE_SIZE)).thenReturn(
            Mono.just(List.of(new MetricDistribution("block_count", 512, 20.0, 90.0)))
        );

        final List<MetricReferenceService.MetricBand> bands = new MetricReferenceService(
            repository, Clock.fixed(START, ZoneOffset.UTC)
        ).bands().block();

        assertThat(bands).containsExactly(
            new MetricReferenceService.MetricBand("block_count", 512, 20.0, 90.0)
        );
    }

    @Test
    void answersFromTheCacheUntilItExpiresRatherThanRankingEveryMeasurementPerReader() {
        final MetricReferenceRepository repository = mock(MetricReferenceRepository.class);
        when(repository.distributions(anyInt())).thenReturn(
            Mono.just(List.of(new MetricDistribution("block_count", 512, 20.0, 90.0)))
        );
        final MutableClock clock = new MutableClock(START);
        final MetricReferenceService service = new MetricReferenceService(repository, clock);

        service.bands().block();
        clock.set(START.plus(MetricReferenceService.CACHE_TTL).minusSeconds(1));
        service.bands().block();
        verify(repository).distributions(MetricReferenceService.MINIMUM_SAMPLE_SIZE);
        verifyNoMoreInteractions(repository);

        clock.set(START.plus(MetricReferenceService.CACHE_TTL).plusSeconds(1));
        service.bands().block();
        verify(repository, times(2)).distributions(MetricReferenceService.MINIMUM_SAMPLE_SIZE);
    }

    @Test
    void offersNoComparisonRatherThanFailingWhenTheMeasurementsCannotBeRead() {
        final MetricReferenceRepository repository = mock(MetricReferenceRepository.class);
        when(repository.distributions(anyInt())).thenReturn(
            Mono.error(new IllegalStateException("synthetic database outage"))
        );

        assertThat(
            new MetricReferenceService(repository, Clock.fixed(START, ZoneOffset.UTC)).bands().block()
        ).isEmpty();
    }

    private static final class MutableClock extends Clock {

        private Instant now;

        private MutableClock(final Instant now) {
            this.now = now;
        }

        private void set(final Instant updated) {
            now = updated;
        }

        @Override
        public ZoneId getZone() {
            return ZoneOffset.UTC;
        }

        @Override
        public Clock withZone(final ZoneId zone) {
            return this;
        }

        @Override
        public Instant instant() {
            return now;
        }
    }
}
