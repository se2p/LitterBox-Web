// SPDX-License-Identifier: EUPL-1.2
// SPDX-FileCopyrightText: 2026 LitterBox-Web contributors
import { describe, expect, it } from 'vitest';
import {
    comparisonReducer,
    initialComparisonState,
    resolvedReference,
    sideIsReady,
    type ComparisonAction,
    type ComparisonState,
} from '../src/pages/comparison-machine';

const reduce = (state: ComparisonState, ...actions: ComparisonAction[]): ComparisonState =>
    actions.reduce(comparisonReducer, state);

const archive = new File(['synthetic'], 'before.sb3');
const valid = { valid: true as const, entries: 1 };
const invalid = { valid: false as const, reason: 'invalid-archive' as const, entries: 0 };
const anyUrl = () => true;

describe('the comparison state machine', () => {
    it('starts empty, or with the project the reader arrived from', () => {
        expect(initialComparisonState().inputs.before).toEqual({
            mode: 'upload',
            url: '',
            preflightBusy: false,
        });
        const arrival = { token: 'a-token', analysisId: 4, name: 'cat-chase.sb3' };
        const carried = initialComparisonState(arrival);
        expect(carried.inputs.before.mode).toBe('analysed');
        expect(carried.inputs.before.analysed).toEqual(arrival);
        // Only the side they came from; the other is theirs to give.
        expect(carried.inputs.after.mode).toBe('upload');
    });

    it('waits for a chosen file to be looked into before calling the side ready', () => {
        const chosen = reduce(initialComparisonState(), {
            type: 'choose-file',
            side: 'before',
            file: archive,
        });
        expect(chosen.inputs.before.preflightBusy).toBe(true);
        expect(sideIsReady(chosen.inputs.before, anyUrl)).toBe(false);

        const settled = reduce(chosen, {
            type: 'preflight-settled',
            side: 'before',
            inputId: chosen.inputIds.before,
            result: valid,
        });
        expect(sideIsReady(settled.inputs.before, anyUrl)).toBe(true);

        const rejected = reduce(chosen, {
            type: 'preflight-settled',
            side: 'before',
            inputId: chosen.inputIds.before,
            result: invalid,
        });
        expect(sideIsReady(rejected.inputs.before, anyUrl)).toBe(false);
        expect(rejected.inputs.before.preflightBusy).toBe(false);
    });

    // The reason the epoch counters existed. Now the reducer refuses the stale answer itself.
    it('ignores a preflight that answers about a file the reader has replaced', () => {
        const first = reduce(initialComparisonState(), {
            type: 'choose-file',
            side: 'before',
            file: archive,
        });
        const staleId = first.inputIds.before;
        const second = reduce(first, {
            type: 'choose-file',
            side: 'before',
            file: new File(['other'], 'after.sb3'),
        });

        const unchanged = reduce(second, {
            type: 'preflight-settled',
            side: 'before',
            inputId: staleId,
            result: valid,
        });

        expect(unchanged).toBe(second);
        expect(unchanged.inputs.before.preflight).toBeUndefined();
        expect(unchanged.inputs.before.preflightBusy).toBe(true);
    });

    it('ignores progress and results belonging to a run that has been superseded', () => {
        const ready = reduce(
            initialComparisonState(),
            {
                type: 'choose-analysed',
                side: 'before',
                choice: { token: 'a', analysisId: 1, name: 'a' },
            },
            {
                type: 'choose-analysed',
                side: 'after',
                choice: { token: 'b', analysisId: 2, name: 'b' },
            },
        );
        const running = reduce(ready, { type: 'run-started', runId: ready.runId });
        expect(running.request.status).toBe('loading');

        // The reader changes their mind while the comparison is in flight.
        const changed = reduce(running, { type: 'choose-url', side: 'after', url: '12345' });
        const late = reduce(
            changed,
            {
                type: 'side-progress',
                side: 'after',
                runId: running.runId,
                progress: { status: 'completed', message: 'done' },
            },
            {
                type: 'run-settled',
                runId: running.runId,
                request: { status: 'error', category: 'failed' },
            },
        );

        expect(late).toBe(changed);
        expect(late.request.status).toBe('idle');
        expect(late.progress.after.status).toBe('idle');
    });

    it('keeps a side that finished so a retry does not analyse it twice', () => {
        const reference = { submissionToken: 'done-token', analysisId: 9 };
        const state = reduce(
            initialComparisonState(),
            { type: 'choose-url', side: 'before', url: '1' },
            { type: 'choose-url', side: 'after', url: '2' },
        );
        const partly = reduce(state, {
            type: 'side-progress',
            side: 'before',
            runId: state.runId,
            progress: { status: 'completed', message: 'done', reference },
        });

        expect(resolvedReference(partly.inputs.before, partly.progress.before)).toEqual(reference);
        expect(resolvedReference(partly.inputs.after, partly.progress.after)).toBeUndefined();

        // Cancelling stops the run without un-analysing what was already analysed.
        const stopped = reduce(partly, { type: 'run-cancelled', message: 'Cancelled' });
        expect(stopped.progress.before.status).toBe('completed');
        expect(stopped.progress.after.status).toBe('cancelled');
        expect(resolvedReference(stopped.inputs.before, stopped.progress.before)).toEqual(
            reference,
        );
        // And nothing the cancelled run still has in flight may report back.
        expect(stopped.runId).not.toBe(partly.runId);
    });

    it('drops everything known about a side when that side is given something else', () => {
        const reference = { submissionToken: 'done-token', analysisId: 9 };
        const analysed = reduce(
            initialComparisonState(),
            { type: 'choose-url', side: 'before', url: '1' },
            {
                type: 'side-progress',
                side: 'before',
                runId: 1,
                progress: { status: 'completed', message: 'done', reference },
            },
        );
        expect(analysed.progress.before.status).toBe('completed');

        const replaced = reduce(analysed, { type: 'choose-file', side: 'before', file: archive });

        expect(replaced.progress.before).toEqual({ status: 'idle' });
        expect(resolvedReference(replaced.inputs.before, replaced.progress.before)).toBeUndefined();
        // The other side is untouched: only what changed was invalidated.
        expect(replaced.progress.after).toBe(analysed.progress.after);
    });

    it('answers for an already-analysed side without anything being submitted', () => {
        const choice = { token: 'held', analysisId: 3, name: 'held.sb3' };
        const state = reduce(initialComparisonState(), {
            type: 'choose-analysed',
            side: 'before',
            choice,
        });
        expect(sideIsReady(state.inputs.before, anyUrl)).toBe(true);
        expect(resolvedReference(state.inputs.before, state.progress.before)).toEqual({
            submissionToken: 'held',
            analysisId: 3,
        });
    });
});
