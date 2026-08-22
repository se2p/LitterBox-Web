/*
 * Copyright (C) 2024-2026 LitterBox-Web contributors
 *
 * This file is part of LitterBox-Web.
 * Licenced under the EUPL-1.2 or later.
 *
 * SPDX-FileCopyrightText: 2024-2026 LitterBox-Web contributors
 * SPDX-License-Identifier: EUPL-1.2
 */
package de.uni_passau.fim.se2.litterbox_web.statistics;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoMoreInteractions;
import static org.mockito.Mockito.when;

import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import org.junit.jupiter.api.Test;
import org.springframework.transaction.TransactionStatus;
import org.springframework.transaction.support.TransactionCallback;

import de.uni_passau.fim.se2.litterbox_web.persistence.DatabaseWork;
import de.uni_passau.fim.se2.litterbox_web.persistence.ReadCommittedTransactions;
import reactor.core.publisher.Mono;
import tools.jackson.databind.json.JsonMapper;

class StatisticsProjectorTest {

    private static final Instant NOW = Instant.parse("2026-08-14T12:00:00Z");

    @Test
    void neverMixesRealAnalysesIntoSyntheticDemoAggregates() {
        final StatisticsRepository repository = mock(StatisticsRepository.class);
        when(repository.hasSyntheticProjection()).thenReturn(true);

        final Integer projected = projector(repository, immediateTransactions()).project().block();

        assertThat(projected).isZero();
        verify(repository).hasSyntheticProjection();
        verifyNoMoreInteractions(repository);
    }

    @Test
    void projectsEachClaimedAnalysisOnceIntoAnonymousAggregates() {
        final StatisticsRepository repository = mock(StatisticsRepository.class);
        final ReadCommittedTransactions transactions = immediateTransactions();
        final LocalDate currentDay = LocalDate.of(2026, 8, 14);
        when(repository.eligibleAnalysisIds(currentDay, 20)).thenReturn(List.of(41L, 42L));
        when(repository.claim(41L, currentDay)).thenReturn(true);
        when(repository.claim(42L, currentDay)).thenReturn(false);
        when(repository.analysis(41L)).thenReturn(new StatisticsRepository.AnalysisRow("""
            {"issues":[
              {"finderId":"message_never_sent","type":"bug"},
              {"finderId":"message_never_sent","type":"bug"},
              {"finderId":"unused_variables","type":"smell"}
            ]}
            """));
        final Map<String, Double> metrics = completeCategoryMetrics();
        metrics.putAll(
            Map.of(
                "block_count", 25.0, "script_count", 6.0, "sprite_count", 2.0,
                "motion_block_count", 4.0, "max_nested_block_count", 3.9,
                "length_longest_script", 12.5
            )
        );
        when(repository.metrics(41L)).thenReturn(metrics);

        final Integer projected = projector(repository, transactions).project().block();

        assertThat(projected).isEqualTo(1);
        verify(repository).addTotals(25, 6, 2, true, true);
        verify(repository).addDistribution("block_count", 25);
        verify(repository).addDistribution("script_count", 6);
        verify(repository).addDistribution("sprite_count", 2);
        verify(repository).addDistribution("max_nested_block_count", 3);
        verify(repository).addDistribution("length_longest_script", 12);
        verify(repository).addBlockCategory("motion_block_count", 4);
        verify(repository).addBlockCategory("other_block_count", 21);
        verify(repository, never()).addBlockCategory("looks_block_count", 0);
        verify(repository).addFinding("message_never_sent", "bug", 2);
        verify(repository).addFinding("unused_variables", "smell", 1);
        verify(repository).addDistribution("bug_count", 2);
        verify(repository).addDistribution("smell_count", 1);
        verify(repository).addDistribution("perfume_count", 0);
        verify(repository, never()).analysis(42L);
    }

    @Test
    void skipsBlockCompositionWhenCoreCategoryMetricsAreIncomplete() {
        final StatisticsRepository repository = mock(StatisticsRepository.class);
        final ReadCommittedTransactions transactions = immediateTransactions();
        final LocalDate currentDay = LocalDate.of(2026, 8, 14);
        when(repository.eligibleAnalysisIds(currentDay, 20)).thenReturn(List.of(41L));
        when(repository.claim(41L, currentDay)).thenReturn(true);
        when(repository.analysis(41L)).thenReturn(new StatisticsRepository.AnalysisRow(null));
        when(repository.metrics(41L)).thenReturn(
            Map.of(
                "block_count", 25.0, "script_count", 6.0, "sprite_count", 2.0,
                "motion_block_count", 4.0
            )
        );

        projector(repository, transactions).project().block();

        verify(repository, never()).addBlockCategory(anyString(), anyLong());
        verify(repository).addTotals(25, 6, 2, false, false);
        verify(repository, never()).addDistribution("bug_count", 0);
    }

    @Test
    void skipsBlockCompositionWhenCoreCategoriesExceedTheTotalBlockCount() {
        final StatisticsRepository repository = mock(StatisticsRepository.class);
        final ReadCommittedTransactions transactions = immediateTransactions();
        final LocalDate currentDay = LocalDate.of(2026, 8, 14);
        when(repository.eligibleAnalysisIds(currentDay, 20)).thenReturn(List.of(41L));
        when(repository.claim(41L, currentDay)).thenReturn(true);
        when(repository.analysis(41L)).thenReturn(new StatisticsRepository.AnalysisRow(null));
        final Map<String, Double> metrics = completeCategoryMetrics();
        metrics.putAll(
            Map.of(
                "block_count", 3.0, "script_count", 1.0, "sprite_count", 1.0,
                "motion_block_count", 4.0
            )
        );
        when(repository.metrics(41L)).thenReturn(metrics);

        projector(repository, transactions).project().block();

        verify(repository, never()).addBlockCategory(anyString(), anyLong());
    }

    @Test
    void storesOnlyNonnegativeFlooredExactValues() {
        final StatisticsRepository repository = mock(StatisticsRepository.class);
        final ReadCommittedTransactions transactions = immediateTransactions();
        final LocalDate currentDay = LocalDate.of(2026, 8, 14);
        when(repository.eligibleAnalysisIds(currentDay, 20)).thenReturn(List.of(41L));
        when(repository.claim(41L, currentDay)).thenReturn(true);
        when(repository.analysis(41L)).thenReturn(new StatisticsRepository.AnalysisRow(null));
        when(repository.metrics(41L)).thenReturn(
            Map.of(
                "block_count", 25.9, "script_count", -1.0, "sprite_count", Double.NaN
            )
        );

        projector(repository, transactions).project().block();

        verify(repository).addTotals(25, 0, 0, false, false);
        verify(repository).addDistribution("block_count", 25);
        verify(repository).addDistribution("script_count", 0);
        verify(repository).addDistribution("sprite_count", 0);
    }

    @Test
    void mapsTheLegacyNestingMetricToTheCurrentPublicName() {
        final StatisticsRepository repository = mock(StatisticsRepository.class);
        final ReadCommittedTransactions transactions = immediateTransactions();
        final LocalDate currentDay = LocalDate.of(2026, 8, 14);
        when(repository.eligibleAnalysisIds(currentDay, 20)).thenReturn(List.of(41L));
        when(repository.claim(41L, currentDay)).thenReturn(true);
        when(repository.analysis(41L)).thenReturn(new StatisticsRepository.AnalysisRow(null));
        when(repository.metrics(41L)).thenReturn(Map.of("nested_block_count", 4.9));

        projector(repository, transactions).project().block();

        verify(repository).addDistribution("max_nested_block_count", 4);
    }

    @Test
    void adaptsLegacyFindingsAndKeepsStoredAggregateBurdenCounts() {
        final StatisticsRepository repository = mock(StatisticsRepository.class);
        final ReadCommittedTransactions transactions = immediateTransactions();
        final LocalDate currentDay = LocalDate.of(2026, 8, 14);
        when(repository.eligibleAnalysisIds(currentDay, 20)).thenReturn(List.of(41L));
        when(repository.claim(41L, currentDay)).thenReturn(true);
        when(repository.analysis(41L)).thenReturn(
            new StatisticsRepository.AnalysisRow(
                """
                    {"issues":[
                      {"finder":"type_error","type":"BUG"},
                      {"finder":"type_error","type":"BUG"},
                      {"finder":"long_script","type":"SMELL"},
                      {"finder":"used_variables","type":"PERFUME"}
                    ]}
                    """, true
            )
        );
        final Map<String, Double> metrics = completeCategoryMetrics();
        metrics.putAll(
            Map.of(
                "block_count", 25.0, "script_count", 6.0, "sprite_count", 2.0,
                "motion_block_count", 4.0, "nested_block_count", 3.9,
                "bugs", 4.0, "smells", 2.0, "perfumes", 5.0
            )
        );
        when(repository.metrics(41L)).thenReturn(metrics);

        final Integer projected = projector(repository, transactions).project().block();

        assertThat(projected).isEqualTo(1);
        verify(repository).addTotals(25, 6, 2, true, true);
        verify(repository).addFinding("type_error", "bug", 2);
        verify(repository).addFinding("long_script", "smell", 1);
        verify(repository).addFinding("used_variables", "perfume", 1);
        verify(repository).addDistribution("bug_count", 4);
        verify(repository).addDistribution("smell_count", 2);
        verify(repository).addDistribution("perfume_count", 5);
        verify(repository).addDistribution("max_nested_block_count", 3);
    }

    @Test
    void excludesTheWholeReportWhenADeclaredFindingSchemaIsIncompatible() {
        final StatisticsRepository repository = mock(StatisticsRepository.class);
        final ReadCommittedTransactions transactions = immediateTransactions();
        final LocalDate currentDay = LocalDate.of(2026, 8, 14);
        when(repository.eligibleAnalysisIds(currentDay, 20)).thenReturn(List.of(41L));
        when(repository.claim(41L, currentDay)).thenReturn(true);
        when(repository.analysis(41L)).thenReturn(
            new StatisticsRepository.AnalysisRow(
                """
                    {"issues":[
                      {"finder":"type_error","type":"BUG"},
                      {"finderId":"message_never_sent","type":"BUG"}
                    ]}
                    """, true
            )
        );
        when(repository.metrics(41L)).thenReturn(Map.of("bugs", 2.0, "smells", 0.0, "perfumes", 0.0));

        projector(repository, transactions).project().block();

        verify(repository).addTotals(0, 0, 0, false, false);
        verify(repository).addDistribution("bug_count", 2);
        verify(repository, never()).addFinding(anyString(), anyString(), anyLong());
    }

    private StatisticsProjector projector(
        final StatisticsRepository repository,
        final ReadCommittedTransactions transactions
    ) {
        final DatabaseWork immediate = new DatabaseWork() {

            @Override
            public <T> Mono<T> submit(final java.util.concurrent.Callable<T> task) {
                return Mono.fromCallable(task);
            }
        };
        return new StatisticsProjector(
            repository, immediate, transactions, Clock.fixed(NOW, ZoneOffset.UTC), JsonMapper.shared(), 20
        );
    }

    private static Map<String, Double> completeCategoryMetrics() {
        final Map<String, Double> metrics = new HashMap<>();
        StatisticsProjector.CORE_BLOCK_CATEGORY_METRICS.forEach(metric -> metrics.put(metric, 0.0));
        return metrics;
    }

    @SuppressWarnings("unchecked")
    private static ReadCommittedTransactions immediateTransactions() {
        final ReadCommittedTransactions transactions = mock(ReadCommittedTransactions.class);
        when(transactions.execute(any(TransactionCallback.class))).thenAnswer(invocation -> {
            final TransactionCallback<Object> callback = invocation.getArgument(0);
            return callback.doInTransaction(mock(TransactionStatus.class));
        });
        return transactions;
    }
}
