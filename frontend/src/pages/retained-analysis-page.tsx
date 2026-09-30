// SPDX-License-Identifier: EUPL-1.2
// SPDX-FileCopyrightText: 2026 LitterBox-Web contributors

/**
 * The two pages reached with an analysis in hand — the advanced workspace and the teacher's modification tool —
 * ask the same three questions before they can draw anything: was an analysis named, is it still there, and does
 * this service offer the capability the page exists for. The answers differ only in which words they are given in,
 * so the questions are asked here and each page passes its own vocabulary.
 */

import type { TFunction } from 'i18next';
import type { ReactNode } from 'react';
import {
    fetchSubmission,
    type BatchAnalysis,
    type SubmissionStatusResponse,
} from '../api/submissions';
import { ErrorState, LoadingState } from '../components/States';
import { PageMain } from '../components/Page';
import type { CapabilityState } from '../lib/capabilities';
import type { RetainedAnalysisSelection } from '../lib/retained-analysis';
import { useAsync } from '../lib/useAsync';
import { RetainedAnalysisEntry, type RetainedAnalysisEntryProps } from './RetainedAnalysisEntry';
import { analysisCandidates } from './submission-utils';

export interface RetainedAnalysis {
    analysis: BatchAnalysis;
    selection: RetainedAnalysisSelection;
}

/** The words a page gives the shared shell, so the reader is told about the page they actually asked for. */
export interface RetainedAnalysisCopy {
    title: string;
    lead: string;
    loading: string;
    recoveryBody: string;
    /** Named rather than fixed: the offer says which project it would reuse, and that is only known here. */
    reuseNamed: (project: string) => string;
    entryTitle: string;
    entryLead: string;
    entryAction: string;
}

/**
 * This page is opening one named analysis, not offering the best one it can find, so a report that never actually
 * said it finished is not an acceptable stand-in — unlike analysisIsCompleted, an empty status is never read as
 * good enough here.
 */
const matchingAnalysis = (
    value: SubmissionStatusResponse,
    selection: RetainedAnalysisSelection,
): BatchAnalysis | undefined =>
    analysisCandidates(value).find(
        (analysis) =>
            analysis.id === selection.analysisId &&
            String(analysis.status ?? '').toLowerCase() === 'completed',
    );

export function useRetainedAnalysis(selection: RetainedAnalysisSelection | undefined) {
    return useAsync<RetainedAnalysis>(
        async (signal) => {
            const value = await fetchSubmission(selection!.submissionToken, signal);
            const analysis = matchingAnalysis(value, selection!);
            if (!analysis) throw new Error('No completed analysis matches this selection');
            return { analysis, selection: selection! };
        },
        [selection],
        { enabled: selection !== undefined },
    );
}

export type RetainedAnalysisGate =
    { ready: false; fallback: ReactNode } | { ready: true; value: RetainedAnalysis };

interface RetainedAnalysisGateOptions extends Omit<RetainedAnalysisEntryProps, 'recovering'> {
    selection: RetainedAnalysisSelection | undefined;
    state: ReturnType<typeof useRetainedAnalysis>['state'];
    capabilityState: CapabilityState;
    onCapabilityRetry: () => void;
    t: TFunction;
    pageClassName: string;
}

/**
 * Everything that has to be true before either page can draw its capability, and what the reader is shown instead
 * when one of them is not. Five of the six answers are a whole page of their own, so the caller returns them as-is.
 */
export const retainedAnalysisGate = ({
    selection,
    state,
    capabilityState,
    onCapabilityRetry,
    t,
    pageClassName,
    copy,
    ...entry
}: RetainedAnalysisGateOptions): RetainedAnalysisGate => {
    const entryPage = (recovering: boolean): RetainedAnalysisGate => ({
        ready: false,
        fallback: (
            <PageMain className={pageClassName}>
                <RetainedAnalysisEntry recovering={recovering} copy={copy} {...entry} />
            </PageMain>
        ),
    });

    if (!selection || state.status === 'error') return entryPage(state.status === 'error');

    const selectionIsLoaded =
        state.status === 'ready' &&
        state.value.selection.submissionToken === selection.submissionToken &&
        state.value.selection.analysisId === selection.analysisId;

    if (state.status === 'idle' || state.status === 'loading' || !selectionIsLoaded)
        return {
            ready: false,
            fallback: (
                <PageMain>
                    <LoadingState heading={copy.title} message={copy.loading} level={1} />
                </PageMain>
            ),
        };

    if (state.status !== 'ready') return entryPage(true);

    if (capabilityState.status === 'loading' || capabilityState.status === 'idle')
        return {
            ready: false,
            fallback: (
                <PageMain>
                    <LoadingState
                        heading={copy.title}
                        message={t('toolsCapabilitiesLoading')}
                        level={1}
                    />
                </PageMain>
            ),
        };

    if (capabilityState.status === 'error')
        return {
            ready: false,
            fallback: (
                <PageMain>
                    <ErrorState
                        heading={copy.title}
                        message={t('toolsCapabilitiesError')}
                        retryLabel={t('retry')}
                        onRetry={onCapabilityRetry}
                        level={1}
                    />
                </PageMain>
            ),
        };

    if (capabilityState.status === 'incompatible')
        return {
            ready: false,
            fallback: (
                <PageMain>
                    <ErrorState
                        heading={t('localeIncompatibilityTitle')}
                        message={t('localeSetIncompatibilityBody')}
                        retryLabel={t('retry')}
                        onRetry={onCapabilityRetry}
                        level={1}
                    />
                </PageMain>
            ),
        };

    return { ready: true, value: state.value };
};
