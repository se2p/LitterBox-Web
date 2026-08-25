/*
 * Copyright (C) 2024-2026 LitterBox-Web contributors
 *
 * This file is part of LitterBox-Web.
 * Licenced under the EUPL-1.2 or later.
 *
 * SPDX-FileCopyrightText: 2024-2026 LitterBox-Web contributors
 * SPDX-License-Identifier: EUPL-1.2
 */
package de.uni_passau.fim.se2.litterbox_web.web_ui.statistics;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.stream.IntStream;

import org.junit.jupiter.api.Test;

import de.uni_passau.fim.se2.litterbox_web.web_ui.catalogue.PatternCatalogueService;
import de.uni_passau.fim.se2.litterbox_web.web_ui.persistence.DatabaseWork;
import reactor.core.publisher.Mono;

class PublicStatisticsServiceTest {

    private static final Instant NOW = Instant.parse("2026-08-14T12:00:00Z");

    @Test
    void suppressesEveryCountBelowTheConfiguredPublicMinimum() {
        final StatisticsRepository repository = mock(StatisticsRepository.class);
        when(repository.snapshot()).thenReturn(snapshot(49));

        final var result = service(repository, 50).statistics(Locale.ENGLISH).block();

        assertThat(result.available()).isFalse();
        assertThat(result.totals()).isNull();
        assertThat(result.distributions()).isEmpty();
        assertThat(result.findingGroups()).isEmpty();
        assertThat(result.blockCategories()).isEmpty();
        assertThat(result.generatedAt()).isEqualTo(Instant.EPOCH);
    }

    @Test
    void cachesTheSnapshotAndCompleteLocalizedResponse() {
        final StatisticsRepository repository = mock(StatisticsRepository.class);
        when(repository.snapshot()).thenReturn(snapshot(50));
        final PublicStatisticsService service = service(repository, 50);

        final var first = service.statistics(Locale.ENGLISH).block();
        final var second = service.statistics(Locale.ENGLISH).block();
        service.statistics(Locale.GERMAN).block();

        assertThat(second).isSameAs(first);
        verify(repository, times(1)).snapshot();
    }

    @Test
    void publishesSmoothedDensityShapeAndRobustSummariesOnceThePopulationIsLargeEnough() {
        final StatisticsRepository repository = mock(StatisticsRepository.class);
        when(repository.snapshot()).thenReturn(
            new StatisticsRepository.Snapshot(
                new StatisticsRepository.Totals(50, 500, 100, 75, NOW),
                List.of(
                    new StatisticsRepository.DistributionRow("block_count", 0, 10),
                    new StatisticsRepository.DistributionRow("block_count", 10, 30),
                    new StatisticsRepository.DistributionRow("block_count", 100, 10)
                ),
                List.of(), List.of(
                    new StatisticsRepository.CategoryRow("motion_block_count", 25, 250),
                    new StatisticsRepository.CategoryRow("unknown_block_count", 25, 250)
                )
            )
        );

        final var result = service(repository, 50).statistics(Locale.ENGLISH).block();

        assertThat(result.available()).isTrue();
        assertThat(result.totals().projects()).isEqualTo(50);
        assertThat(result.distributions()).hasSize(1);
        assertThat(result.distributions().getFirst().metric()).isEqualTo("block_count");
        assertThat(result.distributions().getFirst().sampleSize()).isEqualTo(50);
        assertThat(result.distributions().getFirst().minimum()).isZero();
        assertThat(result.distributions().getFirst().p25()).isEqualTo(10);
        assertThat(result.distributions().getFirst().median()).isEqualTo(10);
        assertThat(result.distributions().getFirst().p75()).isEqualTo(10);
        assertThat(result.distributions().getFirst().p95()).isEqualTo(100);
        assertThat(result.distributions().getFirst().displayMaximum()).isEqualTo(100);
        assertThat(result.distributions().getFirst().zeroCount()).isEqualTo(10);
        assertThat(result.distributions().getFirst().zeroPrevalence()).isEqualTo(0.2);
        assertThat(result.distributions().getFirst().points()).hasSize(41)
            .allSatisfy(point -> assertThat(point.relativeDensity()).isBetween(0.0, 1.0));
        assertThat(result.distributions().getFirst().points()).extracting(PublicStatisticsService.CurvePoint::value)
            .isSorted().doesNotHaveDuplicates();
        assertThat(result.blockCategories().getFirst().prevalence()).isEqualTo(0.5);
        assertThat(result.blockCategories().getFirst().blockShare()).isEqualTo(1.0);
    }

    @Test
    void makesAllZeroValuesAStableNormalizedShape() {
        final StatisticsRepository repository = mock(StatisticsRepository.class);
        when(repository.snapshot()).thenReturn(
            new StatisticsRepository.Snapshot(
                new StatisticsRepository.Totals(50, 0, 0, 0, NOW),
                List.of(new StatisticsRepository.DistributionRow("sprite_count", 0, 50)),
                List.of(), List.of()
            )
        );

        final var distribution = service(repository, 50).statistics(Locale.ENGLISH).block().distributions().getLast();

        assertThat(distribution.metric()).isEqualTo("sprite_count");
        assertThat(distribution.minimum()).isZero();
        assertThat(distribution.displayMaximum()).isZero();
        assertThat(distribution.points()).hasSize(41)
            .allSatisfy(point -> {
                assertThat(point.value()).isZero();
                assertThat(point.relativeDensity()).isEqualTo(1.0);
            });
    }

    @Test
    void capsTheDisplayedRangeAtTheWeightedNinetyNinthPercentile() {
        final StatisticsRepository repository = mock(StatisticsRepository.class);
        when(repository.snapshot()).thenReturn(
            new StatisticsRepository.Snapshot(
                new StatisticsRepository.Totals(100, 990, 0, 0, NOW),
                List.of(
                    new StatisticsRepository.DistributionRow("block_count", 10, 99),
                    new StatisticsRepository.DistributionRow("block_count", 10_000, 1)
                ),
                List.of(), List.of()
            )
        );

        final var distribution = service(repository, 50).statistics(Locale.ENGLISH).block().distributions().getFirst();

        assertThat(distribution.p95()).isEqualTo(10);
        assertThat(distribution.displayMaximum()).isEqualTo(10);
        assertThat(distribution.points())
            .allSatisfy(point -> assertThat(point.value()).isLessThanOrEqualTo(10.000_001));
    }

    @Test
    void excludesTheSingleLargestValueAtTheMinimumPublicSampleSize() {
        final StatisticsRepository repository = mock(StatisticsRepository.class);
        when(repository.snapshot()).thenReturn(
            new StatisticsRepository.Snapshot(
                new StatisticsRepository.Totals(50, 10_490, 0, 0, NOW),
                List.of(
                    new StatisticsRepository.DistributionRow("block_count", 10, 49),
                    new StatisticsRepository.DistributionRow("block_count", 10_000, 1)
                ),
                List.of(), List.of()
            )
        );

        final var distribution = service(repository, 50).statistics(Locale.ENGLISH).block().distributions().getFirst();

        assertThat(distribution.displayMaximum()).isEqualTo(10);
        assertThat(distribution.points())
            .allSatisfy(point -> assertThat(point.value()).isLessThanOrEqualTo(10.000_001));
    }

    @Test
    void excludedOutliersDoNotDistortTheVisibleDensityCurve() {
        final StatisticsRepository withOutlier = mock(StatisticsRepository.class);
        when(withOutlier.snapshot()).thenReturn(
            new StatisticsRepository.Snapshot(
                new StatisticsRepository.Totals(100, 1_049, 0, 0, NOW),
                List.of(
                    new StatisticsRepository.DistributionRow("block_count", 0, 49),
                    new StatisticsRepository.DistributionRow("block_count", 10, 50),
                    new StatisticsRepository.DistributionRow("block_count", 10_000, 1)
                ),
                List.of(), List.of()
            )
        );
        final StatisticsRepository withoutOutlier = mock(StatisticsRepository.class);
        when(withoutOutlier.snapshot()).thenReturn(
            new StatisticsRepository.Snapshot(
                new StatisticsRepository.Totals(100, 1_049, 0, 0, NOW),
                List.of(
                    new StatisticsRepository.DistributionRow("block_count", 0, 49),
                    new StatisticsRepository.DistributionRow("block_count", 10, 50)
                ),
                List.of(), List.of()
            )
        );

        final var outlierCurve = service(withOutlier, 50).statistics(Locale.ENGLISH).block()
            .distributions().getFirst().points();
        final var referenceCurve = service(withoutOutlier, 50).statistics(Locale.ENGLISH).block()
            .distributions().getFirst().points();

        assertThat(outlierCurve).containsExactlyElementsOf(referenceCurve);
    }

    @Test
    void keepsDisplayMaximumAtLeastAsLargeAsP95ForSmallPublicSamples() {
        final StatisticsRepository repository = mock(StatisticsRepository.class);
        when(repository.snapshot()).thenReturn(
            new StatisticsRepository.Snapshot(
                new StatisticsRepository.Totals(12, 110, 0, 0, NOW),
                List.of(
                    new StatisticsRepository.DistributionRow("block_count", 10, 11),
                    new StatisticsRepository.DistributionRow("block_count", 100, 1)
                ),
                List.of(), List.of()
            )
        );

        final var distribution = service(repository, 3).statistics(Locale.ENGLISH).block().distributions().getFirst();

        assertThat(distribution.p25()).isEqualTo(10);
        assertThat(distribution.median()).isEqualTo(10);
        assertThat(distribution.p75()).isEqualTo(10);
        assertThat(distribution.p95()).isEqualTo(100);
        assertThat(distribution.displayMaximum()).isEqualTo(100);
        assertThat(distribution.displayMaximum()).isGreaterThanOrEqualTo(distribution.p95());
    }

    @Test
    void omitsMetricsWithoutAnyExactFrequencyRows() {
        final StatisticsRepository repository = mock(StatisticsRepository.class);
        when(repository.snapshot()).thenReturn(
            new StatisticsRepository.Snapshot(
                new StatisticsRepository.Totals(50, 500, 0, 0, NOW),
                List.of(new StatisticsRepository.DistributionRow("block_count", 10, 50)),
                List.of(), List.of()
            )
        );

        final var distributions = service(repository, 50).statistics(Locale.ENGLISH).block().distributions();

        assertThat(distributions).extracting(PublicStatisticsService.Distribution::metric)
            .containsExactly("block_count");
        assertThat(distributions).allSatisfy(distribution -> assertThat(distribution.sampleSize()).isPositive());
    }

    @Test
    void publishesOnlyTheTopTenFindingsInDeterministicOrder() {
        final StatisticsRepository repository = mock(StatisticsRepository.class);
        final List<StatisticsRepository.FindingRow> findings = new ArrayList<>(
            IntStream.range(0, 12)
                .mapToObj(
                    index -> new StatisticsRepository.FindingRow(
                        "finder-" + index, "bug", index == 11 ? 8 : index, index == 10 ? 99 : index
                    )
                ).toList()
        );
        findings.add(new StatisticsRepository.FindingRow("internal-note", "note", 50, 50));
        when(repository.snapshot()).thenReturn(
            new StatisticsRepository.Snapshot(
                new StatisticsRepository.Totals(50, 0, 0, 0, NOW), List.of(), findings, List.of()
            )
        );

        final var group = service(repository, 50).statistics(Locale.ENGLISH).block().findingGroups().getFirst();

        assertThat(group.findings()).hasSize(10);
        assertThat(group.findings()).extracting(PublicStatisticsService.Finding::finderId)
            .containsExactly(
                "finder-10", "finder-9", "finder-11", "finder-8", "finder-7", "finder-6",
                "finder-5", "finder-4", "finder-3", "finder-2"
            );
    }

    @Test
    void usesOnlyComparableProjectsAsPrevalenceDenominators() {
        final StatisticsRepository repository = mock(StatisticsRepository.class);
        when(repository.snapshot()).thenReturn(
            new StatisticsRepository.Snapshot(
                new StatisticsRepository.Totals(100, 20, 40, 1_000, 200, 100, NOW),
                List.of(),
                List.of(new StatisticsRepository.FindingRow("type_error", "bug", 10, 12)),
                List.of(new StatisticsRepository.CategoryRow("motion_block_count", 20, 500))
            )
        );

        final var result = service(repository, 50).statistics(Locale.ENGLISH).block();

        assertThat(result.totals().projects()).isEqualTo(100);
        assertThat(result.findingGroups().getFirst().findings().getFirst().prevalence()).isEqualTo(0.5);
        assertThat(result.blockCategories().getFirst().prevalence()).isEqualTo(0.5);
    }

    private PublicStatisticsService service(final StatisticsRepository repository, final int minimum) {
        final DatabaseWork immediate = new DatabaseWork() {

            @Override
            public <T> Mono<T> submit(final java.util.concurrent.Callable<T> task) {
                return Mono.fromCallable(task);
            }
        };
        return new PublicStatisticsService(
            repository, immediate, new PatternCatalogueService(), Clock.fixed(NOW, ZoneOffset.UTC), minimum
        );
    }

    private static StatisticsRepository.Snapshot snapshot(final long projects) {
        return new StatisticsRepository.Snapshot(
            new StatisticsRepository.Totals(projects, 490, 98, 73, NOW), List.of(), List.of(), List.of()
        );
    }
}
