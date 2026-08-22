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

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.SQLException;
import java.sql.Statement;
import java.sql.Timestamp;
import java.util.HexFormat;
import java.util.Map;

import javax.sql.DataSource;

import org.springframework.core.io.ClassPathResource;
import org.springframework.core.io.support.EncodedResource;
import org.springframework.jdbc.datasource.init.ScriptUtils;

import de.uni_passau.fim.se2.litterbox_web.util.TestDatabase;

final class LegacyMigrationTestDatabase {

    private static final String FIXTURE_ROOT = "fixtures/legacy/";

    private final TestDatabase sourceSchema;
    private final TestDatabase targetSchema;
    private final DataSource source;
    private final DataSource target;
    private final Path reportRoot;

    LegacyMigrationTestDatabase() throws IOException {
        sourceSchema = TestDatabase.freshSchema("legacy_source");
        targetSchema = TestDatabase.freshSchema("migration_target").migrated();
        source = sourceSchema.dataSource();
        target = targetSchema.dataSource();
        reportRoot = Files.createTempDirectory("legacy-reports-");
    }

    /** Stands in for the directory the old site wrote its reports to, which the database only names. */
    Path reportRoot() {
        return reportRoot;
    }

    DataSource source() {
        return source;
    }

    DataSource target() {
        return target;
    }

    void loadSchema() throws SQLException {
        executeFixture("source-schema.sql");
    }

    void loadData() throws SQLException, IOException {
        executeFixture("source-data.sql");
        insertStatistics();
        // Row 101 names a report that is there, 103 names one that is not, and 102 names none at all.
        Files.writeString(
            reportRoot.resolve("synthetic-101.json"), resourceText("core-metrics-report.json"),
            StandardCharsets.UTF_8
        );
    }

    /** Replaces what a row's report reference points at, for the readings that are not a report. */
    void writeReport(final String name, final String content) throws IOException {
        Files.writeString(reportRoot.resolve(name), content, StandardCharsets.UTF_8);
    }

    void setUploadName(final long programmeId, final String filename) throws SQLException {
        try (
            Connection connection = source.getConnection();
            PreparedStatement statement = connection.prepareStatement(
                "UPDATE programme SET file = ? WHERE id = ?"
            )
        ) {
            statement.setString(1, filename);
            statement.setLong(2, programmeId);
            statement.executeUpdate();
        }
    }

    void setReportReference(final long programmeId, final String reference) throws SQLException {
        try (
            Connection connection = source.getConnection();
            PreparedStatement statement = connection.prepareStatement(
                "UPDATE programme SET litterbox = ? WHERE id = ?"
            )
        ) {
            statement.setString(1, reference);
            statement.setLong(2, programmeId);
            statement.executeUpdate();
        }
    }

    LegacyMigrationOptions options(final Path artifactRoot) throws IOException {
        final Path matched = resourcePath("mapped-source.sb3");
        final Path mismatched = resourcePath("mismatched-source.sb3");
        return new LegacyMigrationOptions(
            "en", "synthetic-core", artifactRoot, reportRoot,
            Map.of("synthetic-primary", "PRIMARY"),
            Map.of(101L, "resolved-synthetic-101", 102L, "resolved-synthetic-102", 103L, "resolved-synthetic-103"),
            Map.of(201L, 101L, 203L, 102L),
            Map.of(
                101L, new LegacyMigrationOptions.SourceMapping(matched, sha256(matched)),
                102L, new LegacyMigrationOptions.SourceMapping(mismatched, "0".repeat(64)),
                103L,
                new LegacyMigrationOptions.SourceMapping(artifactRoot.resolve("missing-source.sb3"), "1".repeat(64)),
                999L, new LegacyMigrationOptions.SourceMapping(mismatched, sha256(mismatched))
            )
        );
    }

    Path resourcePath(final String name) throws IOException {
        return new ClassPathResource(FIXTURE_ROOT + name).getFile().toPath();
    }

    String resourceText(final String name) throws IOException {
        return Files.readString(resourcePath(name), StandardCharsets.UTF_8);
    }

    String sha256(final Path path) throws IOException {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(Files.readAllBytes(path)));
        }
        catch (NoSuchAlgorithmException exception) {
            throw new IllegalStateException("SHA-256 is unavailable", exception);
        }
    }

    void close() {
        sourceSchema.close();
        targetSchema.close();
    }

    private void executeFixture(final String name) throws SQLException {
        try (Connection connection = source.getConnection()) {
            ScriptUtils.executeSqlScript(
                connection, new EncodedResource(new ClassPathResource(FIXTURE_ROOT + name), StandardCharsets.UTF_8)
            );
        }
    }

    private void insertStatistics() throws SQLException {
        final String columns = String.join(", ", LegacySchemaContract.STATISTIKEN_COLUMNS);
        final String placeholders = String.join(
            ", ", java.util.Collections.nCopies(
                LegacySchemaContract.STATISTIKEN_COLUMNS.size(), "?"
            )
        );
        try (
            Connection connection = source.getConnection();
            PreparedStatement statement = connection.prepareStatement(
                "INSERT INTO statistiken (" + columns + ") VALUES (" + placeholders + ")"
            )
        ) {
            int parameter = 1;
            for (String column : LegacySchemaContract.STATISTIKEN_COLUMNS) {
                if ("id".equals(column)) {
                    statement.setLong(parameter, 1001);
                }
                else if ("program".equals(column)) {
                    statement.setLong(parameter, 101);
                }
                else if ("author".equals(column)) {
                    statement.setString(parameter, "synthetic-author-alpha");
                }
                else if ("created".equals(column)) {
                    statement.setTimestamp(parameter, Timestamp.valueOf("2026-01-02 03:04:05"));
                }
                else {
                    statement.setDouble(parameter, 1.0);
                }
                parameter++;
            }
            statement.executeUpdate();
            try (Statement second = connection.createStatement()) {
                second.executeUpdate(
                    "INSERT INTO statistiken (id, program, views, author, created) "
                        + "VALUES (1002, 102, 7, 'synthetic-author-beta', '2026-01-03 03:04:05')"
                );
            }
        }
    }
}
