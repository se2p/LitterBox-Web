// SPDX-License-Identifier: EUPL-1.2
// SPDX-FileCopyrightText: 2026 LitterBox-Web contributors

import type { BatchAnalysis } from '../../api/submissions';
import type { TranslationKey } from '../../i18n/locales';
import {
    OVERVIEW_METRIC_ORDER,
    overviewMetricValue,
    type OverviewMetric,
} from '../../lib/overview-metrics';
import { FAMILIES, issueFamily, type IssueFamily } from '../single-project/issue-family';

// Shared by the results table and the CSV export, so an analysis status reads the same word in both places. Lives
// here rather than in either component because both already import their row/summary types from this module.
export const STATUS_LABEL_KEYS: Readonly<Record<string, TranslationKey>> = {
    completed: 'analysisStatusCompleted',
    failed: 'analysisStatusFailed',
    cancelled: 'analysisStatusCancelled',
    processing: 'analysisStatusProcessing',
    running: 'analysisStatusProcessing',
    queued: 'analysisStatusQueued',
};

/** Status is not among them: it has no column of its own to head, and the filter above the table selects one. */
export type BatchSortColumn = 'name' | 'total' | IssueFamily | OverviewMetric;

const isMeasurement = (column: BatchSortColumn): column is OverviewMetric =>
    (OVERVIEW_METRIC_ORDER as readonly string[]).includes(column);
export type BatchSortDirection = 'ascending' | 'descending';

export interface BatchSort {
    column: BatchSortColumn;
    direction: BatchSortDirection;
}

export interface BatchFilters {
    /** A processing status, or 'all'. */
    status: string;
    family: IssueFamily | 'all';
    /** A finder id, or 'all'. */
    finder: string;
}

export const NO_BATCH_FILTERS: BatchFilters = { status: 'all', family: 'all', finder: 'all' };

export interface BatchRow {
    /** Identifies the analysis in the page's selection, matching what the result page already uses. */
    id: string;
    /** Where this analysis sat in the response, and the last tie-break for every sort. */
    index: number;
    analysis: BatchAnalysis;
    name: string | null;
    status: string;
    completed: boolean;
    /** Findings per family, and their total. Meaningless until the analysis has finished, hence `completed`. */
    counts: Record<IssueFamily, number>;
    total: number;
    /** What the analysis measured about the project itself. Absent for any the report did not carry. */
    measurements: Partial<Record<OverviewMetric, number>>;
    finderIds: ReadonlySet<string>;
}

export interface FinderFrequency {
    finderId: string;
    finderName: string;
    /** Taken from the first occurrence seen. A finder reports one kind of thing, and this is the kind it reported. */
    family: IssueFamily;
    occurrences: number;
    analyses: number;
}

export interface BatchSummary {
    rows: BatchRow[];
    /**
     * The families worth a column. "Other" is the group LitterBox did not put anywhere else, and a column of
     * noughts headed with a name that explains nothing is worse than no column: it invites the question and
     * answers it with a nought.
     */
    families: IssueFamily[];
    /** The measurements at least one finished analysis in this set actually reported. */
    measurements: OverviewMetric[];
    completedCount: number;
    failedCount: number;
    /** Completed analyses that reported nothing. Not "clean projects" — nothing was found, which is not the same. */
    withoutFindings: number;
    totals: Record<IssueFamily, number>;
    totalFindings: number;
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
        const finderIds = new Set<string>();
        issues.forEach((issue) => {
            counts[issueFamily(issue.type)] += 1;
            const finderId = issue.finderId?.trim();
            if (finderId) finderIds.add(finderId);
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
            finderIds,
        };
    });

/**
 * What a class set adds up to, over the analyses that finished.
 *
 * An analysis still running has no findings yet, and one that failed never will; counting either as nought would
 * report a class as having fewer problems than it has because half its projects have not been looked at.
 *
 * This counts rows and nothing else. How far the whole run got is the submission's own business — its analyses
 * appear here only once they have been written out — and is read from its counts rather than inferred from these.
 */
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
        const seenHere = new Set<string>();
        (Array.isArray(row.analysis.issues) ? row.analysis.issues : []).forEach((issue) => {
            const finderId = issue.finderId?.trim();
            // A finding with no id stays its own: grouping by its displayed name would count one finder's work
            // under another's on the strength of a translation.
            if (!finderId) return;
            const known = occurrences.get(finderId) ?? {
                name: issue.finderName?.trim() || finderId,
                family: issueFamily(issue.type),
                count: 0,
                analyses: 0,
            };
            known.count += 1;
            if (!seenHere.has(finderId)) {
                known.analyses += 1;
                seenHere.add(finderId);
            }
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
        // Only reached for two rows that both carry the measurement; the rest are grouped away below.
        return (left.measurements[column] ?? 0) - (right.measurements[column] ?? 0);
    }
    const findings = (row: BatchRow) => (column === 'total' ? row.total : row.counts[column]);
    return findings(left) - findings(right);
};

/** Whether this row has anything to say about this column at all. */
const known = (row: BatchRow, column: BatchSortColumn): boolean => {
    if (column === 'name') return true;
    if (!row.completed) return false;
    return !isMeasurement(column) || row.measurements[column] !== undefined;
};

/**
 * Sorting by a number says nothing about an analysis that has none, so those keep to the end either way — whether
 * the analysis has not finished or the report simply did not carry that measurement.
 */
const unknownLast = (left: BatchRow, right: BatchRow, column: BatchSortColumn): number =>
    known(left, column) === known(right, column) ? 0 : known(left, column) ? -1 : 1;

/**
 * The rows a teacher is looking at, in the order they asked for. Never in place: the response arrays belong to the
 * submission and are read again on the next render.
 */
export const filterAndSortBatchRows = (
    rows: readonly BatchRow[],
    filters: BatchFilters,
    sort: BatchSort | undefined,
): BatchRow[] => {
    const visible = rows.filter((row) => {
        if (filters.status !== 'all' && row.status !== filters.status) return false;
        // A family or finder filter is a question about findings, which only a finished analysis has.
        if (filters.family !== 'all' && !(row.completed && row.counts[filters.family] > 0))
            return false;
        if (filters.finder !== 'all' && !(row.completed && row.finderIds.has(filters.finder)))
            return false;
        return true;
    });
    if (sort === undefined) return visible;
    return [...visible].sort((left, right) => {
        const grouped = unknownLast(left, right, sort.column);
        if (grouped !== 0) return grouped;
        const order = compareRows(left, right, sort.column);
        const directed = sort.direction === 'descending' ? -order : order;
        // Response order breaks every tie, so the same data always lands in the same order.
        return directed || left.index - right.index;
    });
};
