/*
 * Copyright (C) 2024-2026 LitterBox-Web contributors
 *
 * This file is part of LitterBox-Web.
 * Licenced under the EUPL-1.2 or later.
 *
 * SPDX-FileCopyrightText: 2024-2026 LitterBox-Web contributors
 * SPDX-License-Identifier: EUPL-1.2
 */
package de.uni_passau.fim.se2.litterbox_web.web_ui.single_project;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.io.ByteArrayOutputStream;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.HexFormat;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.zip.ZipEntry;
import java.util.zip.ZipOutputStream;

import org.junit.jupiter.api.Test;

class ProjectArchiveInspectorTest {

    private static final String PROJECT_JSON = "project.json";

    private final ProjectArchiveInspector inspector = new ProjectArchiveInspector();

    @Test
    void extractsOnlyTheCurrentCostumeAndSniffsItsMediaType() throws Exception {
        final byte[] content = { (byte) 0xFF, (byte) 0xD8, (byte) 0xFF, 0x00 };
        final String name = md5(content) + ".png";
        final byte[] project = project(name);

        final ProjectArchiveInspector.Inspection result = inspector.inspect(
            archive(Map.of(PROJECT_JSON, project, name, content))
        );

        assertThat(result.projectJson()).isEqualTo(project);
        assertThat(result.assets()).singleElement().satisfies(
            asset -> {
                assertThat(asset.scratchMd5()).isEqualTo(md5(content));
                assertThat(asset.mediaType()).isEqualTo("image/jpeg");
                assertThat(asset.content()).isEqualTo(content);
            }
        );
    }

    @Test
    void rejectsMissingOrMismatchingCurrentCostumeAssets() throws Exception {
        final byte[] content = png();
        final String name = md5(content) + ".png";

        assertThat(inspector.inspect(archive(Map.of(PROJECT_JSON, project(name)))).assets()).isEmpty();

        final byte[] different = "synthetic-html".getBytes(StandardCharsets.UTF_8);
        assertThatThrownBy(
            () -> inspector.inspect(archive(Map.of(PROJECT_JSON, project(name), name, different)))
        )
            .isInstanceOf(IllegalArgumentException.class)
            .hasMessageContaining("does not match");
    }

    @Test
    void keepsSandboxableSvgAndRejectsMimeConfusedThumbnails() throws Exception {
        final byte[] svg = "<svg xmlns=\"http://www.w3.org/2000/svg\"><rect width=\"4\" height=\"4\"/></svg>"
            .getBytes(StandardCharsets.UTF_8);
        final String svgName = md5(svg) + ".svg";
        assertThat(
            inspector.inspect(archive(Map.of(PROJECT_JSON, project(svgName), svgName, svg))).assets()
        ).singleElement().satisfies(asset -> assertThat(asset.mediaType()).isEqualTo("image/svg+xml"));

        final byte[] html = "<html>synthetic</html>".getBytes(StandardCharsets.UTF_8);
        final String htmlName = md5(html) + ".png";
        assertThatThrownBy(
            () -> inspector.inspect(archive(Map.of(PROJECT_JSON, project(htmlName), htmlName, html)))
        )
            .isInstanceOf(IllegalArgumentException.class)
            .hasMessageContaining("raster");
    }

    @Test
    void dropsSvgThumbnailsThatCarryActiveOrExternalContent() throws Exception {
        final String header = "<svg xmlns=\"http://www.w3.org/2000/svg\">";
        for (
            String body : new String[] {
                "<script>alert(1)</script>",
                "<rect onload=\"alert(1)\"/>",
                "<a href=\"https://example.invalid\"><rect/></a>",
                "<image xlink:href=\"/litterbox/api/v1/capabilities\"/>",
                "<foreignObject><p>hi</p></foreignObject>",
                "<image xlink:href=\"data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=\"/>",
            }
        ) {
            final byte[] svg = (header + body + "</svg>").getBytes(StandardCharsets.UTF_8);
            final String name = md5(svg) + ".svg";

            assertThat(inspector.inspect(archive(Map.of(PROJECT_JSON, project(name), name, svg))).assets())
                .as("%s must not be served", body)
                .isEmpty();
        }
    }

    @Test
    void rejectsTraversalDuplicateAndDeeplyNestedEntries() throws Exception {
        final byte[] project = "{\"targets\":[]}".getBytes(StandardCharsets.UTF_8);

        assertThatThrownBy(
            () -> inspector.inspect(archive(Map.of("../project.json", project)))
        ).isInstanceOf(IllegalArgumentException.class).hasMessageContaining("unsafe");

        final Map<String, byte[]> duplicate = new LinkedHashMap<>();
        duplicate.put(PROJECT_JSON, project);
        duplicate.put("PROJECT.JSON", project);
        assertThatThrownBy(() -> inspector.inspect(archive(duplicate)))
            .isInstanceOf(IllegalArgumentException.class)
            .hasMessageContaining("duplicate");

        assertThatThrownBy(
            () -> inspector.inspect(archive(Map.of(PROJECT_JSON, project, "one/two/three/four.txt", new byte[0])))
        ).isInstanceOf(IllegalArgumentException.class).hasMessageContaining("nested");
    }

    @Test
    void rejectsArchivesWithTooManyEntries() throws Exception {
        final Map<String, byte[]> entries = new LinkedHashMap<>();
        entries.put(PROJECT_JSON, "{\"targets\":[]}".getBytes(StandardCharsets.UTF_8));
        for (int index = 0; index < 2_000; index++) {
            entries.put("asset-" + index + ".bin", new byte[] { 1 });
        }

        assertThatThrownBy(() -> inspector.inspect(archive(entries)))
            .isInstanceOf(IllegalArgumentException.class)
            .hasMessageContaining("too many entries");
    }

    @Test
    void rejectsMalformedProjectsNestedArchivesAndInvalidManifests() throws Exception {
        assertThatThrownBy(() -> inspector.inspect("not a zip".getBytes(StandardCharsets.UTF_8)))
            .isInstanceOf(IllegalArgumentException.class)
            .hasMessageContaining(PROJECT_JSON);

        final byte[] project = "{\"targets\":[]}".getBytes(StandardCharsets.UTF_8);
        assertThatThrownBy(
            () -> inspector.inspect(
                archive(
                    Map.of(
                        PROJECT_JSON, "{}".getBytes(
                            StandardCharsets.UTF_8
                        )
                    )
                )
            )
        )
            .isInstanceOf(IllegalArgumentException.class)
            .hasMessageContaining("targets");

        assertThatThrownBy(
            () -> inspector.inspect(
                archive(
                    Map.of(
                        PROJECT_JSON, project,
                        "child.sb3", new byte[] { 1 }
                    )
                )
            )
        )
            .isInstanceOf(IllegalArgumentException.class)
            .hasMessageContaining("nested archive");

        final Map<String, byte[]> invalidManifest = new LinkedHashMap<>();
        invalidManifest.put(PROJECT_JSON, project);
        invalidManifest.put("litterbox/metadata.json", "{}".getBytes(StandardCharsets.UTF_8));
        invalidManifest.put(
            "litterbox/manifest.json",
            ("{\"format\":\"scratch-project-bundle\",\"version\":2,"
                + "\"projectId\":\"synthetic\",\"fetchedAt\":\"2025-01-01T00:00:00Z\","
                + "\"metadataSha256\":\"00\",\"projectJsonSha256\":\"00\",\"assets\":[]}")
                .getBytes(StandardCharsets.UTF_8)
        );
        assertThatThrownBy(() -> inspector.inspect(archive(invalidManifest)))
            .isInstanceOf(IllegalArgumentException.class)
            .hasMessageContaining("manifest");
    }

    @Test
    void rejectsEntriesThatExceedTheDecompressedSizeLimit() throws Exception {
        final Map<String, byte[]> entries = new LinkedHashMap<>();
        entries.put(PROJECT_JSON, "{\"targets\":[]}".getBytes(StandardCharsets.UTF_8));
        entries.put("large.bin", new byte[25 * 1024 * 1024 + 1]);

        assertThatThrownBy(() -> inspector.inspect(archive(entries)))
            .isInstanceOf(IllegalArgumentException.class)
            .hasMessageContaining("too large after extraction");
    }

    private byte[] project(final String assetName) {
        return ("{\"targets\":[{\"name\":\"Stage\",\"isStage\":true,"
            + "\"currentCostume\":0,\"costumes\":[{\"md5ext\":\"" + assetName + "\"}],"
            + "\"sounds\":[],\"blocks\":{}}]}").getBytes(StandardCharsets.UTF_8);
    }

    private byte[] png() {
        return new byte[] { (byte) 0x89, 'P', 'N', 'G', 0x0D, 0x0A, 0x1A, 0x0A };
    }

    private byte[] archive(final Map<String, byte[]> entries) throws Exception {
        final ByteArrayOutputStream output = new ByteArrayOutputStream();
        try (ZipOutputStream zip = new ZipOutputStream(output)) {
            for (Map.Entry<String, byte[]> entry : entries.entrySet()) {
                zip.putNextEntry(new ZipEntry(entry.getKey()));
                zip.write(entry.getValue());
                zip.closeEntry();
            }
        }
        return output.toByteArray();
    }

    private String md5(final byte[] content) throws Exception {
        return HexFormat.of().formatHex(MessageDigest.getInstance("MD5").digest(content));
    }
}
