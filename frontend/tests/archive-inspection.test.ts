// SPDX-License-Identifier: EUPL-1.2
// SPDX-FileCopyrightText: 2025 LitterBox-Web contributors
import { describe, expect, it } from 'vitest';
import JSZip from 'jszip';
import { validateArchiveBuffer, validateTeacherArchiveBuffer } from '../src/lib/archive-inspection';
import { MAX_ENTRY_BYTES } from '../src/lib/archive-preflight';

const asArrayBuffer = (bytes: Uint8Array): ArrayBuffer =>
    bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;

const textBytes = (value: string): Uint8Array => new TextEncoder().encode(value);

const crc32Table = (() => {
    const table = new Uint32Array(256);
    for (let value = 0; value < 256; value += 1) {
        let entry = value;
        for (let bit = 0; bit < 8; bit += 1)
            entry = entry & 1 ? 0xedb88320 ^ (entry >>> 1) : entry >>> 1;
        table[value] = entry >>> 0;
    }
    return table;
})();

const crc32 = (data: Uint8Array): number => {
    let crc = 0xffffffff;
    for (const byte of data) crc = crc32Table[(crc ^ byte) & 0xff] ^ (crc >>> 8);
    return (crc ^ 0xffffffff) >>> 0;
};

const concatBytes = (...parts: Uint8Array[]): Uint8Array => {
    const total = parts.reduce((sum, part) => sum + part.byteLength, 0);
    const result = new Uint8Array(total);
    let offset = 0;
    for (const part of parts) {
        result.set(part, offset);
        offset += part.byteLength;
    }
    return result;
};

const localFileHeader = (name: string, data: Uint8Array): Uint8Array => {
    const nameBytes = textBytes(name);
    const header = new Uint8Array(30);
    const view = new DataView(header.buffer);
    view.setUint32(0, 0x04034b50, true); // local file header signature
    view.setUint16(4, 20, true); // version needed to extract
    view.setUint16(6, 0, true); // general purpose bit flag
    view.setUint16(8, 0, true); // compression method: stored, so no decompressor is needed to reload it
    view.setUint16(10, 0, true); // last mod file time
    view.setUint16(12, 0, true); // last mod file date
    view.setUint32(14, crc32(data), true);
    view.setUint32(18, data.byteLength, true); // compressed size
    view.setUint32(22, data.byteLength, true); // uncompressed size
    view.setUint16(26, nameBytes.byteLength, true);
    view.setUint16(28, 0, true); // extra field length
    return concatBytes(header, nameBytes, data);
};

const centralDirectoryRecord = (
    name: string,
    data: Uint8Array,
    localHeaderOffset: number,
): Uint8Array => {
    const nameBytes = textBytes(name);
    const header = new Uint8Array(46);
    const view = new DataView(header.buffer);
    view.setUint32(0, 0x02014b50, true); // central directory file header signature
    view.setUint16(4, 20, true); // version made by
    view.setUint16(6, 20, true); // version needed to extract
    view.setUint16(8, 0, true); // general purpose bit flag
    view.setUint16(10, 0, true); // compression method
    view.setUint16(12, 0, true); // last mod file time
    view.setUint16(14, 0, true); // last mod file date
    view.setUint32(16, crc32(data), true);
    view.setUint32(20, data.byteLength, true);
    view.setUint32(24, data.byteLength, true);
    view.setUint16(28, nameBytes.byteLength, true);
    view.setUint16(30, 0, true); // extra field length
    view.setUint16(32, 0, true); // file comment length
    view.setUint16(34, 0, true); // disk number start
    view.setUint16(36, 0, true); // internal file attributes
    view.setUint32(38, 0, true); // external file attributes
    view.setUint32(42, localHeaderOffset, true);
    return concatBytes(header, nameBytes);
};

const endOfCentralDirectory = (
    entryCount: number,
    centralDirectorySize: number,
    centralDirectoryOffset: number,
): Uint8Array => {
    const record = new Uint8Array(22);
    const view = new DataView(record.buffer);
    view.setUint32(0, 0x06054b50, true); // end of central directory signature
    view.setUint16(4, 0, true); // this disk number
    view.setUint16(6, 0, true); // disk where central directory starts
    view.setUint16(8, entryCount, true); // central directory records on this disk
    view.setUint16(10, entryCount, true); // total central directory records
    view.setUint32(12, centralDirectorySize, true);
    view.setUint32(16, centralDirectoryOffset, true);
    view.setUint16(20, 0, true); // comment length
    return record;
};

/**
 * A ZIP assembled one central-directory record at a time, rather than through JSZip's own `file()` map. Two
 * entries that share an exact name silently collapse into whichever JSZip's `file()` API saw last, before the
 * archive is even generated — the resulting bytes never contain a genuine duplicate for `loadAsync` to find.
 * Writing the local file headers and central directory by hand is what actually gets two colliding
 * central-directory records into the archive, matching what a hand-crafted hostile upload could contain.
 */
const buildRawArchive = (
    entries: ReadonlyArray<{ name: string; content: Uint8Array }>,
): ArrayBuffer => {
    const localHeaders: Uint8Array[] = [];
    const centralRecords: Uint8Array[] = [];
    let offset = 0;
    for (const entry of entries) {
        const local = localFileHeader(entry.name, entry.content);
        localHeaders.push(local);
        centralRecords.push(centralDirectoryRecord(entry.name, entry.content, offset));
        offset += local.byteLength;
    }
    const centralDirectoryOffset = offset;
    const centralDirectory = concatBytes(...centralRecords);
    const eocd = endOfCentralDirectory(
        entries.length,
        centralDirectory.byteLength,
        centralDirectoryOffset,
    );
    const archive = concatBytes(...localHeaders, centralDirectory, eocd);
    return asArrayBuffer(archive);
};

describe('archive inspection', () => {
    it('resolves a valid single-project archive', async () => {
        const zip = new JSZip();
        zip.file('project.json', '{}');
        zip.file('sprites/sprite.json', '{}');
        const data = asArrayBuffer(await zip.generateAsync({ type: 'uint8array' }));
        await expect(validateArchiveBuffer(data)).resolves.toMatchObject({ valid: true });
    });

    it('rejects an archive with no project.json', async () => {
        const zip = new JSZip();
        zip.file('sprites/sprite.json', '{}');
        const data = asArrayBuffer(await zip.generateAsync({ type: 'uint8array' }));
        await expect(validateArchiveBuffer(data)).resolves.toMatchObject({
            valid: false,
            reason: 'missing-project-json',
        });
    });

    /*
     * The regression this guards: duplicate-entry detection reads the archive's raw central directory because
     * Object.keys(archive.files) only ever shows the survivor once two entries collide — case-insensitively, on
     * every filesystem the browser eventually extracts onto, or exactly, in JSZip's own file map. A ZIP with
     * "project.json" and "Project.JSON" is what a case-insensitive extraction would silently merge into one
     * file; the check exists to refuse it before that happens rather than let extraction quietly pick a winner.
     */
    it('rejects an archive with two entries that differ only in case', async () => {
        const data = buildRawArchive([
            { name: 'project.json', content: textBytes('{}') },
            { name: 'Project.JSON', content: textBytes('{}') },
        ]);
        await expect(validateArchiveBuffer(data)).resolves.toMatchObject({
            valid: false,
            reason: 'duplicate-entry',
        });
    });

    /*
     * The sharper version of the same regression: two central-directory records that share the exact same
     * name. JSZip's own file map collapses these to a single key before any check in this module ever runs, so
     * this case can only be exercised by writing central-directory bytes directly rather than through JSZip's
     * file() API, which would just overwrite the first entry instead of producing a second one.
     */
    it('rejects an archive with two entries of the exact same name', async () => {
        const data = buildRawArchive([
            { name: 'project.json', content: textBytes('{"first":true}') },
            { name: 'project.json', content: textBytes('{"second":true}') },
        ]);
        await expect(validateArchiveBuffer(data)).resolves.toMatchObject({
            valid: false,
            reason: 'duplicate-entry',
        });
    });

    it('rejects a teacher archive with two child entries of the exact same name', async () => {
        const project = new JSZip();
        project.file('project.json', '{}');
        const projectBytes = await project.generateAsync({ type: 'uint8array' });
        const data = buildRawArchive([
            { name: 'first.sb3', content: projectBytes },
            { name: 'first.sb3', content: projectBytes },
        ]);
        await expect(validateTeacherArchiveBuffer(data)).resolves.toMatchObject({
            valid: false,
            reason: 'duplicate-entry',
        });
    });

    /*
     * One project being too big is that project's failure, not the class set's: it is reported beside its name,
     * like a child that is missing its project.json, and the other thirty projects still go through. Sizing an
     * entry by what the archive declares rather than by inflating it must not change that answer, so this asks
     * for the declared size to be the one that decides — the entry is too large to be inflated on purpose.
     */
    it('names the one oversized project in a class set and keeps the rest', async () => {
        const project = new JSZip();
        project.file('project.json', '{}');
        const teacherArchive = new JSZip();
        teacherArchive.file('small.sb3', await project.generateAsync({ type: 'uint8array' }));
        // Nothing but zeros, so the archive carrying it stays small however large it unpacks to.
        teacherArchive.file('huge.sb3', new Uint8Array(MAX_ENTRY_BYTES + 1));
        const data = asArrayBuffer(await teacherArchive.generateAsync({ type: 'uint8array' }));

        await expect(validateTeacherArchiveBuffer(data)).resolves.toMatchObject({
            valid: false,
            projects: 2,
            childErrors: [{ name: 'huge.sb3', reason: 'too-large-uncompressed' }],
        });
    });
});
