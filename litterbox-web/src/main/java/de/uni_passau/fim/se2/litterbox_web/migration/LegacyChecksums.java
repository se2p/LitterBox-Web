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

import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.HexFormat;
import java.util.Map;

final class LegacyChecksums {

    private LegacyChecksums() {
    }

    /** Digests report identities and bytes without retaining report text. */
    static String reports(
        final Iterable<LegacyMigrationModel.Programme> programmes,
        final Map<Long, LegacyMigrationModel.ReportSnapshot> reports
    ) {
        final ReportChecksum digest = reportChecksum();
        for (LegacyMigrationModel.Programme programme : programmes) {
            digest.add(programme.id(), reports.get(programme.id()));
        }
        return digest.finish();
    }

    static ReportChecksum reportChecksum() {
        return new ReportChecksum();
    }

    static String metrics(final Map<Long, Map<String, Double>> metrics) {
        final MessageDigest digest = digest();
        metrics.entrySet().stream().sorted(Map.Entry.comparingByKey()).forEach(programme -> {
            programme.getValue().entrySet().stream().sorted(Map.Entry.comparingByKey()).forEach(metric -> {
                add(digest, Long.toString(programme.getKey()));
                add(digest, metric.getKey());
                final double value = metric.getValue();
                add(digest, Double.toHexString(value == 0.0d ? 0.0d : value));
            });
        });
        return HexFormat.of().formatHex(digest.digest());
    }

    static byte[] digest(final String value) {
        final MessageDigest digest = digest();
        digest.update(value.getBytes(StandardCharsets.UTF_8));
        return digest.digest();
    }

    private static void add(final MessageDigest digest, final String value) {
        if (value == null) {
            digest.update(ByteBuffer.allocate(Integer.BYTES).putInt(-1).array());
            return;
        }
        final byte[] bytes = value.getBytes(StandardCharsets.UTF_8);
        digest.update(ByteBuffer.allocate(Integer.BYTES).putInt(bytes.length).array());
        digest.update(bytes);
    }

    /** The one place this package asks for SHA-256, so that nothing else has to answer for its absence. */
    static MessageDigest digest() {
        try {
            return MessageDigest.getInstance("SHA-256");
        }
        catch (NoSuchAlgorithmException exception) {
            throw new IllegalStateException("SHA-256 is unavailable", exception);
        }
    }

    static final class ReportChecksum {

        private final MessageDigest digest = digest();

        void add(final long programmeId, final LegacyMigrationModel.ReportSnapshot report) {
            LegacyChecksums.add(digest, Long.toString(programmeId));
            if (report == null) {
                digest.update((byte) 0);
                return;
            }
            digest.update((byte) 1);
            LegacyChecksums.add(digest, Long.toString(report.byteSize()));
            LegacyChecksums.add(digest, HexFormat.of().formatHex(report.sha256()));
        }

        String finish() {
            return HexFormat.of().formatHex(digest.digest());
        }
    }
}
