/*
 * Copyright (C) 2024-2026 LitterBox-Web contributors
 *
 * This file is part of LitterBox-Web.
 * Licenced under the EUPL-1.2 or later.
 *
 * SPDX-FileCopyrightText: 2024-2026 LitterBox-Web contributors
 * SPDX-License-Identifier: EUPL-1.2
 */
package de.uni_passau.fim.se2.litterbox_web.persistence.jpa;

import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.transaction.annotation.Transactional;

import de.uni_passau.fim.se2.litterbox_web.persistence.entity.AnalysisMetricEntity;

public interface AnalysisMetrics
    extends JpaRepository<AnalysisMetricEntity, AnalysisMetricEntity.Key>, AnalysisMetricsBatch {

    List<AnalysisMetricEntity> findByAnalysisIdOrderByName(long analysisId);

    List<AnalysisMetricEntity> findByAnalysisIdInOrderByAnalysisIdAscNameAsc(List<Long> analysisIds);

    /**
     * One statement. Derived from the method name this would have fetched every measurement of the analysis in order to
     * delete them one at a time, which is a hundred rows read to be told what a single condition already says.
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
     * Window functions have no equivalent in JPQL, and rewriting this as one would mean fetching every measurement in
     * the database to sort it in Java. It stays as the database's own arithmetic.
     */
    @Query(
        value = """
            SELECT name AS name, sample_size AS sampleSize,
                   MIN(CASE WHEN position = lower_position THEN value END) AS lowerBound,
                   MIN(CASE WHEN position = upper_position THEN value END) AS upperBound
            FROM (
                SELECT metric.name,
                       metric.value,
                       ROW_NUMBER() OVER (PARTITION BY metric.name ORDER BY metric.value) AS position,
                       COUNT(*) OVER (PARTITION BY metric.name) AS sample_size,
                       FLOOR(COUNT(*) OVER (PARTITION BY metric.name) / 3) + 1 AS lower_position,
                       FLOOR(2 * COUNT(*) OVER (PARTITION BY metric.name) / 3) + 1 AS upper_position
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
    }
}
