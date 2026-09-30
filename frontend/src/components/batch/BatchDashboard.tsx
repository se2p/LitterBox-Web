// SPDX-License-Identifier: EUPL-1.2
// SPDX-FileCopyrightText: 2026 LitterBox-Web contributors

import { lazy, Suspense, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { SubmissionStatusResponse } from '../../api/submissions';
import { formatNumber } from '../../i18n';
import { Card } from '../Card';
import { DefinitionList } from '../DataList';
import { getBatchCounts } from './batch-utils';
import { submissionAnalyses } from '../../pages/submission-utils';
import {
    filterAndSortBatchRows,
    NO_BATCH_FILTERS,
    summarizeBatch,
    unnamedProjectLabel,
    type BatchFilters,
    type BatchSortColumn,
} from './batch-summary';
import { TERMINAL_STATUSES } from '../questions/submission-status';
import { BatchFailures } from './BatchFailures';
import { BatchResultsTable } from './BatchResultsTable';
import { BatchAnalyticsWorkspace } from './BatchAnalyticsWorkspace';
import { FoldSection } from '../FoldSection';
import { useSortState } from '../../lib/useSortState';
import { featureMatrix } from './batch-analytics';
import { buildCatalogueLookup } from '../single-project/catalogue-lookup';
import { FAMILY_LABEL_KEYS } from '../single-project/issue-family';

const LazyBatchCsvExport = lazy(() =>
    import('./BatchCsvExport').then((module) => ({ default: module.BatchCsvExport })),
);

export function BatchDashboard({
    value,
    selectedId,
    onSelect,
}: {
    value: SubmissionStatusResponse;
    selectedId?: string;
    onSelect: (id: string) => void;
}) {
    const { t } = useTranslation();
    const [filters, setFilters] = useState<BatchFilters>(NO_BATCH_FILTERS);
    const { sort, toggle: toggleSort, reset: resetSort } = useSortState<BatchSortColumn>();
    const [showProjectReports, setShowProjectReports] = useState(false);

    const counts = getBatchCounts(value);
    const analyses = useMemo(() => submissionAnalyses(value), [value]);
    const summary = useMemo(() => summarizeBatch(analyses), [analyses]);
    const completed = Math.max(counts.completed, summary.completedCount);
    const failed = Math.min(
        Math.max(counts.failed, summary.failedCount),
        Math.max(counts.expected - completed, 0),
    );
    const finished = Math.min(completed + failed, counts.expected);
    const remaining = Math.max(counts.expected - finished, 0);
    const terminal = TERMINAL_STATUSES.has(String(value.status ?? '').toLowerCase());
    const visibleRows = useMemo(
        () => filterAndSortBatchRows(summary.rows, filters, sort),
        [summary.rows, filters, sort],
    );
    const cohortMatrix = useMemo(
        () => featureMatrix(summary.rows, unnamedProjectLabel(t)),
        [summary.rows, t],
    );
    const catalogue = useMemo(() => {
        const fromAnalyses = buildCatalogueLookup(
            (function* () {
                for (const analysis of analyses)
                    if (Array.isArray(analysis.catalogue)) yield* analysis.catalogue;
            })(),
        );
        return fromAnalyses.size > 0
            ? fromAnalyses
            : buildCatalogueLookup(value.catalogueEntries ?? []);
    }, [analyses, value.catalogueEntries]);
    const statuses = useMemo(
        () => Array.from(new Set(summary.rows.map((row) => row.status))).sort(),
        [summary.rows],
    );
    const toggleProjectSetFilter = (key: string, ids: ReadonlySet<string>, label: string) => {
        if (filters.projectSet?.key !== key) setShowProjectReports(true);
        setFilters((current) => ({
            ...current,
            projectSet: current.projectSet?.key === key ? undefined : { key, ids, label },
        }));
    };

    return (
        <Card className="batch-dashboard" aria-labelledby="batch-counts-heading">
            <h2 id="batch-counts-heading">
                {t(terminal ? 'batchSummaryTitle' : 'batchCountsTitle')}
            </h2>
            {!terminal && (
                <>
                    <p className="batch-progress-summary" role="status">
                        {t('batchProgressSummary', {
                            finished: formatNumber(finished),
                            expected: formatNumber(counts.expected),
                        })}
                    </p>
                    <progress
                        className="batch-progress-meter"
                        max={Math.max(counts.expected, 1)}
                        value={Math.min(finished, counts.expected)}
                        aria-label={t('batchProgressMeter')}
                    />
                </>
            )}
            <DefinitionList
                className="capability-list batch-count-list"
                items={[
                    ...(!terminal
                        ? [{ label: t('batchExpected'), value: formatNumber(counts.expected) }]
                        : []),
                    {
                        label: t('analysisStatusCompleted'),
                        value: formatNumber(completed),
                    },
                    ...(!terminal || failed > 0
                        ? [{ label: t('analysisStatusFailed'), value: formatNumber(failed) }]
                        : []),
                    ...(!terminal || remaining > 0
                        ? [
                              {
                                  label: t(terminal ? 'batchNotAnalysed' : 'batchStillProcessing'),
                                  value: formatNumber(remaining),
                              },
                          ]
                        : []),
                ]}
            />
            {summary.completedCount > 0 && (
                <DefinitionList
                    className="capability-list batch-count-list"
                    items={[
                        ...summary.families.map((family) => ({
                            label: t(FAMILY_LABEL_KEYS[family]),
                            value: formatNumber(summary.totals[family]),
                        })),
                        {
                            label: t('batchConcerns'),
                            value: formatNumber(summary.concerns),
                        },
                        {
                            label: t('batchWithoutFindings'),
                            value: formatNumber(summary.withoutFindings),
                        },
                    ]}
                />
            )}
            <BatchAnalyticsWorkspace
                rows={summary.rows}
                finders={summary.finders}
                matrix={cohortMatrix}
                catalogue={catalogue}
                activeFinder={filters.finder === 'all' ? undefined : filters.finder}
                onFinderFilter={(finderId) => {
                    if (filters.finder !== finderId) setShowProjectReports(true);
                    setFilters((current) => ({
                        ...current,
                        finder: current.finder === finderId ? 'all' : finderId,
                    }));
                }}
                activeProjectFilter={filters.projectSet?.key}
                onProjectSetFilter={toggleProjectSetFilter}
                onProjectInspect={onSelect}
                projects={
                    <>
                        <BatchFailures rows={summary.rows} />
                        <FoldSection
                            id="batch-all-projects"
                            className="fold-section batch-project-report-list"
                            title={
                                <h5
                                    id="batch-all-projects-heading"
                                    className="batch-all-projects-title fold-section-title"
                                >
                                    <span>{t('batchAllProjects')}</span>
                                    <span aria-hidden="true">
                                        {t('batchProjectCount', {
                                            count: visibleRows.length,
                                            formatted: formatNumber(visibleRows.length),
                                        })}
                                    </span>
                                </h5>
                            }
                            open={showProjectReports}
                            onToggle={(_id, open) => setShowProjectReports(open)}
                        >
                            <p className="hint">{t('batchAllProjectsHint')}</p>
                            <BatchResultsTable
                                rows={visibleRows}
                                families={summary.families}
                                measurements={summary.measurements}
                                statuses={statuses}
                                finders={summary.finders}
                                filters={filters}
                                sort={sort}
                                selectedId={selectedId}
                                onSelect={onSelect}
                                onFilter={(changes) =>
                                    setFilters((current) => ({ ...current, ...changes }))
                                }
                                onSort={toggleSort}
                                onReset={() => {
                                    setFilters(NO_BATCH_FILTERS);
                                    resetSort();
                                }}
                                onClearProjectSet={() => {
                                    const projectSet = filters.projectSet;
                                    if (projectSet)
                                        toggleProjectSetFilter(
                                            projectSet.key,
                                            projectSet.ids,
                                            projectSet.label,
                                        );
                                }}
                            />
                        </FoldSection>
                    </>
                }
                exportContent={(selectedColumns) => (
                    <Suspense fallback={<p role="status">{t('batchCsvPreparing')}</p>}>
                        <LazyBatchCsvExport
                            token={value.token ?? ''}
                            rows={summary.rows}
                            matrix={cohortMatrix}
                            selectedColumns={selectedColumns}
                            families={summary.families}
                            measurements={summary.measurements}
                            finders={summary.finders}
                        />
                    </Suspense>
                )}
            />
        </Card>
    );
}
