/*
 * Copyright (C) 2024-2026 LitterBox-Web contributors
 *
 * This file is part of LitterBox-Web.
 * Licenced under the EUPL-1.2 or later.
 *
 * SPDX-FileCopyrightText: 2024-2026 LitterBox-Web contributors
 * SPDX-License-Identifier: EUPL-1.2
 */
package de.uni_passau.fim.se2.litterbox_web.web_ui.api.v1;

import java.time.Instant;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

/** Anonymous, delayed aggregate statistics suitable for public publication. */
public record PublicStatisticsDto(
    int schemaVersion,
    boolean available,
    Instant generatedAt,
    Totals totals,
    List<Distribution> distributions,
    List<FindingGroup> findingGroups,
    List<BlockCategory> blockCategories
) {

    public PublicStatisticsDto {
        distributions = distributions == null
            ? null
            : Collections.unmodifiableList(new ArrayList<>(distributions));
        findingGroups = findingGroups == null
            ? null
            : Collections.unmodifiableList(new ArrayList<>(findingGroups));
        blockCategories = blockCategories == null
            ? null
            : Collections.unmodifiableList(new ArrayList<>(blockCategories));
    }

    public record Totals(long projects, long blocks, long scripts, long sprites) {
    }

    public record Distribution(
        String metric,
        long sampleSize,
        long minimum,
        long p25,
        long median,
        long p75,
        long p95,
        long displayMaximum,
        long zeroCount,
        double zeroPrevalence,
        List<CurvePoint> points
    ) {

        public Distribution {
            points = points == null ? null : Collections.unmodifiableList(new ArrayList<>(points));
        }

    }

    public record CurvePoint(double value, double relativeDensity) {
    }

    public record FindingGroup(String type, List<Finding> findings) {

        public FindingGroup {
            findings = findings == null ? null : Collections.unmodifiableList(new ArrayList<>(findings));
        }

    }

    public record Finding(String finderId, String name, long projectsAffected, long occurrences, double prevalence) {
    }

    public record BlockCategory(
        String metric, long projectsUsing, double prevalence, long blocks, double blockShare
    ) {
    }

}
