// SPDX-License-Identifier: EUPL-1.2
// SPDX-FileCopyrightText: 2026 LitterBox-Web contributors

import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { formatNumber, formatRate } from '../../i18n';
import { MetricBoxPlot } from '../MetricBoxPlot';
import { SortableColumnHeader } from '../Table';
import { useSortState } from '../../lib/useSortState';
import { ProjectSetFilterButton } from './ProjectSetFilterButton';
import { useProjectSetFilter } from './project-set-filter';
import {
    distributionBand,
    featureColumnLabels,
    findingColumns,
    metricColumnDefaults,
    metricRankings,
    searchAndSortFeatureMatrixRows,
    type Distribution,
    type FeatureMatrix,
    type MetricRankings,
} from './batch-analytics';

const display = (value: number | undefined) => (value === undefined ? '—' : formatRate(value));

const FEATURE_MATRIX_ROW_CAP = 50;

const METRIC_ENDS = [
    {
        end: 'low',
        ids: 'lowIds',
        labelKey: 'batchMetricExtremeLowLabel',
        textKey: 'batchMetricShowLowest',
    },
    {
        end: 'high',
        ids: 'highIds',
        labelKey: 'batchMetricExtremeHighLabel',
        textKey: 'batchMetricShowHighest',
    },
    {
        end: 'typical',
        ids: 'typicalIds',
        labelKey: 'batchMetricExtremeTypicalLabel',
        textKey: 'batchMetricShowTypical',
    },
] as const;

function MetricDistributionCard({
    column,
    label,
    value,
    total,
    rankings,
}: {
    column: string;
    label: string;
    value: Distribution;
    total: number;
    rankings: MetricRankings;
}) {
    const { t } = useTranslation();
    const projectSetFilter = useProjectSetFilter();
    const band = distributionBand(value);
    const coverage = total === 0 ? 0 : (value.count / total) * 100;

    return (
        <article className="batch-metric-card">
            <h6>{label}</h6>
            <div
                className="batch-metric-coverage-bar"
                role="img"
                aria-label={t('batchMetricCoverageLabel', {
                    present: formatNumber(value.count),
                    total: formatNumber(total),
                })}
            >
                <span style={{ width: `${coverage}%` }} />
            </div>
            <p className="batch-metric-coverage-copy">
                {t('batchMetricCoverageCompact', {
                    present: formatNumber(value.count),
                    total: formatNumber(total),
                    missing: formatNumber(value.missing),
                    zero: formatNumber(value.zero),
                })}
            </p>
            {band && (
                <>
                    <MetricBoxPlot
                        band={band}
                        ariaLabel={t('batchMetricDistributionLabel', {
                            median: display(value.median),
                            q1: display(value.q1),
                            q3: display(value.q3),
                            min: display(value.min),
                            max: display(value.max),
                        })}
                    />
                    <div className="metric-box-plot-labels" aria-hidden="true">
                        <span>{display(value.min)}</span>
                        <strong>{display(value.median)}</strong>
                        <span>{display(value.max)}</span>
                    </div>
                </>
            )}
            {projectSetFilter && rankings.lowIds.length > 0 && (
                <div className="batch-metric-extremes">
                    {METRIC_ENDS.map(({ end, ids, labelKey, textKey }) => {
                        const projectIds = rankings[ids];
                        if (projectIds.length === 0) return null;
                        return (
                            <ProjectSetFilterButton
                                key={end}
                                filterKey={`${column}:${end}`}
                                ids={projectIds}
                                label={t('batchProjectSetFilterLabel', {
                                    primary: label,
                                    secondary: t(labelKey),
                                })}
                                hiddenLabel={label}
                            >
                                {t(textKey, { count: formatNumber(projectIds.length) })}
                            </ProjectSetFilterButton>
                        );
                    })}
                </div>
            )}
            {projectSetFilter && rankings.excluded > 0 && (
                <p className="batch-metric-coverage-copy">
                    {t('batchMetricExtremesExcluded', {
                        count: rankings.excluded,
                        formatted: formatNumber(rankings.excluded),
                    })}
                </p>
            )}
        </article>
    );
}

export function BatchMetricPanels({
    matrix,
    distributions,
    finders,
    selectedMetricColumns,
    onSelectedMetricColumnsChange,
    includeFindingColumns,
    onIncludeFindingColumnsChange,
    selectedMatrixColumns,
}: {
    matrix: FeatureMatrix;
    distributions: readonly { column: string; value: Distribution }[];
    finders: readonly { finderId: string; finderName: string }[];
    selectedMetricColumns: ReadonlySet<string>;
    onSelectedMetricColumnsChange: (next: ReadonlySet<string>) => void;
    includeFindingColumns: boolean;
    onIncludeFindingColumnsChange: (next: boolean) => void;
    selectedMatrixColumns: readonly string[];
}) {
    const { t } = useTranslation();
    const metricColumns = useMemo(
        () => distributions.map((distribution) => distribution.column),
        [distributions],
    );
    const findingColumnCount = useMemo(() => findingColumns(matrix).length, [matrix]);
    const labels = useMemo(() => featureColumnLabels(matrix, t, finders), [matrix, t, finders]);
    const label = (column: string) => labels.get(column)!;
    const [metricView, setMetricView] = useState<'summary' | 'matrix'>('summary');
    const [metricQuery, setMetricQuery] = useState('');
    const [matrixQuery, setMatrixQuery] = useState('');
    const { sort: matrixSort, toggle: toggleMatrixSort } = useSortState<string>();

    const normalizedMetricQuery = metricQuery.trim().toLocaleLowerCase();
    const visibleMetricChoices = distributions.filter(({ column }) =>
        label(column).toLocaleLowerCase().includes(normalizedMetricQuery),
    );
    const selectedDistributions = useMemo(
        () => distributions.filter(({ column }) => selectedMetricColumns.has(column)),
        [distributions, selectedMetricColumns],
    );
    const rankings = useMemo(
        () =>
            new Map(
                selectedDistributions.map(({ column }) => [column, metricRankings(matrix, column)]),
            ),
        [matrix, selectedDistributions],
    );
    const matchingMatrixRows = useMemo(
        () =>
            metricView === 'matrix'
                ? searchAndSortFeatureMatrixRows(matrix.rows, matrixQuery, matrixSort)
                : [],
        [metricView, matrix.rows, matrixQuery, matrixSort],
    );
    const cappedMatrixRows = matchingMatrixRows.slice(0, FEATURE_MATRIX_ROW_CAP);
    const matrixColumnHeader = (column: string, label: string) => (
        <SortableColumnHeader
            key={column}
            label={label}
            direction={matrixSort?.column === column ? matrixSort.direction : undefined}
            onSort={() => toggleMatrixSort(column)}
        />
    );

    return (
        <>
            {distributions.length > 0 && (
                <fieldset className="batch-metric-chooser">
                    <legend>{t('batchMetricsShown')}</legend>
                    <p className="hint batch-metric-selection-hint">
                        {t('batchMetricSelectionHint')}
                    </p>
                    <label className="batch-metric-search">
                        <span>{t('batchMetricSearch')}</span>
                        <input
                            type="search"
                            value={metricQuery}
                            placeholder={t('batchMetricSearchPlaceholder')}
                            onChange={(event) => setMetricQuery(event.target.value)}
                        />
                    </label>
                    <p className="hint">
                        {t('batchMetricChoiceCount', {
                            shown: formatNumber(visibleMetricChoices.length),
                            total: formatNumber(distributions.length),
                        })}
                    </p>
                    <div className="batch-metric-choice-grid">
                        {visibleMetricChoices.map(({ column }) => (
                            <label key={column}>
                                <input
                                    type="checkbox"
                                    checked={selectedMetricColumns.has(column)}
                                    onChange={(event) => {
                                        const next = new Set(selectedMetricColumns);
                                        if (event.target.checked) next.add(column);
                                        else next.delete(column);
                                        onSelectedMetricColumnsChange(next);
                                    }}
                                />
                                {label(column)}
                            </label>
                        ))}
                        {visibleMetricChoices.length === 0 && <p>{t('batchMetricSearchEmpty')}</p>}
                    </div>
                    <div className="batch-metric-choice-actions">
                        <button
                            type="button"
                            onClick={() =>
                                onSelectedMetricColumnsChange(
                                    new Set(metricColumnDefaults(metricColumns)),
                                )
                            }
                        >
                            {t('batchMetricsCore')}
                        </button>
                        <button
                            type="button"
                            onClick={() => onSelectedMetricColumnsChange(new Set(metricColumns))}
                        >
                            {t('batchMetricsAll')}
                        </button>
                        <button
                            type="button"
                            onClick={() => onSelectedMetricColumnsChange(new Set())}
                        >
                            {t('batchMetricsNone')}
                        </button>
                    </div>
                </fieldset>
            )}
            <div
                className="batch-metric-view-switch"
                role="group"
                aria-label={t('batchMetricViews')}
            >
                {distributions.length > 0 && (
                    <button
                        type="button"
                        className="issue-choice"
                        aria-pressed={metricView === 'summary'}
                        onClick={() => setMetricView('summary')}
                    >
                        {t('batchMetricCoverage')}
                    </button>
                )}
                <button
                    type="button"
                    className="issue-choice"
                    aria-pressed={distributions.length === 0 || metricView === 'matrix'}
                    onClick={() => setMetricView('matrix')}
                >
                    {t('batchFeatureMatrix')}
                </button>
            </div>
            {distributions.length > 0 && metricView === 'summary' ? (
                selectedDistributions.length > 0 ? (
                    <div className="batch-metric-card-grid">
                        {selectedDistributions.map(({ column, value }) => (
                            <MetricDistributionCard
                                key={column}
                                column={column}
                                label={label(column)}
                                value={value}
                                total={matrix.rows.length}
                                rankings={rankings.get(column)!}
                            />
                        ))}
                    </div>
                ) : (
                    <p role="status">{t('batchMetricsNoneSelected')}</p>
                )
            ) : (
                <div id="batch-matrix-content">
                    {metricColumns.length > 0 && (
                        <label className="batch-matrix-findings-toggle">
                            <input
                                type="checkbox"
                                checked={includeFindingColumns}
                                onChange={(event) =>
                                    onIncludeFindingColumnsChange(event.target.checked)
                                }
                            />
                            {t('batchMatrixFindingColumns', {
                                count: findingColumnCount,
                                formatted: formatNumber(findingColumnCount),
                            })}
                        </label>
                    )}
                    {selectedMatrixColumns.length > 0 ? (
                        <>
                            <label className="batch-metric-search">
                                <span>{t('batchMatrixSearch')}</span>
                                <input
                                    type="search"
                                    value={matrixQuery}
                                    placeholder={t('batchMatrixSearchPlaceholder')}
                                    onChange={(event) => setMatrixQuery(event.target.value)}
                                />
                            </label>
                            {cappedMatrixRows.length > 0 ? (
                                <div className="batch-table-scroll">
                                    <table className="batch-table">
                                        <caption className="visually-hidden">
                                            {t('batchFeatureMatrix')}
                                        </caption>
                                        <thead>
                                            <tr>
                                                {matrixColumnHeader('name', t('batchProject'))}
                                                {selectedMatrixColumns.map((column) =>
                                                    matrixColumnHeader(column, label(column)),
                                                )}
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {cappedMatrixRows.map((row) => (
                                                <tr key={row.id}>
                                                    <th scope="row">{row.name}</th>
                                                    {selectedMatrixColumns.map((column) => (
                                                        <td key={column} data-label={label(column)}>
                                                            {display(row.values[column])}
                                                        </td>
                                                    ))}
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            ) : (
                                <p role="status">{t('batchMatrixSearchEmpty')}</p>
                            )}
                        </>
                    ) : (
                        <p role="status">{t('batchMetricsNoneSelected')}</p>
                    )}
                    <p className="hint">
                        {matchingMatrixRows.length === matrix.rows.length
                            ? t('batchFeatureMatrixHint', {
                                  shown: formatNumber(cappedMatrixRows.length),
                                  total: formatNumber(matrix.rows.length),
                              })
                            : t('batchFeatureMatrixHintFiltered', {
                                  shown: formatNumber(cappedMatrixRows.length),
                                  matching: formatNumber(matchingMatrixRows.length),
                                  total: formatNumber(matrix.rows.length),
                              })}
                    </p>
                </div>
            )}
            <p className="batch-metric-export-link">
                <a href="#batch-export">{t('batchGoToExport')}</a>
            </p>
        </>
    );
}
