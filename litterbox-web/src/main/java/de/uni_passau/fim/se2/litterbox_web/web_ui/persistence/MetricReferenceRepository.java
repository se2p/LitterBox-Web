/*
 * Copyright (C) 2024-2026 LitterBox-Web contributors
 *
 * This file is part of LitterBox-Web.
 * Licenced under the EUPL-1.2 or later.
 *
 * SPDX-FileCopyrightText: 2024-2026 LitterBox-Web contributors
 * SPDX-License-Identifier: EUPL-1.2
 */
package de.uni_passau.fim.se2.litterbox_web.web_ui.persistence;

import java.util.List;
import java.util.Objects;

import org.springframework.stereotype.Repository;

import de.uni_passau.fim.se2.litterbox_web.web_ui.persistence.jpa.AnalysisMetrics;
import reactor.core.publisher.Mono;

/**
 * Typical values for each measurement, computed from the analyses this deployment has already run. They let a number on
 * a result page be shown as usual or unusual, which it cannot convey on its own to a reader who has never seen another
 * project's figures.
 */
@Repository
public class MetricReferenceRepository {

    private final AnalysisMetrics metrics;
    private final DatabaseWork databaseWork;

    public MetricReferenceRepository(final AnalysisMetrics metrics, final DatabaseWork databaseWork) {
        this.metrics = Objects.requireNonNull(metrics, "metrics");
        this.databaseWork = Objects.requireNonNull(databaseWork, "databaseWork");
    }

    /**
     * @param minimumSampleSize how many completed analyses must carry a measurement before it is worth comparing
     *                          against. Below it the terciles describe the handful of projects that happen to have been
     *                          submitted rather than anything recognisable as typical.
     * @see AnalysisMetrics#terciles
     */
    public Mono<List<MetricDistribution>> distributions(final int minimumSampleSize) {
        if (minimumSampleSize < 1) {
            throw new IllegalArgumentException("Minimum sample size must be positive");
        }
        return databaseWork.submit(
            () -> metrics.terciles(minimumSampleSize).stream()
                .map(
                    row -> new MetricDistribution(
                        row.getName(), row.getSampleSize(), row.getLowerBound(), row.getUpperBound()
                    )
                )
                .toList()
        );
    }

    /**
     * @param lowerBound the value a third of the analysed projects come under
     * @param upperBound the value two thirds of them come under
     */
    public record MetricDistribution(String name, long sampleSize, double lowerBound, double upperBound) {

        public MetricDistribution {
            Objects.requireNonNull(name, "name");
        }
    }
}
