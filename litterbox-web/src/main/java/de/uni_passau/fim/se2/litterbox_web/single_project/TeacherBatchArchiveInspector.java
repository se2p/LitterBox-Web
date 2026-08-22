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

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;

import org.springframework.stereotype.Component;

@Component
public class TeacherBatchArchiveInspector {

    static final long MAX_COMPRESSED_BYTES = 50L * 1024 * 1024;
    private static final int MAX_OUTER_ENTRIES = 2_000;
    private static final int MAX_PROJECTS = 100;
    private static final long MAX_CHILD_BYTES = 25L * 1024 * 1024;
    private static final long MAX_ARCHIVED_CHILD_BYTES = 100L * 1024 * 1024;
    private static final long MAX_EXPANDED_PROJECT_BYTES = 100L * 1024 * 1024;
    private static final int MAX_NAME_LENGTH = 255;
    private static final int BUFFER_SIZE = 16 * 1024;
    private final ProjectArchiveInspector projects;

    public TeacherBatchArchiveInspector(final ProjectArchiveInspector projects) {
        this.projects = projects;
    }

    public List<ChildArchive> inspect(final byte[] outer) throws IOException {
        if (outer == null || outer.length == 0) {
            throw new IllegalArgumentException("Teacher archive must not be empty");
        }
        if (outer.length > MAX_COMPRESSED_BYTES) {
            throw new IllegalArgumentException("Teacher archive exceeds the compressed size limit");
        }
        return inspectOuter(outer);
    }

    public List<ChildArchive> inspect(final InputStream outer) throws IOException {
        if (outer == null) {
            throw new IllegalArgumentException("Teacher archive must not be empty");
        }
        final ByteArrayOutputStream bounded = new ByteArrayOutputStream();
        final byte[] buffer = new byte[BUFFER_SIZE];
        int read;
        while ((read = outer.read(buffer)) >= 0) {
            if (read == 0) {
                continue;
            }
            if ((long) bounded.size() + read > MAX_COMPRESSED_BYTES) {
                throw new IllegalArgumentException("Teacher archive exceeds the compressed size limit");
            }
            bounded.write(buffer, 0, read);
        }
        return inspect(bounded.toByteArray());
    }

    private List<ChildArchive> inspectOuter(final byte[] outer) throws IOException {
        final int expectedEntries = validateCentralDirectory(outer);
        final OuterInspectionState state = new OuterInspectionState();
        try (ZipInputStream zip = new ZipInputStream(new ByteArrayInputStream(outer))) {
            ZipEntry entry;
            while ((entry = zip.getNextEntry()) != null) {
                inspectOuterEntry(zip, entry, state);
            }
        }
        if (state.entryCount != expectedEntries) {
            throw new IllegalArgumentException("Teacher archive structure is malformed");
        }
        if (state.children.isEmpty()) {
            throw new IllegalArgumentException("Teacher archive contains no project archives");
        }
        return List.copyOf(state.children);
    }

    private void inspectOuterEntry(
        final ZipInputStream zip,
        final ZipEntry entry,
        final OuterInspectionState state
    ) throws IOException {
        if (++state.entryCount > MAX_OUTER_ENTRIES) {
            throw new IllegalArgumentException("Teacher archive contains too many entries");
        }
        final String name = entry.getName();
        validateBasicOuterEntryName(name);
        if (!state.names.add(name.toLowerCase(Locale.ROOT))) {
            throw new IllegalArgumentException("Teacher archive contains duplicate entries");
        }
        if (metadataEntry(name)) {
            return;
        }
        validateOuterEntryStructure(name, entry.isDirectory());
        if (entry.isDirectory()) {
            return;
        }
        state.enterProjectDirectory(projectDirectory(name));
        final String projectName = projectName(name);
        validateChildEntry(projectName, state.children.size());
        final byte[] exact = readChild(zip, state);
        if (exact.length > MAX_CHILD_BYTES) {
            state.children.add(
                new ChildArchive(
                    projectName, exact, IllegalArgumentException.class.getSimpleName(),
                    "Teacher archive child exceeds the size limit"
                )
            );
            return;
        }
        inspectChild(projectName, exact, state);
    }

    /**
     * Entries the computer added rather than the teacher. Compressing a folder on macOS writes a parallel
     * {@code __MACOSX} tree of resource forks beside it, and both macOS and Windows leave a folder listing behind;
     * refusing an archive over them would refuse the ordinary way of making one.
     */
    private boolean metadataEntry(final String name) {
        if ("__MACOSX".equals(name) || name.startsWith("__MACOSX/")) {
            return true;
        }
        final String leaf = projectName(name);
        return leaf.startsWith("._")
            || ".DS_Store".equalsIgnoreCase(leaf)
            || "Thumbs.db".equalsIgnoreCase(leaf);
    }

    /** The folder an entry sits in, or the empty string for one at the root of the archive. */
    private String projectDirectory(final String name) {
        final int separator = name.indexOf('/');
        return separator < 0 ? "" : name.substring(0, separator);
    }

    /** What the project is called, which is its own name and not the folder a teacher happened to zip it inside. */
    private String projectName(final String name) {
        return name.endsWith("/") ? "" : name.substring(name.lastIndexOf('/') + 1);
    }

    private void validateChildEntry(final String name, final int childCount) {
        final String lower = name.toLowerCase(Locale.ROOT);
        if (!lower.endsWith(".sb3") && !lower.endsWith(".mblock")) {
            throw new IllegalArgumentException("Teacher archive contains an unsafe unsupported child");
        }
        if (childCount == MAX_PROJECTS) {
            throw new IllegalArgumentException("Teacher archive contains too many projects");
        }
    }

    private byte[] readChild(final ZipInputStream zip, final OuterInspectionState state) throws IOException {
        final ByteArrayOutputStream child = new ByteArrayOutputStream();
        final byte[] buffer = new byte[BUFFER_SIZE];
        int read;
        while ((read = zip.read(buffer)) >= 0) {
            if (read == 0) {
                continue;
            }
            state.archivedChildBytes += read;
            if (state.archivedChildBytes > MAX_ARCHIVED_CHILD_BYTES) {
                throw new IllegalArgumentException("Teacher archive exceeds the extraction limit");
            }
            child.write(buffer, 0, read);
        }
        return child.toByteArray();
    }

    private void inspectChild(final String name, final byte[] exact, final OuterInspectionState state) {
        try {
            validateCentralDirectory(exact);
            countExpandedBytes(exact, state.expansionBudget);
            projects.inspect(exact);
            state.children.add(new ChildArchive(name, exact, null, null));
        }
        catch (ExpansionLimitException error) {
            throw new IllegalArgumentException("Teacher archive exceeds the extraction limit", error);
        }
        catch (IOException | RuntimeException error) {
            state.children.add(
                new ChildArchive(
                    name, exact, error.getClass().getSimpleName(),
                    SingleProjectSupport.safeMessage(error, "Project archive is invalid")
                )
            );
        }
    }

    private int validateCentralDirectory(final byte[] archive) {
        final int minimum = Math.max(0, archive.length - 65_557);
        for (int offset = archive.length - 22; offset >= minimum; offset--) {
            if (littleEndianInt(archive, offset) != 0x06054b50L) {
                continue;
            }
            final int commentLength = littleEndianShort(archive, offset + 20);
            if (offset + 22 + commentLength != archive.length) {
                continue;
            }
            final int disk = littleEndianShort(archive, offset + 4);
            final int directoryDisk = littleEndianShort(archive, offset + 6);
            final int diskEntries = littleEndianShort(archive, offset + 8);
            final int totalEntries = littleEndianShort(archive, offset + 10);
            final long directorySize = littleEndianInt(archive, offset + 12);
            final long directoryOffset = littleEndianInt(archive, offset + 16);
            if (totalEntries > MAX_OUTER_ENTRIES) {
                throw new IllegalArgumentException("Teacher archive contains too many entries");
            }
            if (
                !validDirectoryHeader(
                    archive, offset, disk, directoryDisk, diskEntries, totalEntries, directorySize, directoryOffset
                )
            ) {
                throw new IllegalArgumentException("Teacher archive structure is malformed");
            }
            return totalEntries;
        }
        throw new IllegalArgumentException("Teacher archive structure is malformed");
    }

    private boolean validDirectoryHeader(
        final byte[] archive,
        final int offset,
        final int disk,
        final int directoryDisk,
        final int diskEntries,
        final int totalEntries,
        final long directorySize,
        final long directoryOffset
    ) {
        if (disk != 0 || directoryDisk != 0 || diskEntries != totalEntries) {
            return false;
        }
        if (totalEntries == 0xffff || directorySize == 0xffff_ffffL || directoryOffset == 0xffff_ffffL) {
            return false;
        }
        if (directoryOffset + directorySize > offset) {
            return false;
        }
        return totalEntries == 0 || littleEndianInt(archive, (int) directoryOffset) == 0x02014b50L;
    }

    private int littleEndianShort(final byte[] bytes, final int offset) {
        if (offset < 0 || offset > bytes.length - 2) {
            return -1;
        }
        return Byte.toUnsignedInt(bytes[offset]) | Byte.toUnsignedInt(bytes[offset + 1]) << 8;
    }

    private long littleEndianInt(final byte[] bytes, final int offset) {
        if (offset < 0 || offset > bytes.length - 4) {
            return -1;
        }
        return Integer.toUnsignedLong(
            Byte.toUnsignedInt(bytes[offset])
                | Byte.toUnsignedInt(bytes[offset + 1]) << 8
                | Byte.toUnsignedInt(bytes[offset + 2]) << 16
                | Byte.toUnsignedInt(bytes[offset + 3]) << 24
        );
    }

    /**
     * Where an entry is allowed to sit. A project is either at the root or one folder down, because zipping the folder
     * the projects are already in is how an archive gets made and unwrapping it is nothing more than dropping the first
     * path component. Anything deeper is a directory tree rather than a class set.
     */
    private void validateOuterEntryStructure(final String name, final boolean directory) {
        final String path = directory && name.endsWith("/") ? name.substring(0, name.length() - 1) : name;
        final String[] components = path.split("/", -1);
        validateOuterEntryComponents(components);
        if (!directory && components.length > 2) {
            throw new IllegalArgumentException("Teacher archive contains an unsafe nested project entry");
        }
    }

    private void validateBasicOuterEntryName(final String name) {
        if (name == null || name.isBlank() || name.length() > MAX_NAME_LENGTH) {
            throw new IllegalArgumentException("Teacher archive contains an unsafe project entry");
        }
        if (name.startsWith("/") || name.startsWith("\\") || name.contains("\\")) {
            throw new IllegalArgumentException("Teacher archive contains an unsafe project entry");
        }
        if (name.matches("^[A-Za-z]:.*")) {
            throw new IllegalArgumentException("Teacher archive contains an unsafe project entry");
        }
    }

    private void validateOuterEntryComponents(final String[] components) {
        for (String component : components) {
            if (component.isBlank() || ".".equals(component) || "..".equals(component)) {
                throw new IllegalArgumentException("Teacher archive contains an unsafe project entry");
            }
        }
    }

    private void countExpandedBytes(final byte[] child, final ExpansionBudget budget) throws IOException {
        try (ZipInputStream zip = new ZipInputStream(new ByteArrayInputStream(child))) {
            final byte[] buffer = new byte[BUFFER_SIZE];
            while (zip.getNextEntry() != null) {
                int read;
                while ((read = zip.read(buffer)) >= 0) {
                    if (read == 0) {
                        continue;
                    }
                    budget.add(read);
                }
            }
        }
    }

    private static final class ExpansionBudget {

        private long bytes;

        private void add(final int count) {
            bytes += count;
            if (bytes > MAX_EXPANDED_PROJECT_BYTES) {
                throw new ExpansionLimitException();
            }
        }
    }

    private static final class OuterInspectionState {

        private final List<ChildArchive> children = new ArrayList<>();
        private final Set<String> names = new HashSet<>();
        private final ExpansionBudget expansionBudget = new ExpansionBudget();
        private long archivedChildBytes;
        private int entryCount;
        private String projectDirectory;

        /**
         * The one folder the projects are in, settled by the first of them. A set spread over several folders is not a
         * set with a wrapper around it, and unwrapping it would silently merge groups a teacher separated.
         */
        private void enterProjectDirectory(final String directory) {
            if (projectDirectory == null) {
                projectDirectory = directory;
            }
            else if (!projectDirectory.equals(directory)) {
                throw new IllegalArgumentException("Teacher archive spreads its projects over several folders");
            }
        }
    }

    private static final class ExpansionLimitException extends RuntimeException {
    }

    public record ChildArchive(
        String filename,
        byte[] bytes,
        String failureType,
        String failureMessage
    ) {

        public ChildArchive {
            bytes = bytes.clone();
        }

        @Override
        public byte[] bytes() {
            return bytes.clone();
        }

        public boolean failed() {
            return failureType != null;
        }
    }
}
