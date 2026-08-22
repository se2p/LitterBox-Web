// SPDX-License-Identifier: EUPL-1.2
// SPDX-FileCopyrightText: 2026 LitterBox-Web contributors

/**
 * What the comparison page knows, in one place.
 *
 * Two projects are chosen, possibly submitted, possibly analysed, and then compared. Each of those steps can be
 * abandoned halfway — a reader changes a file while an upload is in flight, cancels a run, or retries after one
 * side failed — and the page has to be able to say what is true at every moment.
 *
 * Held as a reducer rather than a dozen pieces of state and a dozen refs beside them, chiefly because of
 * staleness: every asynchronous step carries the identity of the input or run it belongs to, and the reducer
 * drops an answer to a question nobody is asking any more. Doing that at each callback instead meant a hand-kept
 * pair of counters and a check that was easy to leave out.
 */
import type { AnalysisReferenceDto, DiffViewDto } from '../api/generated';
import type { ArchivePreflightResult } from '../lib/archive-preflight';
import type {
    ComparisonInputMode,
    ComparisonSide,
    ComparisonSideInput,
    ComparisonSideProgress,
} from '../components/capabilities/diff/ComparisonInputs';
import type { AnalysedChoice, ProjectErrorCategory } from './comparison-utils';

export type ProjectRequestState =
    | { status: 'idle' }
    | { status: 'loading' }
    | { status: 'success'; value: DiffViewDto }
    | { status: 'error'; category: ProjectErrorCategory };

export interface ComparisonState {
    inputs: Record<ComparisonSide, ComparisonSideInput>;
    progress: Record<ComparisonSide, ComparisonSideProgress>;
    request: ProjectRequestState;
    /**
     * Bumped whenever a side is given something different. A preflight that comes back for an earlier choice is
     * an answer about a file the reader has already replaced.
     */
    inputIds: Record<ComparisonSide, number>;
    /** Bumped whenever the workflow as a whole is invalidated, so a run in flight stops counting. */
    runId: number;
}

export type ComparisonAction =
    | {
          type: 'choose-mode';
          side: ComparisonSide;
          mode: ComparisonInputMode;
          fallback?: AnalysedChoice;
      }
    | { type: 'choose-file'; side: ComparisonSide; file?: File }
    | { type: 'choose-url'; side: ComparisonSide; url: string }
    | { type: 'choose-analysed'; side: ComparisonSide; choice?: AnalysedChoice }
    | {
          type: 'preflight-settled';
          side: ComparisonSide;
          inputId: number;
          result: ArchivePreflightResult;
      }
    | { type: 'run-started'; runId: number }
    | {
          type: 'side-progress';
          side: ComparisonSide;
          runId: number;
          progress: ComparisonSideProgress;
      }
    | { type: 'run-settled'; runId: number; request: ProjectRequestState }
    | { type: 'run-cancelled'; message: string };

const emptyInput = (): ComparisonSideInput => ({ mode: 'upload', url: '', preflightBusy: false });

const idle = (): ComparisonSideProgress => ({ status: 'idle' });

/**
 * A reader who came here from a project's advanced analysis is comparing that project with something, so it is
 * already chosen for them; the other side is theirs to give.
 */
export const initialComparisonState = (arrival?: AnalysedChoice): ComparisonState => ({
    inputs: {
        before: arrival ? { ...emptyInput(), mode: 'analysed', analysed: arrival } : emptyInput(),
        after: emptyInput(),
    },
    progress: { before: idle(), after: idle() },
    request: { status: 'idle' },
    inputIds: { before: 0, after: 0 },
    runId: 0,
});

/** Giving a side something new discards whatever was known about it and stops any run that assumed the old. */
const withNewInput = (
    state: ComparisonState,
    side: ComparisonSide,
    input: ComparisonSideInput,
): ComparisonState => ({
    ...state,
    inputs: { ...state.inputs, [side]: input },
    progress: { ...state.progress, [side]: idle() },
    request: { status: 'idle' },
    inputIds: { ...state.inputIds, [side]: state.inputIds[side] + 1 },
    runId: state.runId + 1,
});

export const comparisonReducer = (
    state: ComparisonState,
    action: ComparisonAction,
): ComparisonState => {
    switch (action.type) {
        case 'choose-mode':
            return withNewInput(state, action.side, {
                ...emptyInput(),
                mode: action.mode,
                analysed: action.mode === 'analysed' ? action.fallback : undefined,
            });
        case 'choose-file':
            return withNewInput(state, action.side, {
                ...emptyInput(),
                mode: 'upload',
                file: action.file,
                preflightBusy: Boolean(action.file),
            });
        case 'choose-url':
            return withNewInput(state, action.side, {
                ...emptyInput(),
                mode: 'url',
                url: action.url,
            });
        case 'choose-analysed':
            return withNewInput(state, action.side, {
                ...emptyInput(),
                mode: 'analysed',
                analysed: action.choice,
            });
        case 'preflight-settled':
            // An answer about a file the reader has since replaced says nothing about the one they now have.
            if (action.inputId !== state.inputIds[action.side]) return state;
            return {
                ...state,
                inputs: {
                    ...state.inputs,
                    [action.side]: {
                        ...state.inputs[action.side],
                        preflight: action.result,
                        preflightBusy: false,
                    },
                },
            };
        case 'run-started':
            if (action.runId !== state.runId) return state;
            return { ...state, request: { status: 'loading' } };
        case 'side-progress':
            if (action.runId !== state.runId) return state;
            return {
                ...state,
                progress: { ...state.progress, [action.side]: action.progress },
            };
        case 'run-settled':
            if (action.runId !== state.runId) return state;
            return { ...state, request: action.request };
        case 'run-cancelled':
            // Cancelling ends the run for good, so nothing it still has in flight may report back.
            return {
                ...state,
                runId: state.runId + 1,
                request: { status: 'idle' },
                progress: {
                    before: cancelled(state.progress.before, action.message),
                    after: cancelled(state.progress.after, action.message),
                },
            };
    }
};

// A side that had already finished keeps its result: cancelling the run does not un-analyse what was analysed.
const cancelled = (progress: ComparisonSideProgress, message: string): ComparisonSideProgress =>
    progress.status === 'completed' ? progress : { status: 'cancelled', message };

/** Whether a side has been given something that can be compared, without anything having been sent yet. */
export const sideIsReady = (
    input: ComparisonSideInput,
    urlValid: (value: string) => boolean,
): boolean => {
    if (input.mode === 'analysed') return Boolean(input.analysed);
    if (input.mode === 'upload')
        return Boolean(input.file && !input.preflightBusy && input.preflight?.valid);
    return urlValid(input.url);
};

/**
 * The analysis a side already stands for: one this service holds, or one this run produced. A side with either
 * has nothing left to submit, which is what keeps a retry from analysing a project twice.
 */
export const resolvedReference = (
    input: ComparisonSideInput,
    progress: ComparisonSideProgress,
): AnalysisReferenceDto | undefined => {
    if (input.mode === 'analysed' && input.analysed)
        return { submissionToken: input.analysed.token, analysisId: input.analysed.analysisId };
    return progress.status === 'completed' ? progress.reference : undefined;
};
