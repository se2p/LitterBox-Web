// SPDX-License-Identifier: EUPL-1.2
// SPDX-FileCopyrightText: 2026 LitterBox-Web contributors

import type { OverviewMetric } from '../../lib/overview-metrics';
import type { IssueFamily } from '../single-project/issue-family';
import type { BatchRow, FinderFrequency } from './batch-summary';

/** What a teacher chose to take away. The project and how its analysis ended are always in it. */
export interface CsvSections {
    families: boolean;
    measurements: boolean;
    finders: boolean;
}

export interface CsvLabels {
    project: string;
    status: string;
    total: string;
    family: (family: IssueFamily) => string;
    measurement: (metric: OverviewMetric) => string;
    statusOf: (status: string) => string;
    /** Names a row whose analysis reported no name, matching what the table shows in its place. */
    unnamedProject: (index: number) => string;
}

/**
 * A spreadsheet may treat a cell beginning with one of these as a formula, and these cells hold filenames a class
 * chose. Prefixing with an apostrophe is the ordinary way to say "this is text" and survives a round trip.
 */
const formulaLead = /^[=+\-@\t\r]/;

const field = (value: string): string => {
    const guarded = formulaLead.test(value) ? `'${value}` : value;
    return /[",\r\n]/.test(guarded) ? `"${guarded.replaceAll('"', '""')}"` : guarded;
};

/**
 * Plain digits, never the reader's own number formatting: a spreadsheet has to parse these back, and "1.234" means
 * two different numbers depending on who wrote it.
 */
const numeric = (value: number | undefined): string => (value === undefined ? '' : String(value));

/** How many times each finder reported in one analysis, by the same rule the frequency list uses. */
const finderCounts = (row: BatchRow): Map<string, number> => {
    const counts = new Map<string, number>();
    (Array.isArray(row.analysis.issues) ? row.analysis.issues : []).forEach((issue) => {
        const finderId = issue.finderId?.trim();
        if (!finderId) return;
        counts.set(finderId, (counts.get(finderId) ?? 0) + 1);
    });
    return counts;
};

/**
 * The class set as a table a teacher can keep: one row per analysis, one column per thing they asked for.
 *
 * Nothing here is derived that the page does not already show. A cell is empty rather than nought wherever the page
 * shows a dash, because an analysis that has not finished has not reported nought findings — it has reported
 * nothing at all, and a nought in a spreadsheet is a number somebody will average.
 */
export const batchCsv = ({
    rows,
    families,
    measurements,
    finders,
    sections,
    labels,
}: {
    rows: readonly BatchRow[];
    families: readonly IssueFamily[];
    measurements: readonly OverviewMetric[];
    finders: readonly FinderFrequency[];
    sections: CsvSections;
    labels: CsvLabels;
}): string => {
    const header = [labels.project, labels.status];
    if (sections.families) header.push(...families.map(labels.family), labels.total);
    if (sections.measurements) header.push(...measurements.map(labels.measurement));
    if (sections.finders) header.push(...finders.map((finder) => finder.finderName));

    const lines = [header.map(field).join(',')];
    rows.forEach((row) => {
        const counts = sections.finders ? finderCounts(row) : undefined;
        const cells = [
            field(row.name?.trim() || labels.unnamedProject(row.index + 1)),
            field(labels.statusOf(row.status)),
        ];
        if (sections.families) {
            families.forEach((family) =>
                cells.push(numeric(row.completed ? row.counts[family] : undefined)),
            );
            cells.push(numeric(row.completed ? row.total : undefined));
        }
        if (sections.measurements)
            measurements.forEach((metric) => cells.push(numeric(row.measurements[metric])));
        if (sections.finders)
            finders.forEach((finder) =>
                cells.push(
                    numeric(row.completed ? (counts?.get(finder.finderId) ?? 0) : undefined),
                ),
            );
        lines.push(cells.join(','));
    });
    // CRLF, which is what the CSV convention says and what the least forgiving spreadsheet expects.
    return `${lines.join('\r\n')}\r\n`;
};

/**
 * A byte-order mark in front, so a spreadsheet opening this by double-click reads it as UTF-8 rather than guessing
 * from the current machine's code page and mangling every project name with an umlaut in it.
 */
const BYTE_ORDER_MARK = '\uFEFF';

export const csvBlob = (content: string): Blob =>
    new Blob([`${BYTE_ORDER_MARK}${content}`], { type: 'text/csv;charset=utf-8' });
