// SPDX-License-Identifier: EUPL-1.2
// SPDX-FileCopyrightText: 2026 LitterBox-Web contributors

import { useTranslation } from 'react-i18next';
import { formatNumber } from '../../i18n';
import { FAMILY_LABEL_KEYS, type IssueFamily } from '../single-project/issue-family';
import type { OverviewMetric } from '../../lib/overview-metrics';
import {
    STATUS_LABEL_KEYS,
    type BatchFilters,
    type BatchRow,
    type BatchSort,
    type BatchSortColumn,
} from './batch-summary';

/**
 * One row per analysis: the project, where its analysis got to, and what it reported.
 *
 * A class set was a list of cards, one under another, each saying only how many findings there were in total. Thirty
 * of them is a scroll with nothing to compare down: no way to see which project reported the most, and no way to see
 * what the class has in common. A table is the shape this data has always had.
 */
export function BatchResultsTable({
    rows,
    families,
    measurements,
    statuses,
    finders,
    filters,
    sort,
    selectedId,
    onSelect,
    onFilter,
    onSort,
    onReset,
}: {
    rows: BatchRow[];
    /** The finding families this set has anything to say about. */
    families: readonly IssueFamily[];
    /** The measurements at least one analysis in this set reported. */
    measurements: readonly OverviewMetric[];
    statuses: readonly string[];
    finders: readonly { finderId: string; finderName: string }[];
    filters: BatchFilters;
    sort: BatchSort | undefined;
    selectedId?: string;
    onSelect: (id: string) => void;
    onFilter: (changes: Partial<BatchFilters>) => void;
    onSort: (column: BatchSortColumn) => void;
    onReset: () => void;
}) {
    const { t } = useTranslation();

    const statusLabel = (status: string): string => {
        const key = STATUS_LABEL_KEYS[status];
        return key ? t(key) : status;
    };

    // Filtering by the only status there is narrows nothing.
    const showStatusFilter = statuses.length > 1;

    const columnHeader = (column: BatchSortColumn, label: string, numeric: boolean) => (
        <th
            key={column}
            scope="col"
            className={numeric ? 'batch-table-numeric' : undefined}
            aria-sort={sort?.column === column ? sort.direction : 'none'}
        >
            <button type="button" className="batch-sort" onClick={() => onSort(column)}>
                {label}
                <span aria-hidden="true" className="batch-sort-mark">
                    {sort?.column === column ? (sort.direction === 'ascending' ? '▲' : '▼') : '↕'}
                </span>
            </button>
        </th>
    );

    return (
        <>
            <div className="batch-table-filters" role="group" aria-label={t('batchFilters')}>
                {showStatusFilter && (
                    <label>
                        <span>{t('batchFilterStatus')}</span>
                        <select
                            value={filters.status}
                            onChange={(event) => onFilter({ status: event.target.value })}
                        >
                            <option value="all">{t('batchFilterAllStatuses')}</option>
                            {statuses.map((status) => (
                                <option key={status} value={status}>
                                    {statusLabel(status)}
                                </option>
                            ))}
                        </select>
                    </label>
                )}
                <label>
                    <span>{t('issueFilterFamily')}</span>
                    <select
                        value={filters.family}
                        onChange={(event) =>
                            onFilter({ family: event.target.value as IssueFamily | 'all' })
                        }
                    >
                        <option value="all">{t('issueFilterAllFamilies')}</option>
                        {families.map((family) => (
                            <option key={family} value={family}>
                                {t(FAMILY_LABEL_KEYS[family])}
                            </option>
                        ))}
                    </select>
                </label>
                <label>
                    <span>{t('issueFilterFinder')}</span>
                    <select
                        value={filters.finder}
                        onChange={(event) => onFilter({ finder: event.target.value })}
                    >
                        <option value="all">{t('issueFilterAllFinders')}</option>
                        {finders.map((finder) => (
                            <option key={finder.finderId} value={finder.finderId}>
                                {finder.finderName}
                            </option>
                        ))}
                    </select>
                </label>
                <button type="button" onClick={onReset}>
                    {t('issueFilterReset')}
                </button>
            </div>
            {/* Its own scroll region, so a narrow window scrolls the table rather than the page. */}
            <div className="batch-table-scroll">
                <table className="batch-table">
                    <caption className="visually-hidden">{t('batchResultsTitle')}</caption>
                    <thead>
                        <tr>
                            {columnHeader('name', t('batchProject'), false)}
                            {families.map((family) =>
                                columnHeader(family, t(FAMILY_LABEL_KEYS[family]), true),
                            )}
                            {columnHeader('total', t('batchTotalFindings'), true)}
                            {/* What the projects are, beside what was found in them. A row of finding counts
                                says nothing about whether the project it came from is ten blocks or a
                                thousand. */}
                            {measurements.map((metric) =>
                                columnHeader(
                                    metric,
                                    // Short where a column heading has to fit; the full name is in the file a
                                    // teacher downloads, which is read away from this table.
                                    t(metric === 'metricCtScore' ? 'metricCtScoreShort' : metric),
                                    true,
                                ),
                            )}
                        </tr>
                    </thead>
                    <tbody>
                        {rows.map((row) => (
                            <tr
                                key={row.id}
                                className={selectedId === row.id ? 'batch-row-selected' : undefined}
                            >
                                {/* The project's own name is what opens it. A column of its own, headed with
                                    nothing and holding "View project result" on every row, was the widest thing
                                    in the table after the names themselves, and it was what pushed the table
                                    past the edge of its scroll region. What the press does is still said, for
                                    anyone who is hearing the row rather than looking at it. */}
                                <th scope="row" className="batch-table-project">
                                    {row.completed ? (
                                        <button
                                            type="button"
                                            className="batch-result-select"
                                            aria-pressed={selectedId === row.id}
                                            onClick={() => onSelect(row.id)}
                                        >
                                            {row.name ?? `${t('batchProject')} ${row.index + 1}`}
                                            <span className="visually-hidden">
                                                {' '}
                                                {selectedId === row.id
                                                    ? t('batchSelectedProject')
                                                    : t('batchSelectProject')}
                                            </span>
                                        </button>
                                    ) : (
                                        (row.name ?? `${t('batchProject')} ${row.index + 1}`)
                                    )}
                                    {/* Where the analysis got to, for the rows where that is not "finished". A
                                        column of its own said "Analysis complete" down almost every row and
                                        carried the failure reasons as well, which is a sentence rather than a
                                        figure: it took more width than every count in the table together and
                                        left the names three lines deep. The reasons are gathered under the
                                        table, where a sentence has the width of the card to be read in. */}
                                    {!row.completed && (
                                        <span className={`batch-status batch-status-${row.status}`}>
                                            {statusLabel(row.status)}
                                        </span>
                                    )}
                                </th>
                                {families.map((family) => (
                                    <td
                                        key={family}
                                        className="batch-table-numeric"
                                        data-label={t(FAMILY_LABEL_KEYS[family])}
                                    >
                                        {/* An unfinished analysis has no findings yet, and a failed one never
                                            will. Nought would say it reported none. */}
                                        {row.completed ? formatNumber(row.counts[family]) : '—'}
                                    </td>
                                ))}
                                <td
                                    className="batch-table-numeric"
                                    data-label={t('batchTotalFindings')}
                                >
                                    {row.completed ? formatNumber(row.total) : '—'}
                                </td>
                                {measurements.map((metric) => {
                                    const value = row.measurements[metric];
                                    return (
                                        <td
                                            key={metric}
                                            className="batch-table-numeric"
                                            data-label={t(metric)}
                                        >
                                            {/* A measurement this report did not carry is absent, not nought:
                                                nought blocks is a claim about the project. */}
                                            {value === undefined ? '—' : formatNumber(value)}
                                        </td>
                                    );
                                })}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
            {rows.length === 0 && <p className="batch-table-empty">{t('batchNoMatchingRows')}</p>}
        </>
    );
}
