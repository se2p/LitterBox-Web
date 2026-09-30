// SPDX-License-Identifier: EUPL-1.2
// SPDX-FileCopyrightText: 2026 LitterBox-Web contributors

import { useTranslation } from 'react-i18next';
import { formatNumber } from '../../i18n';
import { SortableColumnHeader } from '../Table';
import { FAMILY_LABEL_KEYS, type IssueFamily } from '../single-project/issue-family';
import type { OverviewMetric } from '../../lib/overview-metrics';
import {
    batchProjectName,
    STATUS_LABEL_KEYS,
    type BatchFilters,
    type BatchRow,
    type BatchSort,
    type BatchSortColumn,
} from './batch-summary';

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
    onClearProjectSet,
}: {
    rows: BatchRow[];
    families: readonly IssueFamily[];
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
    onClearProjectSet: () => void;
}) {
    const { t } = useTranslation();

    const statusLabel = (status: string): string => {
        const key = STATUS_LABEL_KEYS[status];
        return key ? t(key) : status;
    };

    const showStatusFilter = statuses.length > 1;

    const columnHeader = (column: BatchSortColumn, label: string, numeric: boolean) => (
        <SortableColumnHeader
            key={column}
            label={label}
            className={numeric ? 'batch-table-numeric' : undefined}
            direction={sort?.column === column ? sort.direction : undefined}
            onSort={() => onSort(column)}
        />
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
                {filters.projectSet && (
                    <p className="batch-active-filter-chip">
                        <span className="batch-active-filter-chip-text" role="status">
                            {t('batchActiveProjectFilter', { label: filters.projectSet.label })}
                        </span>
                        <button
                            type="button"
                            className="batch-table-action"
                            onClick={onClearProjectSet}
                        >
                            <span className="visually-hidden">{filters.projectSet.label}</span>{' '}
                            {t('batchShowAllProjects')}
                        </button>
                    </p>
                )}
                <button type="button" onClick={onReset}>
                    {t('issueFilterReset')}
                </button>
            </div>
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
                            {measurements.map((metric) =>
                                columnHeader(
                                    metric,
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
                                <th scope="row" className="batch-table-project">
                                    {row.completed ? (
                                        <button
                                            type="button"
                                            className="batch-result-select"
                                            aria-pressed={selectedId === row.id}
                                            onClick={() => onSelect(row.id)}
                                        >
                                            {batchProjectName(row, t)}
                                            <span className="visually-hidden">
                                                {' '}
                                                {selectedId === row.id
                                                    ? t('batchSelectedProject')
                                                    : t('batchSelectProject')}
                                            </span>
                                        </button>
                                    ) : (
                                        batchProjectName(row, t)
                                    )}
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
