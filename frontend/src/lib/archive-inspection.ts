// SPDX-License-Identifier: EUPL-1.2
// SPDX-FileCopyrightText: 2025 LitterBox-Web contributors

/**
 * Reading the inside of an archive, which is the only thing here that needs a zip library. Split out because the
 * inspection runs in a worker; kept beside the rest, the library would be downloaded by every visitor regardless of
 * whether they ever chose a file.
 */
import JSZip from 'jszip';

import {
    ACCEPTED_ARCHIVE_EXTENSIONS,
    MAX_ARCHIVE_BYTES,
    MAX_ARCHIVE_ENTRIES,
    MAX_ARCHIVE_NESTING,
    MAX_ENTRY_BYTES,
    MAX_ENTRY_NAME_LENGTH,
    MAX_MANIFEST_BYTES,
    MAX_PATH_DEPTH,
    MAX_TEACHER_PROJECTS,
    MAX_UNCOMPRESSED_BYTES,
    type ArchiveChildError,
    type ArchivePreflightReason,
    type ArchivePreflightResult,
} from './archive-preflight';

const extensionIsAccepted = (name: string): boolean =>
    ACCEPTED_ARCHIVE_EXTENSIONS.some((extension) => name.toLowerCase().endsWith(extension));

const unsafePath = (name: string): boolean =>
    name.startsWith('/') || name.includes('\\') || name.split('/').some((part) => part === '..');

const isDirectory = (name: string, entry: { dir?: boolean }): boolean =>
    Boolean(entry.dir) || name.endsWith('/');

const originalEntryName = (entry: unknown, fallback: string): string =>
    (entry as { unsafeOriginalName?: string }).unsafeOriginalName ?? fallback;

/**
 * The uncompressed size the archive declares for an entry, letting an entry be sized without inflating it. JSZip
 * keeps it on a private field, so this is the one guarded read; every caller must still fall back to inflating.
 */
const declaredUncompressedSize = (entry: unknown): number | undefined => {
    const declared = (entry as { _data?: { uncompressedSize?: number } })._data?.uncompressedSize;
    return typeof declared === 'number' ? declared : undefined;
};

/**
 * The entries exactly as the ZIP central directory lists them, read directly from the archive bytes rather than
 * through JSZip. JSZip's own file map is keyed by name, so two entries sharing a name silently collapse to the
 * last one written before any check here runs; the central directory is a fixed structure that does not lose them.
 */
const rawEntryNames = (data: ArrayBuffer): string[] => {
    if (data.byteLength < 22) return [];
    const bytes = new Uint8Array(data);
    const view = new DataView(data);
    const EOCD_SIGNATURE = 0x06054b50;
    const CENTRAL_DIR_SIGNATURE = 0x02014b50;
    const searchFloor = Math.max(0, bytes.byteLength - 22 - 0xffff);
    let eocd = -1;
    for (let index = bytes.byteLength - 22; index >= searchFloor; index -= 1) {
        if (view.getUint32(index, true) === EOCD_SIGNATURE) {
            eocd = index;
            break;
        }
    }
    if (eocd < 0) return [];
    const totalEntries = view.getUint16(eocd + 10, true);
    const decoder = new TextDecoder();
    const names: string[] = [];
    let offset = view.getUint32(eocd + 16, true);
    for (let entry = 0; entry < totalEntries; entry += 1) {
        if (
            offset + 46 > bytes.byteLength ||
            view.getUint32(offset, true) !== CENTRAL_DIR_SIGNATURE
        )
            return [];
        const nameLength = view.getUint16(offset + 28, true);
        const extraLength = view.getUint16(offset + 30, true);
        const commentLength = view.getUint16(offset + 32, true);
        if (offset + 46 + nameLength > bytes.byteLength) return [];
        names.push(decoder.decode(bytes.subarray(offset + 46, offset + 46 + nameLength)));
        offset += 46 + nameLength + extraLength + commentLength;
    }
    return names;
};

/** Named, short enough to write down, and pointing inside the archive rather than out of it. */
const entryNameIsUnsafe = (name: string): boolean =>
    !name || name.length > MAX_ENTRY_NAME_LENGTH || unsafePath(name);

const validateEntryName = (name: string): ArchivePreflightReason | undefined => {
    if (entryNameIsUnsafe(name)) return 'unsafe-entry';
    const components = name.split('/');
    const pathComponents = name.endsWith('/') ? components.slice(0, -1) : components;
    if (pathComponents.length > MAX_PATH_DEPTH) return 'too-deep';
    // '..' is already refused by unsafePath; an empty or bare-dot component is what is left to catch here.
    if (pathComponents.some((component) => component.length === 0 || component === '.'))
        return 'unsafe-entry';
    return undefined;
};

const isNestedArchive = (name: string): boolean => /\.(?:zip|sb3|mblock)$/i.test(name);

/**
 * Whether two entries would land on the same file. Read from the archive's own central directory, since JSZip's
 * file map has already dropped one of any exact pair by the time this module sees it; falls back to JSZip's names
 * when the directory could not be read. Compared case-insensitively, matching the target filesystem.
 */
const hasDuplicateEntryNames = (data: ArrayBuffer, names: string[]): boolean => {
    const rawNames = rawEntryNames(data);
    const seen = new Set<string>();
    for (const name of rawNames.length > 0 ? rawNames : names) {
        const normalized = name.toLowerCase();
        if (seen.has(normalized)) return true;
        seen.add(normalized);
    }
    return false;
};

/** A JSON document with an object at its top level, which is what both project.json and the manifest must be. */
const isJsonObjectDocument = (bytes: Uint8Array): boolean => {
    try {
        const parsed: unknown = JSON.parse(new TextDecoder().decode(bytes));
        return Boolean(parsed) && typeof parsed === 'object' && !Array.isArray(parsed);
    } catch {
        return false;
    }
};

const asArrayBuffer = (bytes: Uint8Array): ArrayBuffer =>
    bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;

const inspectZip = async (data: ArrayBuffer, nesting: number): Promise<ArchivePreflightResult> => {
    if (data.byteLength > MAX_ARCHIVE_BYTES)
        return { valid: false, reason: 'too-large', entries: 0 };
    if (nesting > MAX_ARCHIVE_NESTING) return { valid: false, reason: 'unsafe-entry', entries: 0 };

    try {
        const archive = await JSZip.loadAsync(data, { createFolders: false });
        const names = Object.keys(archive.files);
        if (hasDuplicateEntryNames(data, names))
            return { valid: false, reason: 'duplicate-entry', entries: names.length };
        if (names.length > MAX_ARCHIVE_ENTRIES)
            return { valid: false, reason: 'too-many-entries', entries: names.length };

        const files = names.filter((name) => !isDirectory(name, archive.files[name]));
        let uncompressedBytes = 0;

        for (const name of names) {
            const entry = archive.files[name];
            const originalName = originalEntryName(entry, name);
            const nameReason = validateEntryName(originalName);
            if (nameReason) return { valid: false, reason: nameReason, entries: names.length };
            if (!isDirectory(name, entry) && isNestedArchive(originalName)) {
                return { valid: false, reason: 'unsafe-entry', entries: names.length };
            }
        }

        if (files.filter((name) => name === 'project.json').length !== 1)
            return { valid: false, reason: 'missing-project-json', entries: names.length };

        for (const name of files) {
            const entry = archive.files[name];
            // The only entries this module looks inside; every other entry only needs to be sized.
            const needsContent = name === 'project.json' || name === 'litterbox/manifest.json';
            const declared = declaredUncompressedSize(entry);
            if (declared !== undefined) {
                if (
                    declared > MAX_ENTRY_BYTES ||
                    uncompressedBytes + declared > MAX_UNCOMPRESSED_BYTES
                )
                    return {
                        valid: false,
                        reason: 'too-large-uncompressed',
                        entries: names.length,
                    };
                if (!needsContent) {
                    uncompressedBytes += declared;
                    continue;
                }
            }
            const bytes = await entry.async('uint8array');
            if (bytes.byteLength > MAX_ENTRY_BYTES)
                return { valid: false, reason: 'too-large-uncompressed', entries: names.length };
            uncompressedBytes += bytes.byteLength;
            if (uncompressedBytes > MAX_UNCOMPRESSED_BYTES)
                return { valid: false, reason: 'too-large-uncompressed', entries: names.length };
            if (needsContent) {
                if (bytes.byteLength > MAX_MANIFEST_BYTES)
                    return { valid: false, reason: 'too-large-manifest', entries: names.length };
                if (!isJsonObjectDocument(bytes))
                    return { valid: false, reason: 'invalid-archive', entries: names.length };
            }
        }

        return { valid: true, entries: names.length, uncompressedBytes };
    } catch {
        return { valid: false, reason: 'invalid-archive', entries: 0 };
    }
};

export async function validateArchiveBuffer(
    data: ArrayBuffer,
    nesting = 0,
): Promise<ArchivePreflightResult> {
    return inspectZip(data, nesting);
}

const childNameIsUnsafe = (name: string): boolean =>
    Boolean(validateEntryName(name)) || /\.zip$/i.test(name);

/**
 * Entries the computer added rather than the teacher — macOS's `__MACOSX` resource-fork tree and folder-listing
 * files both platforms leave behind. Refusing an archive over them would refuse the ordinary way of making one.
 * Mirrors TeacherBatchArchiveInspector on the service.
 */
const isDesktopMetadata = (name: string): boolean => {
    if (name === '__MACOSX' || name.startsWith('__MACOSX/')) return true;
    const leaf = projectName(name);
    return (
        leaf.startsWith('._') ||
        leaf.toLowerCase() === '.ds_store' ||
        leaf.toLowerCase() === 'thumbs.db'
    );
};

/** The folder an entry sits in, or the empty string for one at the root of the archive. */
const projectDirectory = (name: string): string => {
    const separator = name.indexOf('/');
    return separator < 0 ? '' : name.slice(0, separator);
};

/** What the project is called, which is its own name and not the folder a teacher happened to zip it inside. */
const projectName = (name: string): string =>
    name.endsWith('/') ? '' : name.slice(name.lastIndexOf('/') + 1);

export async function validateTeacherArchiveBuffer(
    data: ArrayBuffer,
): Promise<ArchivePreflightResult> {
    if (data.byteLength > MAX_ARCHIVE_BYTES)
        return { valid: false, reason: 'too-large', entries: 0 };
    try {
        const outer = await JSZip.loadAsync(data, { createFolders: false });
        const names = Object.keys(outer.files);
        const asNamed = (name: string): string => originalEntryName(outer.files[name], name);
        if (hasDuplicateEntryNames(data, names))
            return { valid: false, reason: 'duplicate-entry', entries: names.length };
        if (names.length > MAX_ARCHIVE_ENTRIES)
            return { valid: false, reason: 'too-many-entries', entries: names.length };

        // Path safety applies to every entry, including desktop metadata: only their shape is excused.
        if (names.some((name) => entryNameIsUnsafe(asNamed(name))))
            return { valid: false, reason: 'unsafe-entry', entries: names.length };

        const carried = names.filter((name) => !isDesktopMetadata(asNamed(name)));
        if (carried.some((name) => validateEntryName(asNamed(name))))
            return { valid: false, reason: 'unsafe-entry', entries: names.length };

        const files = carried.filter((name) => !isDirectory(name, outer.files[name]));
        if (
            files.some((name) => {
                const leaf = projectName(asNamed(name));
                return (
                    asNamed(name).split('/').length > 2 ||
                    childNameIsUnsafe(leaf) ||
                    !extensionIsAccepted(leaf)
                );
            })
        )
            return { valid: false, reason: 'unsafe-entry', entries: names.length };
        // A single wrapper folder is unwrapped; a folder per project is a grouping the teacher made and stays.
        const directories = new Set(files.map((name) => projectDirectory(asNamed(name))));
        if (directories.size > 1)
            return { valid: false, reason: 'several-folders', entries: names.length };
        if (files.length === 0 || files.length > MAX_TEACHER_PROJECTS)
            return {
                valid: false,
                reason: 'too-many-entries',
                entries: names.length,
                projects: files.length,
            };

        let archivedChildBytes = 0;
        let expandedProjectBytes = 0;
        const childErrors: ArchiveChildError[] = [];
        for (const name of files) {
            const entry = outer.files[name];
            const shown = projectName(asNamed(name));
            const declared = declaredUncompressedSize(entry);
            // One project being too big is that project's own failure, so the rest of the class set still goes
            // through; going over the total is the archive's failure, with no single project to name.
            if (declared !== undefined && declared > MAX_ENTRY_BYTES) {
                childErrors.push({ name: shown, reason: 'too-large-uncompressed' });
                continue;
            }
            if (declared !== undefined && archivedChildBytes + declared > MAX_UNCOMPRESSED_BYTES)
                return {
                    valid: false,
                    reason: 'too-large-uncompressed',
                    entries: names.length,
                };
            const bytes = await entry.async('uint8array');
            if (bytes.byteLength > MAX_ENTRY_BYTES) {
                childErrors.push({ name: shown, reason: 'too-large-uncompressed' });
                continue;
            }
            archivedChildBytes += bytes.byteLength;
            if (archivedChildBytes > MAX_UNCOMPRESSED_BYTES)
                return { valid: false, reason: 'too-large-uncompressed', entries: names.length };
            const child = await inspectZip(asArrayBuffer(bytes), 1);
            if (!child.valid) {
                childErrors.push({ name: shown, reason: child.reason ?? 'invalid-archive' });
            } else {
                expandedProjectBytes += child.uncompressedBytes ?? 0;
                if (expandedProjectBytes > MAX_UNCOMPRESSED_BYTES)
                    return {
                        valid: false,
                        reason: 'too-large-uncompressed',
                        entries: names.length,
                    };
            }
        }
        return childErrors.length > 0
            ? {
                  valid: false,
                  reason: 'invalid-archive',
                  entries: names.length,
                  projects: files.length,
                  childErrors,
                  uncompressedBytes: expandedProjectBytes,
              }
            : {
                  valid: true,
                  entries: names.length,
                  projects: files.length,
                  uncompressedBytes: expandedProjectBytes,
              };
    } catch {
        return { valid: false, reason: 'invalid-archive', entries: 0 };
    }
}
