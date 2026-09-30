// SPDX-License-Identifier: EUPL-1.2
// SPDX-FileCopyrightText: 2026 LitterBox-Web contributors

import type { BatchAnalysis } from '../../api/submissions';
import type { SortDirection } from '../Table';
import type { SortState } from '../../lib/useSortState';
import type { TranslationKey } from '../../i18n/locales';
import {
    OVERVIEW_METRIC_ORDER,
    overviewMetricValue,
    type OverviewMetric,
} from '../../lib/overview-metrics';
import { FAMILIES, issueFamily, type IssueFamily } from '../single-project/issue-family';

export const STATUS_LABEL_KEYS: Readonly<Record<string, TranslationKey>> = {
    completed: 'analysisStatusCompleted',
    failed: 'analysisStatusFailed',
    cancelled: 'analysisStatusCancelled',
    processing: 'analysisStatusProcessing',
    running: 'analysisStatusProcessing',
    queued: 'analysisStatusQueued',
};

export type BatchSortColumn = 'name' | 'total' | IssueFamily | OverviewMetric;

const isMeasurement = (column: BatchSortColumn): column is OverviewMetric =>
    (OVERVIEW_METRIC_ORDER as readonly string[]).includes(column);
export type BatchSort = SortState<BatchSortColumn>;

export interface BatchFilters {
    status: string;
    family: IssueFamily | 'all';
    finder: string;
    projectSet?: { key: string; ids: ReadonlySet<string>; label: string };
}

export const NO_BATCH_FILTERS: BatchFilters = { status: 'all', family: 'all', finder: 'all' };

export interface BatchRow {
    id: string;
    index: number;
    analysis: BatchAnalysis;
    name: string | null;
    status: string;
    completed: boolean;
    counts: Record<IssueFamily, number>;
    total: number;
    measurements: Partial<Record<OverviewMetric, number>>;
    finderCounts: ReadonlyMap<string, number>;
}

export const batchProjectName = (
    row: Pick<BatchRow, 'name' | 'index'>,
    t: (key: 'batchProject') => string,
): string => row.name ?? unnamedProjectLabel(t)(row.index + 1);

export const unnamedProjectLabel =
    (t: (key: 'batchProject') => string) =>
    (position: number): string =>
        `${t('batchProject')} ${position}`;

export interface FinderFrequency {
    finderId: string;
    finderName: string;
    family: IssueFamily;
    occurrences: number;
    analyses: number;
}

export interface BatchSummary {
    rows: BatchRow[];
    families: IssueFamily[];
    measurements: OverviewMetric[];
    completedCount: number;
    failedCount: number;
    withoutFindings: number;
    totals: Record<IssueFamily, number>;
    totalFindings: number;
    concerns: number;
    finders: FinderFrequency[];
}

const statusOf = (analysis: BatchAnalysis): string => String(analysis.status ?? '').toLowerCase();

const emptyCounts = (): Record<IssueFamily, number> => ({
    bug: 0,
    smell: 0,
    perfume: 0,
    other: 0,
});

export const batchRows = (analyses: readonly BatchAnalysis[]): BatchRow[] =>
    analyses.map((analysis, index) => {
        const status = statusOf(analysis);
        const completed = status === 'completed';
        const issues = completed && Array.isArray(analysis.issues) ? analysis.issues : [];
        const counts = emptyCounts();
        const finderCounts = new Map<string, number>();
        issues.forEach((issue) => {
            counts[issueFamily(issue.type)] += 1;
            const finderId = issue.finderId?.trim();
            if (finderId) finderCounts.set(finderId, (finderCounts.get(finderId) ?? 0) + 1);
        });
        const measurements: Partial<Record<OverviewMetric, number>> = {};
        if (completed) {
            OVERVIEW_METRIC_ORDER.forEach((metric) => {
                const value = overviewMetricValue(analysis.metrics, metric);
                if (value !== undefined) measurements[metric] = value;
            });
        }
        return {
            id: String(analysis.id ?? index),
            index,
            analysis,
            name: analysis.name ?? null,
            status,
            completed,
            counts,
            total: issues.length,
            measurements,
            finderCounts,
        };
    });

const finderIdentity = (
    analysis: BatchAnalysis,
    finderId: string,
): { name: string; family: IssueFamily } => {
    const issue = (Array.isArray(analysis.issues) ? analysis.issues : []).find(
        (candidate) => candidate.finderId?.trim() === finderId,
    );
    return { name: issue?.finderName?.trim() || finderId, family: issueFamily(issue?.type) };
};

export const summarizeBatch = (analyses: readonly BatchAnalysis[]): BatchSummary => {
    const rows = batchRows(analyses);
    const completedRows = rows.filter((row) => row.completed);
    const failedCount = rows.filter((row) => row.status === 'failed').length;
    const totals = emptyCounts();
    const occurrences = new Map<
        string,
        { name: string; family: IssueFamily; count: number; analyses: number }
    >();
    completedRows.forEach((row) => {
        FAMILIES.forEach((family) => {
            totals[family] += row.counts[family];
        });
        row.finderCounts.forEach((count, finderId) => {
            const known = occurrences.get(finderId) ?? {
                ...finderIdentity(row.analysis, finderId),
                count: 0,
                analyses: 0,
            };
            known.count += count;
            known.analyses += 1;
            occurrences.set(finderId, known);
        });
    });
    return {
        rows,
        families: FAMILIES.filter((family) => family !== 'other' || totals.other > 0),
        measurements: OVERVIEW_METRIC_ORDER.filter((metric) =>
            completedRows.some((row) => row.measurements[metric] !== undefined),
        ),
        completedCount: completedRows.length,
        failedCount,
        withoutFindings: completedRows.filter((row) => row.total === 0).length,
        totals,
        totalFindings: FAMILIES.reduce((sum, family) => sum + totals[family], 0),
        concerns: totals.bug + totals.smell,
        finders: Array.from(occurrences, ([finderId, value]) => ({
            finderId,
            finderName: value.name,
            family: value.family,
            occurrences: value.count,
            analyses: value.analyses,
        })).sort(
            (left, right) =>
                right.analyses - left.analyses ||
                right.occurrences - left.occurrences ||
                left.finderName.localeCompare(right.finderName),
        ),
    };
};

const compareRows = (left: BatchRow, right: BatchRow, column: BatchSortColumn): number => {
    if (column === 'name') {
        return (left.name ?? '').localeCompare(right.name ?? '');
    }
    if (isMeasurement(column)) {
        return (left.measurements[column] ?? 0) - (right.measurements[column] ?? 0);
    }
    const findings = (row: BatchRow) => (column === 'total' ? row.total : row.counts[column]);
    return findings(left) - findings(right);
};

const known = (row: BatchRow, column: BatchSortColumn): boolean => {
    if (column === 'name') return true;
    if (!row.completed) return false;
    return !isMeasurement(column) || row.measurements[column] !== undefined;
};

export const sortUnknownLast = <T>(
    rows: readonly T[],
    direction: SortDirection,
    known: (row: T) => boolean,
    compare: (left: T, right: T) => number,
    tieBreak: (left: T, right: T) => number,
): T[] =>
    [...rows].sort((left, right) => {
        const leftKnown = known(left);
        const rightKnown = known(right);
        if (leftKnown !== rightKnown) return leftKnown ? -1 : 1;
        const order = compare(left, right);
        return (direction === 'descending' ? -order : order) || tieBreak(left, right);
    });

export const filterAndSortBatchRows = (
    rows: readonly BatchRow[],
    filters: BatchFilters,
    sort: BatchSort | undefined,
): BatchRow[] => {
    const visible = rows.filter((row) => {
        if (filters.status !== 'all' && row.status !== filters.status) return false;
        if (filters.family !== 'all' && !(row.completed && row.counts[filters.family] > 0))
            return false;
        if (filters.finder !== 'all' && !(row.completed && row.finderCounts.has(filters.finder)))
            return false;
        if (filters.projectSet && !filters.projectSet.ids.has(row.id)) return false;
        return true;
    });
    if (sort === undefined) return visible;
    return sortUnknownLast(
        visible,
        sort.direction,
        (row) => known(row, sort.column),
        (left, right) => compareRows(left, right, sort.column),
        (left, right) => left.index - right.index,
    );
};
