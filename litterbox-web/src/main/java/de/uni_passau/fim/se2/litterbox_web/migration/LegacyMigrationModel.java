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

import java.nio.file.Path;
import java.sql.Timestamp;
import java.util.List;
import java.util.Map;

final class LegacyMigrationModel {

    private LegacyMigrationModel() {
    }

    /**
     * @param reportReference the name of the file the old site wrote the report to, which is what the legacy
     *                        {@code litterbox} column holds. The report itself lives beside it on disk.
     */
    record Programme(
        long id,
        String token,
        String gender,
        String scratchUsername,
        String filename,
        String url,
        String description,
        String institution,
        String reportReference,
        String ip,
        Timestamp time
    ) {
    }

    record Statistics(
        long id,
        long programmeId,
        Map<String, Double> metrics,
        Long views,
        Long loves,
        Long favorites,
        Long remixes,
        String author,
        Timestamp created
    ) {
    }

    record Feedback(long id, long programmeId, String pattern, int reaction, Timestamp time) {
    }

    record Question(
        long id,
        String programName,
        String question,
        String answer,
        String correct,
        Timestamp time
    ) {
    }

    record ExternalId(long id, String value, Timestamp timestamp) {
    }

    record Contact(
        long id,
        String age,
        String mail,
        String gender,
        String subject,
        String message,
        String ip
    ) {
    }

    record SourceData(
        List<Programme> programmes,
        List<Statistics> statistics,
        List<Feedback> feedback,
        List<Question> questions,
        List<ExternalId> externalIds,
        List<Contact> contacts,
        Map<String, Long> rowCounts,
        Map<String, Long> nullCounts
    ) {
    }

    record Artifact(
        long programmeId,
        Availability availability,
        Path sourcePath,
        byte[] sha256,
        long byteSize,
        String reason,
        String manifestJson
    ) {

        Artifact {
            sha256 = sha256.clone();
        }

        @Override
        public byte[] sha256() {
            return sha256.clone();
        }
    }

    enum Availability {
        VERIFIED,
        UNAVAILABLE
    }

    /**
     * @param reports the verified report file each programme's reference resolved to, by programme id. Report contents
     *                deliberately stay on disk until they are streamed into the target.
     */
    record PreparedMigration(
        SourceData source,
        Map<Long, String> shareTokens,
        Map<Long, String> schoolTypes,
        Map<Long, Long> questionProgrammeIds,
        Map<Long, Map<String, Double>> metrics,
        Map<Long, Artifact> artifacts,
        Map<Long, ReportSnapshot> reports,
        LegacyMigrationReport.TokenCollisions tokenCollisions,
        LegacyMigrationReport.QuestionJoins questionJoins,
        LegacyMigrationReport.Artifacts artifactSummary,
        LegacyMigrationReport.Reports reportSummary,
        LegacyMigrationReport.Privacy privacy,
        List<String> missingCoreMetricNames,
        List<String> coreMetricNamesOutsideLegacyView,
        LegacyMigrationReport.Reconciliations reconciliations,
        String sourceReportChecksum,
        String sourceMetricChecksum
    ) {
    }

    record ReportSnapshot(Path sourcePath, byte[] sha256, long byteSize) {

        ReportSnapshot {
            sha256 = sha256.clone();
        }

        @Override
        public byte[] sha256() {
            return sha256.clone();
        }
    }

    record TargetResult(
        Map<String, Long> rowCounts,
        Map<String, Long> nullCounts,
        Map<String, LegacyMigrationReport.MetricAggregate> metrics,
        String reportChecksum,
        String metricChecksum,
        LegacyArtifactVerificationEvidence verificationEvidence
    ) {
    }
}
