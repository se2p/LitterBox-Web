// SPDX-License-Identifier: EUPL-1.2
// SPDX-FileCopyrightText: 2026 LitterBox-Web contributors

import type { OverviewMetric } from '../../lib/overview-metrics';
import { BYTE_ORDER_MARK, csvDocument, field, numeric } from '../../lib/csv';
import type { IssueFamily } from '../single-project/issue-family';
import type { BatchRow, FinderFrequency } from './batch-summary';
import type { FeatureMatrix } from './batch-analytics';

export interface CsvLabels {
    project: string;
    status: string;
    total: string;
    family: (family: IssueFamily) => string;
    measurement: (metric: OverviewMetric) => string;
    statusOf: (status: string) => string;
    unnamedProject: (index: number) => string;
}

export const batchCsv = ({
    rows,
    families,
    measurements,
    finders,
    labels,
}: {
    rows: readonly BatchRow[];
    families: readonly IssueFamily[];
    measurements: readonly OverviewMetric[];
    finders: readonly FinderFrequency[];
    labels: CsvLabels;
}): string => {
    const header = [labels.project, labels.status];
    if (families.length > 0) header.push(...families.map(labels.family), labels.total);
    header.push(...measurements.map(labels.measurement));
    header.push(...finders.map((finder) => finder.finderName));

    const lines = [header.map(field)];
    rows.forEach((row) => {
        const cells = [
            field(row.name?.trim() || labels.unnamedProject(row.index + 1)),
            field(labels.statusOf(row.status)),
        ];
        if (families.length > 0) {
            families.forEach((family) =>
                cells.push(numeric(row.completed ? row.counts[family] : undefined)),
            );
            cells.push(numeric(row.completed ? row.total : undefined));
        }
        measurements.forEach((metric) => cells.push(numeric(row.measurements[metric])));
        finders.forEach((finder) =>
            cells.push(
                numeric(row.completed ? (row.finderCounts.get(finder.finderId) ?? 0) : undefined),
            ),
        );
        lines.push(cells);
    });
    return csvDocument(lines);
};

export interface CsvDataset {
    name: string;
    content: string;
}

export interface FeatureMatrixCsvLabels {
    project: string;
    column: (column: string) => string;
}

export interface FindingProfileCsvLabels {
    project: string;
    status: string;
    finderId: string;
    finder: string;
    family: string;
    occurrences: string;
    statusOf: (status: string) => string;
    familyOf: (family: string) => string;
    unnamedProject: (index: number) => string;
}

export const csvBundleBlob = async (datasets: readonly CsvDataset[]): Promise<Blob> => {
    const { default: JSZip } = await import('jszip');
    const archive = new JSZip();
    datasets.forEach((dataset) =>
        archive.file(dataset.name, `${BYTE_ORDER_MARK}${dataset.content}`),
    );
    return archive.generateAsync({ type: 'blob' });
};

export const featureMatrixCsv = (
    matrix: FeatureMatrix,
    columns: readonly string[],
    labels: FeatureMatrixCsvLabels = {
        project: 'Project',
        column: (column) => column,
    },
): string => {
    return csvDocument([
        [labels.project, ...columns.map(labels.column)].map(field),
        ...matrix.rows.map((row) => [
            field(row.name),
            ...columns.map((column) => numeric(row.values[column])),
        ]),
    ]);
};

export const findingProfileCsv = (
    rows: readonly BatchRow[],
    finderIds: readonly string[],
    labels: FindingProfileCsvLabels = {
        project: 'Project',
        status: 'Status',
        finderId: 'Finder ID',
        finder: 'Finder',
        family: 'Family',
        occurrences: 'Occurrences',
        statusOf: (status) => status,
        familyOf: (family) => family,
        unnamedProject: (index) => `Project ${index}`,
    },
): string => {
    const selectedFinderIds = new Set(
        finderIds.length > 0
            ? finderIds
            : rows.flatMap((row) =>
                  (Array.isArray(row.analysis.issues) ? row.analysis.issues : []).flatMap(
                      (issue) => {
                          const id = issue.finderId?.trim();
                          return id ? [id] : [];
                      },
                  ),
              ),
    );
    const lines = [
        [
            labels.project,
            labels.status,
            labels.finderId,
            labels.finder,
            labels.family,
            labels.occurrences,
        ].map(field),
    ];
    rows.filter((row) => row.completed).forEach((row) => {
        const perFinder = new Map<string, { name: string; family: string; count: number }>();
        (Array.isArray(row.analysis.issues) ? row.analysis.issues : []).forEach((issue) => {
            const id = issue.finderId?.trim();
            if (!id || !selectedFinderIds.has(id)) return;
            const current = perFinder.get(id) ?? {
                name: issue.finderName?.trim() || id,
                family: String(issue.type ?? ''),
                count: 0,
            };
            current.count += 1;
            perFinder.set(id, current);
        });
        perFinder.forEach((finding, id) =>
            lines.push([
                field(row.name ?? labels.unnamedProject(row.index + 1)),
                field(labels.statusOf(row.status)),
                field(id),
                field(finding.name),
                field(labels.familyOf(finding.family)),
                numeric(finding.count),
            ]),
        );
    });
    return csvDocument(lines);
};
