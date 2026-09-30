// SPDX-License-Identifier: EUPL-1.2
// SPDX-FileCopyrightText: 2026 LitterBox-Web contributors

import { describe, expect, it } from 'vitest';
import type { AnalysisIssue, BatchAnalysis } from '../src/api/submissions';
import {
    batchRows,
    filterAndSortBatchRows,
    NO_BATCH_FILTERS,
    summarizeBatch,
} from '../src/components/batch/batch-summary';
import { issue as finding } from './helpers';

const issue = (finderId: string, type: string, id = 1): AnalysisIssue =>
    finding({ id, finderId, finderName: `Name of ${finderId}`, type });

const analysis = (
    id: number,
    name: string,
    status: string,
    issues: AnalysisIssue[] = [],
): BatchAnalysis => ({ id, name, status, issues }) as BatchAnalysis;

const measure = (value: BatchAnalysis, metrics: Record<string, number>): BatchAnalysis =>
    ({ ...value, metrics }) as BatchAnalysis;

const classSet = (): BatchAnalysis[] => [
    analysis(1, 'charlie.sb3', 'completed', [
        issue('never-set', 'bug', 1),
        issue('never-set', 'bug', 2),
        issue('long-script', 'smell', 3),
    ]),
    analysis(2, 'alice.sb3', 'failed'),
    analysis(3, 'bob.sb3', 'completed', [issue('never-set', 'bug', 4)]),
    analysis(4, 'dana.sb3', 'running'),
    analysis(5, 'erin.sb3', 'completed'),
];

describe('what a class set adds up to', () => {
    it('counts findings only from the analyses that finished', () => {
        const summary = summarizeBatch(classSet());

        expect(summary.completedCount).toBe(3);
        expect(summary.failedCount).toBe(1);
        expect(summary.totals).toEqual({ bug: 3, smell: 1, perfume: 0, other: 0 });
        expect(summary.totalFindings).toBe(4);
        expect(summary.withoutFindings).toBe(1);
    });

    it('counts occurrences and containing analyses independently', () => {
        const summary = summarizeBatch(classSet());

        expect(summary.finders).toEqual([
            {
                finderId: 'never-set',
                finderName: 'Name of never-set',
                family: 'bug',
                occurrences: 3,
                analyses: 2,
            },
            {
                finderId: 'long-script',
                finderName: 'Name of long-script',
                family: 'smell',
                occurrences: 1,
                analyses: 1,
            },
        ]);
    });

    it('leaves findings without a finder id out of the frequency list', () => {
        const summary = summarizeBatch([
            analysis(1, 'a.sb3', 'completed', [issue('', 'bug', 1), issue('   ', 'bug', 2)]),
        ]);

        expect(summary.finders).toEqual([]);
        expect(summary.totalFindings).toBe(2);
    });

    it('counts bugs and smells as the concerns, and leaves praise out of them', () => {
        const summary = summarizeBatch([
            analysis(1, 'a.sb3', 'completed', [
                issue('missing-loop', 'bug', 1),
                issue('long-script', 'smell', 2),
                issue('good-naming', 'perfume', 3),
                issue('good-naming', 'perfume', 4),
                issue('good-naming', 'perfume', 5),
            ]),
        ]);

        expect(summary.totalFindings).toBe(5);
        expect(summary.concerns).toBe(2);
    });

    it('gives an unfinished analysis no counts to be read as nought', () => {
        const rows = batchRows([analysis(1, 'a.sb3', 'running', [issue('never-set', 'bug')])]);

        expect(rows[0]?.completed).toBe(false);
        expect(rows[0]?.total).toBe(0);
    });

    it('offers a column only for what the set has something to say about', () => {
        expect(summarizeBatch(classSet()).families).toEqual(['bug', 'smell', 'perfume']);
        expect(summarizeBatch(classSet()).measurements).toEqual([]);

        const measured = summarizeBatch([
            measure(analysis(1, 'a.sb3', 'completed'), { sprite_count: 3 }),
            measure(analysis(2, 'b.sb3', 'completed', [issue('odd', 'novelty', 1)]), {
                blocks: 12,
            }),
            measure(analysis(3, 'c.sb3', 'running'), { script_count: 9 }),
        ]);

        expect(measured.families).toEqual(['bug', 'smell', 'perfume', 'other']);
        // "blocks" and "block_count" are one measurement under two names; a script count reported only by an
        // analysis that has not finished is not a measurement this set has.
        expect(measured.measurements).toEqual(['metricSprites', 'metricBlocks']);
        expect(measured.rows[1]?.measurements).toEqual({ metricBlocks: 12 });
        expect(measured.rows[2]?.measurements).toEqual({});
    });
});

describe('ordering and filtering a class set', () => {
    const rows = () => batchRows(classSet());

    it('keeps the response order until a sort is chosen', () => {
        expect(
            filterAndSortBatchRows(rows(), NO_BATCH_FILTERS, undefined).map((r) => r.name),
        ).toEqual(['charlie.sb3', 'alice.sb3', 'bob.sb3', 'dana.sb3', 'erin.sb3']);
    });

    it('sorts by a column and breaks every tie on the response order', () => {
        const byBugs = filterAndSortBatchRows(rows(), NO_BATCH_FILTERS, {
            column: 'bug',
            direction: 'descending',
        });

        expect(byBugs.map((row) => row.name)).toEqual([
            'charlie.sb3',
            'bob.sb3',
            'erin.sb3',
            'alice.sb3',
            'dana.sb3',
        ]);
    });

    it('sorts by a measurement and keeps the analyses that have none at the end', () => {
        const measured = batchRows([
            measure(analysis(1, 'small.sb3', 'completed'), { block_count: 12 }),
            analysis(2, 'unmeasured.sb3', 'completed'),
            measure(analysis(3, 'large.sb3', 'completed'), { blocks: 400 }),
        ]);
        const order = (direction: 'ascending' | 'descending') =>
            filterAndSortBatchRows(measured, NO_BATCH_FILTERS, {
                column: 'metricBlocks',
                direction,
            }).map((row) => row.name);

        expect(order('ascending')).toEqual(['small.sb3', 'large.sb3', 'unmeasured.sb3']);
        expect(order('descending')).toEqual(['large.sb3', 'small.sb3', 'unmeasured.sb3']);
    });

    it('does not reorder what it was given', () => {
        const original = rows();
        const names = original.map((row) => row.name);
        filterAndSortBatchRows(original, NO_BATCH_FILTERS, {
            column: 'name',
            direction: 'ascending',
        });

        expect(original.map((row) => row.name)).toEqual(names);
    });

    it('shows only the finished analyses that reported a matching finding', () => {
        const byFinder = filterAndSortBatchRows(
            rows(),
            { ...NO_BATCH_FILTERS, finder: 'long-script' },
            undefined,
        );
        expect(byFinder.map((row) => row.name)).toEqual(['charlie.sb3']);

        const bySmell = filterAndSortBatchRows(
            rows(),
            { ...NO_BATCH_FILTERS, family: 'smell' },
            undefined,
        );
        expect(bySmell.map((row) => row.name)).toEqual(['charlie.sb3']);
    });

    it('filters by processing status without asking about findings', () => {
        const failed = filterAndSortBatchRows(
            rows(),
            { ...NO_BATCH_FILTERS, status: 'failed' },
            undefined,
        );

        expect(failed.map((row) => row.name)).toEqual(['alice.sb3']);
    });

    it('narrows to an arbitrary project id set chosen from a class-overview panel', () => {
        const byProjectSet = filterAndSortBatchRows(
            rows(),
            {
                ...NO_BATCH_FILTERS,
                projectSet: {
                    key: 'concept:pen',
                    ids: new Set(['1', '3']),
                    label: 'Pen · Contains it',
                },
            },
            undefined,
        );
        expect(byProjectSet.map((row) => row.name)).toEqual(['charlie.sb3', 'bob.sb3']);
    });
});
