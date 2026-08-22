/*
 * Copyright (C) 2024-2026 LitterBox-Web contributors
 *
 * This file is part of LitterBox-Web.
 * Licenced under the EUPL-1.2 or later.
 *
 * SPDX-FileCopyrightText: 2024-2026 LitterBox-Web contributors
 * SPDX-License-Identifier: EUPL-1.2
 */
package de.uni_passau.fim.se2.litterbox_web.capabilities.injection;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.Arrays;
import java.util.HexFormat;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Random;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;
import java.util.zip.ZipOutputStream;

import org.junit.jupiter.api.Test;

class InjectionArchiveCodecTest {

    private static final String PROJECT_JSON = "project.json";
    private static final String EMPTY_PROJECT = "{\"targets\":[]}";
    private static final String NOTES_TXT = "notes.txt";

    private static final InjectionArchiveCodec.Limits NORMAL_LIMITS = new InjectionArchiveCodec.Limits(
        2_000, 100L * 1024 * 1024, 100L * 1024 * 1024, 25L * 1024 * 1024
    );

    @Test
    void rejectsDuplicateUnsafeAndNestedEntryNames() throws IOException {
        final byte[] project = project(EMPTY_PROJECT);
        assertMalformed(
            zipEntries(
                List.of(
                    new Entry(PROJECT_JSON, project), new Entry("PROJECT.JSON", project)
                )
            )
        );
        for (String unsafe : List.of("../project.json", "/project.json", "project\\\\json", "nested.zip")) {
            assertMalformed(zipEntries(List.of(new Entry(unsafe, project))));
        }
    }

    @Test
    void rejectsMalformedPrivateBundleManifests() throws IOException {
        final byte[] project = project(EMPTY_PROJECT);
        assertMalformed(
            zip(
                Map.of(
                    PROJECT_JSON, project,
                    "litterbox/manifest.json", "not-json".getBytes(StandardCharsets.UTF_8),
                    "litterbox/metadata.json", "{}".getBytes(StandardCharsets.UTF_8)
                )
            )
        );

        final byte[] asset = new byte[] { 1, 2, 3 };
        final String assetName = HexFormat.of().formatHex(digest("MD5", asset)) + ".png";
        final byte[] projectWithAsset = project(
            "{\"targets\":[{\"costumes\":[{\"md5ext\":\"" + assetName + "\"}],\"sounds\":[]}]}"
        );
        final byte[] metadata = "{}".getBytes(StandardCharsets.UTF_8);
        final String incompleteManifest = """
            {
              "format":"scratch-project-bundle",
              "version":2,
              "projectId":"synthetic-project",
              "fetchedAt":"2026-08-05T00:00:00Z",
              "projectJsonSha256":"%s",
              "metadataSha256":"%s",
              "assets":[]
            }
            """.formatted(
            HexFormat.of().formatHex(digest("SHA-256", projectWithAsset)),
            HexFormat.of().formatHex(digest("SHA-256", metadata))
        );
        assertMalformed(
            zip(
                Map.of(
                    PROJECT_JSON, projectWithAsset,
                    assetName, asset,
                    "litterbox/manifest.json", incompleteManifest.getBytes(StandardCharsets.UTF_8),
                    "litterbox/metadata.json", metadata
                )
            )
        );
        assertMalformed(
            zip(
                Map.of(
                    PROJECT_JSON, project,
                    "litterbox/manifest.json", "{}".getBytes(StandardCharsets.UTF_8)
                )
            )
        );
    }

    @Test
    void rejectsEntryCountEntrySizeAndTotalUncompressedLimits() throws IOException {
        final byte[] project = project(EMPTY_PROJECT);
        assertThatThrownBy(
            () -> InjectionArchiveCodec.inspect(
                zip(Map.of(PROJECT_JSON, project, NOTES_TXT, new byte[] { 1 })),
                new InjectionArchiveCodec.Limits(1, 10_000, 10_000, 100)
            )
        ).isInstanceOf(InjectionArchiveCodec.ArchiveLimitExceeded.class);
        assertThatThrownBy(
            () -> InjectionArchiveCodec.inspect(
                zip(Map.of(PROJECT_JSON, project, NOTES_TXT, new byte[20])),
                new InjectionArchiveCodec.Limits(2_000, 10_000, 25, 100)
            )
        ).isInstanceOf(InjectionArchiveCodec.ArchiveLimitExceeded.class);
        assertThatThrownBy(
            () -> InjectionArchiveCodec.inspect(
                zip(Map.of(PROJECT_JSON, project)),
                new InjectionArchiveCodec.Limits(2_000, 10_000, 10_000, 5)
            )
        ).isInstanceOf(InjectionArchiveCodec.ArchiveLimitExceeded.class);
    }

    @Test
    void rejectsHighlyCompressedEntriesByUncompressedSizeBeforeExpansionCompletes() throws IOException {
        final byte[] compressedBomb = new byte[128 * 1024];
        Arrays.fill(compressedBomb, (byte) 0);
        final byte[] archive = zip(
            Map.of(PROJECT_JSON, project(EMPTY_PROJECT), "payload.bin", compressedBomb)
        );

        assertThatThrownBy(
            () -> InjectionArchiveCodec.inspect(
                archive, new InjectionArchiveCodec.Limits(2_000, 10_000, 1_024, 200_000)
            )
        ).isInstanceOf(InjectionArchiveCodec.ArchiveLimitExceeded.class);
    }

    @Test
    void rejectsReferencedAssetsWithAnIncorrectScratchHash() throws IOException {
        final String assetName = "00000000000000000000000000000000.png";
        final byte[] project = project(
            "{\"targets\":[{\"costumes\":[{\"md5ext\":\"" + assetName + "\"}],\"sounds\":[]}] }"
        );
        assertMalformed(zip(Map.of(PROJECT_JSON, project, assetName, new byte[] { 1, 2, 3 })));
    }

    @Test
    void reconstructsDeterministicallyAndReplacesOnlyPublicProjectJson() throws IOException {
        final byte[] originalProject = project("{\"targets\":[{}]}");
        final byte[] derivedProject = project(EMPTY_PROJECT);
        final byte[] note = "synthetic-note".getBytes(StandardCharsets.UTF_8);
        final byte[] source = zip(Map.of(PROJECT_JSON, originalProject, NOTES_TXT, note));
        final InjectionArchiveCodec.ValidatedArchive validated = InjectionArchiveCodec.inspect(source, NORMAL_LIMITS);

        final byte[] first = InjectionArchiveCodec.reconstruct(validated, derivedProject, NORMAL_LIMITS);
        final byte[] second = InjectionArchiveCodec.reconstruct(validated, derivedProject, NORMAL_LIMITS);

        assertThat(first).isEqualTo(second);
        assertThat(entries(first).keySet()).containsExactly(NOTES_TXT, PROJECT_JSON);
        assertThat(entries(first)).containsEntry(NOTES_TXT, note).containsEntry(PROJECT_JSON, derivedProject);
    }

    @Test
    void rejectsDerivedProjectsReferencingMissingAssets() throws IOException {
        final byte[] source = zip(Map.of(PROJECT_JSON, project(EMPTY_PROJECT)));
        final InjectionArchiveCodec.ValidatedArchive validated = InjectionArchiveCodec.inspect(source, NORMAL_LIMITS);
        final byte[] derived = project(
            "{\"targets\":[{\"costumes\":[{\"md5ext\":\"00000000000000000000000000000000.png\"}]}]}"
        );

        assertThatThrownBy(() -> InjectionArchiveCodec.reconstruct(validated, derived, NORMAL_LIMITS))
            .isInstanceOf(InjectionArchiveCodec.ArchiveMalformed.class);
    }

    @Test
    void rejectsDerivedOutputBeforeItExceedsTheCompressedLimit() throws IOException {
        final byte[] randomBytes = new byte[1_000];
        new Random(71).nextBytes(randomBytes);
        final byte[] source = zip(Map.of(PROJECT_JSON, project(EMPTY_PROJECT), "notes.bin", randomBytes));
        final InjectionArchiveCodec.ValidatedArchive validated = InjectionArchiveCodec.inspect(source, NORMAL_LIMITS);
        final InjectionArchiveCodec.Limits outputLimits = new InjectionArchiveCodec.Limits(2_000, 200, 2_000, 2_000);

        assertThatThrownBy(
            () -> InjectionArchiveCodec.reconstruct(validated, project(EMPTY_PROJECT), outputLimits)
        ).isInstanceOf(InjectionArchiveCodec.ArchiveLimitExceeded.class);
    }

    private static void assertMalformed(final byte[] archive) {
        assertThatThrownBy(() -> InjectionArchiveCodec.inspect(archive, NORMAL_LIMITS))
            .isInstanceOf(InjectionArchiveCodec.ArchiveMalformed.class);
    }

    private static byte[] project(final String value) {
        return value.getBytes(StandardCharsets.UTF_8);
    }

    private static byte[] digest(final String algorithm, final byte[] value) {
        try {
            return MessageDigest.getInstance(algorithm).digest(value);
        }
        catch (NoSuchAlgorithmException exception) {
            throw new IllegalStateException(exception);
        }
    }

    private static byte[] zip(final Map<String, byte[]> entries) throws IOException {
        return zipEntries(
            entries.entrySet().stream().map(entry -> new Entry(entry.getKey(), entry.getValue())).toList()
        );
    }

    private static byte[] zipEntries(final List<Entry> entries) throws IOException {
        final ByteArrayOutputStream output = new ByteArrayOutputStream();
        try (ZipOutputStream zip = new ZipOutputStream(output, StandardCharsets.UTF_8)) {
            for (Entry entry : entries) {
                zip.putNextEntry(new ZipEntry(entry.name()));
                zip.write(entry.bytes());
                zip.closeEntry();
            }
        }
        return output.toByteArray();
    }

    private static Map<String, byte[]> entries(final byte[] archive) throws IOException {
        final Map<String, byte[]> entries = new LinkedHashMap<>();
        try (ZipInputStream zip = new ZipInputStream(new ByteArrayInputStream(archive))) {
            ZipEntry entry;
            while ((entry = zip.getNextEntry()) != null) {
                final ByteArrayOutputStream content = new ByteArrayOutputStream();
                zip.transferTo(content);
                entries.put(entry.getName(), content.toByteArray());
            }
        }
        return entries;
    }

    private record Entry(String name, byte[] bytes) {

        private Entry {
            bytes = Arrays.copyOf(bytes, bytes.length);
        }
    }
}
