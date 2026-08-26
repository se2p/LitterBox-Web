// SPDX-License-Identifier: EUPL-1.2
// SPDX-FileCopyrightText: 2026 LitterBox-Web contributors

import { isAbortError } from '../lib/abort-error';
import { BASE_URL } from '../lib/base-url';
import type {
    InjectionDownloadRequestDto,
    InjectionPreviewDto,
    InjectionRequestDto,
    InjectorCatalogueViewDto,
    InjectorViewDto,
} from './generated';
import { SUPPORTED_LOCALES, type SupportedLocale } from './capabilities';
import {
    boundedNonblankString,
    boundedString,
    hasExactKeys,
    isContentEncoded,
    isJsonContentType,
    isObject,
    nonnegativeSafeInteger as isNonnegativeSafeInteger,
    positiveSafeInteger as isPositiveSafeInteger,
    isProblemJsonContentType,
    problemCodeFrom,
    readBoundedBytes,
    readBoundedText,
} from './validation';

export const MAX_INJECTION_ARCHIVE_BYTES = 100 * 1024 * 1024;
export const MAX_INJECTOR_SELECTION = 8;
export const MAX_INJECTOR_ID_LENGTH = 128;
export const MAX_INJECTOR_COUNT = 200;
export const MAX_INJECTION_RESULT_COUNT = 200;
export const MAX_INJECTION_RESPONSE_BYTES = 8 * 1024 * 1024;

const MAX_PROBLEM_RESPONSE_BYTES = 16 * 1024;
const MAX_FINDER_ID_LENGTH = 128;
const MAX_INJECTOR_NAME_LENGTH = 512;
const MAX_INJECTOR_DESCRIPTION_LENGTH = 4096;
const MAX_SOURCE_NAME_LENGTH = 512;
const MAX_SPRITE_NAME_LENGTH = 512;
const MAX_SCRIPT_ID_LENGTH = 128;
const MAX_SCRATCHBLOCKS_LENGTH = 32768;

export const INJECTION_FAILURE_CODES = [
    'no_applicable_mutation',
    'injector_unavailable',
    'injector_failed',
] as const;
export type InjectionFailureCode = (typeof INJECTION_FAILURE_CODES)[number];

export const INJECTION_ERROR_CATEGORIES = [
    'capability_disabled',
    'authorization_required',
    'analysis_not_found',
    'analysis_not_ready',
    'capability_limit_exceeded',
    'unsupported_source_format',
    'no_applicable_mutation',
    'capability_unavailable',
    'capability_timeout',
    'analysis_capacity_exhausted',
    'invalid_request',
    'malformed_response',
    'response_too_large',
    'network_failure',
    'cancellation',
] as const;
export type InjectionErrorCategory = (typeof INJECTION_ERROR_CATEGORIES)[number];

export class InjectionApiError extends Error {
    public readonly category: InjectionErrorCategory;
    public readonly status?: number;

    public constructor(category: InjectionErrorCategory, status?: number) {
        super(category);
        this.name = 'InjectionApiError';
        this.category = category;
        this.status = status;
    }
}

export interface InjectionArchiveResult {
    readonly filename: InjectionArchiveFilename;
    readonly byteLength: number;
    readonly blob: Blob;
}

/** The archive of every mutation is a carrier for projects rather than a project, and is named as one. */
export const INJECTION_BUNDLE_FILENAME = 'litterbox-derived-all.zip';

export type InjectionArchiveFilename =
    'litterbox-derived.sb3' | 'litterbox-derived.mblock' | typeof INJECTION_BUNDLE_FILENAME;

/** The local spelling of the shared pair, kept because "nonblank" reads better as an argument at these sites. */
const isBoundedString = (value: unknown, maximum: number, nonblank = false): value is string =>
    nonblank ? boundedNonblankString(value, maximum) : boundedString(value, maximum);

const isLocale = (value: unknown): value is SupportedLocale =>
    typeof value === 'string' && (SUPPORTED_LOCALES as readonly string[]).includes(value);

const isFailureCode = (value: unknown): value is InjectionFailureCode =>
    typeof value === 'string' && (INJECTION_FAILURE_CODES as readonly string[]).includes(value);

const overLength = (value: unknown, field: string, maximum: number): boolean => {
    const candidate = isObject(value) ? value[field] : undefined;
    return Array.isArray(candidate) && candidate.length > maximum;
};

const assertTokenAndAnalysis = (token: string, analysisId: number): void => {
    if (!isBoundedString(token, MAX_INJECTOR_ID_LENGTH, true) || !isPositiveSafeInteger(analysisId))
        throw new InjectionApiError('invalid_request');
};

const normalizeSourceFormat = (
    value: string | null | undefined,
): '.sb3' | '.mblock' | undefined => {
    const normalized = String(value ?? '').toLowerCase();
    const format = normalized.startsWith('.') ? normalized : `.${normalized}`;
    return format === '.sb3' || format === '.mblock' ? format : undefined;
};

export const isInjectionSourceFormat = (
    value: string | null | undefined,
): value is '.sb3' | '.mblock' => normalizeSourceFormat(value) !== undefined;

export const injectionArchiveFilename = (
    inputFormat: string | null | undefined,
): InjectionArchiveFilename | undefined => {
    const format = normalizeSourceFormat(inputFormat);
    if (format === '.sb3') return 'litterbox-derived.sb3';
    if (format === '.mblock') return 'litterbox-derived.mblock';
    return undefined;
};

export const injectorCatalogueUrl = (
    token: string,
    analysisId: number,
    locale: SupportedLocale,
): string => {
    assertTokenAndAnalysis(token, analysisId);
    if (!isLocale(locale)) throw new InjectionApiError('invalid_request');
    const query = new URLSearchParams({ locale });
    return `${BASE_URL}api/v1/submissions/${encodeURIComponent(token)}/analyses/${encodeURIComponent(
        String(analysisId),
    )}/injector-catalogue?${query.toString()}`;
};

export const injectionPreviewUrl = (token: string, analysisId: number): string => {
    assertTokenAndAnalysis(token, analysisId);
    return `${BASE_URL}api/v1/submissions/${encodeURIComponent(token)}/analyses/${encodeURIComponent(
        String(analysisId),
    )}/injections`;
};

export const injectionDownloadUrl = (token: string, analysisId: number): string => {
    assertTokenAndAnalysis(token, analysisId);
    return `${injectionPreviewUrl(token, analysisId)}/download`;
};

export const injectionBundleUrl = (token: string, analysisId: number): string => {
    assertTokenAndAnalysis(token, analysisId);
    return `${injectionPreviewUrl(token, analysisId)}/download-all`;
};

export const validateInjectorSelection = (injectorIds: unknown): string[] => {
    if (!Array.isArray(injectorIds)) throw new InjectionApiError('invalid_request');
    if (injectorIds.length < 1 || injectorIds.length > MAX_INJECTOR_SELECTION)
        throw new InjectionApiError('invalid_request');
    const selection = injectorIds.map((injectorId) => {
        if (!isBoundedString(injectorId, MAX_INJECTOR_ID_LENGTH, true))
            throw new InjectionApiError('invalid_request');
        return injectorId;
    });
    if (new Set(selection).size !== selection.length)
        throw new InjectionApiError('invalid_request');
    return selection;
};

const validateInjector = (value: unknown): value is InjectorViewDto =>
    hasExactKeys(value, ['injectorId', 'finderId', 'name', 'description']) &&
    isBoundedString(value.injectorId, MAX_INJECTOR_ID_LENGTH, true) &&
    isBoundedString(value.finderId, MAX_FINDER_ID_LENGTH, true) &&
    isBoundedString(value.name, MAX_INJECTOR_NAME_LENGTH, true) &&
    isBoundedString(value.description, MAX_INJECTOR_DESCRIPTION_LENGTH);

const validateInjectorResponse = (value: unknown): InjectorViewDto[] => {
    if (Array.isArray(value) && value.length > MAX_INJECTOR_COUNT)
        throw new InjectionApiError('response_too_large');
    if (!Array.isArray(value) || !value.every(validateInjector))
        throw new InjectionApiError('malformed_response');
    const injectors = value as InjectorViewDto[];
    if (new Set(injectors.map((injector) => injector.injectorId)).size !== injectors.length)
        throw new InjectionApiError('malformed_response');
    return injectors;
};

const validateInjectorCatalogueResponse = (value: unknown): InjectorCatalogueViewDto => {
    if (
        !hasExactKeys(value, ['injectors', 'maxSelectedInjectors', 'allSelectionSupported']) ||
        !isPositiveSafeInteger(value.maxSelectedInjectors) ||
        value.maxSelectedInjectors > MAX_INJECTOR_SELECTION ||
        typeof value.allSelectionSupported !== 'boolean'
    )
        throw new InjectionApiError('malformed_response');
    const injectors = validateInjectorResponse(value.injectors);
    return {
        injectors,
        maxSelectedInjectors: value.maxSelectedInjectors,
        allSelectionSupported: value.allSelectionSupported,
    };
};

const validateCompleteCatalogueIds = (injectorIds: unknown): string[] => {
    if (
        !Array.isArray(injectorIds) ||
        injectorIds.length < 1 ||
        injectorIds.length > MAX_INJECTOR_COUNT
    )
        throw new InjectionApiError('invalid_request');
    const selection = injectorIds.map((injectorId) => {
        if (!isBoundedString(injectorId, MAX_INJECTOR_ID_LENGTH, true))
            throw new InjectionApiError('invalid_request');
        return injectorId;
    });
    if (new Set(selection).size !== selection.length)
        throw new InjectionApiError('invalid_request');
    return selection;
};

const validateSource = (value: unknown, analysisId: number): boolean =>
    hasExactKeys(value, ['analysisId', 'name']) &&
    value.analysisId === analysisId &&
    isPositiveSafeInteger(value.analysisId) &&
    isBoundedString(value.name, MAX_SOURCE_NAME_LENGTH, true);

const validateInjectionResult = (value: unknown, selectedIds: ReadonlySet<string>): boolean =>
    hasExactKeys(value, [
        'injectorId',
        'finderId',
        'resultIndex',
        'spriteName',
        'originalScriptId',
        'mutatedScriptId',
        'originalScratchblocks',
        'mutatedScratchblocks',
    ]) &&
    isBoundedString(value.injectorId, MAX_INJECTOR_ID_LENGTH, true) &&
    selectedIds.has(value.injectorId) &&
    isBoundedString(value.finderId, MAX_FINDER_ID_LENGTH, true) &&
    isNonnegativeSafeInteger(value.resultIndex) &&
    value.resultIndex < MAX_INJECTION_RESULT_COUNT &&
    isBoundedString(value.spriteName, MAX_SPRITE_NAME_LENGTH, true) &&
    // A script id names the script for the reader and nothing else; several injectors rewrite a script in place
    // and hand back no new name for it. Demanding one threw away every other mutation in the same answer.
    isBoundedString(value.originalScriptId, MAX_SCRIPT_ID_LENGTH) &&
    isBoundedString(value.mutatedScriptId, MAX_SCRIPT_ID_LENGTH) &&
    isBoundedString(value.originalScratchblocks, MAX_SCRATCHBLOCKS_LENGTH) &&
    isBoundedString(value.mutatedScratchblocks, MAX_SCRATCHBLOCKS_LENGTH);

const validateInjectionFailure = (value: unknown, selectedIds: ReadonlySet<string>): boolean =>
    hasExactKeys(value, ['injectorId', 'finderId', 'code']) &&
    isBoundedString(value.injectorId, MAX_INJECTOR_ID_LENGTH, true) &&
    selectedIds.has(value.injectorId) &&
    isBoundedString(value.finderId, MAX_FINDER_ID_LENGTH, true) &&
    isFailureCode(value.code);

const validatePreviewResponse = (
    value: unknown,
    analysisId: number,
    selectedIds: readonly string[],
): InjectionPreviewDto => {
    const selectedSet = new Set(selectedIds);
    // How many came back is a different complaint from what they looked like, and the reader can act on the first.
    if (
        overLength(value, 'results', MAX_INJECTION_RESULT_COUNT) ||
        overLength(value, 'failures', MAX_INJECTOR_COUNT)
    )
        throw new InjectionApiError('response_too_large');
    if (
        !hasExactKeys(value, ['schemaVersion', 'source', 'results', 'failures']) ||
        value.schemaVersion !== 1 ||
        !validateSource(value.source, analysisId) ||
        !Array.isArray(value.results) ||
        !value.results.every((result) => validateInjectionResult(result, selectedSet)) ||
        !Array.isArray(value.failures) ||
        !value.failures.every((failure) => validateInjectionFailure(failure, selectedSet))
    )
        throw new InjectionApiError('malformed_response');

    const results = value.results as InjectionPreviewDto['results'];
    const resultKeys = results.map((result) => `${result.injectorId}\u0000${result.resultIndex}`);
    if (new Set(resultKeys).size !== resultKeys.length)
        throw new InjectionApiError('malformed_response');
    return value as unknown as InjectionPreviewDto;
};

const readResponseText = (response: Response, maximum: number): Promise<string> =>
    readBoundedText(response, maximum, {
        tooLarge: () => new InjectionApiError('response_too_large', response.status),
        readFailed: (error) =>
            isAbortError(error)
                ? new InjectionApiError('cancellation', response.status)
                : new InjectionApiError('malformed_response', response.status),
        malformed: () => new InjectionApiError('malformed_response', response.status),
    });

const readJson = async (response: Response): Promise<unknown> => {
    const text = await readResponseText(response, MAX_INJECTION_RESPONSE_BYTES);
    try {
        return JSON.parse(text);
    } catch {
        throw new InjectionApiError('malformed_response', response.status);
    }
};

const isKnownErrorCategory = (value: unknown): value is InjectionErrorCategory =>
    typeof value === 'string' && (INJECTION_ERROR_CATEGORIES as readonly string[]).includes(value);

const readProblemCode = async (response: Response): Promise<InjectionErrorCategory | undefined> => {
    if (!isProblemJsonContentType(response.headers.get('Content-Type'))) return undefined;
    try {
        const text = await readResponseText(response, MAX_PROBLEM_RESPONSE_BYTES);
        return problemCodeFrom(text, isKnownErrorCategory);
    } catch (error) {
        if (error instanceof InjectionApiError && error.category === 'cancellation') throw error;
        return undefined;
    }
};

const categoryForStatus = (
    status: number,
    code?: InjectionErrorCategory,
): InjectionErrorCategory => {
    if (code) return code;
    if (status === 401 || status === 403) return 'authorization_required';
    if (status === 404) return 'capability_disabled';
    if (status === 409) return 'analysis_not_ready';
    if (status === 413 || status === 429) return 'capability_limit_exceeded';
    if (status === 422) return 'invalid_request';
    if (status === 503) return 'capability_unavailable';
    if (status === 504) return 'capability_timeout';
    if (status === 507) return 'analysis_capacity_exhausted';
    return status >= 500 ? 'capability_unavailable' : 'invalid_request';
};

const requestJson = async (url: string, init: RequestInit): Promise<Response> => {
    try {
        return await fetch(url, init);
    } catch (error) {
        if (isAbortError(error)) throw new InjectionApiError('cancellation');
        throw new InjectionApiError('network_failure');
    }
};

const readSuccessfulJson = async (response: Response): Promise<unknown> => {
    if (!response.ok) {
        const code = await readProblemCode(response);
        throw new InjectionApiError(categoryForStatus(response.status, code), response.status);
    }
    if (response.status !== 200 || !isJsonContentType(response.headers.get('Content-Type')))
        throw new InjectionApiError('malformed_response', response.status);
    return readJson(response);
};

export async function fetchInjectorCatalogue(
    token: string,
    analysisId: number,
    locale: SupportedLocale,
    signal?: AbortSignal,
): Promise<InjectorCatalogueViewDto> {
    const response = await requestJson(injectorCatalogueUrl(token, analysisId, locale), {
        headers: {
            Accept: 'application/json',
            Authorization: `Bearer ${token}`,
        },
        signal,
    });
    const payload = await readSuccessfulJson(response);
    return validateInjectorCatalogueResponse(payload);
}

export async function fetchInjectionPreview(
    token: string,
    analysisId: number,
    injectorIds: readonly string[],
    signal?: AbortSignal,
): Promise<InjectionPreviewDto> {
    const selection = validateInjectorSelection(injectorIds);
    const request: InjectionRequestDto = { injectorIds: selection };
    const response = await requestJson(injectionPreviewUrl(token, analysisId), {
        method: 'POST',
        headers: {
            Accept: 'application/json',
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(request),
        signal,
    });
    const payload = await readSuccessfulJson(response);
    return validatePreviewResponse(payload, analysisId, selection);
}

export async function fetchAllInjectionPreviews(
    token: string,
    analysisId: number,
    completeCatalogueInjectorIds: readonly string[],
    signal?: AbortSignal,
): Promise<InjectionPreviewDto> {
    assertTokenAndAnalysis(token, analysisId);
    const catalogueIds = validateCompleteCatalogueIds(completeCatalogueInjectorIds);
    const request: InjectionRequestDto = { injectorIds: [], all: true };
    const response = await requestJson(injectionPreviewUrl(token, analysisId), {
        method: 'POST',
        headers: {
            Accept: 'application/json',
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(request),
        signal,
    });
    const payload = await readSuccessfulJson(response);
    return validatePreviewResponse(payload, analysisId, catalogueIds);
}

/**
 * Content-Length is advisory here too: the byte ceiling enforced while streaming the archive is what actually
 * protects this client, so a response with no Content-Length at all is not thereby suspect. A header that is
 * present and already declares more than the ceiling allows can be rejected before a single byte is read.
 */
const parseContentLength = (value: string | null): number | undefined => {
    if (value === null) return undefined;
    if (!/^\d+$/.test(value.trim())) throw new InjectionApiError('malformed_response');
    const length = Number(value.trim());
    if (!Number.isSafeInteger(length)) throw new InjectionApiError('malformed_response');
    if (length > MAX_INJECTION_ARCHIVE_BYTES) throw new InjectionApiError('response_too_large');
    return length;
};

const readArchiveBytes = (response: Response): Promise<Uint8Array> =>
    readBoundedBytes(response, MAX_INJECTION_ARCHIVE_BYTES, {
        tooLarge: () => new InjectionApiError('response_too_large', response.status),
        readFailed: (error) =>
            isAbortError(error)
                ? new InjectionApiError('cancellation', response.status)
                : new InjectionApiError('malformed_response', response.status),
    });

/** Everything both downloads must agree on: the media type and the declared size, when the server sent one. */
const readArchiveResponse = async (
    response: Response,
    filename: InjectionArchiveFilename,
): Promise<InjectionArchiveResult> => {
    if (!response.ok) {
        const code = await readProblemCode(response);
        throw new InjectionApiError(categoryForStatus(response.status, code), response.status);
    }
    if (response.status !== 200) throw new InjectionApiError('malformed_response', response.status);
    if (response.headers.get('Content-Type') !== 'application/zip')
        throw new InjectionApiError('malformed_response', response.status);
    // An encoded body leaves nothing for the declared length to be compared against (see isContentEncoded), so it
    // is set aside and the streaming ceiling in readArchiveBytes is left to do the one job that still applies.
    const contentLength = isContentEncoded(response.headers.get('Content-Encoding'))
        ? undefined
        : parseContentLength(response.headers.get('Content-Length'));
    const bytes = await readArchiveBytes(response);
    if (contentLength !== undefined && contentLength !== bytes.byteLength)
        throw new InjectionApiError('malformed_response', response.status);
    const buffer = new ArrayBuffer(bytes.byteLength);
    new Uint8Array(buffer).set(bytes);
    return Object.freeze({
        filename,
        byteLength: bytes.byteLength,
        blob: new Blob([buffer], { type: 'application/zip' }),
    });
};

export async function fetchInjectionArchive(
    token: string,
    analysisId: number,
    inputFormat: string | null | undefined,
    request: InjectionDownloadRequestDto,
    signal?: AbortSignal,
): Promise<InjectionArchiveResult> {
    const filename = injectionArchiveFilename(inputFormat);
    if (!filename || !hasExactKeys(request, ['injectorId', 'resultIndex']))
        throw new InjectionApiError('invalid_request');
    if (
        !isBoundedString(request.injectorId, MAX_INJECTOR_ID_LENGTH, true) ||
        !isNonnegativeSafeInteger(request.resultIndex) ||
        request.resultIndex >= MAX_INJECTION_RESULT_COUNT
    )
        throw new InjectionApiError('invalid_request');

    const response = await requestJson(injectionDownloadUrl(token, analysisId), {
        method: 'POST',
        headers: {
            Accept: 'application/zip',
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(request),
        signal,
    });
    return readArchiveResponse(response, filename);
}

/**
 * Every mutation the chosen injectors produce, in one archive. Taking them one at a time meant a preview, a choice
 * and a download for each, which for a set of faults to hand out in class is an afternoon of clicking.
 */
export async function fetchInjectionBundle(
    token: string,
    analysisId: number,
    injectorIds: readonly string[],
    all: boolean,
    signal?: AbortSignal,
): Promise<InjectionArchiveResult> {
    assertTokenAndAnalysis(token, analysisId);
    const request: InjectionRequestDto = all
        ? { injectorIds: [], all: true }
        : { injectorIds: validateInjectorSelection(injectorIds) };
    const response = await requestJson(injectionBundleUrl(token, analysisId), {
        method: 'POST',
        headers: {
            Accept: 'application/zip',
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(request),
        signal,
    });
    return readArchiveResponse(response, INJECTION_BUNDLE_FILENAME);
}
