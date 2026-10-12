/*
 * Copyright (C) 2024-2026 LitterBox-Web contributors
 *
 * This file is part of LitterBox-Web.
 * Licenced under the EUPL-1.2 or later.
 *
 * SPDX-FileCopyrightText: 2024-2026 LitterBox-Web contributors
 * SPDX-License-Identifier: EUPL-1.2
 */
package de.uni_passau.fim.se2.litterbox_web.web_ui.persistence.jpa;

import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.transaction.annotation.Transactional;

import de.uni_passau.fim.se2.litterbox_web.web_ui.persistence.entity.AnalysisMetricEntity;

public interface AnalysisMetrics
    extends JpaRepository<AnalysisMetricEntity, AnalysisMetricEntity.Key>, AnalysisMetricsBatch {

    List<AnalysisMetricEntity> findByAnalysisIdOrderByName(long analysisId);

    List<AnalysisMetricEntity> findByAnalysisIdInOrderByAnalysisIdAscNameAsc(List<Long> analysisIds);

    /**
     * One statement. Derived from the method name this would have fetched every measurement of the analysis in order to
     * delete them one at a time, which is a hundred rows read to be told what a single condition already says.
     *
     * @param analysisId the analysis whose metrics should be deleted
     * @return the number of deleted metrics
     */
    @Modifying(clearAutomatically = true)
    @Transactional
    @Query(
        value = "DELETE FROM analysis_metric WHERE analysis_id = :analysisId",
        nativeQuery = true
    )
    int deleteByAnalysisId(@Param("analysisId") long analysisId);

    /**
     * The split points are the terciles: the value a third of the projects come under, and the value two thirds of them
     * come under. Anything between the two is the ordinary middle and is reported as such.
     *
     * <p>
     * Alongside them this also derives a five-number summary — minimum, quartiles and maximum — so a caller that wants
     * to draw a box plot instead of a three-way verdict has the numbers for it. The quartile positions follow the same
     * arithmetic as the terciles above, just split into quarters instead of thirds: {@code q1_position} is where a
     * quarter of the ranked values end, {@code median_position} where half do, {@code q3_position} where three quarters
     * do. Because {@code position} only ever runs from 1 to {@code sample_size} and rises with {@code value}, every one
     * of these picked values is bounded between the minimum and maximum by construction, whatever the sample size —
     * there is no {@code sample_size} for which a quartile could fall outside that order.
     *
     * <p>
     * Window functions have no equivalent in JPQL, and rewriting this as one would mean fetching every measurement in
     * the database to sort it in Java. It stays as the database's own arithmetic.
     *
     * @param minimumSampleSize minimum number of samples
     * @return metric distributions
     */
    @Query(
        value = """
            SELECT name AS name, sample_size AS sampleSize,
                   MIN(CASE WHEN position = lower_position THEN value END) AS lowerBound,
                   MIN(CASE WHEN position = upper_position THEN value END) AS upperBound,
                   MIN(value) AS minimum,
                   MIN(CASE WHEN position = q1_position THEN value END) AS q1,
                   MIN(CASE WHEN position = median_position THEN value END) AS median,
                   MIN(CASE WHEN position = q3_position THEN value END) AS q3,
                   MAX(value) AS maximum
            FROM (
                SELECT metric.name,
                       metric.value,
                       ROW_NUMBER() OVER (PARTITION BY metric.name ORDER BY metric.value) AS position,
                       COUNT(*) OVER (PARTITION BY metric.name) AS sample_size,
                       FLOOR(COUNT(*) OVER (PARTITION BY metric.name) / 3) + 1 AS lower_position,
                       FLOOR(2 * COUNT(*) OVER (PARTITION BY metric.name) / 3) + 1 AS upper_position,
                       FLOOR(COUNT(*) OVER (PARTITION BY metric.name) / 4) + 1 AS q1_position,
                       FLOOR(COUNT(*) OVER (PARTITION BY metric.name) / 2) + 1 AS median_position,
                       FLOOR(3 * COUNT(*) OVER (PARTITION BY metric.name) / 4) + 1 AS q3_position
                FROM analysis_metric metric
                JOIN analysis ON analysis.id = metric.analysis_id AND analysis.status = 'DONE'
            ) ranked
            GROUP BY name, sample_size
            HAVING sample_size >= :minimumSampleSize
            ORDER BY name
            """,
        nativeQuery = true
    )
    List<MetricDistributionRow> terciles(@Param("minimumSampleSize") int minimumSampleSize);

    /** What the tercile query returns, named so Spring Data can bind the columns onto it. */
    interface MetricDistributionRow {

        String getName();

        long getSampleSize();

        double getLowerBound();

        double getUpperBound();

        double getMinimum();

        double getQ1();

        double getMedian();

        double getQ3();

        double getMaximum();
    }
}
