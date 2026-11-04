// SPDX-License-Identifier: EUPL-1.2
// SPDX-FileCopyrightText: 2026 LitterBox-Web contributors

import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { beforeEach, expect, it, vi } from 'vitest';
import i18n from '../src/i18n';
import type { BatchAnalysis } from '../src/api/submissions';
import { BatchAnalyticsWorkspace } from '../src/components/batch/BatchAnalyticsWorkspace';
import { batchRows } from '../src/components/batch/batch-summary';
import { featureMatrix } from '../src/components/batch/batch-analytics';
import { featureMatrixCsv } from '../src/components/batch/batch-csv';

beforeEach(async () => {
    await i18n.changeLanguage('en');
});

const rows = batchRows([
    { id: 1, status: 'completed', metrics: { ct_score: 9, ct_score_flow_control: 2 } },
    {
        id: 2,
        status: 'completed',
        metrics: { ct_score: 9, ct_extended_score: 12, ct_extended_score_flow_control: 4 },
    },
] as unknown as BatchAnalysis[]);

it('defaults a mixed cohort to Extended and clears its CT project filter when switching', async () => {
    const user = userEvent.setup();
    const onFilter = vi.fn();
    render(
        <MemoryRouter>
            <BatchAnalyticsWorkspace
                rows={rows}
                matrix={featureMatrix(rows)}
                finders={[]}
                activeProjectFilter="ct:extended:flowControl:4"
                onProjectSetFilter={onFilter}
                projects={null}
                exportContent={() => null}
            />
        </MemoryRouter>,
    );
    const selector = screen.getByRole('combobox', { name: 'Computational-thinking rubric' });
    expect(selector).toHaveValue('extended');
    const fold = screen
        .getByRole('heading', { name: 'Computational thinking across the class' })
        .closest('details')!;
    await user.click(fold.querySelector('summary')!);
    expect(within(fold).getByRole('columnheader', { name: 'Level 4' })).toBeInTheDocument();
    await user.selectOptions(selector, 'classic');
    expect(onFilter).toHaveBeenCalledWith('ct:extended:flowControl:4', new Set(), '');
    expect(within(fold).queryByRole('columnheader', { name: 'Level 4' })).not.toBeInTheDocument();
});

it('keeps Classic and Extended feature columns separate and leaves historical values missing', () => {
    const matrix = featureMatrix(rows);
    expect(matrix.columns).toContain('metric:ct_score');
    expect(matrix.columns).toContain('metric:ct_extended_score');
    expect(matrix.rows[0].values['metric:ct_extended_score']).toBeUndefined();
    expect(matrix.rows[1].values['metric:ct_extended_score_flow_control']).toBe(4);
});

it('exports separate rubric values and keeps missing historical metrics blank', () => {
    const columns = [
        'metric:ct_score',
        'metric:ct_extended_score',
        'metric:ct_extended_score_flow_control',
    ];
    const lines = featureMatrixCsv(featureMatrix(rows), columns).split('\r\n');
    expect(lines[0]).toBe(`Project,${columns.join(',')}`);
    expect(lines[1].split(',').slice(1)).toEqual(['9', '', '']);
    expect(lines[2].split(',').slice(1)).toEqual(['9', '12', '4']);
});
