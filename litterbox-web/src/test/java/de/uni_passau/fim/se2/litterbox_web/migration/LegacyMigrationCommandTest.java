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

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Map;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.jdbc.core.JdbcTemplate;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;

/** The thing an operator actually runs, declaring every project by id, path and digest as the harness demands. */
class LegacyMigrationCommandTest {

    private LegacyMigrationTestDatabase schemas;

    @BeforeEach
    void createSchemas() throws Exception {
        schemas = new LegacyMigrationTestDatabase();
        schemas.loadSchema();
        schemas.loadData();
    }

    @AfterEach
    void dropSchemas() {
        schemas.close();
    }

    @Test
    void findsEveryUploadTheOldRowsNameAndImportsIt(@TempDir final Path work) throws Exception {
        final Path uploads = uploadsWith(work, "repeated-synthetic.sb3", "unique-synthetic.mblock");
        final LegacyMigrationProperties properties = properties(work, uploads, false);

        final LegacyMigrationReport report = command(properties).run();

        assertThat(report.artifacts().explicitlyMapped()).isEqualTo(3L);
        assertThat(report.artifacts().checksumMatched()).isEqualTo(3L);
        assertThat(report.artifacts().unavailable()).isZero();
        assertThat(report.reports().loaded()).isEqualTo(1L);
        final JdbcTemplate target = new JdbcTemplate(schemas.target());
        assertThat(target.queryForObject("SELECT COUNT(*) FROM analysis", Long.class)).isEqualTo(3L);
        assertThat(target.queryForObject("SELECT report_json FROM analysis WHERE legacy_id = '101'", String.class))
            .isEqualTo(schemas.resourceText("core-metrics-report.json"));
    }

    /** A row whose upload has been lost keeps everything the old database still knows about it. */
    @Test
    void leavesARowWhoseUploadIsGoneUnmappedRatherThanFailing(@TempDir final Path work) throws Exception {
        final Path uploads = uploadsWith(work, "repeated-synthetic.sb3");

        final LegacyMigrationReport report = command(properties(work, uploads, false)).run();

        assertThat(report.artifacts().withoutMapping()).isEqualTo(1L);
        assertThat(report.artifacts().explicitlyMapped()).isEqualTo(2L);
        assertThat(
            new JdbcTemplate(schemas.target())
                .queryForObject("SELECT COUNT(*) FROM analysis", Long.class)
        ).isEqualTo(3L);
    }

    /** What was declared is written down, so a later run can be held against what this one found. */
    @Test
    void writesTheReportAndWhatItDeclared(@TempDir final Path work) throws Exception {
        final Path uploads = uploadsWith(work, "repeated-synthetic.sb3", "unique-synthetic.mblock");
        final LegacyMigrationProperties properties = properties(work, uploads, false);

        command(properties).run();

        final JsonNode report = new ObjectMapper().readTree(Files.readString(properties.getReportOutput()));
        assertThat(report.path("status").asText()).isEqualTo("MIGRATED");
        final JsonNode manifest = new ObjectMapper()
            .readTree(Files.readString(work.resolve("migration-sources.json")));
        assertThat(manifest.fieldNames()).toIterable().containsExactlyInAnyOrder("101", "102", "103");
        assertThat(manifest.path("101").path("sha256").asText()).hasSize(64);
        assertThat(manifest.path("101").path("path").asText()).endsWith("repeated-synthetic.sb3");
    }

    /** A rehearsal answers the same questions and leaves the schema as clean as it found it. */
    @Test
    void rehearsesWithoutKeepingAnything(@TempDir final Path work) throws Exception {
        final Path uploads = uploadsWith(work, "repeated-synthetic.sb3", "unique-synthetic.mblock");

        final LegacyMigrationReport report = command(properties(work, uploads, true)).run();

        assertThat(report.artifacts().checksumMatched()).isEqualTo(3L);
        assertThat(report.reports().loaded()).isEqualTo(1L);
        final JdbcTemplate target = new JdbcTemplate(schemas.target());
        assertThat(target.queryForObject("SELECT COUNT(*) FROM analysis", Long.class)).isZero();
        assertThat(target.queryForObject("SELECT COUNT(*) FROM legacy_id_map", Long.class)).isZero();
        assertThat(Files.walk(artifactRoot(work)).filter(Files::isRegularFile).toList()).isEmpty();
    }

    /** A name from the old database that climbs out of the uploads directory is not followed. */
    @Test
    void refusesAnUploadNameThatLeavesItsDirectory(@TempDir final Path work) throws Exception {
        final Path uploads = uploadsWith(work, "repeated-synthetic.sb3");
        Files.writeString(work.resolve("outside.sb3"), "not for you", StandardCharsets.UTF_8);
        schemas.setUploadName(103L, "../outside.sb3");
        final LegacyMigrationProperties properties = properties(work, uploads, false);
        // Renaming the file is also what a question joined on, so that join has to be made explicit instead.
        properties.setQuestionResolutions(Map.of(201L, 101L, 202L, 103L, 203L, 102L));

        final LegacyMigrationReport report = command(properties).run();

        assertThat(report.artifacts().withoutMapping()).isEqualTo(1L);
        assertThat(Files.exists(work.resolve("outside.sb3"))).isTrue();
    }

    @Test
    void refusesToRunWithoutTheDirectoriesItReads(@TempDir final Path work) throws Exception {
        final LegacyMigrationProperties properties = properties(work, uploadsWith(work), false);
        properties.setReportRoot(null);

        assertThatThrownBy(() -> command(properties).run())
            .isInstanceOf(IllegalStateException.class)
            .hasMessageContaining("report-root");
    }

    private LegacyMigrationCommand command(final LegacyMigrationProperties properties) {
        return new LegacyMigrationCommand(
            properties, schemas.source(), schemas.target(), LegacySyntheticReanalysisVerifier::verify
        );
    }

    private LegacyMigrationProperties properties(
        final Path work,
        final Path uploads,
        final boolean dryRun
    ) throws IOException {
        final LegacyMigrationProperties properties = new LegacyMigrationProperties();
        properties.setUploadsRoot(uploads);
        properties.setReportRoot(schemas.reportRoot());
        properties.setArtifactStoreRoot(artifactRoot(work));
        properties.setReportOutput(work.resolve("migration.json"));
        properties.setLocale("en");
        properties.setLitterboxArtifactVersion("synthetic-core");
        properties.setApprovedSchoolTypes(Map.of("synthetic-primary", "PRIMARY"));
        properties.setTokenResolutions(
            Map.of(101L, "resolved-synthetic-101", 102L, "resolved-synthetic-102", 103L, "resolved-synthetic-103")
        );
        properties.setQuestionResolutions(Map.of(201L, 101L, 203L, 102L));
        properties.setDryRun(dryRun);
        return properties;
    }

    private Path artifactRoot(final Path work) throws IOException {
        return Files.createDirectories(work.resolve("artifacts"));
    }

    /** The old uploads directory, holding the files the fixture rows name and nothing else. */
    private Path uploadsWith(final Path work, final String... names) throws IOException {
        final Path uploads = Files.createDirectories(work.resolve("uploads"));
        for (String name : names) {
            Files.writeString(uploads.resolve(name), "synthetic project " + name, StandardCharsets.UTF_8);
        }
        return uploads;
    }
}
