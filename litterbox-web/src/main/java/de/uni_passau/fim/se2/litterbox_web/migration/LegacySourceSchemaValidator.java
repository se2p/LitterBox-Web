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

final class LegacySourceSchemaValidator {

    private static final Map<String, Integer> JDBC_TYPES = Map.ofEntries(
        Map.entry("tinyint", java.sql.Types.TINYINT),
        Map.entry("smallint", java.sql.Types.SMALLINT),
        Map.entry("mediumint", java.sql.Types.INTEGER),
        Map.entry("int", java.sql.Types.INTEGER),
        Map.entry("integer", java.sql.Types.INTEGER),
        Map.entry("bigint", java.sql.Types.BIGINT),
        Map.entry("float", java.sql.Types.FLOAT),
        Map.entry("double", java.sql.Types.DOUBLE),
        Map.entry("decimal", java.sql.Types.DECIMAL),
        Map.entry("numeric", java.sql.Types.DECIMAL),
        Map.entry("char", java.sql.Types.CHAR),
        Map.entry("varchar", java.sql.Types.VARCHAR),
        Map.entry("tinytext", java.sql.Types.LONGVARCHAR),
        Map.entry("text", java.sql.Types.LONGVARCHAR),
        Map.entry("mediumtext", java.sql.Types.LONGVARCHAR),
        Map.entry("longtext", java.sql.Types.LONGVARCHAR),
        Map.entry("timestamp", java.sql.Types.TIMESTAMP),
        Map.entry("datetime", java.sql.Types.TIMESTAMP),
        Map.entry("date", java.sql.Types.DATE)
    );

    void validate(final Connection source) throws SQLException {
        final Map<String, List<ActualColumn>> discovered = discover(source);
        final List<LegacyMigrationException.Diagnostic> diagnostics = new ArrayList<>();
        for (Map.Entry<String, LegacySchemaContract.Table> entry : LegacySchemaContract.CONTRACT.entrySet()) {
            validateTable(entry.getKey(), entry.getValue(), discovered, diagnostics);
        }
        if (!diagnostics.isEmpty()) {
            throw new LegacyMigrationException("Legacy source schema is incompatible", diagnostics);
        }
    }

    private Map<String, List<ActualColumn>> discover(final Connection source) throws SQLException {
        final Map<String, List<ActualColumn>> result = new LinkedHashMap<>();
        final String sql = "SELECT TABLE_NAME, COLUMN_NAME, DATA_TYPE, COLUMN_TYPE, ORDINAL_POSITION "
            + "FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() "
            + "ORDER BY TABLE_NAME, ORDINAL_POSITION";
        try (var statement = source.createStatement(); ResultSet rows = statement.executeQuery(sql)) {
            while (rows.next()) {
                result.computeIfAbsent(rows.getString("TABLE_NAME"), ignored -> new ArrayList<>()).add(
                    new ActualColumn(
                        rows.getString("COLUMN_NAME"),
                        jdbcType(rows.getString("DATA_TYPE")),
                        rows.getString("COLUMN_TYPE"),
                        rows.getInt("ORDINAL_POSITION")
                    )
                );
            }
        }
        return result;
    }

    private void validateTable(
        final String table,
        final LegacySchemaContract.Table expected,
        final Map<String, List<ActualColumn>> discovered,
        final List<LegacyMigrationException.Diagnostic> diagnostics
    ) {
        final List<ActualColumn> actual = discovered.get(table);
        if (actual == null) {
            final boolean caseChanged = discovered.keySet().stream().anyMatch(name -> name.equalsIgnoreCase(table));
            final String code = caseChanged ? "TABLE_CASE_CHANGED" : "MISSING_TABLE";
            diagnostics.add(new LegacyMigrationException.Diagnostic(code, table, null, "required table is absent", 1));
            return;
        }
        final Map<String, ActualColumn> byName = new LinkedHashMap<>();
        actual.forEach(column -> byName.put(column.name(), column));
        for (LegacySchemaContract.Column column : expected.columns()) {
            validateColumn(table, column, byName, diagnostics);
        }
        for (ActualColumn column : actual) {
            final boolean expectedColumn = expected.columns().stream()
                .anyMatch(item -> item.name().equals(column.name()));
            if (!expectedColumn) {
                diagnostics.add(
                    new LegacyMigrationException.Diagnostic(
                        "UNEXPECTED_COLUMN", table, column.name(), "column is outside the required contract", 1
                    )
                );
            }
        }
        final List<String> expectedOrder = expected.columns().stream().map(LegacySchemaContract.Column::name).toList();
        final List<String> actualOrder = actual.stream().map(ActualColumn::name).toList();
        if (!expectedOrder.equals(actualOrder)) {
            diagnostics.add(
                new LegacyMigrationException.Diagnostic(
                    "COLUMN_ORDER_CHANGED", table, null, "required column order differs", 1
                )
            );
        }
    }

    private void validateColumn(
        final String table,
        final LegacySchemaContract.Column expected,
        final Map<String, ActualColumn> actual,
        final List<LegacyMigrationException.Diagnostic> diagnostics
    ) {
        final ActualColumn column = actual.get(expected.name());
        if (column == null) {
            diagnostics.add(
                new LegacyMigrationException.Diagnostic(
                    "MISSING_COLUMN", table, expected.name(), "required column is absent", 1
                )
            );
        }
        else if (!expected.kind().accepts(column.jdbcType())) {
            diagnostics.add(
                new LegacyMigrationException.Diagnostic(
                    "INCOMPATIBLE_SQL_TYPE", table, expected.name(),
                    "expected " + expected.kind() + " but found " + column.typeName(), 1
                )
            );
        }
    }

    private int jdbcType(final String dataType) {
        return JDBC_TYPES.getOrDefault(dataType.toLowerCase(java.util.Locale.ROOT), java.sql.Types.OTHER);
    }

    private record ActualColumn(String name, int jdbcType, String typeName, int ordinal) {
    }
}
