// SPDX-License-Identifier: EUPL-1.2
// SPDX-FileCopyrightText: 2026 LitterBox-Web contributors

import { isAbortError } from '../lib/abort-error';
import { BASE_URL } from '../lib/base-url';
import type {
    ActorDiffViewDto,
    AnalysisReferenceDto,
    DiffCountsDto,
    DiffIssueViewDto,
    DiffViewDto,
    ScriptDiffViewDto,
    SourceViewDto,
} from './generated';
import {
    boundedNonblankString,
    boundedString,
    hasExactKeys,
    isJsonContentType,
    isObject,
    isProblemJsonContentType,
    nonnegativeSafeInteger,
    nullableBoundedString,
    positiveSafeInteger,
    problemCodeFrom,
    readBoundedText,
} from './validation';

export const DIFFS_URL = `${BASE_URL}api/v1/diffs`;
export const MAX_DIFF_RESPONSE_BYTES = 5 * 1024 * 1024;
const MAX_TOKEN_LENGTH = 128;
const MAX_SHORT_TEXT_LENGTH = 16_384;
const MAX_SCRATCHBLOCKS_LENGTH = 262_144;
const MAX_ISSUES = 50_000;
const MAX_ACTORS = 10_000;
const MAX_SCRIPTS_PER_ACTOR = 50_000;

export type DiffErrorCategory =
    | 'validation'
    | 'capability_disabled'
    | 'analysis_not_found'
    | 'analysis_not_ready'
    | 'capability_limit_exceeded'
    | 'unsupported_source_format'
    | 'capability_unavailable'
    | 'capability_timeout'
    | 'malformed_request'
    | 'malformed_response'
    | 'network_failure'
    | 'canceled';

export class DiffApiError extends Error {
    public readonly category: DiffErrorCategory;
    public readonly status?: number;

    public constructor(category: DiffErrorCategory, status?: number) {
        super(category);
        this.name = 'DiffApiError';
        this.category = category;
        this.status = status;
    }
}

export function validateAnalysisReference(reference: AnalysisReferenceDto): void {
    if (
        !isObject(reference) ||
        !boundedNonblankString(reference.submissionToken, MAX_TOKEN_LENGTH) ||
        !positiveSafeInteger(reference.analysisId)
    ) {
        throw new DiffApiError('validation');
    }
}

const exactReference = (reference: AnalysisReferenceDto): AnalysisReferenceDto => {
    validateAnalysisReference(reference);
    return {
        submissionToken: reference.submissionToken,
        analysisId: reference.analysisId,
    };
};

const exactCounts = (value: unknown): DiffCountsDto => {
    if (
        !hasExactKeys(value, [
            'beforeTotal',
            'afterTotal',
            'fixed',
            'newIssues',
            'persisting',
            'removed',
        ]) ||
        !nonnegativeSafeInteger(value.beforeTotal, MAX_ISSUES) ||
        !nonnegativeSafeInteger(value.afterTotal, MAX_ISSUES) ||
        !nonnegativeSafeInteger(value.fixed, MAX_ISSUES) ||
        !nonnegativeSafeInteger(value.newIssues, MAX_ISSUES) ||
        !nonnegativeSafeInteger(value.persisting, MAX_ISSUES) ||
        !nonnegativeSafeInteger(value.removed, MAX_ISSUES)
    ) {
        throw new DiffApiError('malformed_response');
    }
    return {
        beforeTotal: value.beforeTotal,
        afterTotal: value.afterTotal,
        fixed: value.fixed,
        newIssues: value.newIssues,
        persisting: value.persisting,
        removed: value.removed,
    };
};

const exactIssue = (value: unknown): DiffIssueViewDto => {
    if (
        !hasExactKeys(value, [
            'finderId',
            'finderName',
            'issueType',
            'severity',
            'sprite',
            'blockId',
            'scratchblocks',
        ]) ||
        !boundedString(value.finderId, MAX_SHORT_TEXT_LENGTH) ||
        !boundedString(value.finderName, MAX_SHORT_TEXT_LENGTH) ||
        !boundedString(value.issueType, MAX_SHORT_TEXT_LENGTH) ||
        !nonnegativeSafeInteger(value.severity, 100) ||
        !boundedString(value.sprite, MAX_SHORT_TEXT_LENGTH) ||
        !nullableBoundedString(value.blockId, MAX_SHORT_TEXT_LENGTH) ||
        !boundedString(value.scratchblocks, MAX_SCRATCHBLOCKS_LENGTH)
    ) {
        throw new DiffApiError('malformed_response');
    }
    return {
        finderId: value.finderId,
        finderName: value.finderName,
        issueType: value.issueType,
        severity: value.severity,
        sprite: value.sprite,
        blockId: value.blockId,
        scratchblocks: value.scratchblocks,
    };
};

const exactScript = (value: unknown): ScriptDiffViewDto => {
    if (
        !hasExactKeys(value, [
            'changeType',
            'beforeScratchblocks',
            'afterScratchblocks',
            'annotatedBeforeScratchblocks',
            'annotatedAfterScratchblocks',
        ]) ||
        !boundedNonblankString(value.changeType, MAX_SHORT_TEXT_LENGTH) ||
        !nullableBoundedString(value.beforeScratchblocks, MAX_SCRATCHBLOCKS_LENGTH) ||
        !nullableBoundedString(value.afterScratchblocks, MAX_SCRATCHBLOCKS_LENGTH) ||
        !nullableBoundedString(value.annotatedBeforeScratchblocks, MAX_SCRATCHBLOCKS_LENGTH) ||
        !nullableBoundedString(value.annotatedAfterScratchblocks, MAX_SCRATCHBLOCKS_LENGTH)
    ) {
        throw new DiffApiError('malformed_response');
    }
    return {
        changeType: value.changeType,
        beforeScratchblocks: value.beforeScratchblocks,
        afterScratchblocks: value.afterScratchblocks,
        annotatedBeforeScratchblocks: value.annotatedBeforeScratchblocks,
        annotatedAfterScratchblocks: value.annotatedAfterScratchblocks,
    };
};

const exactActor = (value: unknown): ActorDiffViewDto => {
    if (
        !hasExactKeys(value, ['actorName', 'stage', 'scripts']) ||
        !boundedString(value.actorName, MAX_SHORT_TEXT_LENGTH) ||
        typeof value.stage !== 'boolean' ||
        !Array.isArray(value.scripts) ||
        value.scripts.length > MAX_SCRIPTS_PER_ACTOR
    ) {
        throw new DiffApiError('malformed_response');
    }
    return {
        actorName: value.actorName,
        stage: value.stage,
        scripts: value.scripts.map(exactScript),
    };
};

const exactSource = (value: unknown): SourceViewDto => {
    if (
        !hasExactKeys(value, ['analysisId', 'name']) ||
        !positiveSafeInteger(value.analysisId) ||
        !boundedNonblankString(value.name, MAX_SHORT_TEXT_LENGTH)
    ) {
        throw new DiffApiError('malformed_response');
    }
    return { analysisId: value.analysisId, name: value.name };
};

const exactArray = <T>(value: unknown, maximum: number, parser: (item: unknown) => T): T[] => {
    if (!Array.isArray(value) || value.length > maximum)
        throw new DiffApiError('malformed_response');
    return value.map(parser);
};

const parseDiff = (value: unknown): DiffViewDto => {
    if (
        !hasExactKeys(value, [
            'schemaVersion',
            'before',
            'after',
            'counts',
            'fixed',
            'newIssues',
            'persisting',
            'removed',
            'actors',
        ]) ||
        value.schemaVersion !== 1
    ) {
        throw new DiffApiError('malformed_response');
    }
    const counts = exactCounts(value.counts);
    const fixed = exactArray(value.fixed, MAX_ISSUES, exactIssue);
    const newIssues = exactArray(value.newIssues, MAX_ISSUES, exactIssue);
    const persisting = exactArray(value.persisting, MAX_ISSUES, exactIssue);
    const removed = exactArray(value.removed, MAX_ISSUES, exactIssue);
    const actors = exactArray(value.actors, MAX_ACTORS, exactActor);
    if (
        counts.fixed !== fixed.length ||
        counts.newIssues !== newIssues.length ||
        counts.persisting !== persisting.length ||
        counts.removed !== removed.length ||
        counts.beforeTotal !== fixed.length + persisting.length + removed.length ||
        // A fixed finding is one the newer version no longer has, so it is not part of the total after. Counting
        // it there rejected every comparison in which anything had actually been repaired.
        counts.afterTotal !== persisting.length + newIssues.length
    ) {
        throw new DiffApiError('malformed_response');
    }
    return {
        schemaVersion: 1,
        before: exactSource(value.before),
        after: exactSource(value.after),
        counts,
        fixed,
        newIssues,
        persisting,
        removed,
        actors,
    };
};

/**
 * A Content-Length that is already known to be dishonest is a reason to give up before a single byte is read.
 * The bounded reader shared with the other API modules still enforces the same ceiling against what actually
 * arrives, which is the check that matters once the header cannot be trusted either way.
 */
const readDiffResponseText = (response: Response): Promise<string> => {
    const contentLength = response.headers.get('Content-Length');
    if (contentLength && /^\d+$/.test(contentLength)) {
        const declaredBytes = Number(contentLength);
        if (!Number.isSafeInteger(declaredBytes) || declaredBytes > MAX_DIFF_RESPONSE_BYTES) {
            throw new DiffApiError('malformed_response');
        }
    }
    return readBoundedText(response, MAX_DIFF_RESPONSE_BYTES, {
        tooLarge: () => new DiffApiError('malformed_response'),
    });
};

const PROBLEM_CODES = [
    'capability_disabled',
    'analysis_not_found',
    'analysis_not_ready',
    'capability_limit_exceeded',
    'unsupported_source_format',
    'capability_unavailable',
    'capability_timeout',
] as const;

const isKnownErrorCode = (value: unknown): value is (typeof PROBLEM_CODES)[number] =>
    typeof value === 'string' && (PROBLEM_CODES as readonly string[]).includes(value);

const readProblemCode = async (response: Response): Promise<string | undefined> => {
    if (!isProblemJsonContentType(response.headers.get('Content-Type'))) return undefined;
    try {
        return problemCodeFrom(await readDiffResponseText(response), isKnownErrorCode);
    } catch (error) {
        if (isAbortError(error)) throw new DiffApiError('canceled');
        return undefined;
    }
};

const categoryForStatus = (status: number, code?: string): DiffErrorCategory => {
    // Every code this client knows is also one of its categories, so a recognised code names the answer itself.
    if (isKnownErrorCode(code)) return code;
    if (status === 400) return 'malformed_request';
    if (status === 404) return 'analysis_not_found';
    if (status === 409) return 'analysis_not_ready';
    if (status === 413 || status === 429) return 'capability_limit_exceeded';
    if (status === 422) return 'unsupported_source_format';
    if (status === 503) return 'capability_unavailable';
    if (status === 504) return 'capability_timeout';
    return 'malformed_response';
};

export async function fetchDiff(
    request: { before: AnalysisReferenceDto; after: AnalysisReferenceDto },
    signal?: AbortSignal,
): Promise<DiffViewDto> {
    const body = {
        before: exactReference(request.before),
        after: exactReference(request.after),
    };
    let response: Response;
    try {
        response = await fetch(DIFFS_URL, {
            method: 'POST',
            headers: {
                Accept: 'application/json',
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(body),
            signal,
        });
    } catch (error) {
        if (isAbortError(error) || signal?.aborted) throw new DiffApiError('canceled');
        throw new DiffApiError('network_failure');
    }
    if (!response.ok) {
        const code = await readProblemCode(response);
        throw new DiffApiError(categoryForStatus(response.status, code), response.status);
    }
    if (response.status !== 200 || !isJsonContentType(response.headers.get('Content-Type'))) {
        throw new DiffApiError('malformed_response', response.status);
    }
    try {
        const bodyText = await readDiffResponseText(response);
        return parseDiff(JSON.parse(bodyText) as unknown);
    } catch (error) {
        if (error instanceof DiffApiError) throw error;
        if (isAbortError(error) || signal?.aborted) throw new DiffApiError('canceled');
        throw new DiffApiError('malformed_response');
    }
}
