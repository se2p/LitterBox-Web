// SPDX-License-Identifier: EUPL-1.2
// SPDX-FileCopyrightText: 2026 LitterBox-Web contributors

import { sortUnknownLast, type BatchRow, type FinderFrequency } from './batch-summary';
import type { SortState } from '../../lib/useSortState';
import type { MetricBoxPlotBand } from '../metric-box-plot';
import {
    OVERVIEW_METRIC_ORDER,
    overviewMetricNames,
    overviewMetricValue,
    type OverviewMetric,
} from '../../lib/overview-metrics';
import {
    CT_RUBRICS,
    PROGRAMMING_CONCEPT_ORDER,
    conceptCoverage,
    ctProfile,
    ctTotal,
    type ConceptId,
    type CtDimensionId,
    type CtLevel,
    type CtRubricId,
} from '../../lib/program-concepts';
import type { TranslationKey } from '../../i18n/locales';
import { metricDisplayName } from '../capabilities/metrics/metric-utils';
import { FAMILY_LABEL_KEYS, type IssueFamily } from '../single-project/issue-family';

export interface FeatureMatrix {
    columns: string[];
    rows: Array<{ id: string; name: string; values: Record<string, number | undefined> }>;
}

const completed = (rows: readonly BatchRow[]) => rows.filter((row) => row.completed);
const metricEntries = (row: BatchRow): Array<[string, number]> => {
    const metrics = row.analysis.metrics;
    if (!metrics || typeof metrics !== 'object' || Array.isArray(metrics)) return [];
    return Object.entries(metrics).filter(
        (entry): entry is [string, number] =>
            typeof entry[1] === 'number' && Number.isFinite(entry[1]),
    );
};

const OVERVIEW_METRIC_BY_NAME: ReadonlyMap<string, OverviewMetric> = new Map(
    OVERVIEW_METRIC_ORDER.flatMap((metric) =>
        overviewMetricNames(metric).map((name): [string, OverviewMetric] => [name, metric]),
    ),
);

export const CONCERN_RATE_FEATURE = 'findings:concerns';

const CONCERN_FAMILIES = ['family:bug', 'family:smell'] as const;

const concernCount = (values: Readonly<Record<string, number | undefined>>): number =>
    CONCERN_FAMILIES.reduce((sum, column) => sum + (values[column] ?? 0), 0);

const concernRate = (
    values: Readonly<Record<string, number | undefined>>,
    blocks: number,
): number => (concernCount(values) * 1000) / blocks;

export const overviewMetricColumn = (
    columns: readonly string[],
    metric: OverviewMetric,
): string | undefined =>
    columns.find(
        (column) =>
            column.startsWith('metric:') &&
            overviewMetricNames(metric).includes(column.slice('metric:'.length)),
    );

export const metricColumnDefaults = (columns: readonly string[]): string[] => {
    const preferred = OVERVIEW_METRIC_ORDER.flatMap((metric) => {
        const column = overviewMetricColumn(columns, metric);
        return column ? [column] : [];
    });
    return preferred.length > 0 ? preferred : columns.slice(0, 4);
};

export const finderNameIndex = (
    finders: readonly { finderId: string; finderName: string }[],
): ReadonlyMap<string, string> =>
    new Map(finders.map((finder) => [`finder:${finder.finderId}`, finder.finderName]));

export const featureColumnLabels = (
    matrix: FeatureMatrix,
    translate: (key: TranslationKey) => string,
    finders: readonly { finderId: string; finderName: string }[],
): ReadonlyMap<string, string> => {
    const finderNames = finderNameIndex(finders);
    return new Map(
        matrix.columns.map((column) => [
            column,
            featureColumnLabel(column, translate, finderNames),
        ]),
    );
};

export const featureColumnLabel = (
    column: string,
    translate: (key: TranslationKey) => string,
    finderNames: ReadonlyMap<string, string>,
): string => {
    if (column === CONCERN_RATE_FEATURE) return translate('batchConcernRatePerThousandBlocks');
    const family = column.match(/^family:(bug|smell|perfume|other)$/)?.[1] as
        IssueFamily | undefined;
    if (family) return translate(FAMILY_LABEL_KEYS[family]);
    const finderName = finderNames.get(column);
    if (finderName) return finderName;
    if (column.startsWith('metric:'))
        return metricDisplayName(column.slice('metric:'.length), translate);
    return column.replace(/^finder:/, '').replaceAll('_', ' ');
};

export const featureMatrix = (
    rows: readonly BatchRow[],
    unnamedProject: (index: number) => string = (index) => `Project ${index}`,
): FeatureMatrix => {
    const metricNames = new Set<string>();
    const metricNamesByOverview = new Map<OverviewMetric, string>();
    const finders = new Set<string>();
    const done = completed(rows).map((row) => ({ row, metrics: metricEntries(row) }));
    done.forEach(({ row, metrics }) => {
        metrics.forEach(([name]) => {
            const overview = OVERVIEW_METRIC_BY_NAME.get(name);
            if (overview) {
                const current = metricNamesByOverview.get(overview);
                if (
                    current === undefined ||
                    overviewMetricNames(overview).indexOf(name) <
                        overviewMetricNames(overview).indexOf(current)
                )
                    metricNamesByOverview.set(overview, name);
            } else metricNames.add(`metric:${name}`);
        });
        row.finderCounts.forEach((_count, id) => finders.add(`finder:${id}`));
    });
    metricNamesByOverview.forEach((name) => metricNames.add(`metric:${name}`));
    const hasOther = done.some(({ row }) => row.counts.other > 0);
    const blockMetricName = metricNamesByOverview.get('metricBlocks');
    const finderColumns = Array.from(finders).sort();
    const columns = [
        ...Array.from(metricNames).sort(),
        ...['family:bug', 'family:smell', 'family:perfume', ...(hasOther ? ['family:other'] : [])],
        ...(blockMetricName === undefined ? [] : [CONCERN_RATE_FEATURE]),
        ...finderColumns,
    ];
    return {
        columns,
        rows: done.map(({ row, metrics }) => {
            const values: Record<string, number | undefined> = {};
            metricNamesByOverview.forEach((name, metric) => {
                const value = overviewMetricValue(row.analysis.metrics, metric);
                if (value !== undefined) values[`metric:${name}`] = value;
            });
            metrics.forEach(([name, value]) => {
                if (!OVERVIEW_METRIC_BY_NAME.get(name)) values[`metric:${name}`] = value;
            });
            Object.entries(row.counts).forEach(([family, count]) => {
                if (family !== 'other' || hasOther) values[`family:${family}`] = count;
            });
            if (blockMetricName !== undefined) {
                const blocks = values[`metric:${blockMetricName}`];
                if (blocks !== undefined && blocks > 0)
                    values[CONCERN_RATE_FEATURE] = concernRate(values, blocks);
            }
            row.finderCounts.forEach((count, id) => (values[`finder:${id}`] = count));
            finderColumns.forEach((column) => {
                values[column] ??= 0;
            });
            return { id: row.id, name: row.name ?? unnamedProject(row.index + 1), values };
        }),
    };
};

export interface Distribution {
    count: number;
    missing: number;
    zero: number;
    min?: number;
    q1?: number;
    median?: number;
    q3?: number;
    max?: number;
}

/** Box-plot band for a distribution; missing quartiles fall back to the range midpoint. */
export const distributionBand = ({
    min,
    q1,
    median,
    q3,
    max,
}: Distribution): MetricBoxPlotBand | undefined => {
    if (min === undefined || max === undefined) return undefined;
    const midpoint = (min + max) / 2;
    return {
        minimum: min,
        q1: q1 ?? midpoint,
        median: median ?? midpoint,
        q3: q3 ?? midpoint,
        maximum: max,
    };
};

const quantile = (sorted: readonly number[], position: number): number | undefined => {
    if (sorted.length === 0) return undefined;
    const index = (sorted.length - 1) * position;
    const lower = Math.floor(index);
    const upper = Math.ceil(index);
    return sorted[lower] + (sorted[upper] - sorted[lower]) * (index - lower);
};

export const distribution = (values: readonly (number | undefined)[]): Distribution => {
    const present = values
        .filter((value): value is number => value !== undefined)
        .sort((a, b) => a - b);
    return {
        count: present.length,
        missing: values.length - present.length,
        zero: present.filter((value) => value === 0).length,
        min: present[0],
        q1: quantile(present, 0.25),
        median: quantile(present, 0.5),
        q3: quantile(present, 0.75),
        max: present.at(-1),
    };
};

export const metricDistributions = (
    matrix: FeatureMatrix,
): Array<{ column: string; value: Distribution }> =>
    matrix.columns
        .filter((column) => column.startsWith('metric:') || column === CONCERN_RATE_FEATURE)
        .map((column) => ({
            column,
            value: distribution(matrix.rows.map((row) => row.values[column])),
        }));

export const findingColumns = (matrix: FeatureMatrix): string[] =>
    matrix.columns.filter(
        (column) => !column.startsWith('metric:') && column !== CONCERN_RATE_FEATURE,
    );

export interface MetricRankings {
    lowIds: readonly string[];
    highIds: readonly string[];
    typicalIds: readonly string[];
    excluded: number;
}

const METRIC_RANKING_SAMPLE_SIZE = 5;

const byId = (left: { id: string }, right: { id: string }) => left.id.localeCompare(right.id);

export const metricRankings = (
    matrix: FeatureMatrix,
    column: string,
    sampleSize = METRIC_RANKING_SAMPLE_SIZE,
): MetricRankings => {
    const ascending = matrix.rows
        .map((row) => ({ id: row.id, value: row.values[column] }))
        .filter((entry): entry is { id: string; value: number } => entry.value !== undefined)
        .sort((left, right) => left.value - right.value || byId(left, right));
    const excluded = matrix.rows.length - ascending.length;
    const centre = quantile(
        ascending.map((entry) => entry.value),
        0.5,
    );
    if (centre === undefined) return { lowIds: [], highIds: [], typicalIds: [], excluded };
    const highest = ascending
        .slice(-sampleSize)
        .sort((left, right) => right.value - left.value || byId(left, right));
    const typical = [...ascending]
        .sort(
            (left, right) =>
                Math.abs(left.value - centre) - Math.abs(right.value - centre) || byId(left, right),
        )
        .slice(0, sampleSize);
    return {
        lowIds: ascending.slice(0, sampleSize).map((entry) => entry.id),
        highIds: highest.map((entry) => entry.id),
        typicalIds: typical.map((entry) => entry.id),
        excluded,
    };
};

export type FeatureMatrixSort = SortState<string>;

type MatrixRow = FeatureMatrix['rows'][number];

const knownInMatrix = (row: MatrixRow, column: string): boolean =>
    column === 'name' || row.values[column] !== undefined;

const compareMatrixRows = (left: MatrixRow, right: MatrixRow, column: string): number =>
    column === 'name'
        ? left.name.localeCompare(right.name)
        : (left.values[column] ?? 0) - (right.values[column] ?? 0);

export const searchAndSortFeatureMatrixRows = (
    rows: readonly MatrixRow[],
    query: string,
    sort: FeatureMatrixSort | undefined,
): MatrixRow[] => {
    const normalized = query.trim().toLocaleLowerCase();
    const matching = normalized
        ? rows.filter((row) => row.name.toLocaleLowerCase().includes(normalized))
        : [...rows];
    if (sort === undefined) return matching;
    return sortUnknownLast(
        matching,
        sort.direction,
        (row) => knownInMatrix(row, sort.column),
        (left, right) => compareMatrixRows(left, right, sort.column),
        (left, right) => left.id.localeCompare(right.id),
    );
};

export interface CommonIssue extends FinderFrequency {
    prevalence: number;
    density?: number;
    applicable: number;
}

export const commonIssues = (
    rows: readonly BatchRow[],
    finders: readonly FinderFrequency[],
): CommonIssue[] => {
    const done = completed(rows);
    const sized = done
        .map((row) => ({ row, blocks: row.measurements.metricBlocks }))
        .filter(
            (value): value is { row: BatchRow; blocks: number } =>
                value.blocks !== undefined && value.blocks > 0,
        );
    const blocks = sized.reduce((sum, value) => sum + value.blocks, 0);
    const occurrencesByFinder = new Map<string, number>();
    for (const { row } of sized)
        for (const [finderId, count] of row.finderCounts)
            occurrencesByFinder.set(finderId, (occurrencesByFinder.get(finderId) ?? 0) + count);
    return finders.map((finder) => {
        const occurrences = occurrencesByFinder.get(finder.finderId) ?? 0;
        return {
            ...finder,
            prevalence: done.length === 0 ? 0 : finder.analyses / done.length,
            density: blocks === 0 ? undefined : occurrences / blocks,
            applicable: sized.length,
        };
    });
};

const blockColumn = (matrix: FeatureMatrix): string | undefined =>
    overviewMetricColumn(matrix.columns, 'metricBlocks');

export type TriageReasonId = 'mostBugs' | 'mostSmells' | 'smallProject' | 'largeProject';

export interface TriageEntry {
    id: string;
    name: string;
    reasons: TriageReasonId[];
    bugs: number;
    smells: number;
    blocks?: number;
}

export interface ProjectTriage {
    entries: TriageEntry[];
    unsized: number;
}

export const projectTriage = (matrix: FeatureMatrix): ProjectTriage => {
    const sizeColumn = blockColumn(matrix);
    const sized = matrix.rows.filter(
        (row) => sizeColumn !== undefined && row.values[sizeColumn] !== undefined,
    );
    const blocksFor = (row: MatrixRow): number | undefined =>
        sizeColumn ? row.values[sizeColumn] : undefined;
    const counts = (row: MatrixRow) => ({
        bugs: row.values['family:bug'] ?? 0,
        smells: row.values['family:smell'] ?? 0,
    });
    const entries = new Map<string, TriageEntry>();
    const addReason = (row: MatrixRow, reason: TriageReasonId) => {
        const current = entries.get(row.id);
        if (current) {
            if (!current.reasons.includes(reason)) current.reasons.push(reason);
            return;
        }
        const { bugs, smells } = counts(row);
        entries.set(row.id, {
            id: row.id,
            name: row.name,
            reasons: [reason],
            bugs,
            smells,
            blocks: blocksFor(row),
        });
    };
    const byCount = (field: 'bugs' | 'smells') =>
        matrix.rows
            .map((row) => ({ row, count: counts(row)[field] }))
            .filter(({ count }) => count > 0)
            .sort(
                (left, right) =>
                    right.count - left.count || left.row.id.localeCompare(right.row.id),
            )
            .slice(0, 2);
    byCount('bugs').forEach(({ row }) => addReason(row, 'mostBugs'));
    byCount('smells').forEach(({ row }) => addReason(row, 'mostSmells'));

    sized.sort(
        (left, right) => blocksFor(left)! - blocksFor(right)! || left.id.localeCompare(right.id),
    );
    if (sized.length > 1 && blocksFor(sized[0]) !== blocksFor(sized[sized.length - 1])) {
        addReason(sized[0], 'smallProject');
        sized.sort(
            (left, right) =>
                blocksFor(right)! - blocksFor(left)! || left.id.localeCompare(right.id),
        );
        addReason(sized[0], 'largeProject');
    }
    return { entries: [...entries.values()], unsized: matrix.rows.length - sized.length };
};

export interface CohortConceptCoverage {
    id: ConceptId;
    zero: number;
    unreported: number;
    total: number;
    presentIds: readonly string[];
}

export const cohortConceptCoverage = (rows: readonly BatchRow[]): CohortConceptCoverage[] => {
    const coverageByRow = completed(rows).map((row) => ({
        row,
        coverage: new Map(conceptCoverage(row.analysis.metrics).map((entry) => [entry.id, entry])),
    }));
    return PROGRAMMING_CONCEPT_ORDER.map((id) => {
        const presentIds: string[] = [];
        let zero = 0;
        let unreported = 0;
        coverageByRow.forEach(({ row, coverage }) => {
            const entry = coverage.get(id);
            if (entry === undefined || entry.count === undefined) unreported += 1;
            else if (entry.present) presentIds.push(row.id);
            else zero += 1;
        });
        return {
            id,
            zero,
            unreported,
            total: coverageByRow.length,
            presentIds: presentIds.sort(),
        };
    });
};

export const cohortCtTotal = (
    rows: readonly BatchRow[],
    rubric: CtRubricId = 'classic',
): Distribution =>
    distribution(completed(rows).map((row) => ctTotal(row.analysis.metrics, rubric).score));

export interface CohortCtDimension {
    id: CtDimensionId;
    levelIds: readonly (readonly string[])[];
    unreported: number;
    total: number;
    median: number | undefined;
}

export const cohortCtProfile = (
    rows: readonly BatchRow[],
    rubric: CtRubricId = 'classic',
): CohortCtDimension[] => {
    const dimensions = CT_RUBRICS[rubric].dimensions;
    const levelCount = CT_RUBRICS[rubric].levelMax + 1;
    const profileByRow = completed(rows).map((row) => ({
        row,
        profile: new Map(ctProfile(row.analysis.metrics, rubric).map((entry) => [entry.id, entry])),
    }));
    return dimensions.map(({ id }) => {
        const levelIds: string[][] = Array.from({ length: levelCount }, () => []);
        profileByRow.forEach(({ row, profile }) => {
            const level = profile.get(id)?.level;
            if (level !== undefined) levelIds[level].push(row.id);
        });
        levelIds.forEach((ids) => ids.sort());
        const unreported = profileByRow.length - levelIds.reduce((sum, ids) => sum + ids.length, 0);
        return {
            id,
            levelIds,
            unreported,
            total: profileByRow.length,
            median: distribution(profileByRow.map(({ profile }) => profile.get(id)?.level)).median,
        };
    });
};

export interface ReferenceConceptGap {
    id: ConceptId;
    count: number;
    unreported: number;
    total: number;
}

export interface ReferenceConceptExtra {
    id: ConceptId;
    count: number;
    total: number;
}

export const referenceConceptComparison = (
    referenceMetrics: unknown,
    rows: readonly BatchRow[],
): { classLacks: ReferenceConceptGap[]; taskLacks: ReferenceConceptExtra[] } => {
    const reference = new Map(conceptCoverage(referenceMetrics).map((entry) => [entry.id, entry]));
    const cohort = cohortConceptCoverage(rows);
    return {
        classLacks: cohort
            .filter(
                (entry) =>
                    reference.get(entry.id)?.present === true &&
                    (entry.zero > 0 || entry.unreported > 0),
            )
            .map((entry) => ({
                id: entry.id,
                count: entry.zero,
                unreported: entry.unreported,
                total: entry.total,
            })),
        taskLacks: cohort
            .filter((entry) => entry.presentIds.length > 0 && reference.get(entry.id)?.count === 0)
            .map((entry) => ({ id: entry.id, count: entry.presentIds.length, total: entry.total })),
    };
};

export interface ReferenceCtComparison {
    id: CtDimensionId;
    referenceLevel: CtLevel | undefined;
    medianLevel: number | undefined;
}

export const referenceCtComparison = (
    referenceMetrics: unknown,
    rows: readonly BatchRow[],
    rubric: CtRubricId = 'classic',
): ReferenceCtComparison[] => {
    const reference = new Map(
        ctProfile(referenceMetrics, rubric).map((entry) => [entry.id, entry]),
    );
    return cohortCtProfile(rows, rubric).map((entry) => ({
        id: entry.id,
        referenceLevel: reference.get(entry.id)?.level,
        medianLevel: entry.median,
    }));
};

export interface ReferenceSizeComparison {
    metric: OverviewMetric;
    referenceValue: number | undefined;
    medianValue: number | undefined;
}

export const referenceSizeComparison = (
    referenceMetrics: unknown,
    rows: readonly BatchRow[],
): ReferenceSizeComparison[] => {
    const done = completed(rows);
    return OVERVIEW_METRIC_ORDER.map((metric) => ({
        metric,
        referenceValue: overviewMetricValue(referenceMetrics, metric),
        medianValue: distribution(done.map((row) => row.measurements[metric])).median,
    })).filter((entry) => entry.referenceValue !== undefined || entry.medianValue !== undefined);
};
