// SPDX-License-Identifier: EUPL-1.2
// SPDX-FileCopyrightText: 2026 LitterBox-Web contributors

/**
 * How a page hands a completed analysis on to another page: in navigation state, never in the address. The token is
 * the reader's own authorization for that analysis, and an address is copied, logged and shared without a thought.
 *
 * Two destinations carry one now — the advanced workspace and the teacher's task analysis — so the rule about what
 * may travel in that state is written once rather than once per destination.
 */

const MAX_SUBMISSION_TOKEN_LENGTH = 128;

export const ADVANCED_ANALYSIS_PATH = '/advanced';
export const ADVANCED_ANALYSIS_COMPATIBILITY_PATH = '/tools';

/**
 * Fault injection has no page of its own any more; it is a section of the advanced workspace. Kept as a destination
 * in its own right, and not folded into ADVANCED_ANALYSIS_PATH, only so a link or an in-flight "analyse then
 * continue" navigation still aimed at the old address resolves — App redirects it there itself.
 */
export const MODIFICATION_PATH = '/teacher/modify';

/**
 * A teacher analysing their own model solution, or their own starter project, is not analysing a child's work at
 * all: the reading is of the task, not of a submission to it. It lives under the teacher's pages, and it is a page
 * of its own rather than a mode of the child's result page, because the questions a teacher asks of a task are not
 * the questions that page already answers.
 */
export const TASK_ANALYSIS_PATH = '/teacher/task';

export interface RetainedAnalysisSelection {
    readonly submissionToken: string;
    readonly analysisId: number;
}

export interface RetainedAnalysisNavigationState {
    readonly retainedAnalysis: RetainedAnalysisSelection;
}

export interface RetainedAnalysisDestination<Path extends string> {
    readonly pathname: Path;
    readonly state: RetainedAnalysisNavigationState;
}

const isExactObject = (value: unknown, keys: readonly string[]): value is Record<string, unknown> =>
    value !== null &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    Object.keys(value).length === keys.length &&
    keys.every((key) => Object.prototype.hasOwnProperty.call(value, key));

export const validSelection = (value: unknown): value is RetainedAnalysisSelection =>
    isExactObject(value, ['submissionToken', 'analysisId']) &&
    typeof value.submissionToken === 'string' &&
    value.submissionToken.trim().length > 0 &&
    value.submissionToken.length <= MAX_SUBMISSION_TOKEN_LENGTH &&
    typeof value.analysisId === 'number' &&
    Number.isSafeInteger(value.analysisId) &&
    value.analysisId > 0;

export const readRetainedAnalysis = (state: unknown): RetainedAnalysisSelection | undefined => {
    if (!isExactObject(state, ['retainedAnalysis']) || !validSelection(state.retainedAnalysis))
        return undefined;
    return {
        submissionToken: state.retainedAnalysis.submissionToken,
        analysisId: state.retainedAnalysis.analysisId,
    };
};

export const retainedAnalysisDestination = <Path extends string>(
    pathname: Path,
    selection: RetainedAnalysisSelection,
): RetainedAnalysisDestination<Path> => {
    if (!validSelection(selection)) throw new TypeError('Invalid retained analysis selection');
    return {
        pathname,
        state: {
            retainedAnalysis: {
                submissionToken: selection.submissionToken,
                analysisId: selection.analysisId,
            },
        },
    };
};
