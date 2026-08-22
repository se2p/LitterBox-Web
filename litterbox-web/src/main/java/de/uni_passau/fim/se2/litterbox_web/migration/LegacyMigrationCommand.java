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
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.LinkOption;
import java.nio.file.Path;
import java.security.MessageDigest;
import java.sql.Connection;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;
import java.util.HexFormat;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Objects;
import java.util.TreeMap;

import javax.sql.DataSource;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.SerializationFeature;

/**
 * The import of the old site, as a thing that can be run and looked at.
 *
 * <p>
 * The harness takes every project as an explicit mapping from legacy id to path and expected digest, which is a fine
 * thing to demand and an impossible thing to type four thousand times. This is what builds them: it reads the old rows,
 * finds each upload by the name the row gives it, and declares it with the digest it has. What it declared is written
 * out beside the report, so a later run can be held against it.
 */
final class LegacyMigrationCommand {

    private static final Logger log = LoggerFactory.getLogger(LegacyMigrationCommand.class);

    private final LegacyMigrationProperties properties;
    private final DataSource source;
    private final DataSource target;
    private final LegacyArtifactReanalysisVerifier verifier;

    LegacyMigrationCommand(
        final LegacyMigrationProperties properties,
        final DataSource source,
        final DataSource target,
        final LegacyArtifactReanalysisVerifier verifier
    ) {
        this.properties = Objects.requireNonNull(properties, "properties");
        this.source = Objects.requireNonNull(source, "source");
        this.target = Objects.requireNonNull(target, "target");
        this.verifier = Objects.requireNonNull(verifier, "verifier");
    }

    LegacyMigrationReport run() throws IOException, SQLException {
        require(properties.getUploadsRoot(), "uploads-root");
        require(properties.getReportRoot(), "report-root");
        require(properties.getArtifactStoreRoot(), "artifact-store-root");

        final Map<Long, LegacyMigrationOptions.SourceMapping> mappings = discoverSourceMappings();
        final LegacyMigrationOptions options = new LegacyMigrationOptions(
            properties.getLocale(), properties.getLitterboxArtifactVersion(), properties.getArtifactStoreRoot(),
            properties.getReportRoot(), properties.getApprovedSchoolTypes(), properties.getTokenResolutions(),
            properties.getQuestionResolutions(), mappings
        );
        writeManifest(mappings);

        final LegacyMigrationHarness harness = new LegacyMigrationHarness(source, target, verifier);
        log.info(
            "Importing the legacy schema{}. {} of its projects were found in {}.",
            properties.isDryRun() ? " as a rehearsal, which is rolled back" : "", mappings.size(),
            properties.getUploadsRoot()
        );
        final LegacyMigrationReport report = properties.isDryRun()
            ? harness.rehearse(options)
            : harness.migrate(options);
        writeReport(report);
        describe(report, harness.verificationEvidence());
        return report;
    }

    private void describe(final LegacyMigrationReport report, final LegacyArtifactVerificationEvidence evidence) {
        log.info(
            "{} rows read. {} reports were read from their files, {} were named but not there, {} were not "
                + "reports, {} were too large to serve and kept only their metrics, {} rows named none. {} projects "
                + "were copied; {} of them still parse and {} no longer do. {} rows had no project left to copy.",
            report.sourceRowCounts().getOrDefault("programme", 0L), report.reports().loaded(),
            report.reports().missing(), report.reports().unreadable(), report.reports().oversized(),
            report.reports().withoutReference(),
            evidence.reopenedArtifacts(), evidence.reanalysisSuccesses(), evidence.reanalysisParseFailures(),
            report.artifacts().unavailable()
        );
    }

    /**
     * Pairs every legacy row with the upload it names, where that upload is still there. A row whose file has been lost
     * is left unmapped on purpose: the harness records it as unavailable and migrates everything else the old database
     * still knows about it.
     */
    private Map<Long, LegacyMigrationOptions.SourceMapping> discoverSourceMappings() throws SQLException, IOException {
        final Map<Long, LegacyMigrationOptions.SourceMapping> result = new LinkedHashMap<>();
        final Path root = properties.getUploadsRoot().toAbsolutePath().normalize();
        try (
            Connection connection = source.getConnection();
            Statement statement = connection.createStatement();
            ResultSet rows = statement.executeQuery("SELECT id, file FROM programme ORDER BY id")
        ) {
            while (rows.next()) {
                final String filename = rows.getString("file");
                if (filename == null || filename.isBlank()) {
                    continue;
                }
                final Path upload = LegacyPaths.resolveInsideDirectory(root, filename);
                if (upload == null || !Files.isRegularFile(upload, LinkOption.NOFOLLOW_LINKS)) {
                    continue;
                }
                result.put(rows.getLong("id"), new LegacyMigrationOptions.SourceMapping(upload, sha256(upload)));
            }
        }
        return Map.copyOf(result);
    }

    private String sha256(final Path file) throws IOException {
        final MessageDigest digest = LegacyChecksums.digest();
        try (InputStream input = Files.newInputStream(file, LinkOption.NOFOLLOW_LINKS)) {
            final byte[] buffer = new byte[8192];
            int read = input.read(buffer);
            while (read >= 0) {
                digest.update(buffer, 0, read);
                read = input.read(buffer);
            }
        }
        return HexFormat.of().formatHex(digest.digest());
    }

    private void writeManifest(final Map<Long, LegacyMigrationOptions.SourceMapping> mappings) throws IOException {
        final Map<String, Map<String, String>> manifest = new TreeMap<>();
        mappings.forEach(
            (id, mapping) -> manifest.put(
                Long.toString(id), Map.of("path", mapping.path().toString(), "sha256", mapping.expectedSha256())
            )
        );
        writeBeside("-sources.json", json(manifest));
    }

    private void writeReport(final LegacyMigrationReport report) throws IOException {
        final Path output = properties.getReportOutput().toAbsolutePath();
        createParent(output);
        Files.writeString(output, report.toJson(), StandardCharsets.UTF_8);
        log.info("The migration report is in {}.", output);
    }

    private void writeBeside(final String suffix, final String content) throws IOException {
        final Path output = properties.getReportOutput().toAbsolutePath();
        final String name = output.getFileName().toString().replaceFirst("\\.json$", "") + suffix;
        final Path beside = output.resolveSibling(name);
        createParent(beside);
        Files.writeString(beside, content, StandardCharsets.UTF_8);
    }

    private void createParent(final Path file) throws IOException {
        final Path parent = file.getParent();
        if (parent != null) {
            Files.createDirectories(parent);
        }
    }

    private String json(final Map<String, Map<String, String>> value) {
        final ObjectMapper mapper = new ObjectMapper();
        mapper.enable(SerializationFeature.ORDER_MAP_ENTRIES_BY_KEYS);
        try {
            return mapper.writeValueAsString(value);
        }
        catch (JsonProcessingException exception) {
            throw new IllegalStateException("The source manifest could not be serialized", exception);
        }
    }

    private void require(final Object value, final String name) {
        if (value == null || (value instanceof String text && text.isBlank())) {
            throw new IllegalStateException("litterbox.legacy-migration." + name + " must be set");
        }
    }
}
