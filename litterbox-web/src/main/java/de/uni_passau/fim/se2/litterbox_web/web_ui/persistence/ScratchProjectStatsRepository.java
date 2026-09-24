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

import java.time.Instant;
import java.time.format.DateTimeParseException;
import java.util.List;
import java.util.Objects;

import org.springframework.stereotype.Repository;

import de.uni_passau.fim.se2.litterbox_web.web_ui.persistence.jpa.ScratchProjectStatistics;
import reactor.core.publisher.Mono;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

@Repository
public class ScratchProjectStatsRepository {

    private final ScratchProjectStatistics statistics;
    private final DatabaseWork databaseWork;
    private final JsonMapper mapper = JsonMapper.shared();

    public ScratchProjectStatsRepository(
        final ScratchProjectStatistics statistics,
        final DatabaseWork databaseWork
    ) {
        this.statistics = Objects.requireNonNull(statistics, "statistics");
        this.databaseWork = Objects.requireNonNull(databaseWork, "databaseWork");
    }

    public Mono<Void> upsertFromManifest(final long analysisId, final String manifestJson) {
        Objects.requireNonNull(manifestJson, "manifestJson");
        return databaseWork.submit(() -> upsertStats(analysisId, manifestJson));
    }

    private Void upsertStats(final long analysisId, final String manifestJson) {
        final ScratchProjectStats stats = parseManifest(manifestJson);
        statistics.upsert(
            analysisId, stats.views(), stats.loves(), stats.favorites(), stats.remixes(),
            stats.authorUsername(), stats.authorUsername() == null ? null : "SCRATCH_API",
            stats.createdAt(), stats.fetchedAt()
        );
        return null;
    }

    private ScratchProjectStats parseManifest(final String manifestJson) {
        final JsonNode manifest = mapper.readTree(manifestJson);
        if (
            manifest == null || !manifest.isObject()
                || !"scratch-project-bundle".equals(manifest.path("format").stringValue(null))
                || manifest.path("version").asInt(-1) < 2
        ) {
            throw new IllegalArgumentException("Scratch source manifest is invalid");
        }
        final JsonNode measurements = manifest.get("statistics");
        if (measurements != null && !measurements.isNull() && !measurements.isObject()) {
            throw new IllegalArgumentException("Scratch source statistics are invalid");
        }
        final String username = nullableText(manifest.get("authorUsername"), "Scratch author username");
        if (username != null && username.length() > 255) {
            throw new IllegalArgumentException("Scratch author username exceeds the storage limit");
        }
        final Instant fetchedAt = parseRequiredInstant(manifest.get("fetchedAt"), "Scratch fetch time");
        return new ScratchProjectStats(
            statistic(measurements, "views"), statistic(measurements, "loves"),
            statistic(measurements, "favorites"), statistic(measurements, "remixes"), username,
            createdAt(manifest.get("upstreamTimestamps")), fetchedAt
        );
    }

    private Instant createdAt(final JsonNode timestamps) {
        if (timestamps == null || timestamps.isNull()) {
            return null;
        }
        if (!timestamps.isObject()) {
            throw new IllegalArgumentException("Scratch upstream timestamps are invalid");
        }
        for (String name : List.of("created", "created_at", "createdAt", "date_created", "history.created")) {
            final JsonNode value = timestamps.get(name);
            if (value != null && !value.isNull()) {
                final String text = nullableText(value, "Scratch creation time");
                try {
                    return Instant.parse(text);
                }
                catch (DateTimeParseException ignored) {
                    return null;
                }
            }
        }
        return null;
    }

    private Instant parseRequiredInstant(final JsonNode value, final String label) {
        final String text = nullableText(value, label);
        if (text == null) {
            throw new IllegalArgumentException(label + " is missing");
        }
        try {
            return Instant.parse(text);
        }
        catch (DateTimeParseException error) {
            throw new IllegalArgumentException(label + " is invalid", error);
        }
    }

    private String nullableText(final JsonNode value, final String label) {
        if (value == null || value.isNull()) {
            return null;
        }
        if (!value.isTextual()) {
            throw new IllegalArgumentException(label + " is invalid");
        }
        return value.textValue();
    }

    private Long statistic(final JsonNode measurements, final String name) {
        if (measurements == null || measurements.isNull()) {
            return null;
        }
        final JsonNode value = measurements.get(name);
        if (value == null || value.isNull()) {
            return null;
        }
        if (!value.isIntegralNumber() || !value.canConvertToLong() || value.longValue() < 0) {
            throw new IllegalArgumentException("Scratch source statistics are invalid");
        }
        return value.longValue();
    }

    public record ScratchProjectStats(
        Long views,
        Long loves,
        Long favorites,
        Long remixes,
        String authorUsername,
        Instant createdAt,
        Instant fetchedAt
    ) {
    }
}
