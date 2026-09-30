// SPDX-License-Identifier: EUPL-1.2
// SPDX-FileCopyrightText: 2025 LitterBox-Web contributors

import type { BatchAnalysis, SubmissionStatusResponse } from '../../api/submissions';
import { submissionAnalyses } from '../../pages/submission-utils';

export interface BatchCounts {
    expected: number;
    queued: number;
    running: number;
    completed: number;
    failed: number;
}

const finiteCount = (value: unknown): number =>
    typeof value === 'number' && Number.isFinite(value) && value >= 0 ? Math.floor(value) : 0;

const statusOf = (analysis: BatchAnalysis): string => String(analysis.status ?? '').toLowerCase();

export const getBatchCounts = (value: SubmissionStatusResponse): BatchCounts => {
    const expected = Math.max(
        finiteCount(value.counts?.expected),
        finiteCount(value.expectedCount),
    );
    const completed = Math.min(
        expected,
        Math.max(finiteCount(value.counts?.completed), finiteCount(value.completedCount)),
    );
    const failed = Math.min(
        Math.max(0, expected - completed),
        Math.max(finiteCount(value.counts?.failed), finiteCount(value.failedCount)),
    );
    const analyses = submissionAnalyses(value);
    const explicitRunning = analyses.filter((analysis) =>
        ['processing', 'running'].includes(statusOf(analysis)),
    ).length;
    const remaining = Math.max(0, expected - completed - failed);
    const running = Math.min(
        remaining,
        explicitRunning > 0
            ? explicitRunning
            : ['processing', 'running'].includes(String(value.status).toLowerCase()) &&
                remaining > 0
              ? 1
              : 0,
    );
    return {
        expected,
        queued: Math.max(0, remaining - running),
        running,
        completed,
        failed,
    };
};

export const scrollToProjectReports = (): void => {
    const scroll = () => {
        globalThis.document
            ?.getElementById('batch-all-projects')
            ?.scrollIntoView?.({ block: 'start' });
    };
    const raf = globalThis.requestAnimationFrame;
    if (typeof raf === 'function') raf(scroll);
    else scroll();
};

export const safeFailureMessage = (
    message: string | null | undefined,
    fallback: string,
): string => {
    if (!message) return fallback;
    const compact = message.replace(/\s+/g, ' ').trim().slice(0, 240);
    if (
        !compact ||
        /(?:storage[_ ]?key|source[_ ]?artifact|manifest|username|private|upstream|token)/i.test(
            compact,
        )
    )
        return fallback;
    return compact;
};
