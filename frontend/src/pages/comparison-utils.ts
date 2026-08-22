// SPDX-License-Identifier: EUPL-1.2
// SPDX-FileCopyrightText: 2026 LitterBox-Web contributors

import type { AnalysisReferenceDto } from '../api/generated';
import {
    fetchSubmission,
    SubmissionApiError,
    type SubmissionStatusResponse,
} from '../api/submissions';
import { DiffApiError } from '../api/diffs';
import { isAbortError } from '../lib/abort-error';
import { SUBMISSION_POLL_INTERVAL_MS, watchSubmissionEvents } from '../lib/submission-events';
import type { TranslationKey } from '../i18n/locales';
import { analysisCandidates } from './submission-utils';

export interface ReferenceInput {
    submissionToken: string;
    analysisId: string;
}

export type ProjectErrorCategory =
    | 'validation'
    | 'unsupported'
    | 'authorization'
    | 'timeout'
    | 'canceled'
    | 'disabled'
    | 'unavailable'
    | 'limit'
    | 'malformed'
    | 'network'
    | 'failed'
    | 'unresolved';

export class ProjectWorkflowError extends Error {
    public readonly category: ProjectErrorCategory;

    public constructor(category: ProjectErrorCategory) {
        super(category);
        this.name = 'ProjectWorkflowError';
        this.category = category;
    }
}

/** A project this service has already analysed, named the way the reader knows it rather than by its address. */
export interface AnalysedChoice {
    token: string;
    analysisId: number;
    name: string;
    /** When this device last had the result open; see recent-projects. Absent for anything it does not remember. */
    at?: number;
}

export const choiceKey = (choice: AnalysedChoice): string => `${choice.token}:${choice.analysisId}`;

/**
 * A project's name is its filename, and a reader who analysed the same project twice is offered two entries
 * reading exactly the same. When it is known, the time each was last open is what separates them.
 */
export const choiceLabel = (choice: AnalysedChoice, relative: (at: number) => string): string =>
    choice.at === undefined ? choice.name : `${choice.name} · ${relative(choice.at)}`;

/** The analysis a reader arrived from, as the advanced workspace hands it over. */
export const analysedChoiceFrom = (
    value: unknown,
    fallbackName: string,
): AnalysedChoice | undefined => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
    const candidate = value as Record<string, unknown>;
    if (typeof candidate.submissionToken !== 'string') return undefined;
    if (candidate.submissionToken.trim().length === 0 || candidate.submissionToken.length > 128)
        return undefined;
    if (typeof candidate.analysisId !== 'number') return undefined;
    if (!Number.isSafeInteger(candidate.analysisId) || candidate.analysisId <= 0) return undefined;
    const name = typeof candidate.name === 'string' ? candidate.name.trim() : '';
    return {
        token: candidate.submissionToken,
        analysisId: candidate.analysisId,
        name: name.length > 0 ? name.slice(0, 120) : fallbackName,
    };
};

export const emptyReference = (): ReferenceInput => ({ submissionToken: '', analysisId: '' });

/**
 * What a result hands back is its address, so that is what a reader has to paste. A whole link is reduced to the
 * part of it this form needs; anything that is not a link is taken as already being that part.
 */
export const submissionTokenFrom = (value: string): string => {
    const trimmed = value.trim();
    if (!/^https?:\/\//i.test(trimmed)) return trimmed;
    try {
        const segments = new URL(trimmed).pathname.split('/').filter(Boolean);
        const named = segments.findIndex(
            (segment) => segment === 'submissions' || segment === 'questions',
        );
        const token = named === -1 ? undefined : segments[named + 1];
        return token ? decodeURIComponent(token) : trimmed;
    } catch {
        return trimmed;
    }
};

export const toReference = (value: ReferenceInput): AnalysisReferenceDto | undefined => {
    const submissionToken = submissionTokenFrom(value.submissionToken);
    if (
        submissionToken.length === 0 ||
        submissionToken.length > 128 ||
        !/^[1-9]\d*$/.test(value.analysisId)
    ) {
        return undefined;
    }
    const analysisId = Number(value.analysisId);
    if (!Number.isSafeInteger(analysisId) || analysisId <= 0) return undefined;
    return { submissionToken, analysisId };
};

export const projectErrorFrom = (
    error: unknown,
    phase: 'submit' | 'status' | 'diff',
): ProjectWorkflowError => {
    if (error instanceof ProjectWorkflowError) return error;
    if (isAbortError(error)) return new ProjectWorkflowError('canceled');
    if (error instanceof DiffApiError) {
        switch (error.category) {
            case 'capability_disabled':
                return new ProjectWorkflowError('disabled');
            case 'capability_limit_exceeded':
                return new ProjectWorkflowError('limit');
            case 'unsupported_source_format':
                return new ProjectWorkflowError('unsupported');
            case 'capability_timeout':
                return new ProjectWorkflowError('timeout');
            case 'canceled':
                return new ProjectWorkflowError('canceled');
            case 'malformed_response':
                return new ProjectWorkflowError('malformed');
            case 'capability_unavailable':
                return new ProjectWorkflowError('unavailable');
            case 'analysis_not_found':
                return new ProjectWorkflowError('authorization');
            case 'analysis_not_ready':
                return new ProjectWorkflowError('unresolved');
            case 'validation':
            case 'malformed_request':
                return new ProjectWorkflowError('validation');
            case 'network_failure':
                return new ProjectWorkflowError('network');
            default:
                return new ProjectWorkflowError(phase === 'diff' ? 'network' : 'failed');
        }
    }
    if (error instanceof SubmissionApiError) {
        switch (error.status) {
            case 400:
            case 422:
                return new ProjectWorkflowError('validation');
            case 401:
            case 403:
                return new ProjectWorkflowError('authorization');
            case 404:
                return new ProjectWorkflowError(phase === 'status' ? 'authorization' : 'disabled');
            case 408:
            case 504:
                return new ProjectWorkflowError('timeout');
            case 413:
                return new ProjectWorkflowError('limit');
            case 415:
                return new ProjectWorkflowError('unsupported');
            case 409:
                return new ProjectWorkflowError('unresolved');
            case 503:
                return new ProjectWorkflowError('unavailable');
            default:
                return new ProjectWorkflowError('failed');
        }
    }
    if (error instanceof SyntaxError) return new ProjectWorkflowError('malformed');
    return new ProjectWorkflowError(phase === 'diff' ? 'network' : 'failed');
};

/**
 * A comparison is a claim that two projects were both analysed successfully, so a submission that only partly
 * succeeded is not an acceptable partner for it — unlike analysisIsCompleted, an empty status is read as good
 * enough only when the whole submission is 'completed', never when it is merely 'partial'.
 */
export const analysisReferenceFrom = (
    value: SubmissionStatusResponse,
): AnalysisReferenceDto | undefined => {
    const analysis = analysisCandidates(value).find((candidate) => {
        const status = String(candidate.status ?? '').toLowerCase();
        return status === 'completed' || (status === '' && analysisStatus(value) === 'completed');
    });
    if (!analysis || !Number.isSafeInteger(analysis.id) || analysis.id <= 0) return undefined;
    return { submissionToken: value.token, analysisId: analysis.id };
};

export const analysisStatus = (value: SubmissionStatusResponse): string =>
    String(value.status ?? '').toLowerCase();

export const statusMessageKey = (status: string): TranslationKey => {
    switch (status.toLowerCase()) {
        case 'queued':
            return 'statusQueued';
        case 'processing':
        case 'running':
            return 'statusProcessing';
        case 'completed':
            return 'statusCompleted';
        case 'failed':
            return 'statusFailed';
        case 'cancelled':
            return 'statusCancelled';
        default:
            return 'diffProjectWaiting';
    }
};

export const projectErrorKey = (category: ProjectErrorCategory): TranslationKey => {
    switch (category) {
        case 'validation':
            return 'diffValidationError';
        case 'unsupported':
            return 'diffErrorUnsupported';
        case 'authorization':
            return 'diffProjectErrorAuthorization';
        case 'timeout':
            return 'diffErrorTimeout';
        case 'canceled':
            return 'diffErrorCanceled';
        case 'disabled':
            return 'diffErrorDisabled';
        case 'unavailable':
            return 'diffErrorUnavailable';
        case 'limit':
            return 'diffErrorLimit';
        case 'malformed':
        case 'unresolved':
            return 'diffErrorResponse';
        case 'network':
            return 'diffErrorNetwork';
        case 'failed':
            return 'submitErrorBody';
    }
};

export const errorMessageKey = (error: DiffApiError): TranslationKey => {
    switch (error.category) {
        case 'validation':
            return 'diffValidationError';
        case 'capability_disabled':
            return 'diffErrorDisabled';
        case 'analysis_not_found':
            return 'diffErrorNotFound';
        case 'analysis_not_ready':
            return 'diffErrorNotReady';
        case 'capability_limit_exceeded':
            return 'diffErrorLimit';
        case 'unsupported_source_format':
            return 'diffErrorUnsupported';
        case 'capability_unavailable':
            return 'diffErrorUnavailable';
        case 'capability_timeout':
            return 'diffErrorTimeout';
        case 'malformed_request':
            return 'diffErrorRequest';
        case 'malformed_response':
            return 'diffErrorResponse';
        case 'network_failure':
            return 'diffErrorNetwork';
        case 'canceled':
            return 'diffErrorCanceled';
    }
};

const completedStatus = new Set(['completed', 'partial']);

/**
 * A cap on silence, not on total runtime. A project still visibly progressing after this long must be left to keep
 * going, so the window is rearmed on every sign of life rather than started once at the top.
 */
const INACTIVITY_MS = 120_000;

export const monitorSubmission = async (
    token: string,
    parentSignal: AbortSignal,
    onStatus: (status: string) => void,
): Promise<AnalysisReferenceDto> => {
    if (parentSignal.aborted) throw new ProjectWorkflowError('canceled');
    const monitorController = new AbortController();
    let closeEvents: (() => void) | undefined;
    let timer: number | undefined;
    let inactivityTimer: number | undefined;
    let settled = false;
    let refreshing = false;
    let timedOut = false;

    return new Promise<AnalysisReferenceDto>((resolve, reject) => {
        const cleanup = () => {
            parentSignal.removeEventListener('abort', abort);
            monitorController.signal.removeEventListener('abort', monitorAbort);
            if (timer !== undefined) window.clearInterval(timer);
            if (inactivityTimer !== undefined) window.clearTimeout(inactivityTimer);
            closeEvents?.();
        };
        const finish = (error?: ProjectWorkflowError, reference?: AnalysisReferenceDto) => {
            if (settled) return;
            settled = true;
            cleanup();
            if (error) reject(error);
            else if (reference) resolve(reference);
            else reject(new ProjectWorkflowError('unresolved'));
        };
        const abort = () => {
            monitorController.abort();
            finish(new ProjectWorkflowError('canceled'));
        };
        const monitorAbort = () => {
            if (!timedOut && !settled) finish(new ProjectWorkflowError('canceled'));
        };
        const restartInactivityTimer = () => {
            if (settled) return;
            if (inactivityTimer !== undefined) window.clearTimeout(inactivityTimer);
            inactivityTimer = window.setTimeout(() => {
                timedOut = true;
                monitorController.abort();
                finish(new ProjectWorkflowError('timeout'));
            }, INACTIVITY_MS);
        };
        const refresh = async () => {
            if (settled || refreshing) return;
            refreshing = true;
            try {
                const value = await fetchSubmission(token, monitorController.signal);
                const status = analysisStatus(value);
                restartInactivityTimer();
                onStatus(status);
                const reference = analysisReferenceFrom(value);
                if (reference) {
                    finish(undefined, reference);
                    return;
                }
                if (status === 'failed') {
                    finish(new ProjectWorkflowError('failed'));
                    return;
                }
                if (status === 'cancelled') {
                    finish(new ProjectWorkflowError('canceled'));
                    return;
                }
                if (completedStatus.has(status)) {
                    finish(new ProjectWorkflowError('unresolved'));
                }
            } catch (error) {
                if (timedOut) return;
                if (monitorController.signal.aborted && !parentSignal.aborted) return;
                finish(projectErrorFrom(error, 'status'));
            } finally {
                refreshing = false;
            }
        };
        parentSignal.addEventListener('abort', abort, { once: true });
        monitorController.signal.addEventListener('abort', monitorAbort, { once: true });
        timer = window.setInterval(() => void refresh(), SUBMISSION_POLL_INTERVAL_MS);
        restartInactivityTimer();
        closeEvents = watchSubmissionEvents(token, () => {
            // The event is a sign of life whether or not the refresh it triggers succeeds.
            restartInactivityTimer();
            void refresh();
        });
        void refresh();
    });
};
