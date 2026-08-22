// SPDX-License-Identifier: EUPL-1.2
// SPDX-FileCopyrightText: 2026 LitterBox-Web contributors

import { isAbortError } from '../lib/abort-error';
import { BASE_URL } from '../lib/base-url';
import type {
    ExportRequestDto,
    ExportScriptTargetViewDto,
    ExportSpriteTargetViewDto,
    ExportTargetDto,
} from './generated';
import {
    boundedNonblankString as isBoundedNonblankString,
    hasExactKeys,
    isContentEncoded,
    positiveSafeInteger as isPositiveSafeInteger,
    isProblemJsonContentType,
    problemCodeFrom,
    readBoundedBytes,
} from './validation';

export const MAX_EXPORT_RESPONSE_BYTES = 10 * 1024 * 1024;
export const MAX_EXPORT_TARGET_TEXT_LENGTH = 255;
export const MAX_EXPORT_TOKEN_LENGTH = 128;
export const MAX_EXPORT_TARGET_ACTORS = 1_000;
export const MAX_EXPORT_TARGET_SCRIPTS = 10_000;
export const MAX_EXPORT_SCRIPT_PREVIEW_BYTES = 256 * 1024;
const MAX_PROBLEM_RESPONSE_BYTES = 16 * 1024;

export const EXPORT_FORMATS = ['scratchblocks', 'goboscript', 'pystage'] as const;
export type ExportFormat = (typeof EXPORT_FORMATS)[number];

export const EXPORT_TARGET_KINDS = ['program', 'sprite', 'script'] as const;
export type ExportTargetKind = (typeof EXPORT_TARGET_KINDS)[number];

export const EXPORT_FORMAT_METADATA: Readonly<
    Record<
        ExportFormat,
        Readonly<{
            mediaType: string;
            filename: string;
            extension: string;
        }>
    >
> = Object.freeze({
    scratchblocks: Object.freeze({
        mediaType: 'text/plain;charset=UTF-8',
        filename: 'litterbox-export.txt',
        extension: '.txt',
    }),
    goboscript: Object.freeze({
        mediaType: 'text/plain;charset=UTF-8',
        filename: 'litterbox-export.gs',
        extension: '.gs',
    }),
    pystage: Object.freeze({
        mediaType: 'text/x-python;charset=UTF-8',
        filename: 'litterbox-export.py',
        extension: '.py',
    }),
});

export const EXPORT_ERROR_CATEGORIES = [
    'validation',
    'capability_disabled',
    'authorization_required',
    'analysis_not_found',
    'analysis_not_ready',
    'capability_limit_exceeded',
    'unsupported_source_format',
    'target_not_found',
    'capability_unavailable',
    'capability_timeout',
    'malformed_request',
    'malformed_response',
    'network_failure',
    'canceled',
] as const;
export type ExportErrorCategory = (typeof EXPORT_ERROR_CATEGORIES)[number];

export class ExportApiError extends Error {
    public readonly category: ExportErrorCategory;
    public readonly status?: number;

    public constructor(category: ExportErrorCategory, status?: number) {
        super(category);
        this.name = 'ExportApiError';
        this.category = category;
        this.status = status;
    }
}

export interface ExportDownloadMetadata {
    readonly format: ExportFormat;
    readonly mediaType: string;
    readonly filename: string;
    readonly extension: string;
    readonly byteLength: number;
    readonly target: Readonly<ExportTargetDto>;
}

export interface ExportResult {
    readonly metadata: Readonly<ExportDownloadMetadata>;
    readonly blob: Blob;
}

export interface ExportTargets {
    readonly sprites: readonly Readonly<ExportSpriteTargetViewDto>[];
    readonly scripts: readonly Readonly<ExportScriptTargetViewDto>[];
}

export const isExportFormat = (value: unknown): value is ExportFormat =>
    typeof value === 'string' && (EXPORT_FORMATS as readonly string[]).includes(value);

export const isExportTargetKind = (value: unknown): value is ExportTargetKind =>
    typeof value === 'string' && (EXPORT_TARGET_KINDS as readonly string[]).includes(value);

const analysisCapabilityUrl = (token: string, analysisId: number): string => {
    if (!isBoundedNonblankString(token, MAX_EXPORT_TOKEN_LENGTH))
        throw new ExportApiError('validation');
    if (!isPositiveSafeInteger(analysisId)) throw new ExportApiError('validation');
    return `${BASE_URL}api/v1/submissions/${encodeURIComponent(token)}/analyses/${encodeURIComponent(
        String(analysisId),
    )}`;
};

export const exportUrl = (token: string, analysisId: number): string =>
    `${analysisCapabilityUrl(token, analysisId)}/exports`;

export const exportTargetsUrl = (token: string, analysisId: number): string =>
    `${analysisCapabilityUrl(token, analysisId)}/export-targets`;

export function validateExportTarget(target: ExportTargetDto): void {
    if (
        !hasExactKeys(target, ['kind', 'spriteName', 'scriptId']) ||
        !isExportTargetKind(target.kind)
    )
        throw new ExportApiError('validation');

    if (target.kind === 'program') {
        if (target.spriteName !== null || target.scriptId !== null)
            throw new ExportApiError('validation');
        return;
    }

    if (target.kind === 'sprite') {
        if (
            !isBoundedNonblankString(target.spriteName, MAX_EXPORT_TARGET_TEXT_LENGTH) ||
            target.scriptId !== null
        )
            throw new ExportApiError('validation');
        return;
    }

    if (
        target.spriteName !== null ||
        !isBoundedNonblankString(target.scriptId, MAX_EXPORT_TARGET_TEXT_LENGTH)
    )
        throw new ExportApiError('validation');
}

export function validateExportRequest(
    token: string,
    analysisId: number,
    request: ExportRequestDto,
): void {
    exportUrl(token, analysisId);
    if (!hasExactKeys(request, ['format', 'target']) || !isExportFormat(request.format))
        throw new ExportApiError('validation');
    validateExportTarget(request.target);
}

const responseMediaTypeMatches = (value: string | null, expected: string): boolean => {
    if (!value) return false;
    const actual = value.split(';').map((part) => part.trim().toLowerCase());
    const wanted = expected.split(';').map((part) => part.trim().toLowerCase());
    return actual.length === wanted.length && actual.every((part, index) => part === wanted[index]);
};

const safeProblemCode = (value: unknown): value is ExportErrorCategory =>
    typeof value === 'string' && (EXPORT_ERROR_CATEGORIES as readonly string[]).includes(value);

const readProblemCode = async (response: Response): Promise<ExportErrorCategory | undefined> => {
    if (!isProblemJsonContentType(response.headers.get('Content-Type'))) return undefined;
    try {
        if (!response.body) {
            const text = await response.text();
            if (new TextEncoder().encode(text).byteLength > MAX_PROBLEM_RESPONSE_BYTES) return;
            return problemCodeFrom(text, safeProblemCode);
        }
        const reader = response.body.getReader();
        const chunks: Uint8Array[] = [];
        let byteLength = 0;
        try {
            while (true) {
                const chunk = await reader.read();
                if (chunk.done) break;
                byteLength += chunk.value.byteLength;
                if (byteLength > MAX_PROBLEM_RESPONSE_BYTES) {
                    await reader.cancel();
                    return undefined;
                }
                chunks.push(chunk.value);
            }
        } finally {
            reader.releaseLock();
        }
        const bytes = new Uint8Array(byteLength);
        let offset = 0;
        for (const chunk of chunks) {
            bytes.set(chunk, offset);
            offset += chunk.byteLength;
        }
        return problemCodeFrom(new TextDecoder().decode(bytes), safeProblemCode);
    } catch (error) {
        if (isAbortError(error)) throw new ExportApiError('canceled', response.status);
        return undefined;
    }
};

const categoryFor = (status: number, code?: ExportErrorCategory): ExportErrorCategory => {
    if (code && code !== 'validation' && code !== 'malformed_response') return code;
    if (status === 400) return 'malformed_request';
    if (status === 401 || status === 403) return 'authorization_required';
    if (status === 404) return 'capability_disabled';
    if (status === 409) return 'analysis_not_ready';
    if (status === 413 || status === 429) return 'capability_limit_exceeded';
    if (status === 422) return 'malformed_request';
    if (status === 503) return 'capability_unavailable';
    if (status === 504) return 'capability_timeout';
    return 'malformed_request';
};

const readExportBytes = (response: Response): Promise<Uint8Array> =>
    readBoundedBytes(response, MAX_EXPORT_RESPONSE_BYTES, {
        tooLarge: () => new ExportApiError('malformed_response', response.status),
        readFailed: (error) =>
            isAbortError(error)
                ? new ExportApiError('canceled', response.status)
                : new ExportApiError('malformed_response', response.status),
    });

/**
 * Content-Length is advisory: the byte ceiling enforced while streaming the body is what actually protects this
 * client, so a response with no Content-Length at all is not thereby suspect. A header that is present but does
 * not match what arrived, on the other hand, is a response this client no longer understands.
 */
const parseContentLength = (value: string | null): number | undefined => {
    if (value === null) return undefined;
    const normalized = value.trim();
    if (!/^\d+$/.test(normalized)) throw new ExportApiError('malformed_response');
    const length = Number(normalized);
    if (!Number.isSafeInteger(length) || length > MAX_EXPORT_RESPONSE_BYTES)
        throw new ExportApiError('malformed_response');
    return length;
};

const validateSuccessHeaders = (response: Response, format: ExportFormat): number | undefined => {
    const metadata = EXPORT_FORMAT_METADATA[format];
    if (response.status !== 200) throw new ExportApiError('malformed_response', response.status);
    if (!responseMediaTypeMatches(response.headers.get('Content-Type'), metadata.mediaType))
        throw new ExportApiError('malformed_response', response.status);
    // An encoded body leaves nothing for the declared length to be compared against; see isContentEncoded.
    if (isContentEncoded(response.headers.get('Content-Encoding'))) return undefined;
    return parseContentLength(response.headers.get('Content-Length'));
};

const validateTargetCatalogueHeaders = (response: Response): void => {
    if (response.status !== 200) throw new ExportApiError('malformed_response', response.status);
    const contentType = response.headers.get('Content-Type')?.toLowerCase().split(';')[0]?.trim();
    if (contentType !== 'application/json')
        throw new ExportApiError('malformed_response', response.status);
};

const isExportSpriteTargetView = (value: unknown): value is ExportSpriteTargetViewDto =>
    hasExactKeys(value, ['name', 'stage']) &&
    isBoundedNonblankString(value.name, MAX_EXPORT_TARGET_TEXT_LENGTH) &&
    typeof value.stage === 'boolean';

const isExportScriptTargetView = (value: unknown): value is ExportScriptTargetViewDto =>
    hasExactKeys(value, ['scriptId', 'spriteName', 'ordinal', 'scratchblocks']) &&
    isBoundedNonblankString(value.scriptId, MAX_EXPORT_TARGET_TEXT_LENGTH) &&
    isBoundedNonblankString(value.spriteName, MAX_EXPORT_TARGET_TEXT_LENGTH) &&
    isPositiveSafeInteger(value.ordinal) &&
    typeof value.scratchblocks === 'string' &&
    new TextEncoder().encode(value.scratchblocks).byteLength <= MAX_EXPORT_SCRIPT_PREVIEW_BYTES;

export const validateExportTargets = (value: unknown): ExportTargets => {
    if (
        !hasExactKeys(value, ['sprites', 'scripts']) ||
        !Array.isArray(value.sprites) ||
        value.sprites.length > MAX_EXPORT_TARGET_ACTORS ||
        !value.sprites.every(isExportSpriteTargetView) ||
        !Array.isArray(value.scripts) ||
        value.scripts.length > MAX_EXPORT_TARGET_SCRIPTS ||
        !value.scripts.every(isExportScriptTargetView)
    )
        throw new ExportApiError('malformed_response');

    const spriteKeys = value.sprites.map((sprite) => `${sprite.stage}:${sprite.name}`);
    const scriptIds = value.scripts.map((script) => script.scriptId);
    if (
        new Set(spriteKeys).size !== spriteKeys.length ||
        new Set(scriptIds).size !== scriptIds.length
    )
        throw new ExportApiError('malformed_response');

    const sprites = value.sprites.map((sprite) => Object.freeze({ ...sprite }));
    const scripts = value.scripts.map((script) => Object.freeze({ ...script }));
    return Object.freeze({ sprites: Object.freeze(sprites), scripts: Object.freeze(scripts) });
};

export async function fetchExportTargets(
    token: string,
    analysisId: number,
    signal?: AbortSignal,
): Promise<ExportTargets> {
    const url = exportTargetsUrl(token, analysisId);
    let response: Response;
    try {
        response = await fetch(url, {
            method: 'GET',
            headers: {
                Accept: 'application/json',
                Authorization: `Bearer ${token}`,
            },
            signal,
        });
    } catch (error) {
        if (isAbortError(error)) throw new ExportApiError('canceled');
        throw new ExportApiError('network_failure');
    }

    if (!response.ok) {
        const code = await readProblemCode(response);
        throw new ExportApiError(categoryFor(response.status, code), response.status);
    }

    validateTargetCatalogueHeaders(response);
    const bytes = await readExportBytes(response);
    try {
        const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
        return validateExportTargets(JSON.parse(text) as unknown);
    } catch (error) {
        if (error instanceof ExportApiError) throw error;
        throw new ExportApiError('malformed_response', response.status);
    }
}

export async function fetchExport(
    token: string,
    analysisId: number,
    request: ExportRequestDto,
    signal?: AbortSignal,
): Promise<ExportResult> {
    validateExportRequest(token, analysisId, request);
    const url = exportUrl(token, analysisId);
    const metadata = EXPORT_FORMAT_METADATA[request.format];
    let response: Response;
    try {
        response = await fetch(url, {
            method: 'POST',
            headers: {
                Accept: metadata.mediaType,
                Authorization: `Bearer ${token}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(request),
            signal,
        });
    } catch (error) {
        if (isAbortError(error)) throw new ExportApiError('canceled');
        throw new ExportApiError('network_failure');
    }

    if (!response.ok) {
        const code = await readProblemCode(response);
        throw new ExportApiError(categoryFor(response.status, code), response.status);
    }

    const contentLength = validateSuccessHeaders(response, request.format);
    const bytes = await readExportBytes(response);
    if (contentLength !== undefined && contentLength !== bytes.byteLength)
        throw new ExportApiError('malformed_response', response.status);
    try {
        new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    } catch {
        throw new ExportApiError('malformed_response', response.status);
    }
    const target = Object.freeze({
        kind: request.target.kind,
        spriteName: request.target.spriteName,
        scriptId: request.target.scriptId,
    });
    const downloadMetadata = Object.freeze({
        format: request.format,
        mediaType: metadata.mediaType,
        filename: metadata.filename,
        extension: metadata.extension,
        byteLength: bytes.byteLength,
        target,
    });
    const blobBuffer = new ArrayBuffer(bytes.byteLength);
    new Uint8Array(blobBuffer).set(bytes);
    return Object.freeze({
        metadata: downloadMetadata,
        blob: new Blob([blobBuffer], { type: metadata.mediaType }),
    });
}
