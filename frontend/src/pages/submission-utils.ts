// SPDX-License-Identifier: EUPL-1.2
// SPDX-FileCopyrightText: 2026 LitterBox-Web contributors

import type { AnalysisIssue, BatchAnalysis, SubmissionStatusResponse } from '../api/submissions';
import { rememberProject } from '../lib/recent-projects';

export const analysisStatus = (analysis: BatchAnalysis): string =>
    String(analysis.status ?? '').toLowerCase();

export const analysisIsCompleted = (analysis: BatchAnalysis, submissionStatus: string): boolean =>
    analysisStatus(analysis) === 'completed' ||
    (analysisStatus(analysis) === '' &&
        ['completed', 'partial'].includes(submissionStatus.toLowerCase()));

// The schema declares `analyses` required, but a handful of synthetic fixtures used in tests still send a
// response without it, so a reader of the field has to tolerate that shape at runtime regardless of what the
// type says. This is the one place that copes; everything below, and every other file, reads through it.
export const submissionAnalyses = (value: SubmissionStatusResponse): BatchAnalysis[] =>
    Array.isArray(value.analyses) ? value.analyses : [];

/**
 * The two places a submission response keeps its analyses, flattened into the one list every reader that is
 * searching for a particular analysis looks through: the batch array, then the single project's own slot.
 *
 * For counting rather than searching, use `reportedAnalyses`: a response that filled both slots would be counted
 * twice here.
 */
export const analysisCandidates = (value: SubmissionStatusResponse): BatchAnalysis[] => [
    ...submissionAnalyses(value),
    ...(value.analysis ? [value.analysis] : []),
];

/**
 * Every analysis the response actually reports, each once. A class set fills the array and a single project fills
 * the slot beside it, so the array leads and the lone slot is read only when it is empty.
 */
export const reportedAnalyses = (value: SubmissionStatusResponse): BatchAnalysis[] => {
    const analyses = submissionAnalyses(value);
    if (analyses.length > 0) return analyses;
    return value.analysis ? [value.analysis] : [];
};

const BATCH_SOURCE_TYPES = ['TEACHER_BATCH', 'TEACHER_ZIP', 'SCRATCH_STUDIO', 'SCRATCH_URL_LIST'];

/**
 * A class set rather than one project. The source type settles it even before anything has finished, which is what a
 * page still waiting for the first result has to go on; more than one analysis settles it for a response that came
 * back without one.
 */
export const isBatchSubmission = (value: SubmissionStatusResponse): boolean =>
    submissionAnalyses(value).length > 1 ||
    BATCH_SOURCE_TYPES.includes(String(value.sourceType ?? '').toUpperCase());

export const primaryAnalysis = (value: SubmissionStatusResponse): BatchAnalysis | undefined => {
    if (value.analysis && analysisIsCompleted(value.analysis, value.status)) return value.analysis;
    return submissionAnalyses(value).find((analysis) =>
        analysisIsCompleted(analysis, value.status),
    );
};

export type IssueSort =
    'result' | 'sprite-finder' | 'finder-sprite' | 'severity-desc' | 'severity-asc';

export interface IssueFilterState {
    family: string;
    type: string;
    finder: string;
    sprite: string;
    severity: string;
    sort: IssueSort;
}

export const DEFAULT_ISSUE_FILTERS: IssueFilterState = {
    family: 'all',
    type: 'all',
    finder: 'all',
    sprite: 'all',
    severity: 'all',
    sort: 'result',
};

export const issueFinderValue = (issue: AnalysisIssue): string =>
    issue.finderId?.trim() || issue.finderName?.trim() || `issue-${issue.id}`;

export const issueFinderLabel = (issue: AnalysisIssue, unavailableLabel: string): string =>
    issue.finderName?.trim() || unavailableLabel;

export const issueSpriteValue = (issue: AnalysisIssue): string => issue.sprite?.trim() ?? '';

export const compareIssueText = (left: string, right: string): number => {
    const normalizedLeft = left.toLowerCase();
    const normalizedRight = right.toLowerCase();
    if (normalizedLeft < normalizedRight) return -1;
    if (normalizedLeft > normalizedRight) return 1;
    if (left < right) return -1;
    if (left > right) return 1;
    return 0;
};

export const positiveAnalysisId = (value: unknown): value is number =>
    typeof value === 'number' && Number.isSafeInteger(value) && value > 0;

const SUPPORTED_TOOL_FORMATS = new Set(['.sb3', '.mblock']);

export const validToolFormat = (value: string | null | undefined): boolean => {
    const normalized = String(value ?? '').toLowerCase();
    return SUPPORTED_TOOL_FORMATS.has(normalized.startsWith('.') ? normalized : `.${normalized}`);
};

export function focusToolFromHash(hash: string): void {
    if (!hash.startsWith('#')) return;
    let id: string;
    try {
        id = decodeURIComponent(hash.slice(1));
    } catch {
        return;
    }
    const target = document.getElementById(id);
    if (!(target instanceof HTMLElement)) return;
    target.focus({ preventScroll: true });
    const reducedMotion =
        typeof window.matchMedia === 'function' &&
        window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    target.scrollIntoView?.({ behavior: reducedMotion ? 'auto' : 'smooth', block: 'start' });
}

/** Puts a finished single-project analysis on the recent list, under the name its result carries. */
export const rememberAnalysedProject = (token: string, value: SubmissionStatusResponse): void => {
    const analysis = primaryAnalysis(value);
    if (!analysis || !analysisIsCompleted(analysis, value.status)) return;
    rememberProject({
        token,
        name: analysis.name?.trim() || token,
        kind: 'issues',
        ...(positiveAnalysisId(analysis.id) ? { analysisId: analysis.id } : {}),
    });
};
