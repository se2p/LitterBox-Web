// SPDX-License-Identifier: EUPL-1.2
// SPDX-FileCopyrightText: 2025 LitterBox-Web contributors

/**
 * Choosing a file, and the limits that choice is held to. The archive is opened in a worker; nothing on this side
 * of that boundary reads one, so nothing here imports a zip library — see archive-inspection.
 */

export const MAX_ARCHIVE_BYTES = 50 * 1024 * 1024;
export const MAX_ARCHIVE_ENTRIES = 2_000;
export const MAX_UNCOMPRESSED_BYTES = 100 * 1024 * 1024;
export const MAX_ENTRY_BYTES = 25 * 1024 * 1024;
export const MAX_MANIFEST_BYTES = 2 * 1024 * 1024;
export const MAX_ENTRY_NAME_LENGTH = 255;
export const MAX_PATH_DEPTH = 3;
export const MAX_ARCHIVE_NESTING = 1;
export const MAX_TEACHER_PROJECTS = 100;
export const ACCEPTED_ARCHIVE_EXTENSIONS = ['.sb3', '.mblock'] as const;

export type ArchivePreflightReason =
    | 'too-large'
    | 'unsupported-type'
    | 'invalid-archive'
    | 'missing-project-json'
    | 'unsafe-entry'
    | 'duplicate-entry'
    | 'too-many-entries'
    | 'too-large-uncompressed'
    | 'too-large-manifest'
    | 'too-deep'
    | 'several-folders';

export interface ArchiveChildError {
    name: string;
    reason: ArchivePreflightReason;
}

export interface ArchivePreflightResult {
    valid: boolean;
    reason?: ArchivePreflightReason;
    entries: number;
    childErrors?: ArchiveChildError[];
    projects?: number;
    uncompressedBytes?: number;
}

const extensionIsAccepted = (name: string): boolean =>
    ACCEPTED_ARCHIVE_EXTENSIONS.some((extension) => name.toLowerCase().endsWith(extension));

const isTeacherArchive = (name: string): boolean => name.toLowerCase().endsWith('.zip');

const readArrayBuffer = (blob: Blob): Promise<ArrayBuffer> => {
    if (typeof blob.arrayBuffer === 'function') return blob.arrayBuffer();
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as ArrayBuffer);
        reader.onerror = () => reject(reader.error ?? new Error('Unable to read archive'));
        reader.readAsArrayBuffer(blob);
    });
};

const runInWorker = (
    file: File,
    kind?: 'teacher',
    signal?: AbortSignal,
): Promise<ArchivePreflightResult> =>
    new Promise((resolve) => {
        if (signal?.aborted) {
            resolve({ valid: false, reason: 'invalid-archive', entries: 0 });
            return;
        }
        const worker = new Worker(
            new URL('../workers/archive-preflight.worker.ts', import.meta.url),
            { type: 'module' },
        );
        let settled = false;
        const abort = () => finish({ valid: false, reason: 'invalid-archive', entries: 0 });
        const cleanup = () => {
            signal?.removeEventListener('abort', abort);
            worker.onmessage = null;
            worker.onerror = null;
            worker.terminate();
        };
        const finish = (result: ArchivePreflightResult) => {
            if (settled) return;
            settled = true;
            cleanup();
            resolve(result);
        };
        worker.onmessage = (event: MessageEvent<ArchivePreflightResult>) => finish(event.data);
        worker.onerror = () => finish({ valid: false, reason: 'invalid-archive', entries: 0 });
        signal?.addEventListener('abort', abort, { once: true });
        void readArrayBuffer(file)
            .then((data) => {
                if (settled || signal?.aborted) return;
                worker.postMessage({ data, kind }, [data]);
            })
            .catch(() => finish({ valid: false, reason: 'invalid-archive', entries: 0 }));
    });

export async function preflightArchive(
    file: File,
    signal?: AbortSignal,
): Promise<ArchivePreflightResult> {
    if (file.size > MAX_ARCHIVE_BYTES) return { valid: false, reason: 'too-large', entries: 0 };
    if (!extensionIsAccepted(file.name))
        return { valid: false, reason: 'unsupported-type', entries: 0 };
    // No worker to send it to — a test environment, or a browser too old for module workers. The inspection is
    // fetched at that point rather than linked in, so the ordinary path still costs nothing.
    if (typeof Worker === 'undefined') {
        const { validateArchiveBuffer } = await import('./archive-inspection');
        return validateArchiveBuffer(await readArrayBuffer(file));
    }
    return runInWorker(file, undefined, signal);
}

export async function preflightTeacherArchive(
    file: File,
    signal?: AbortSignal,
): Promise<ArchivePreflightResult> {
    if (file.size > MAX_ARCHIVE_BYTES) return { valid: false, reason: 'too-large', entries: 0 };
    if (!isTeacherArchive(file.name))
        return { valid: false, reason: 'unsupported-type', entries: 0 };
    if (typeof Worker === 'undefined') {
        const { validateTeacherArchiveBuffer } = await import('./archive-inspection');
        return validateTeacherArchiveBuffer(await readArrayBuffer(file));
    }
    return runInWorker(file, 'teacher', signal);
}

export const isNumericScratchProjectUrl = (value: string): boolean => {
    try {
        const url = new URL(value);
        return (
            url.protocol === 'https:' &&
            url.hostname === 'scratch.mit.edu' &&
            url.search === '' &&
            url.hash === '' &&
            /^\/projects\/[1-9]\d*\/?$/.test(url.pathname)
        );
    } catch {
        return false;
    }
};

export const parseScratchStudioId = (value: string): string | undefined => {
    if (/^[1-9]\d*$/.test(value)) return value;
    try {
        const url = new URL(value);
        return url.protocol === 'https:' &&
            url.hostname === 'scratch.mit.edu' &&
            url.search === '' &&
            url.hash === ''
            ? /^\/studios\/([1-9]\d*)\/?$/.exec(url.pathname)?.[1]
            : undefined;
    } catch {
        return undefined;
    }
};
