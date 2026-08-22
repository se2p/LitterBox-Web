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

import java.sql.Timestamp;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;

import org.springframework.stereotype.Repository;

import jakarta.persistence.EntityManager;

/** Database operations over the anonymous, cumulative public-statistics projection. */
@Repository
public class StatisticsRepository {

    private final EntityManager entityManager;

    public StatisticsRepository(final EntityManager entityManager) {
        this.entityManager = Objects.requireNonNull(entityManager, "entityManager");
    }

    @SuppressWarnings("unchecked")
    public List<Long> eligibleAnalysisIds(final LocalDate currentUtcDay, final int limit) {
        return entityManager.createNativeQuery(
            "SELECT analysis.id FROM analysis LEFT JOIN statistics_processed_analysis processed "
                + "ON processed.analysis_id = analysis.id "
                + "WHERE analysis.status = 'DONE' AND analysis.from_creation = TRUE "
                + "AND (analysis.detector_set = 'all' OR analysis.provenance = 'LEGACY') "
                + "AND analysis.completed_at < :currentDay AND processed.analysis_id IS NULL "
                + "ORDER BY CASE WHEN analysis.provenance = 'LEGACY' THEN 1 ELSE 0 END, analysis.id LIMIT :limit"
        ).setParameter("currentDay", currentUtcDay).setParameter("limit", limit).getResultList();
    }

    /** Claims an eligible analysis before any aggregate is changed. A transaction rollback releases this claim. */
    public boolean claim(final long analysisId, final LocalDate currentUtcDay) {
        return entityManager.createNativeQuery(
            "INSERT IGNORE INTO statistics_processed_analysis (analysis_id) "
                + "SELECT id FROM analysis WHERE id = :analysisId AND status = 'DONE' "
                + "AND from_creation = TRUE AND (detector_set = 'all' OR provenance = 'LEGACY') "
                + "AND completed_at < :currentDay"
        ).setParameter("analysisId", analysisId).setParameter("currentDay", currentUtcDay).executeUpdate() == 1;
    }

    @SuppressWarnings("unchecked")
    public AnalysisRow analysis(final long analysisId) {
        final List<Object[]> rows = entityManager.createNativeQuery(
            "SELECT report_json, provenance FROM analysis WHERE id = :analysisId"
        ).setParameter("analysisId", analysisId).getResultList();
        if (rows.isEmpty()) {
            throw new IllegalStateException("Claimed analysis no longer exists");
        }
        final Object[] row = rows.getFirst();
        return new AnalysisRow((String) row[0], "LEGACY".equals(row[1]));
    }

    @SuppressWarnings("unchecked")
    public Map<String, Double> metrics(final long analysisId) {
        final List<Object[]> rows = entityManager.createNativeQuery(
            "SELECT name, value FROM analysis_metric WHERE analysis_id = :analysisId"
        ).setParameter("analysisId", analysisId).getResultList();
        final Map<String, Double> result = new HashMap<>();
        for (Object[] row : rows) {
            result.put((String) row[0], ((Number) row[1]).doubleValue());
        }
        return result;
    }

    public boolean hasSyntheticProjection() {
        final Number rows = (Number) entityManager.createNativeQuery(
            "SELECT COUNT(*) FROM statistics_total WHERE singleton = 1 AND synthetic = TRUE"
        ).getSingleResult();
        return rows.longValue() > 0;
    }

    public void addTotals(
        final long blocks,
        final long scripts,
        final long sprites,
        final boolean hasFindingDetails,
        final boolean hasBlockCategories
    ) {
        entityManager.createNativeQuery(
            "INSERT INTO statistics_total (singleton, projects, finding_projects, block_category_projects, blocks, "
                + "scripts, sprites) VALUES (1, 1, :findingProjects, :blockCategoryProjects, :blocks, :scripts, :sprites) "
                + "ON DUPLICATE KEY UPDATE projects = projects + 1, "
                + "finding_projects = finding_projects + VALUES(finding_projects), "
                + "block_category_projects = block_category_projects + VALUES(block_category_projects), "
                + "blocks = blocks + VALUES(blocks), scripts = scripts + VALUES(scripts), "
                + "sprites = sprites + VALUES(sprites), updated_at = CURRENT_TIMESTAMP(6)"
        ).setParameter("findingProjects", hasFindingDetails ? 1 : 0)
            .setParameter("blockCategoryProjects", hasBlockCategories ? 1 : 0)
            .setParameter("blocks", blocks).setParameter("scripts", scripts).setParameter("sprites", sprites)
            .executeUpdate();
    }

    public void addDistribution(final String metric, final long metricValue) {
        entityManager.createNativeQuery(
            "INSERT INTO statistics_distribution (metric, metric_value, count) VALUES (:metric, :value, 1) "
                + "ON DUPLICATE KEY UPDATE count = count + 1"
        ).setParameter("metric", metric).setParameter("value", metricValue).executeUpdate();
    }

    public void addBlockCategory(final String metric, final long blocks) {
        entityManager.createNativeQuery(
            "INSERT INTO statistics_block_category (metric, projects_using, blocks) VALUES (:metric, 1, :blocks) "
                + "ON DUPLICATE KEY UPDATE projects_using = projects_using + 1, blocks = blocks + VALUES(blocks)"
        ).setParameter("metric", metric).setParameter("blocks", blocks).executeUpdate();
    }

    public void addFinding(final String finderId, final String issueType, final long occurrences) {
        entityManager.createNativeQuery(
            "INSERT INTO statistics_finding (finder_id, issue_type, projects_affected, occurrences) "
                + "VALUES (:finderId, :issueType, 1, :occurrences) ON DUPLICATE KEY UPDATE "
                + "projects_affected = projects_affected + 1, occurrences = occurrences + VALUES(occurrences)"
        ).setParameter("finderId", finderId).setParameter("issueType", issueType)
            .setParameter("occurrences", occurrences).executeUpdate();
    }

    @SuppressWarnings("unchecked")
    public Snapshot snapshot() {
        final List<Object[]> totalRows = entityManager.createNativeQuery(
            "SELECT projects, finding_projects, block_category_projects, blocks, scripts, sprites, updated_at "
                + "FROM statistics_total WHERE singleton = 1"
        ).getResultList();
        final Totals totals = totalRows.isEmpty()
            ? new Totals(0, 0, 0, 0, 0, 0, Instant.EPOCH)
            : total(totalRows.getFirst());
        final List<DistributionRow> distributions = entityManager.createNativeQuery(
            "SELECT metric, metric_value, count FROM statistics_distribution ORDER BY metric, metric_value"
        ).getResultList().stream().map(row -> distribution((Object[]) row)).toList();
        final List<FindingRow> findings = entityManager.createNativeQuery(
            "SELECT finder_id, issue_type, projects_affected, occurrences FROM statistics_finding "
                + "ORDER BY issue_type, finder_id"
        ).getResultList().stream().map(row -> finding((Object[]) row)).toList();
        final List<CategoryRow> categories = entityManager.createNativeQuery(
            "SELECT metric, projects_using, blocks FROM statistics_block_category ORDER BY metric"
        ).getResultList().stream().map(row -> category((Object[]) row)).toList();
        return new Snapshot(totals, distributions, findings, categories);
    }

    private static Totals total(final Object[] row) {
        return new Totals(
            number(row[0]), number(row[1]), number(row[2]), number(row[3]), number(row[4]), number(row[5]),
            instant(row[6])
        );
    }

    private static Instant instant(final Object value) {
        if (value instanceof Instant instant) {
            return instant;
        }
        if (value instanceof Timestamp timestamp) {
            return timestamp.toInstant();
        }
        if (value instanceof LocalDateTime dateTime) {
            return dateTime.toInstant(ZoneOffset.UTC);
        }
        throw new IllegalStateException("Unsupported statistics timestamp type");
    }

    private static DistributionRow distribution(final Object[] row) {
        return new DistributionRow((String) row[0], number(row[1]), number(row[2]));
    }

    private static FindingRow finding(final Object[] row) {
        return new FindingRow((String) row[0], (String) row[1], number(row[2]), number(row[3]));
    }

    private static CategoryRow category(final Object[] row) {
        return new CategoryRow((String) row[0], number(row[1]), number(row[2]));
    }

    private static long number(final Object value) {
        return ((Number) value).longValue();
    }

    public record AnalysisRow(String reportJson, boolean legacy) {

        AnalysisRow(final String reportJson) {
            this(reportJson, false);
        }
    }

    public record Totals(
        long projects,
        long findingProjects,
        long blockCategoryProjects,
        long blocks,
        long scripts,
        long sprites,
        Instant generatedAt
    ) {

        Totals(
            final long projects,
            final long blocks,
            final long scripts,
            final long sprites,
            final Instant generatedAt
        ) {
            this(projects, projects, projects, blocks, scripts, sprites, generatedAt);
        }
    }

    /** One exact integer value's anonymous population count; this row never leaves the service layer. */
    public record DistributionRow(String metric, long value, long count) {
    }

    public record FindingRow(String finderId, String issueType, long projectsAffected, long occurrences) {
    }

    public record CategoryRow(String metric, long projectsUsing, long blocks) {
    }

    public record Snapshot(
        Totals totals, List<DistributionRow> distributions, List<FindingRow> findings,
        List<CategoryRow> categories
    ) {
    }
}
