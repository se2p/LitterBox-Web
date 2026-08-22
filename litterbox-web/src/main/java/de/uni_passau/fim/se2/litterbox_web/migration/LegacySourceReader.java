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

import java.sql.Connection;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.TreeMap;

final class LegacySourceReader {

    LegacyMigrationModel.SourceData read(final Connection source) throws SQLException {
        final Map<String, Long> counts = new TreeMap<>();
        final Map<String, Long> nulls = new TreeMap<>();
        final List<LegacyMigrationModel.Programme> programmes = readProgrammes(source, counts, nulls);
        final List<LegacyMigrationModel.Statistics> statistics = readStatistics(source, counts, nulls);
        final List<LegacyMigrationModel.Feedback> feedback = readFeedback(source, counts, nulls);
        final List<LegacyMigrationModel.Question> questions = readQuestions(source, counts, nulls);
        final List<LegacyMigrationModel.ExternalId> externalIds = readExternalIds(source, counts, nulls);
        final List<LegacyMigrationModel.Contact> contacts = readContacts(source, counts, nulls);
        return new LegacyMigrationModel.SourceData(
            programmes, statistics, feedback, questions, externalIds, contacts,
            Map.copyOf(counts), Map.copyOf(nulls)
        );
    }

    private List<LegacyMigrationModel.Programme> readProgrammes(
        final Connection source, final Map<String, Long> counts, final Map<String, Long> nulls
    ) throws SQLException {
        final List<LegacyMigrationModel.Programme> result = new ArrayList<>();
        try (
            var statement = source.createStatement();
            ResultSet rows = statement.executeQuery("SELECT * FROM programme ORDER BY id")
        ) {
            while (rows.next()) {
                countNulls("programme", rows, nulls);
                result.add(
                    new LegacyMigrationModel.Programme(
                        rows.getLong("id"), rows.getString("token"), rows.getString("gender"),
                        rows.getString("scratchUsername"), rows.getString("file"), rows.getString("url"),
                        rows.getString("description"), rows.getString("institution"), rows.getString("litterbox"),
                        rows.getString("ip"), rows.getTimestamp("time")
                    )
                );
            }
        }
        counts.put("programme", (long) result.size());
        return List.copyOf(result);
    }

    private List<LegacyMigrationModel.Statistics> readStatistics(
        final Connection source, final Map<String, Long> counts, final Map<String, Long> nulls
    ) throws SQLException {
        final List<LegacyMigrationModel.Statistics> result = new ArrayList<>();
        try (
            var statement = source.createStatement();
            ResultSet rows = statement.executeQuery("SELECT * FROM statistiken ORDER BY id")
        ) {
            while (rows.next()) {
                countNulls("statistiken", rows, nulls);
                final Map<String, Double> metrics = new LinkedHashMap<>();
                for (String name : LegacySchemaContract.STATISTIKEN_COLUMNS) {
                    if (!LegacySchemaContract.STATISTICS_METADATA.contains(name)) {
                        final Number value = (Number) rows.getObject(name);
                        if (value != null) {
                            metrics.put(name, value.doubleValue());
                        }
                    }
                }
                result.add(
                    new LegacyMigrationModel.Statistics(
                        rows.getLong("id"), rows.getLong("program"), Map.copyOf(metrics),
                        nullableLong(rows, "views"), nullableLong(rows, "loves"),
                        nullableLong(rows, "favorites"), nullableLong(rows, "remixes"),
                        rows.getString("author"), rows.getTimestamp("created")
                    )
                );
            }
        }
        counts.put("statistiken", (long) result.size());
        return List.copyOf(result);
    }

    private List<LegacyMigrationModel.Feedback> readFeedback(
        final Connection source, final Map<String, Long> counts, final Map<String, Long> nulls
    ) throws SQLException {
        final List<LegacyMigrationModel.Feedback> result = new ArrayList<>();
        try (
            var statement = source.createStatement();
            ResultSet rows = statement.executeQuery("SELECT * FROM feedback ORDER BY id")
        ) {
            while (rows.next()) {
                countNulls("feedback", rows, nulls);
                result.add(
                    new LegacyMigrationModel.Feedback(
                        rows.getLong("id"), rows.getLong("program"), rows.getString("pattern"),
                        rows.getInt("reaction"), rows.getTimestamp("time")
                    )
                );
            }
        }
        counts.put("feedback", (long) result.size());
        return List.copyOf(result);
    }

    private List<LegacyMigrationModel.Question> readQuestions(
        final Connection source, final Map<String, Long> counts, final Map<String, Long> nulls
    ) throws SQLException {
        final List<LegacyMigrationModel.Question> result = new ArrayList<>();
        try (
            var statement = source.createStatement();
            ResultSet rows = statement.executeQuery("SELECT * FROM fragen ORDER BY id")
        ) {
            while (rows.next()) {
                countNulls("fragen", rows, nulls);
                result.add(
                    new LegacyMigrationModel.Question(
                        rows.getLong("id"), rows.getString("programName"), rows.getString("question"),
                        rows.getString("answer"), rows.getString("correct"), rows.getTimestamp("time")
                    )
                );
            }
        }
        counts.put("fragen", (long) result.size());
        return List.copyOf(result);
    }

    private List<LegacyMigrationModel.ExternalId> readExternalIds(
        final Connection source, final Map<String, Long> counts, final Map<String, Long> nulls
    ) throws SQLException {
        final List<LegacyMigrationModel.ExternalId> result = new ArrayList<>();
        try (
            var statement = source.createStatement();
            ResultSet rows = statement.executeQuery("SELECT * FROM `extId` ORDER BY id")
        ) {
            while (rows.next()) {
                countNulls("extId", rows, nulls);
                result.add(
                    new LegacyMigrationModel.ExternalId(
                        rows.getLong("id"), rows.getString("extId"), rows.getTimestamp("timestamp")
                    )
                );
            }
        }
        counts.put("extId", (long) result.size());
        return List.copyOf(result);
    }

    private List<LegacyMigrationModel.Contact> readContacts(
        final Connection source, final Map<String, Long> counts, final Map<String, Long> nulls
    ) throws SQLException {
        final List<LegacyMigrationModel.Contact> result = new ArrayList<>();
        try (
            var statement = source.createStatement();
            ResultSet rows = statement.executeQuery("SELECT * FROM nachrichten ORDER BY id")
        ) {
            while (rows.next()) {
                countNulls("nachrichten", rows, nulls);
                result.add(
                    new LegacyMigrationModel.Contact(
                        rows.getLong("id"), rows.getString("age"), rows.getString("mail"),
                        rows.getString("gender"),
                        rows.getString("subject"), rows.getString("message"), rows.getString("ip")
                    )
                );
            }
        }
        counts.put("nachrichten", (long) result.size());
        return List.copyOf(result);
    }

    private void countNulls(final String table, final ResultSet row, final Map<String, Long> nulls)
        throws SQLException {
        for (LegacySchemaContract.Column column : LegacySchemaContract.CONTRACT.get(table).columns()) {
            final String key = table + "." + column.name();
            nulls.putIfAbsent(key, 0L);
            if (row.getObject(column.name()) == null) {
                nulls.compute(key, (ignored, count) -> count + 1);
            }
        }
    }

    private Long nullableLong(final ResultSet row, final String column) throws SQLException {
        final Number value = (Number) row.getObject(column);
        return value == null ? null : value.longValue();
    }
}
