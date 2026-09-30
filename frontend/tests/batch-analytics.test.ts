// SPDX-License-Identifier: EUPL-1.2
// SPDX-FileCopyrightText: 2026 LitterBox-Web contributors

import { describe, expect, it } from 'vitest';
import type { BatchAnalysis } from '../src/api/submissions';
import { batchRows, summarizeBatch } from '../src/components/batch/batch-summary';
import {
    csvBundleBlob,
    featureMatrixCsv,
    findingProfileCsv,
} from '../src/components/batch/batch-csv';
import {
    CONCERN_RATE_FEATURE,
    cohortConceptCoverage,
    cohortCtProfile,
    cohortCtTotal,
    commonIssues,
    distribution,
    featureMatrix,
    metricRankings,
    projectTriage,
    referenceConceptComparison,
    searchAndSortFeatureMatrixRows,
    type FeatureMatrix,
} from '../src/components/batch/batch-analytics';

const analysis = (
    id: number,
    metrics: Record<string, number>,
    issues: unknown[] = [],
): BatchAnalysis =>
    ({ id, name: `project-${id}`, status: 'completed', metrics, issues }) as BatchAnalysis;

describe('batch analytics', () => {
    it('distinguishes missing values from reported zero and reports coverage', () => {
        const matrix = featureMatrix(
            batchRows([
                analysis(1, { block_count: 0 }),
                analysis(2, {}),
                analysis(3, { block_count: 12 }),
            ]),
        );
        const values = matrix.rows.map((row) => row.values['metric:block_count']);
        expect(distribution(values)).toMatchObject({ count: 2, missing: 1, zero: 1, median: 6 });
        expect(featureMatrixCsv(matrix, ['metric:block_count'])).toContain('project-2,\r\n');
    });

    it('uses only rows with usable blocks as the issue density denominator', () => {
        const analyses = [
            analysis(1, { block_count: 100 }, [{ finderId: 'f', finderName: 'F', type: 'bug' }]),
            analysis(2, {}, [{ finderId: 'f', finderName: 'F', type: 'bug' }]),
        ];
        const summary = summarizeBatch(analyses);
        expect(commonIssues(summary.rows, summary.finders)[0]).toMatchObject({
            applicable: 1,
            density: 0.01,
            prevalence: 1,
        });
    });

    it('reports prevalence as the share of completed analyses a finder appeared in at least once', () => {
        const analyses = [
            analysis(1, { block_count: 100 }, [
                { finderId: 'f', finderName: 'F', type: 'bug' },
                { finderId: 'f', finderName: 'F', type: 'bug' },
            ]),
            analysis(2, { block_count: 100 }, [{ finderId: 'f', finderName: 'F', type: 'bug' }]),
            analysis(3, { block_count: 100 }, []),
        ];
        const summary = summarizeBatch(analyses);
        expect(commonIssues(summary.rows, summary.finders)[0]).toMatchObject({
            occurrences: 3,
            analyses: 2,
            prevalence: 2 / 3,
        });
    });

    it('promotes the concern rate to a real matrix column, present and reported zero alike', () => {
        const analyses = [
            analysis(1, { block_count: 100 }, [{ finderId: 'f', finderName: 'F', type: 'bug' }]),
            analysis(2, { block_count: 200 }, []),
        ];
        const matrix = featureMatrix(batchRows(analyses));
        expect(matrix.columns).toContain(CONCERN_RATE_FEATURE);
        const byId = new Map(matrix.rows.map((row) => [row.id, row.values[CONCERN_RATE_FEATURE]]));
        expect(byId.get('1')).toBe(10);
        expect(byId.get('2')).toBe(0);
    });

    it('counts only bugs and smells in the rate, so good patterns never read as findings', () => {
        const matrix = featureMatrix(
            batchRows([
                analysis(1, { block_count: 100 }, [
                    { finderId: 'b', finderName: 'B', type: 'bug' },
                    { finderId: 's', finderName: 'S', type: 'smell' },
                    { finderId: 'p', finderName: 'P', type: 'perfume' },
                    { finderId: 'p', finderName: 'P', type: 'perfume' },
                ]),
                // Perfumes alone leave a project at a rate of exactly zero, not at the top of the class set.
                analysis(2, { block_count: 100 }, [
                    { finderId: 'p', finderName: 'P', type: 'perfume' },
                ]),
            ]),
        );
        const byId = new Map(matrix.rows.map((row) => [row.id, row.values[CONCERN_RATE_FEATURE]]));
        expect(byId.get('1')).toBe(20);
        expect(byId.get('2')).toBe(0);
    });

    it('excludes a project with no reported block count from the concern rate, rather than reading it as zero', () => {
        const analyses = [
            analysis(1, {}, [{ finderId: 'f', finderName: 'F', type: 'bug' }]),
            analysis(2, { block_count: 100 }, []),
        ];
        const matrix = featureMatrix(batchRows(analyses));
        const unsized = matrix.rows.find((row) => row.id === '1');
        expect(unsized?.values[CONCERN_RATE_FEATURE]).toBeUndefined();
    });

    it('guards a reported block count of zero instead of dividing by it', () => {
        const matrix = featureMatrix(
            batchRows([
                analysis(1, { block_count: 0 }, [{ finderId: 'f', finderName: 'F', type: 'bug' }]),
            ]),
        );
        expect(matrix.rows[0].values[CONCERN_RATE_FEATURE]).toBeUndefined();
    });

    it('never adds the concern-rate column when no report in the cohort carries a block count', () => {
        const matrix = featureMatrix(
            batchRows([analysis(1, {}, [{ finderId: 'f', finderName: 'F', type: 'bug' }])]),
        );
        expect(matrix.columns).not.toContain(CONCERN_RATE_FEATURE);
    });

    it('creates a useful long finding dataset and a multi-file CSV bundle', async () => {
        const rows = batchRows([
            analysis(1, { block_count: 1 }, [{ finderId: 'f', finderName: 'F', type: 'bug' }]),
        ]);
        expect(findingProfileCsv(rows, ['f'])).toContain('project-1,completed,f,F,bug,1');
        expect(
            await csvBundleBlob([
                { name: 'one.csv', content: 'a' },
                { name: 'two.csv', content: 'b' },
            ]),
        ).toBeInstanceOf(Blob);
    });
});

describe('projectTriage', () => {
    const finding = (type: string, id = type) => ({ finderId: id, finderName: id, type });

    it('deduplicates projects and retains every selected reason', () => {
        const analyses = [
            analysis(1, { block_count: 2 }, [finding('bug'), finding('smell')]),
            analysis(2, { block_count: 2 }, []),
            analysis(3, {}, [finding('bug')]),
            ...Array.from({ length: 8 }, (_, index) =>
                analysis(index + 4, { block_count: 60 }, []),
            ),
        ];
        const triage = projectTriage(featureMatrix(batchRows(analyses)));

        expect(triage.entries.find((entry) => entry.id === '1')).toMatchObject({
            reasons: ['mostBugs', 'mostSmells', 'smallProject'],
            bugs: 1,
            smells: 1,
            blocks: 2,
        });
        expect(triage.entries.map((entry) => entry.id)).toEqual(['1', '3', '10']);
        expect(triage.entries.find((entry) => entry.id === '10')?.reasons).toEqual([
            'largeProject',
        ]);
        expect(triage.unsized).toBe(1);
    });

    it('ranks bugs and smells by their actual counts, including small projects', () => {
        const analyses = [
            analysis(1, { block_count: 4 }, [finding('bug'), finding('bug', 'b2')]),
            analysis(2, { block_count: 20 }, []),
            analysis(3, { block_count: 30 }, [
                finding('bug', 'b1'),
                finding('bug', 'b2'),
                finding('smell', 's1'),
            ]),
            analysis(4, { block_count: 40 }, [finding('smell')]),
            analysis(5, { block_count: 50 }, [finding('bug'), finding('perfume')]),
            analysis(6, { block_count: 60 }, []),
            analysis(7, { block_count: 70 }, [finding('bug', 'b1'), finding('bug', 'b2')]),
            analysis(8, { block_count: 80 }, [finding('bug')]),
            analysis(9, { block_count: 90 }, [finding('smell', 's1'), finding('smell', 's2')]),
            analysis(10, { block_count: 100 }, [finding('bug')]),
        ];
        const triage = projectTriage(featureMatrix(batchRows(analyses)));
        expect(
            triage.entries
                .filter((entry) => entry.reasons.includes('mostBugs'))
                .map((entry) => entry.id),
        ).toEqual(['1', '3']);
        expect(triage.entries.find((entry) => entry.id === '1')).toMatchObject({
            bugs: 2,
            smells: 0,
            blocks: 4,
        });
        expect(
            triage.entries
                .filter((entry) => entry.reasons.includes('mostSmells'))
                .map((entry) => entry.id)
                .sort(),
        ).toEqual(['3', '9']);
        expect(triage.entries.map((entry) => entry.id)).toEqual(['1', '3', '9', '10']);
    });

    it('selects at most six projects from a larger cohort', () => {
        const analyses = Array.from({ length: 22 }, (_, index) => {
            const bugs = index === 4 ? 10 : index === 5 ? 9 : 1;
            const smells = index === 6 ? 10 : index === 7 ? 9 : 1;
            return analysis(index + 1, { block_count: (index + 1) * 10 }, [
                ...Array.from({ length: bugs }, (_, i) => finding('bug', `b${i}`)),
                ...Array.from({ length: smells }, (_, i) => finding('smell', `s${i}`)),
            ]);
        });
        const triage = projectTriage(featureMatrix(batchRows(analyses)));

        expect(triage.entries.map((entry) => entry.id)).toEqual(['5', '6', '7', '8', '1', '22']);
        expect(triage.entries.map((entry) => entry.reasons)).toEqual([
            ['mostBugs'],
            ['mostBugs'],
            ['mostSmells'],
            ['mostSmells'],
            ['smallProject'],
            ['largeProject'],
        ]);
    });

    it('includes findings for projects without a block count', () => {
        const analyses = [analysis(1, {}, [finding('bug')]), analysis(2, { block_count: 20 }, [])];
        const triage = projectTriage(featureMatrix(batchRows(analyses)));

        expect(triage.entries[0]).toMatchObject({
            id: '1',
            reasons: ['mostBugs'],
            blocks: undefined,
        });
        expect(triage.unsized).toBe(1);
    });

    it('does not highlight size extremes in an equal-size cohort', () => {
        const triage = projectTriage(
            featureMatrix(
                batchRows([
                    analysis(1, { block_count: 20 }, []),
                    analysis(2, { block_count: 20 }, []),
                ]),
            ),
        );

        expect(triage).toEqual({ entries: [], unsized: 0 });
    });
});

describe('cohortConceptCoverage', () => {
    it('keeps a concept absent from every report distinct from one reported zero everywhere', () => {
        const rows = batchRows([
            analysis(1, { sequence_count: 0 }),
            analysis(2, { sequence_count: 0 }),
        ]);
        const coverage = cohortConceptCoverage(rows);
        expect(coverage.find((entry) => entry.id === 'sequences')).toEqual({
            id: 'sequences',
            zero: 2,
            unreported: 0,
            total: 2,
            presentIds: [],
        });
        expect(coverage.find((entry) => entry.id === 'loops')).toEqual({
            id: 'loops',
            zero: 0,
            unreported: 2,
            total: 2,
            presentIds: [],
        });
        expect(coverage.find((entry) => entry.id === 'pen')).toBeUndefined();
    });

    it('names exactly the reports that reported a concept present, for a filter to point at', () => {
        const rows = batchRows([
            analysis(1, { variables_block_count: 3 }),
            analysis(2, { variables_block_count: 0 }),
            analysis(3, {}),
        ]);
        const variables = cohortConceptCoverage(rows).find((entry) => entry.id === 'variables');
        expect(variables).toEqual({
            id: 'variables',
            zero: 1,
            unreported: 1,
            total: 3,
            presentIds: ['1'],
        });
    });
});

describe('cohortCtProfile', () => {
    it('never counts a report that never carried the dimension metric as level 0', () => {
        const rows = batchRows([analysis(1, { ct_score_flow_control: 0 }), analysis(2, {})]);
        const flowControl = cohortCtProfile(rows).find((entry) => entry.id === 'flowControl');
        expect(flowControl?.levelIds.map((ids) => ids.length)).toEqual([1, 0, 0, 0]);
        expect(flowControl?.levelIds).toEqual([['1'], [], [], []]);
        expect(flowControl?.unreported).toBe(1);
        expect(flowControl?.total).toBe(2);
    });

    it('reports the median level only among the reports that carried the metric', () => {
        const rows = batchRows([
            analysis(1, { ct_score_logic: 1 }),
            analysis(2, { ct_score_logic: 2 }),
            analysis(3, { ct_score_logic: 3 }),
            analysis(4, {}),
        ]);
        const logic = cohortCtProfile(rows).find((entry) => entry.id === 'logic');
        expect(logic?.median).toBe(2);
        expect(logic?.unreported).toBe(1);
        expect(logic?.total).toBe(4);
    });
});

describe('cohortCtTotal', () => {
    it('summarises reported overall scores without treating an old report as zero', () => {
        const rows = batchRows([
            analysis(1, { ct_score: 3 }),
            analysis(2, { ct_score: 9 }),
            analysis(3, { ct_score: 15 }),
            analysis(4, {}),
        ]);

        expect(cohortCtTotal(rows)).toMatchObject({
            count: 3,
            missing: 1,
            min: 3,
            median: 9,
            max: 15,
        });
    });
});

describe('referenceConceptComparison', () => {
    it('names a concept the reference uses that the class set lacks, with the right count', () => {
        const rows = batchRows([
            analysis(1, { loop_count: 4 }),
            analysis(2, { loop_count: 0 }),
            analysis(3, { loop_count: 0 }),
        ]);
        const { classLacks: gaps } = referenceConceptComparison({ loop_count: 6 }, rows);
        expect(gaps.find((entry) => entry.id === 'loops')).toEqual({
            id: 'loops',
            count: 2,
            unreported: 0,
            total: 3,
        });
    });

    it('produces no comparison row for a concept the reference never reported', () => {
        const rows = batchRows([analysis(1, { loop_count: 0 }), analysis(2, { loop_count: 2 })]);
        const { classLacks: gaps } = referenceConceptComparison({}, rows);
        expect(gaps.find((entry) => entry.id === 'loops')).toBeUndefined();
    });

    it('lists no gap for a concept every project in the class already uses', () => {
        const rows = batchRows([analysis(1, { loop_count: 4 }), analysis(2, { loop_count: 1 })]);
        const { classLacks: gaps } = referenceConceptComparison({ loop_count: 6 }, rows);
        expect(gaps).toEqual([]);
    });

    it('never turns a concept no analyser in the cohort measures into a false gap', () => {
        const rows = batchRows([analysis(1, {}), analysis(2, {})]);
        const { classLacks: gaps } = referenceConceptComparison({ loop_count: 3 }, rows);
        expect(gaps.find((entry) => entry.id === 'loops')).toEqual({
            id: 'loops',
            count: 0,
            unreported: 2,
            total: 2,
        });
    });
});

const syntheticMatrix = (
    rows: ReadonlyArray<{ id: string; name?: string; value?: number }>,
    column = 'metric:x',
): FeatureMatrix => ({
    columns: [column],
    rows: rows.map(({ id, name, value }) => ({
        id,
        name: name ?? id,
        values: value === undefined ? {} : { [column]: value },
    })),
});

describe('metricRankings', () => {
    it('leaves a project that never reported the metric out of both ends, and counts it as excluded', () => {
        const matrix = syntheticMatrix([
            { id: '1', value: 10 },
            { id: '2' },
            { id: '3', value: 20 },
        ]);
        const extremes = metricRankings(matrix, 'metric:x');
        expect(extremes.lowIds).toEqual(['1', '3']);
        expect(extremes.highIds).toEqual(['3', '1']);
        expect(extremes.excluded).toBe(1);
    });

    it('breaks a tie on id, the same way at both ends', () => {
        const matrix = syntheticMatrix([
            { id: '3', value: 10 },
            { id: '1', value: 10 },
            { id: '2', value: 10 },
        ]);
        const extremes = metricRankings(matrix, 'metric:x');
        expect(extremes.lowIds).toEqual(['1', '2', '3']);
        expect(extremes.highIds).toEqual(['1', '2', '3']);
    });

    it('caps each end at the requested sample size rather than returning the whole cohort', () => {
        const matrix = syntheticMatrix(
            Array.from({ length: 9 }, (_, index) => ({ id: String(index), value: index })),
        );
        const extremes = metricRankings(matrix, 'metric:x', 3);
        expect(extremes.lowIds).toEqual(['0', '1', '2']);
        expect(extremes.highIds).toEqual(['8', '7', '6']);
    });

    it('reports nothing at either end for a column no completed report carries', () => {
        const matrix = syntheticMatrix([{ id: '1' }, { id: '2' }]);
        const extremes = metricRankings(matrix, 'metric:x');
        expect(extremes).toEqual({ lowIds: [], highIds: [], typicalIds: [], excluded: 2 });
    });
});

describe('metricRankings typical ids', () => {
    it('finds the projects closest to the column median, nearest first', () => {
        const matrix = syntheticMatrix([
            { id: '1', value: 5 },
            { id: '2', value: 96 },
            { id: '3', value: 480 },
        ]);
        expect(metricRankings(matrix, 'metric:x').typicalIds).toEqual(['2', '1', '3']);
    });

    it('breaks a tie on id, the same way the ends do', () => {
        const matrix = syntheticMatrix([
            { id: '3', value: 10 },
            { id: '1', value: 10 },
            { id: '2', value: 10 },
        ]);
        expect(metricRankings(matrix, 'metric:x').typicalIds).toEqual(['1', '2', '3']);
    });

    it('caps at the requested sample size rather than returning the whole cohort', () => {
        const matrix = syntheticMatrix(
            Array.from({ length: 9 }, (_, index) => ({ id: String(index), value: index })),
        );
        expect(metricRankings(matrix, 'metric:x', 3).typicalIds).toEqual(['4', '3', '5']);
    });

    it('excludes a project that never reported the column, rather than crediting it with some distance from a centre it never measured', () => {
        const matrix = syntheticMatrix([
            { id: '1', value: 10 },
            { id: '2' },
            { id: '3', value: 20 },
        ]);
        const typical = metricRankings(matrix, 'metric:x');
        expect(typical.typicalIds).toEqual(['1', '3']);
        expect(typical.excluded).toBe(1);
    });

    it('reports nothing for a column no completed report carries', () => {
        const matrix = syntheticMatrix([{ id: '1' }, { id: '2' }]);
        expect(metricRankings(matrix, 'metric:x').typicalIds).toEqual([]);
    });
});

describe('searchAndSortFeatureMatrixRows', () => {
    const matrix = syntheticMatrix([
        { id: '1', name: 'Charlie', value: 30 },
        { id: '2', name: 'alice' },
        { id: '3', name: 'Bob', value: 10 },
    ]);

    it('keeps response order until a sort is chosen', () => {
        expect(
            searchAndSortFeatureMatrixRows(matrix.rows, '', undefined).map((row) => row.id),
        ).toEqual(['1', '2', '3']);
    });

    it('sorts by a column and keeps a row with no value at the end, in either direction', () => {
        const ascending = searchAndSortFeatureMatrixRows(matrix.rows, '', {
            column: 'metric:x',
            direction: 'ascending',
        });
        expect(ascending.map((row) => row.id)).toEqual(['3', '1', '2']);
        const descending = searchAndSortFeatureMatrixRows(matrix.rows, '', {
            column: 'metric:x',
            direction: 'descending',
        });
        expect(descending.map((row) => row.id)).toEqual(['1', '3', '2']);
    });

    it('sorts by project name', () => {
        const byName = searchAndSortFeatureMatrixRows(matrix.rows, '', {
            column: 'name',
            direction: 'ascending',
        });
        expect(byName.map((row) => row.id)).toEqual(['2', '3', '1']);
    });

    it('searches by project name, case-insensitively, without touching the rows it was given', () => {
        const original = [...matrix.rows];
        expect(
            searchAndSortFeatureMatrixRows(matrix.rows, 'ob', undefined).map((row) => row.id),
        ).toEqual(['3']);
        expect(matrix.rows).toEqual(original);
    });
});
