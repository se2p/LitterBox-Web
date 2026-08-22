/*
 * Copyright (C) 2024-2026 LitterBox-Web contributors
 *
 * This file is part of LitterBox-Web.
 * Licenced under the EUPL-1.2 or later.
 *
 * SPDX-FileCopyrightText: 2024-2026 LitterBox-Web contributors
 * SPDX-License-Identifier: EUPL-1.2
 */
package de.uni_passau.fim.se2.litterbox_web.single_project;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.zip.ZipEntry;
import java.util.zip.ZipOutputStream;

import org.junit.jupiter.api.Test;

class TeacherBatchArchiveInspectorTest {

    private static final String UNSAFE = "unsafe";

    private final TeacherBatchArchiveInspector inspector = new TeacherBatchArchiveInspector(
        new ProjectArchiveInspector()
    );

    @Test
    void preservesOrderedExactChildArchives() throws IOException {
        final byte[] first = projectArchive("first");
        final byte[] second = projectArchive("second");
        final byte[] outer = zip(Map.of("first.sb3", first, "second.mblock", second));

        final var children = inspector.inspect(outer);

        assertThat(children).extracting(TeacherBatchArchiveInspector.ChildArchive::filename)
            .containsExactlyInAnyOrder("first.sb3", "second.mblock");
        assertThat(children).anySatisfy(child -> {
            assertThat(child.filename()).isEqualTo("first.sb3");
            assertThat(child.bytes()).isEqualTo(first);
        });
        assertThat(children).anySatisfy(child -> {
            assertThat(child.filename()).isEqualTo("second.mblock");
            assertThat(child.bytes()).isEqualTo(second);
        });
    }

    @Test
    void rejectsDeepPathsAndNestedArchives() throws IOException {
        assertThatThrownBy(
            () -> inspector.inspect(zip(Map.of("term/folder/project.sb3", projectArchive("nested"))))
        ).isInstanceOf(IllegalArgumentException.class).hasMessageContaining(UNSAFE);
        assertThatThrownBy(() -> inspector.inspect(zip(Map.of("project.zip", projectArchive("nested")))))
            .isInstanceOf(IllegalArgumentException.class)
            .hasMessageContaining(UNSAFE);
    }

    /*
     * Zipping the folder the projects are already in is how an archive gets made, on every desktop there is. The
     * wrapper says nothing about the projects, so it is dropped, and each project keeps its own name.
     */
    @Test
    void acceptsProjectsWrappedInASingleFolder() throws IOException {
        final byte[] first = projectArchive("first");
        final byte[] second = projectArchive("second");

        final var children = inspector.inspect(
            zip(Map.of("class 7b/", new byte[0], "class 7b/first.sb3", first, "class 7b/second.mblock", second))
        );

        assertThat(children).extracting(TeacherBatchArchiveInspector.ChildArchive::filename)
            .containsExactlyInAnyOrder("first.sb3", "second.mblock");
        assertThat(children).allSatisfy(child -> assertThat(child.failed()).isFalse());
    }

    /*
     * A folder each is a grouping a teacher made, not a wrapper they can be relieved of: flattening it would merge
     * the groups and leave two projects of the same name indistinguishable.
     */
    @Test
    void rejectsProjectsSpreadOverSeveralFolders() throws IOException {
        final byte[] project = projectArchive("synthetic");

        assertThatThrownBy(
            () -> inspector.inspect(
                zip(Map.of("monday/first.sb3", project, "tuesday/second.sb3", project))
            )
        ).isInstanceOf(IllegalArgumentException.class).hasMessageContaining("several folders");
        assertThatThrownBy(
            () -> inspector.inspect(
                zip(Map.of("loose.sb3", project, "class/wrapped.sb3", project))
            )
        ).isInstanceOf(IllegalArgumentException.class).hasMessageContaining("several folders");
    }

    /*
     * Compressing a folder in the macOS Finder writes a parallel resource-fork tree beside it, and both macOS and
     * Windows leave a folder listing behind. None of it is a project, and refusing an archive over it would refuse
     * the ordinary way of making one.
     */
    @Test
    void ignoresWhatTheDesktopAddedRatherThanTheTeacher() throws IOException {
        final byte[] project = projectArchive("first");
        final Map<String, byte[]> entries = new LinkedHashMap<>();
        entries.put("class 7b/", new byte[0]);
        entries.put("class 7b/first.sb3", project);
        entries.put("class 7b/.DS_Store", new byte[] { 1 });
        entries.put("__MACOSX/", new byte[0]);
        entries.put("__MACOSX/class 7b/._first.sb3", new byte[] { 1 });
        entries.put("Thumbs.db", new byte[] { 1 });

        final var children = inspector.inspect(zip(entries));

        assertThat(children).extracting(TeacherBatchArchiveInspector.ChildArchive::filename)
            .containsExactly("first.sb3");
    }

    @Test
    void recordsMalformedProjectsAsChildFailures() throws IOException {
        final var children = inspector.inspect(
            zip(Map.of("broken.sb3", zip(Map.of("asset.txt", new byte[0]))))
        );

        assertThat(children).singleElement().satisfies(child -> {
            assertThat(child.filename()).isEqualTo("broken.sb3");
            assertThat(child.failed()).isTrue();
            assertThat(child.failureType()).isEqualTo(IllegalArgumentException.class.getSimpleName());
            assertThat(child.failureMessage()).contains("project.json");
        });
    }

    @Test
    void preservesValidChildrenAlongsideMalformedAndCaseCollidingProjects() throws IOException {
        final byte[] valid = projectArchive("valid");
        final byte[] missingProject = zip(Map.of("asset.txt", new byte[] { 1 }));
        final byte[] duplicateProject = zip(
            Map.of(
                "project.json", "{\"targets\":[]}".getBytes(),
                "PROJECT.JSON", "{\"targets\":[]}".getBytes()
            )
        );

        final var children = inspector.inspect(
            zip(Map.of("valid.sb3", valid, "missing.sb3", missingProject, "duplicate.mblock", duplicateProject))
        );

        assertThat(children).hasSize(3);
        assertThat(children).filteredOn(child -> !child.failed()).singleElement()
            .satisfies(child -> assertThat(child.bytes()).isEqualTo(valid));
        assertThat(children).filteredOn(TeacherBatchArchiveInspector.ChildArchive::failed)
            .extracting(TeacherBatchArchiveInspector.ChildArchive::filename)
            .containsExactlyInAnyOrder("missing.sb3", "duplicate.mblock");
    }

    @Test
    void rejectsCaseFoldedOuterDuplicatesAndUnsafeAbsoluteOrBackslashPaths() throws IOException {
        final byte[] project = projectArchive("synthetic");
        assertThatThrownBy(() -> inspector.inspect(zip(Map.of("Project.sb3", project, "project.SB3", project))))
            .isInstanceOf(IllegalArgumentException.class)
            .hasMessageContaining("duplicate");
        assertThatThrownBy(() -> inspector.inspect(zip(Map.of("/project.sb3", project))))
            .isInstanceOf(IllegalArgumentException.class)
            .hasMessageContaining(UNSAFE);
        assertThatThrownBy(() -> inspector.inspect(zip(Map.of("folder\\project.sb3", project))))
            .isInstanceOf(IllegalArgumentException.class)
            .hasMessageContaining(UNSAFE);
        assertThatThrownBy(() -> inspector.inspect(zip(Map.of("../project.sb3", project))))
            .isInstanceOf(IllegalArgumentException.class)
            .hasMessageContaining(UNSAFE);
    }

    @Test
    void rejectsUnsupportedEmptyMalformedAndCompressedOversizeArchives() throws IOException {
        assertThatThrownBy(() -> inspector.inspect(zip(Map.of("notes.txt", new byte[] { 1 }))))
            .isInstanceOf(IllegalArgumentException.class)
            .hasMessageContaining("unsupported");
        assertThatThrownBy(() -> inspector.inspect(zip(Map.of())))
            .isInstanceOf(IllegalArgumentException.class)
            .hasMessageContaining("no project");
        final byte[] complete = zip(Map.of("project.sb3", projectArchive("synthetic")));
        assertThatThrownBy(() -> inspector.inspect(Arrays.copyOf(complete, complete.length - 8)))
            .isInstanceOf(IllegalArgumentException.class)
            .hasMessageContaining("malformed");
        assertThatThrownBy(
            () -> inspector.inspect(new byte[(int) TeacherBatchArchiveInspector.MAX_COMPRESSED_BYTES + 1])
        ).isInstanceOf(IllegalArgumentException.class).hasMessageContaining("compressed");
    }

    @Test
    void recordsMalformedChildZipWithoutDiscardingItsExactBytes() throws IOException {
        final byte[] complete = projectArchive("synthetic");
        final byte[] malformed = Arrays.copyOf(complete, complete.length - 8);

        final var child = inspector.inspect(zip(Map.of("broken.sb3", malformed))).getFirst();

        assertThat(child.failed()).isTrue();
        assertThat(child.bytes()).isEqualTo(malformed);
        assertThat(child.failureMessage()).contains("malformed");
    }

    @Test
    void rejectsMoreThanOneHundredProjects() throws IOException {
        final byte[] project = projectArchive("synthetic");
        final Map<String, byte[]> children = new LinkedHashMap<>();
        for (int index = 0; index <= 100; index++) {
            children.put("project-" + index + ".sb3", project);
        }

        assertThatThrownBy(() -> inspector.inspect(zip(children)))
            .isInstanceOf(IllegalArgumentException.class)
            .hasMessageContaining("too many projects");
    }

    @Test
    void enforcesOuterEntryAndAggregateExpansionLimits() throws IOException {
        final Map<String, byte[]> directories = new LinkedHashMap<>();
        for (int index = 0; index <= 2_000; index++) {
            directories.put("directory-" + index + "/", new byte[0]);
        }
        assertThatThrownBy(() -> inspector.inspect(zip(directories)))
            .isInstanceOf(IllegalArgumentException.class)
            .hasMessageContaining("too many entries");

        final Map<String, byte[]> expandingChildren = new LinkedHashMap<>();
        for (int index = 0; index < 5; index++) {
            expandingChildren.put("project-" + index + ".sb3", expandedProjectArchive(22 * 1024 * 1024));
        }
        assertThatThrownBy(() -> inspector.inspect(zip(expandingChildren)))
            .isInstanceOf(IllegalArgumentException.class)
            .hasMessageContaining("extraction limit");
    }

    private byte[] projectArchive(final String name) throws IOException {
        return zip(Map.of("project.json", ("{\"name\":\"" + name + "\",\"targets\":[]}").getBytes()));
    }

    private byte[] expandedProjectArchive(final int paddingBytes) throws IOException {
        final ByteArrayOutputStream output = new ByteArrayOutputStream();
        try (ZipOutputStream zip = new ZipOutputStream(output)) {
            zip.putNextEntry(new ZipEntry("project.json"));
            zip.write("{\"targets\":[]}".getBytes());
            zip.closeEntry();
            zip.putNextEntry(new ZipEntry("padding.bin"));
            final byte[] padding = new byte[8 * 1024];
            int remaining = paddingBytes;
            while (remaining > 0) {
                final int count = Math.min(remaining, padding.length);
                zip.write(padding, 0, count);
                remaining -= count;
            }
            zip.closeEntry();
        }
        return output.toByteArray();
    }

    private byte[] zip(final Map<String, byte[]> entries) throws IOException {
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
}
