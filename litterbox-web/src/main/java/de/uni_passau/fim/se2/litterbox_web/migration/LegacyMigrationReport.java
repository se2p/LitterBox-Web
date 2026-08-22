/*
 * Copyright (C) 2024-2026 LitterBox-Web contributors
 *
 * This file is part of LitterBox-Web.
 * Licenced under the EUPL-1.2 or later.
 *
 * SPDX-FileCopyrightText: 2024-2026 LitterBox-Web contributors
 * SPDX-License-Identifier: EUPL-1.2
 */
package de.uni_passau.fim.se2.litterbox_web.migration;

import java.util.List;
import java.util.Map;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.MapperFeature;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.SerializationFeature;

public record LegacyMigrationReport(
    String status,
    Map<String, Long> sourceRowCounts,
    Map<String, Long> targetRowCounts,
    Map<String, Long> sourceNullCounts,
    Map<String, Long> targetNullCounts,
    TokenCollisions tokenCollisions,
    Map<String, MetricAggregate> metrics,
    List<String> missingCoreMetricNames,
    List<String> coreMetricNamesOutsideLegacyView,
    CountComparison feedback,
    QuestionJoins questionJoins,
    CountComparison externalIds,
    CountComparison contactMessages,
    Artifacts artifacts,
    Reports reports,
    Privacy privacy,
    Reconciliations reconciliations,
    Checksums checksums
) {

    /** Returns a deterministic machine-readable representation of this aggregate report. */
    public String toJson() {
        final ObjectMapper mapper = new ObjectMapper();
        mapper.enable(MapperFeature.SORT_PROPERTIES_ALPHABETICALLY);
        mapper.enable(SerializationFeature.ORDER_MAP_ENTRIES_BY_KEYS);
        try {
            return mapper.writeValueAsString(this);
        }
        catch (JsonProcessingException exception) {
            throw new IllegalStateException("The aggregate migration report could not be serialized", exception);
        }
    }

    public record TokenCollisions(
        long exactDuplicateGroups,
        long caseCollisionGroups,
        long affectedRows,
        long generatedRows,
        long explicitlyResolvedRows
    ) {
    }

    public record MetricAggregate(long count, long nullCount, double sum, double minimum, double maximum) {
    }

    public record CountComparison(long source, long target) {
    }

    public record QuestionJoins(
        long source,
        long automatic,
        long explicitlyResolved,
        long ambiguousBeforeResolution,
        long unmatchedBeforeResolution,
        long target
    ) {
    }

    public record Artifacts(
        long explicitlyMapped,
        long checksumMatched,
        long checksumMismatched,
        long missingFiles,
        long withoutMapping,
        long mappingsWithoutProgramme,
        long unavailable,
        long importedBytes
    ) {
    }

    /**
     * How many of the old reports could actually be read. The old rows name a file rather than holding the report, so a
     * row can be migrated with every metric intact and still have no report to show.
     *
     * @param referenced       rows naming a report file
     * @param loaded           reports read from that file
     * @param missing          named files that are not on disk
     * @param unreadable       named files that could not be read or are not reports
     * @param oversized        reports larger than this service will hold in memory, read for their metrics and then
     *                         left behind
     * @param withoutReference rows naming no file at all
     */
    public record Reports(
        long referenced,
        long loaded,
        long missing,
        long unreadable,
        long oversized,
        long withoutReference
    ) {
    }

    public record Privacy(
        long droppedIpRows,
        long droppedGenderRows,
        long droppedAgeRows,
        long mappedSchoolRows,
        long unmappedSchoolRows,
        long distinctUnmappedSchoolValues,
        List<Long> unmappedSchoolCategoryFrequencies
    ) {
    }

    /** Aggregate-only accounting of deterministic legacy reconciliation decisions. */
    public record Reconciliations(
        String policyVersion,
        long usernameMismatches,
        Map<String, Long> reportMetricConflicts
    ) {
    }

    public record Checksums(
        String sourceReportSnapshots,
        String targetReportSnapshots,
        String sourceMetrics,
        String targetMetrics
    ) {
    }
}
