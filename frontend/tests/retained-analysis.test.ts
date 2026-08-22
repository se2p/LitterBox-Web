// SPDX-License-Identifier: EUPL-1.2
// SPDX-FileCopyrightText: 2026 LitterBox-Web contributors

import { describe, expect, it } from 'vitest';
import {
    ADVANCED_ANALYSIS_PATH,
    readRetainedAnalysis,
    retainedAnalysisDestination,
} from '../src/lib/retained-analysis';

describe('retained analysis navigation contract', () => {
    it('carries an authorized retained-analysis reference in navigation state only', () => {
        const destination = retainedAnalysisDestination(ADVANCED_ANALYSIS_PATH, {
            submissionToken: 'synthetic/private-token',
            analysisId: 7,
        });

        expect(destination).toEqual({
            pathname: ADVANCED_ANALYSIS_PATH,
            state: {
                retainedAnalysis: {
                    submissionToken: 'synthetic/private-token',
                    analysisId: 7,
                },
            },
        });
        expect(destination.pathname).not.toContain('synthetic/private-token');
        expect(readRetainedAnalysis(destination.state)).toEqual(destination.state.retainedAnalysis);
    });

    it.each([
        undefined,
        null,
        {},
        { retainedAnalysis: null },
        { retainedAnalysis: { submissionToken: '', analysisId: 7 } },
        { retainedAnalysis: { submissionToken: 'token', analysisId: 0 } },
        { retainedAnalysis: { submissionToken: 'token', analysisId: 1.5 } },
        { retainedAnalysis: { submissionToken: 'token', analysisId: 7, storageKey: 'secret' } },
        { retainedAnalysis: { submissionToken: 'token', analysisId: 7 }, unexpected: true },
    ])('rejects invalid or expanded navigation state %#', (state) => {
        expect(readRetainedAnalysis(state)).toBeUndefined();
    });

    it('rejects invalid destinations before navigation', () => {
        expect(() =>
            retainedAnalysisDestination(ADVANCED_ANALYSIS_PATH, {
                submissionToken: ' ',
                analysisId: 7,
            }),
        ).toThrow(TypeError);
        expect(() =>
            retainedAnalysisDestination(ADVANCED_ANALYSIS_PATH, {
                submissionToken: 'token',
                analysisId: -1,
            }),
        ).toThrow(TypeError);
    });
});
