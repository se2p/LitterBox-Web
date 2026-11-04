// SPDX-License-Identifier: EUPL-1.2
// SPDX-FileCopyrightText: 2026 LitterBox-Web contributors

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import i18n from '../src/i18n';
import { TaskThinkingProfile } from '../src/components/task-analysis/TaskThinkingProfile';
import { batchRows } from '../src/components/batch/batch-summary';
import {
    cohortCtProfile,
    cohortCtTotal,
    referenceCtComparison,
} from '../src/components/batch/batch-analytics';
import type { BatchAnalysis } from '../src/api/submissions';

const extendedMetrics = {
    ct_extended_score: 36,
    ct_extended_score_average: 4,
    ct_extended_score_abstraction: 4,
    ct_extended_score_data_representation: 4,
    ct_extended_score_flow_control: 4,
    ct_extended_score_logic: 4,
    ct_extended_score_math_operators: 4,
    ct_extended_score_motion: 4,
    ct_extended_score_parallelization: 4,
    ct_extended_score_synchronization: 4,
    ct_extended_score_user_interactivity: 4,
    ct_score: 21,
    ct_score_abstraction: 3,
    ct_score_data_representation: 3,
    ct_score_flow_control: 3,
    ct_score_logic: 3,
    ct_score_parallelization: 3,
    ct_score_synchronization: 3,
    ct_score_user_interactivity: 3,
};

const analysis = (id: number, metrics: Record<string, number>): BatchAnalysis =>
    ({
        id,
        name: `project-${id}`,
        status: 'completed',
        metrics,
        issues: [],
    }) as unknown as BatchAnalysis;

describe('extended computational-thinking teacher views', () => {
    beforeEach(async () => {
        await i18n.changeLanguage('en');
    });

    it('defaults to Extended, renders nine dimensions and preserves level 4', () => {
        render(<TaskThinkingProfile metrics={extendedMetrics} locale="en" />);

        expect(screen.getByRole('combobox', { name: 'Computational-thinking rubric' })).toHaveValue(
            'extended',
        );
        expect(screen.getByText('36 of 36')).toBeInTheDocument();
        expect(screen.getAllByRole('row')).toHaveLength(10);
        expect(screen.getAllByRole('img', { name: 'Level 4 of 4' })).toHaveLength(9);
        expect(screen.queryByRole('link', { name: 'Examples at Dr. Scratch' })).toBeNull();
        expect(
            screen.getAllByText(
                'Uses a clone-start script with a broadcast or top-level non-trivial control structure.',
            ),
        ).toHaveLength(2);
    });

    it('switches back to Classic with seven dimensions and a total out of 21', async () => {
        const user = userEvent.setup();
        render(<TaskThinkingProfile metrics={extendedMetrics} locale="en" />);
        await user.selectOptions(
            screen.getByRole('combobox', { name: 'Computational-thinking rubric' }),
            'classic',
        );

        expect(screen.getByText('21 of 21')).toBeInTheDocument();
        expect(screen.getAllByRole('row')).toHaveLength(8);
        expect(screen.getAllByRole('img', { name: 'Level 3 of 3' })).toHaveLength(7);
        expect(screen.getAllByRole('link', { name: 'Examples at Dr. Scratch' })).toHaveLength(7);
    });

    it('keeps missing Extended dimensions out of mixed-cohort medians', () => {
        const rows = batchRows([
            analysis(1, { ct_extended_score: 36, ct_extended_score_flow_control: 4 }),
            analysis(2, { ct_extended_score: 0, ct_extended_score_flow_control: 0 }),
            analysis(3, { ct_score: 21, ct_score_flow_control: 3 }),
        ]);
        const profile = cohortCtProfile(rows, 'extended');
        const flow = profile.find(({ id }) => id === 'flowControl');
        expect(flow?.levelIds[4]).toEqual(['1']);
        expect(flow?.levelIds[0]).toEqual(['2']);
        expect(flow?.unreported).toBe(1);
        expect(flow?.median).toBe(2);
        expect(cohortCtTotal(rows, 'extended')).toMatchObject({ count: 2, missing: 1, median: 18 });
    });

    it('compares Extended reference levels and includes all nine dimensions', () => {
        const rows = batchRows([analysis(1, { ct_extended_score_flow_control: 2 })]);
        const comparison = referenceCtComparison(
            { ct_extended_score_flow_control: 4 },
            rows,
            'extended',
        );
        expect(comparison).toHaveLength(9);
        expect(comparison.find(({ id }) => id === 'flowControl')).toMatchObject({
            referenceLevel: 4,
            medianLevel: 2,
        });
        expect(comparison.find(({ id }) => id === 'motion')).toMatchObject({
            referenceLevel: undefined,
            medianLevel: undefined,
        });
    });
});
