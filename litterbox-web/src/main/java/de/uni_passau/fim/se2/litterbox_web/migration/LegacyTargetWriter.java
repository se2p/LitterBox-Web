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
import java.io.OutputStream;
import java.io.Reader;
import java.nio.file.AtomicMoveNotSupportedException;
import java.nio.file.FileAlreadyExistsException;
import java.nio.file.FileSystemException;
import java.nio.file.Files;
import java.nio.file.InvalidPathException;
import java.nio.file.LinkOption;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.nio.file.StandardOpenOption;
import java.security.MessageDigest;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;
import java.sql.Timestamp;
import java.sql.Types;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.HexFormat;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.TreeMap;

final class LegacyTargetWriter {

    private static final List<String> COUNTED_TABLES = List.of(
        "submission", "source_artifact", "submission_artifact", "analysis", "analysis_metric",
        "scratch_project_stats", "issue_feedback", "quiz_answer", "legacy_id_map", "external_id",
        "contact_message"
    );

    private final Connection target;
    private final LegacyMigrationOptions options;
    private final LegacyArtifactReanalysisVerifier reanalysisVerifier;
    private final List<Path> createdArtifacts = new ArrayList<>();
    private final Map<String, Long> artifactIds = new HashMap<>();
    private final Map<Long, Long> analysisIds = new LinkedHashMap<>();
    private final Map<Long, Long> submissionIds = new LinkedHashMap<>();

    LegacyTargetWriter(
        final Connection target,
        final LegacyMigrationOptions options,
        final LegacyArtifactReanalysisVerifier reanalysisVerifier
    ) {
        this.target = target;
        this.options = options;
        this.reanalysisVerifier = reanalysisVerifier;
    }

    LegacyMigrationModel.TargetResult write(final LegacyMigrationModel.PreparedMigration plan)
        throws SQLException, IOException {
        try {
            writeProgrammes(plan);
            writeFeedback(plan);
            writeQuestions(plan);
            writeExternalIds(plan.source().externalIds());
            writeContacts(plan.source().contacts());
            final LegacyArtifactVerificationEvidence verificationEvidence = copyAndVerifyArtifacts(plan);
            final Map<String, Long> counts = rowCounts();
            final Map<String, Long> nulls = nullCounts();
            final Map<String, LegacyMigrationReport.MetricAggregate> metrics = metricAggregates(
                plan.source().programmes().size()
            );
            return new LegacyMigrationModel.TargetResult(
                counts, nulls, metrics, targetReportChecksum(), targetMetricChecksum(), verificationEvidence
            );
        }
        catch (SQLException | RuntimeException exception) {
            cleanupArtifacts();
            throw exception;
        }
    }

    void cleanupArtifacts() {
        for (Path path : createdArtifacts) {
            try {
                Files.deleteIfExists(path);
            }
            catch (IOException ignored) {
                // The database rollback remains authoritative; an unreferenced content hash is safe.
            }
        }
    }

    private void writeProgrammes(final LegacyMigrationModel.PreparedMigration plan) throws SQLException, IOException {
        final Map<Long, LegacyMigrationModel.Statistics> statistics = new HashMap<>();
        plan.source().statistics().forEach(row -> statistics.put(row.programmeId(), row));
        for (LegacyMigrationModel.Programme programme : plan.source().programmes()) {
            final LegacyMigrationModel.Artifact artifact = plan.artifacts().get(programme.id());
            final long artifactId = artifactId(programme, artifact);
            final long submissionId = insertSubmission(
                programme, plan.shareTokens().get(programme.id()),
                plan.schoolTypes().get(programme.id())
            );
            final long analysisId = insertAnalysis(
                programme, artifact, artifactId, submissionId, plan.reports().get(programme.id())
            );
            submissionIds.put(programme.id(), submissionId);
            analysisIds.put(programme.id(), analysisId);
            insertSubmissionArtifact(submissionId, artifactId);
            insertLegacyMap("programme", programme.id(), programme.token(), programme.filename(), analysisId);
            final LegacyMigrationModel.Statistics statistic = statistics.get(programme.id());
            if (statistic != null) {
                writeStatistics(programme, statistic, analysisId);
            }
            writeMetrics(analysisId, plan.metrics().get(programme.id()));
        }
    }

    private long artifactId(
        final LegacyMigrationModel.Programme programme,
        final LegacyMigrationModel.Artifact artifact
    ) throws SQLException {
        final String hex = HexFormat.of().formatHex(artifact.sha256());
        final Long existing = artifactIds.get(hex);
        if (existing != null) {
            return existing;
        }
        final String storageKey;
        final String sourceKind;
        if (artifact.availability() == LegacyMigrationModel.Availability.VERIFIED) {
            storageKey = "sha256/" + hex;
            sourceKind = "LEGACY";
        }
        else {
            storageKey = "legacy-unavailable/" + programme.id();
            sourceKind = "LEGACY_UNAVAILABLE";
        }
        final String sql = "INSERT INTO source_artifact "
            + "(sha256, storage_key, original_filename, media_type, byte_size, source_kind, manifest_json, "
            + "retention_state, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, 'ACTIVE', ?)";
        try (PreparedStatement statement = target.prepareStatement(sql, Statement.RETURN_GENERATED_KEYS)) {
            statement.setBytes(1, artifact.sha256());
            statement.setString(2, storageKey);
            statement.setString(3, programme.filename());
            statement.setString(4, mediaType(programme.filename()));
            statement.setLong(5, artifact.byteSize());
            statement.setString(6, sourceKind);
            statement.setString(7, artifact.manifestJson());
            statement.setTimestamp(8, programme.time());
            statement.executeUpdate();
            final long id = generatedId(statement);
            artifactIds.put(hex, id);
            return id;
        }
    }

    private long insertSubmission(
        final LegacyMigrationModel.Programme programme,
        final String shareToken,
        final String schoolType
    ) throws SQLException {
        final String sql = "INSERT INTO submission "
            + "(share_token, source_type, locale, school_type, state, expected_count, completed_count, "
            + "failed_count, created_at, updated_at) VALUES (?, 'LEGACY', ?, ?, 'COMPLETED', 1, 1, 0, ?, ?)";
        try (PreparedStatement statement = target.prepareStatement(sql, Statement.RETURN_GENERATED_KEYS)) {
            statement.setString(1, shareToken);
            statement.setString(2, options.locale());
            setNullableString(statement, 3, schoolType);
            statement.setTimestamp(4, programme.time());
            statement.setTimestamp(5, programme.time());
            statement.executeUpdate();
            return generatedId(statement);
        }
    }

    private long insertAnalysis(
        final LegacyMigrationModel.Programme programme,
        final LegacyMigrationModel.Artifact artifact,
        final long artifactId,
        final long submissionId,
        final LegacyMigrationModel.ReportSnapshot report
    ) throws SQLException, IOException {
        final String sql = "INSERT INTO analysis "
            + "(submission_id, source_artifact_id, project_id, project_name, provenance, report_schema_version, "
            + "litterbox_artifact_version, locale, input_sha256, input_format, report_json, status, legacy_id, "
            + "from_creation, created_at, completed_at) "
            // Marked as a creation, which it is: each migrated programme gets a submission of its own, and this is
            // the analysis that submission exists for. Migrated work is thereby the same shape as work this service
            // made itself, and re-analysing a retained legacy programme later adds a row rather than being refused.
            + "VALUES (?, ?, ?, ?, 'LEGACY', 'legacy', ?, ?, ?, ?, ?, 'DONE', ?, TRUE, ?, ?)";
        try (PreparedStatement statement = target.prepareStatement(sql, Statement.RETURN_GENERATED_KEYS)) {
            statement.setLong(1, submissionId);
            statement.setLong(2, artifactId);
            setNullableString(statement, 3, scratchProjectId(programme.url()));
            setNullableString(statement, 4, programme.filename());
            statement.setString(5, options.litterboxArtifactVersion());
            statement.setString(6, options.locale());
            if (artifact.availability() == LegacyMigrationModel.Availability.VERIFIED) {
                statement.setBytes(7, artifact.sha256());
            }
            else {
                statement.setNull(7, Types.BINARY);
            }
            setNullableString(statement, 8, inputFormat(programme.filename()));
            if (report == null) {
                statement.setNull(9, Types.LONGVARCHAR);
            }
            else {
                verifyReport(report);
                try (
                    Reader contents = Files
                        .newBufferedReader(report.sourcePath(), java.nio.charset.StandardCharsets.UTF_8)
                ) {
                    statement.setCharacterStream(9, contents);
                    statement.setString(10, Long.toString(programme.id()));
                    statement.setTimestamp(11, programme.time());
                    statement.setTimestamp(12, programme.time());
                    statement.executeUpdate();
                }
                verifyReport(report);
                return generatedId(statement);
            }
            statement.setString(10, Long.toString(programme.id()));
            statement.setTimestamp(11, programme.time());
            statement.setTimestamp(12, programme.time());
            statement.executeUpdate();
            return generatedId(statement);
        }
    }

    private void verifyReport(final LegacyMigrationModel.ReportSnapshot report) throws IOException {
        final MessageDigest digest = LegacyChecksums.digest();
        long byteSize = 0;
        try (InputStream input = Files.newInputStream(report.sourcePath(), LinkOption.NOFOLLOW_LINKS)) {
            final byte[] buffer = new byte[8192];
            int read;
            while ((read = input.read(buffer)) >= 0) {
                if (read > 0) {
                    digest.update(buffer, 0, read);
                    byteSize += read;
                }
            }
        }
        if (byteSize != report.byteSize() || !MessageDigest.isEqual(digest.digest(), report.sha256())) {
            throw new LegacyMigrationException(
                "Legacy report changed after migration planning",
                List.of(
                    new LegacyMigrationException.Diagnostic(
                        "REPORT_SOURCE_CHANGED", "programme", "litterbox", "report bytes changed after discovery", 1
                    )
                )
            );
        }
    }

    private void insertSubmissionArtifact(final long submissionId, final long artifactId) throws SQLException {
        try (
            PreparedStatement statement = target.prepareStatement(
                "INSERT INTO submission_artifact (submission_id, artifact_id, role) VALUES (?, ?, 'LEGACY_SOURCE')"
            )
        ) {
            statement.setLong(1, submissionId);
            statement.setLong(2, artifactId);
            statement.executeUpdate();
        }
    }

    private void writeStatistics(
        final LegacyMigrationModel.Programme programme,
        final LegacyMigrationModel.Statistics statistics,
        final long analysisId
    ) throws SQLException {
        final String username = statistics.author() == null || statistics.author().isBlank()
            ? programme.scratchUsername()
            : statistics.author();
        final boolean hasStats = hasStatistics(statistics, username);
        if (hasStats) {
            final String sql = "INSERT INTO scratch_project_stats "
                + "(analysis_id, views, loves, favorites, remixes, author_username, username_source, "
                + "scratch_created_at) VALUES (?, ?, ?, ?, ?, ?, 'LEGACY', ?)";
            try (PreparedStatement statement = target.prepareStatement(sql)) {
                statement.setLong(1, analysisId);
                setNullableLong(statement, 2, statistics.views());
                setNullableLong(statement, 3, statistics.loves());
                setNullableLong(statement, 4, statistics.favorites());
                setNullableLong(statement, 5, statistics.remixes());
                setNullableString(statement, 6, username);
                setNullableTimestamp(statement, 7, statistics.created());
                statement.executeUpdate();
            }
        }
        insertLegacyMap("statistiken", statistics.id(), null, programme.filename(), analysisId);
    }

    private void writeMetrics(final long analysisId, final Map<String, Double> metrics) throws SQLException {
        final String sql = "INSERT INTO analysis_metric (analysis_id, name, value) VALUES (?, ?, ?)";
        try (PreparedStatement statement = target.prepareStatement(sql)) {
            for (Map.Entry<String, Double> metric : metrics.entrySet()) {
                statement.setLong(1, analysisId);
                statement.setString(2, metric.getKey());
                statement.setDouble(3, metric.getValue());
                statement.addBatch();
            }
            statement.executeBatch();
        }
    }

    private boolean hasStatistics(
        final LegacyMigrationModel.Statistics statistics,
        final String username
    ) {
        if (statistics.views() != null || statistics.loves() != null) {
            return true;
        }
        if (statistics.favorites() != null || statistics.remixes() != null) {
            return true;
        }
        return username != null || statistics.created() != null;
    }

    private void writeFeedback(final LegacyMigrationModel.PreparedMigration plan) throws SQLException {
        final String sql = "INSERT INTO issue_feedback "
            + "(analysis_id, finder_name, reaction, created_at, updated_at) VALUES (?, ?, ?, ?, ?)";
        try (PreparedStatement statement = target.prepareStatement(sql)) {
            for (LegacyMigrationModel.Feedback feedback : plan.source().feedback()) {
                statement.setLong(1, analysisIds.get(feedback.programmeId()));
                statement.setString(2, feedback.pattern());
                statement.setString(3, reaction(feedback.reaction()));
                statement.setTimestamp(4, feedback.time());
                statement.setTimestamp(5, feedback.time());
                statement.executeUpdate();
                insertLegacyMap(
                    "feedback", feedback.id(), feedback.pattern(), null, analysisIds.get(feedback.programmeId())
                );
            }
        }
    }

    private void writeQuestions(final LegacyMigrationModel.PreparedMigration plan) throws SQLException {
        final String sql = "INSERT INTO quiz_answer "
            + "(id, analysis_id, question_id, answer, correct, created_at) VALUES (?, ?, ?, ?, ?, ?)";
        try (PreparedStatement statement = target.prepareStatement(sql)) {
            for (LegacyMigrationModel.Question question : plan.source().questions()) {
                final long programmeId = plan.questionProgrammeIds().get(question.id());
                statement.setLong(1, question.id());
                statement.setLong(2, analysisIds.get(programmeId));
                statement.setString(3, question.question());
                statement.setString(4, question.answer());
                setNullableBoolean(statement, 5, correct(question.correct()));
                statement.setTimestamp(6, question.time());
                statement.executeUpdate();
                insertLegacyMap("fragen", question.id(), null, question.programName(), analysisIds.get(programmeId));
            }
        }
    }

    private void writeExternalIds(final List<LegacyMigrationModel.ExternalId> rows) throws SQLException {
        final String sql = "INSERT INTO external_id (id, legacy_name, legacy_value, created_at) "
            + "VALUES (?, 'extId', ?, ?)";
        final Set<String> written = new HashSet<>();
        try (PreparedStatement statement = target.prepareStatement(sql)) {
            for (LegacyMigrationModel.ExternalId row : rows) {
                if (written.add(row.value().toLowerCase(Locale.ROOT))) {
                    statement.setLong(1, row.id());
                    statement.setString(2, row.value());
                    statement.setTimestamp(3, row.timestamp());
                    statement.executeUpdate();
                }
                insertLegacyMap("extId", row.id(), null, null, null);
            }
        }
    }

    private void writeContacts(final List<LegacyMigrationModel.Contact> rows) throws SQLException {
        final String sql = "INSERT INTO contact_message (id, sender_name, sender_email, message, created_at) "
            + "VALUES (?, ?, ?, ?, NULL)";
        try (PreparedStatement statement = target.prepareStatement(sql)) {
            for (LegacyMigrationModel.Contact row : rows) {
                statement.setLong(1, row.id());
                statement.setString(2, row.subject());
                setNullableString(statement, 3, row.mail());
                statement.setString(4, row.message());
                statement.executeUpdate();
                insertLegacyMap("nachrichten", row.id(), null, null, null);
            }
        }
    }

    private void insertLegacyMap(
        final String table,
        final long oldId,
        final String token,
        final String filename,
        final Long analysisId
    ) throws SQLException {
        final String sql = "INSERT INTO legacy_id_map "
            + "(old_table_name, old_id, old_token, old_filename, analysis_id) VALUES (?, ?, ?, ?, ?)";
        try (PreparedStatement statement = target.prepareStatement(sql)) {
            statement.setString(1, table);
            statement.setString(2, Long.toString(oldId));
            setNullableString(statement, 3, token);
            setNullableString(statement, 4, filename);
            if (analysisId == null) {
                statement.setNull(5, Types.BIGINT);
            }
            else {
                statement.setLong(5, analysisId);
            }
            statement.executeUpdate();
        }
    }

    private LegacyArtifactVerificationEvidence copyAndVerifyArtifacts(
        final LegacyMigrationModel.PreparedMigration plan
    ) throws SQLException {
        final Path root = options.artifactStoreRoot().toAbsolutePath().normalize();
        final Map<String, Path> copied = new TreeMap<>();
        try {
            createDirectoryNoSymlinks(root);
            for (LegacyMigrationModel.Artifact artifact : plan.artifacts().values()) {
                if (artifact.availability() != LegacyMigrationModel.Availability.VERIFIED) {
                    continue;
                }
                final String hex = HexFormat.of().formatHex(artifact.sha256());
                if (copied.containsKey(hex)) {
                    continue;
                }
                final Path destination = storagePath(root, "sha256/" + hex, hex);
                createDirectoryNoSymlinks(destination.getParent());
                if (Files.exists(destination, LinkOption.NOFOLLOW_LINKS)) {
                    validateStoredArtifact(destination, artifact.sha256(), artifact.byteSize());
                }
                else {
                    copyArtifact(artifact, destination);
                }
                copied.put(hex, destination);
            }
            return verifyCopiedArtifacts(root, copied);
        }
        catch (LegacyMigrationException exception) {
            throw exception;
        }
        catch (IOException exception) {
            throw verificationFailure("ARTIFACT_STORE_UNAVAILABLE", root, exception);
        }
    }

    private LegacyArtifactVerificationEvidence verifyCopiedArtifacts(
        final Path root,
        final Map<String, Path> copied
    ) throws SQLException {
        long byteSizeMatches = 0;
        long checksumMatches = 0;
        long reanalysisSuccesses = 0;
        long parseFailures = 0;
        for (Map.Entry<String, Path> entry : copied.entrySet()) {
            final Long artifactId = artifactIds.get(entry.getKey());
            if (artifactId == null) {
                throw verificationFailure("PERSISTED_ARTIFACT_METADATA_MISMATCH");
            }
            final PersistedArtifact metadata = persistedArtifact(artifactId);
            final String persistedHex = HexFormat.of().formatHex(metadata.sha256());
            final Path persistedPath = storagePath(root, metadata.storageKey(), persistedHex);
            if (!persistedPath.equals(entry.getValue()) || !"LEGACY".equals(metadata.sourceKind())) {
                throw verificationFailure("PERSISTED_ARTIFACT_METADATA_MISMATCH");
            }
            final ReanalysisCount count = verifyReopenedArtifact(persistedPath, metadata);
            byteSizeMatches += count.byteSizeMatches();
            checksumMatches += count.checksumMatches();
            reanalysisSuccesses += count.reanalysisSuccesses();
            parseFailures += count.parseFailures();
        }
        return new LegacyArtifactVerificationEvidence(
            copied.size(), byteSizeMatches, checksumMatches, reanalysisSuccesses, parseFailures,
            LegacyArtifactReanalysisVerifier.LEGACY_REPORT_VERSION
        );
    }

    private PersistedArtifact persistedArtifact(final long artifactId) throws SQLException {
        final String sql = "SELECT sha256, storage_key, byte_size, source_kind, original_filename "
            + "FROM source_artifact WHERE id = ?";
        try (PreparedStatement statement = target.prepareStatement(sql)) {
            statement.setLong(1, artifactId);
            try (ResultSet rows = statement.executeQuery()) {
                if (!rows.next()) {
                    throw verificationFailure("PERSISTED_ARTIFACT_METADATA_MISMATCH");
                }
                final byte[] sha256 = rows.getBytes("sha256");
                final String storageKey = rows.getString("storage_key");
                final long byteSize = rows.getLong("byte_size");
                final String sourceKind = rows.getString("source_kind");
                if (sha256 == null || sha256.length != 32 || storageKey == null || byteSize < 0) {
                    throw verificationFailure("PERSISTED_ARTIFACT_METADATA_MISMATCH");
                }
                return new PersistedArtifact(
                    sha256, storageKey, byteSize, sourceKind, rows.getString("original_filename")
                );
            }
        }
    }

    private ReanalysisCount verifyReopenedArtifact(
        final Path storagePath,
        final PersistedArtifact metadata
    ) {
        ensureNoSymbolicLinks(storagePath);
        final DigestingInputStream bytes;
        final LegacyArtifactReanalysisResult result;
        try (InputStream raw = Files.newInputStream(storagePath, LinkOption.NOFOLLOW_LINKS)) {
            bytes = new DigestingInputStream(raw);
            try {
                result = reanalysisVerifier.verify(
                    new LegacyArtifactReanalysisInput(storagePath, bytes, metadata.originalFilename())
                );
            }
            catch (Exception exception) {
                throw verificationFailure("REANALYSIS_FAILED");
            }
            if (bytes.byteCount() != metadata.byteSize()) {
                throw verificationFailure("COPIED_ARTIFACT_SIZE_MISMATCH");
            }
            if (!MessageDigest.isEqual(bytes.digest(), metadata.sha256())) {
                throw verificationFailure("COPIED_ARTIFACT_CHECKSUM_MISMATCH");
            }
            if (
                result == null || result.analysisVersion().isBlank()
                    || LegacyArtifactReanalysisVerifier.LEGACY_REPORT_VERSION.equals(result.analysisVersion())
            ) {
                throw verificationFailure("REANALYSIS_VERSION_INVALID");
            }
        }
        catch (LegacyMigrationException exception) {
            throw exception;
        }
        catch (IOException exception) {
            throw verificationFailure("COPIED_ARTIFACT_UNREADABLE", storagePath, exception);
        }
        validateStoredArtifact(storagePath, metadata.sha256(), metadata.byteSize());
        return ReanalysisCount.of(result);
    }

    private void validateStoredArtifact(final Path path, final byte[] expected, final long size) {
        final StoredBytes actual;
        try {
            actual = inspectStoredArtifact(path);
        }
        catch (IOException exception) {
            throw verificationFailure("COPIED_ARTIFACT_UNREADABLE", path, exception);
        }
        if (actual.byteSize() != size) {
            throw verificationFailure("COPIED_ARTIFACT_SIZE_MISMATCH");
        }
        if (!MessageDigest.isEqual(actual.sha256(), expected)) {
            throw verificationFailure("COPIED_ARTIFACT_CHECKSUM_MISMATCH");
        }
    }

    private StoredBytes inspectStoredArtifact(final Path path) throws IOException {
        ensureNoSymbolicLinks(path);
        if (!Files.isRegularFile(path, LinkOption.NOFOLLOW_LINKS)) {
            throw verificationFailure("COPIED_ARTIFACT_UNREADABLE");
        }
        final MessageDigest digest = LegacyChecksums.digest();
        long size = 0;
        try (InputStream input = Files.newInputStream(path, LinkOption.NOFOLLOW_LINKS)) {
            final byte[] buffer = new byte[8192];
            int read;
            while ((read = input.read(buffer)) != -1) {
                if (read > 0) {
                    digest.update(buffer, 0, read);
                    size += read;
                }
            }
        }
        return new StoredBytes(digest.digest(), size);
    }

    private void copyArtifact(final LegacyMigrationModel.Artifact artifact, final Path destination) {
        final Path temporary;
        try {
            temporary = Files.createTempFile(destination.getParent(), ".legacy-migration-", ".tmp");
        }
        catch (IOException exception) {
            throw verificationFailure("ARTIFACT_STORE_UNAVAILABLE", destination.getParent(), exception);
        }
        try {
            try (
                InputStream input = Files.newInputStream(artifact.sourcePath(), LinkOption.NOFOLLOW_LINKS);
                OutputStream output = Files.newOutputStream(
                    temporary, StandardOpenOption.WRITE, StandardOpenOption.TRUNCATE_EXISTING
                )
            ) {
                final byte[] buffer = new byte[8192];
                int read;
                while ((read = input.read(buffer)) != -1) {
                    if (read > 0) {
                        output.write(buffer, 0, read);
                    }
                }
            }
            catch (IOException exception) {
                throw verificationFailure("SOURCE_ARTIFACT_COPY_FAILED");
            }
            validateStoredArtifact(temporary, artifact.sha256(), artifact.byteSize());
            try {
                Files.move(temporary, destination, StandardCopyOption.ATOMIC_MOVE);
            }
            catch (AtomicMoveNotSupportedException ignored) {
                Files.move(temporary, destination);
            }
            ensureNoSymbolicLinks(destination);
            createdArtifacts.add(destination);
        }
        catch (LegacyMigrationException exception) {
            throw exception;
        }
        catch (IOException exception) {
            throw verificationFailure("ARTIFACT_STORE_UNAVAILABLE", destination, exception);
        }
        finally {
            try {
                Files.deleteIfExists(temporary);
            }
            catch (IOException ignored) {
                // The migration rollback remains authoritative for the database.
            }
        }
    }

    private Path storagePath(final Path root, final String storageKey, final String expectedHex) {
        final Path key;
        try {
            key = Path.of(storageKey);
        }
        catch (InvalidPathException exception) {
            throw verificationFailure("UNSAFE_ARTIFACT_PATH");
        }
        if (!validStorageKey(key, expectedHex)) {
            throw verificationFailure("UNSAFE_ARTIFACT_PATH");
        }
        final Path result = root.resolve(expectedHex.substring(0, 2)).resolve(expectedHex.substring(2)).normalize();
        if (!result.startsWith(root) || result.equals(root)) {
            throw verificationFailure("UNSAFE_ARTIFACT_PATH");
        }
        ensureNoSymbolicLinksUnderRoot(root, result);
        return result;
    }

    private boolean validStorageKey(final Path key, final String expectedHex) {
        if (key.isAbsolute() || key.getNameCount() != 2) {
            return false;
        }
        if (!"sha256".equals(key.getName(0).toString()) || !expectedHex.equals(key.getName(1).toString())) {
            return false;
        }
        return expectedHex.matches("[0-9a-f]{64}");
    }

    private void createDirectoryNoSymlinks(final Path directory) throws IOException {
        ensureNoSymbolicLinks(directory);
        final List<Path> missing = new ArrayList<>();
        Path current = directory;
        while (!Files.exists(current, LinkOption.NOFOLLOW_LINKS)) {
            missing.add(current);
            current = current.getParent();
            if (current == null) {
                throw verificationFailure("UNSAFE_ARTIFACT_PATH");
            }
        }
        if (Files.isSymbolicLink(current) || !Files.isDirectory(current, LinkOption.NOFOLLOW_LINKS)) {
            throw verificationFailure("UNSAFE_ARTIFACT_PATH");
        }
        for (int index = missing.size() - 1; index >= 0; index--) {
            final Path part = missing.get(index);
            try {
                Files.createDirectory(part);
            }
            catch (FileAlreadyExistsException exception) {
                if (Files.isSymbolicLink(part) || !Files.isDirectory(part, LinkOption.NOFOLLOW_LINKS)) {
                    throw verificationFailure("UNSAFE_ARTIFACT_PATH");
                }
            }
            ensureNoSymbolicLinks(part);
        }
    }

    private void ensureNoSymbolicLinks(final Path path) {
        if (Files.isSymbolicLink(path)) {
            throw verificationFailure("UNSAFE_ARTIFACT_PATH");
        }
    }

    private void ensureNoSymbolicLinksUnderRoot(final Path root, final Path path) {
        for (Path current = path; current != null && current.startsWith(root); current = current.getParent()) {
            ensureNoSymbolicLinks(current);
        }
    }

    private LegacyMigrationException verificationFailure(final String code) {
        return new LegacyMigrationException(
            "Legacy source-artifact verification failed",
            List.of(
                new LegacyMigrationException.Diagnostic(
                    code, "source_artifact", null, "aggregate verification failed", 1
                )
            )
        );
    }

    /**
     * The same refusal, saying which path it was working on and what the operating system answered. Neither is a value
     * out of the old database — they are this deployment's own configuration and its filesystem's reply — and without
     * them a store that cannot be written is indistinguishable from one that is merely wrong.
     */
    private LegacyMigrationException verificationFailure(
        final String code,
        final Path path,
        final IOException cause
    ) {
        return new LegacyMigrationException(
            "Legacy source-artifact verification failed",
            List.of(
                new LegacyMigrationException.Diagnostic(
                    code, "source_artifact", null, "could not write " + path + ": " + reason(cause), 1
                )
            ),
            cause
        );
    }

    /**
     * What the filesystem actually objected to. The message of a {@link FileSystemException} is the file it concerns,
     * which is already being reported, so the kind of failure is the part worth adding: a store that may not be written
     * and one that has no room left read alike until they are named.
     */
    private static String reason(final IOException cause) {
        final String detail = cause instanceof FileSystemException failure ? failure.getReason() : cause.getMessage();
        return detail == null || detail.isBlank()
            ? cause.getClass().getSimpleName()
            : cause.getClass().getSimpleName() + " (" + detail + ")";
    }

    private Map<String, Long> rowCounts() throws SQLException {
        final Map<String, Long> result = new TreeMap<>();
        try (Statement statement = target.createStatement()) {
            for (String table : COUNTED_TABLES) {
                try (ResultSet rows = statement.executeQuery("SELECT COUNT(*) FROM " + table)) {
                    rows.next();
                    result.put(table, rows.getLong(1));
                }
            }
        }
        return Map.copyOf(result);
    }

    private Map<String, Long> nullCounts() throws SQLException {
        final List<String> columns = List.of(
            "submission.school_type", "analysis.project_id", "analysis.project_name", "analysis.input_sha256",
            "analysis.report_json", "scratch_project_stats.views", "scratch_project_stats.loves",
            "scratch_project_stats.favorites", "scratch_project_stats.remixes",
            "scratch_project_stats.author_username", "scratch_project_stats.scratch_created_at",
            "quiz_answer.correct", "contact_message.sender_email", "contact_message.created_at"
        );
        final Map<String, Long> result = new TreeMap<>();
        try (Statement statement = target.createStatement()) {
            for (String qualified : columns) {
                final String[] parts = qualified.split("\\.");
                try (
                    ResultSet rows = statement.executeQuery(
                        "SELECT COUNT(*) FROM " + parts[0] + " WHERE " + parts[1] + " IS NULL"
                    )
                ) {
                    rows.next();
                    result.put(qualified, rows.getLong(1));
                }
            }
        }
        return Map.copyOf(result);
    }

    private Map<String, LegacyMigrationReport.MetricAggregate> metricAggregates(final int programmeCount)
        throws SQLException {
        final Map<String, LegacyMigrationReport.MetricAggregate> result = new TreeMap<>();
        final String sql = "SELECT name, COUNT(*) AS metric_count, SUM(value) AS metric_sum, "
            + "MIN(value) AS metric_min, MAX(value) AS metric_max FROM analysis_metric GROUP BY name ORDER BY name";
        try (Statement statement = target.createStatement(); ResultSet rows = statement.executeQuery(sql)) {
            while (rows.next()) {
                final long count = rows.getLong("metric_count");
                result.put(
                    rows.getString("name"), new LegacyMigrationReport.MetricAggregate(
                        count, programmeCount - count, rows.getDouble("metric_sum"),
                        rows.getDouble("metric_min"), rows.getDouble("metric_max")
                    )
                );
            }
        }
        return Map.copyOf(result);
    }

    private String targetReportChecksum() throws SQLException {
        final LegacyChecksums.ReportChecksum checksum = LegacyChecksums.reportChecksum();
        final String sql = "SELECT CAST(map.old_id AS UNSIGNED) AS old_id, "
            + "OCTET_LENGTH(analysis.report_json) AS report_bytes, SHA2(analysis.report_json, 256) AS report_sha256 "
            + "FROM legacy_id_map map JOIN analysis ON analysis.id = map.analysis_id "
            + "WHERE map.old_table_name = 'programme' ORDER BY CAST(map.old_id AS UNSIGNED)";
        try (Statement statement = target.createStatement(); ResultSet rows = statement.executeQuery(sql)) {
            while (rows.next()) {
                final long oldId = rows.getLong("old_id");
                final String sha256 = rows.getString("report_sha256");
                if (sha256 == null) {
                    checksum.add(oldId, (LegacyMigrationModel.ReportSnapshot) null);
                }
                else {
                    checksum.add(
                        oldId,
                        new LegacyMigrationModel.ReportSnapshot(
                            null, HexFormat.of().parseHex(sha256), rows.getLong("report_bytes")
                        )
                    );
                }
            }
        }
        return checksum.finish();
    }

    private String targetMetricChecksum() throws SQLException {
        final Map<Long, Map<String, Double>> metrics = new LinkedHashMap<>();
        final String sql = "SELECT CAST(map.old_id AS UNSIGNED) AS old_id, metric.name, metric.value "
            + "FROM legacy_id_map map JOIN analysis_metric metric ON metric.analysis_id = map.analysis_id "
            + "WHERE map.old_table_name = 'programme' ORDER BY CAST(map.old_id AS UNSIGNED), metric.name";
        try (Statement statement = target.createStatement(); ResultSet rows = statement.executeQuery(sql)) {
            while (rows.next()) {
                metrics.computeIfAbsent(rows.getLong("old_id"), ignored -> new TreeMap<>())
                    .put(rows.getString("name"), rows.getDouble("value"));
            }
        }
        return LegacyChecksums.metrics(metrics);
    }

    private record PersistedArtifact(
        byte[] sha256,
        String storageKey,
        long byteSize,
        String sourceKind,
        String originalFilename
    ) {

        PersistedArtifact {
            sha256 = sha256.clone();
        }

        @Override
        public byte[] sha256() {
            return sha256.clone();
        }
    }

    private record StoredBytes(byte[] sha256, long byteSize) {

        StoredBytes {
            sha256 = sha256.clone();
        }

        @Override
        public byte[] sha256() {
            return sha256.clone();
        }
    }

    private record ReanalysisCount(
        long byteSizeMatches,
        long checksumMatches,
        long reanalysisSuccesses,
        long parseFailures
    ) {

        /** One artifact, reopened whole; whether it still reads as a project is the only open question. */
        static ReanalysisCount of(final LegacyArtifactReanalysisResult result) {
            final long parsed = result.parsed() ? 1 : 0;
            return new ReanalysisCount(1, 1, parsed, 1 - parsed);
        }
    }

    private static final class DigestingInputStream extends InputStream {

        private final InputStream delegate;
        private final MessageDigest digest;
        private long byteCount;

        DigestingInputStream(final InputStream delegate) {
            this.delegate = delegate;
            this.digest = LegacyChecksums.digest();
        }

        @Override
        public int read() throws IOException {
            final int value = delegate.read();
            if (value >= 0) {
                digest.update((byte) value);
                byteCount++;
            }
            return value;
        }

        @Override
        public int read(final byte[] bytes, final int offset, final int length) throws IOException {
            final int read = delegate.read(bytes, offset, length);
            if (read > 0) {
                digest.update(bytes, offset, read);
                byteCount += read;
            }
            return read;
        }

        @Override
        public void close() throws IOException {
            delegate.close();
        }

        long byteCount() {
            return byteCount;
        }

        byte[] digest() {
            return digest.digest();
        }
    }

    private long generatedId(final PreparedStatement statement) throws SQLException {
        try (ResultSet keys = statement.getGeneratedKeys()) {
            if (!keys.next()) {
                throw new SQLException("Target database did not return a generated identifier");
            }
            return keys.getLong(1);
        }
    }

    private String scratchProjectId(final String url) {
        if (url == null) {
            return null;
        }
        final java.util.regex.Matcher matcher = java.util.regex.Pattern
            .compile("^https://scratch\\.mit\\.edu/projects/([0-9]+)/?$").matcher(url);
        return matcher.matches() ? matcher.group(1) : null;
    }

    private String mediaType(final String filename) {
        final String format = inputFormat(filename);
        if ("sb3".equals(format)) {
            return "application/x.scratch.sb3";
        }
        if ("mblock".equals(format)) {
            return "application/x.mblock";
        }
        return "application/octet-stream";
    }

    private String inputFormat(final String filename) {
        if (filename == null) {
            return null;
        }
        final int separator = filename.lastIndexOf('.');
        if (separator < 0 || separator == filename.length() - 1) {
            return null;
        }
        return filename.substring(separator + 1).toLowerCase(java.util.Locale.ROOT);
    }

    private String reaction(final int value) {
        return switch (value) {
            case 1 -> "HELPFUL";
            case -1 -> "NOT_HELPFUL";
            case 0 -> "NEUTRAL";
            default -> throw new IllegalArgumentException("Unsupported legacy feedback reaction");
        };
    }

    private Boolean correct(final String value) {
        if (value == null) {
            return null;
        }
        return switch (value.trim().toLowerCase(java.util.Locale.ROOT)) {
            case "1", "true" -> true;
            case "0", "false" -> false;
            default -> throw new IllegalArgumentException("Unsupported legacy correctness value");
        };
    }

    private void setNullableString(final PreparedStatement statement, final int index, final String value)
        throws SQLException {
        if (value == null) {
            statement.setNull(index, Types.VARCHAR);
        }
        else {
            statement.setString(index, value);
        }
    }

    private void setNullableLong(final PreparedStatement statement, final int index, final Long value)
        throws SQLException {
        if (value == null) {
            statement.setNull(index, Types.BIGINT);
        }
        else {
            statement.setLong(index, value);
        }
    }

    private void setNullableTimestamp(final PreparedStatement statement, final int index, final Timestamp value)
        throws SQLException {
        if (value == null) {
            statement.setNull(index, Types.TIMESTAMP);
        }
        else {
            statement.setTimestamp(index, value);
        }
    }

    private void setNullableBoolean(final PreparedStatement statement, final int index, final Boolean value)
        throws SQLException {
        if (value == null) {
            statement.setNull(index, Types.BOOLEAN);
        }
        else {
            statement.setBoolean(index, value);
        }
    }
}
