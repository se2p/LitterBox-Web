// SPDX-License-Identifier: EUPL-1.2
// SPDX-FileCopyrightText: 2026 LitterBox-Web contributors

import { useMemo, useState } from 'react';
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
    type BatchFilters,
    type BatchSort,
    type BatchSortColumn,
} from './batch-summary';
import { TERMINAL_STATUSES } from '../questions/submission-status';
import { BatchCsvExport } from './BatchCsvExport';
import { BatchFailures } from './BatchFailures';
import { BatchResultsTable } from './BatchResultsTable';
import { FamilyIcon } from '../single-project/FamilyIcon';
import { FAMILY_LABEL_KEYS } from '../single-project/issue-family';

/** Enough finders to see what a class has in common, before the list becomes its own scroll. */
const INITIAL_FINDERS = 8;

/**
 * What a class set adds up to, and every analysis in it.
 *
 * Everything here counts analyses and findings. None of it ranks projects or learners, and none of it is a grade:
 * "twelve occurrences in seven analyses" is a fact about what LitterBox reported, and stops there.
 */
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
    const [sort, setSort] = useState<BatchSort>();
    const [allFinders, setAllFinders] = useState(false);

    const counts = getBatchCounts(value);
    // submission-utils is the one place that copes with a response missing its `analyses` field, so this reads
    // through it rather than repeating the guard.
    const analyses = useMemo(() => submissionAnalyses(value), [value]);
    const summary = useMemo(() => summarizeBatch(analyses), [analyses]);
    /*
     * How far the run got, taken from the submission rather than from the rows. An analysis becomes a row once its
     * report exists, so a set that was cancelled, or one whose reports have not been written out yet, has finished
     * with more projects than the table can show. Counting rows alone reported a cancelled set as still running.
     */
    const completed = Math.max(counts.completed, summary.completedCount);
    const failed = Math.min(
        Math.max(counts.failed, summary.failedCount),
        Math.max(counts.expected - completed, 0),
    );
    const finished = Math.min(completed + failed, counts.expected);
    const remaining = Math.max(counts.expected - finished, 0);
    /*
     * A set that stopped short is not going to analyse the rest of itself. What it never reached was not left
     * running, so it is named for what became of it rather than counted towards a bar that will never move again.
     * A run that finished everything has nothing left over, and keeps the wording it had all the way through.
     */
    const stoppedShort =
        remaining > 0 && TERMINAL_STATUSES.has(String(value.status ?? '').toLowerCase());
    const visibleRows = useMemo(
        () => filterAndSortBatchRows(summary.rows, filters, sort),
        [summary.rows, filters, sort],
    );
    const statuses = useMemo(
        () => Array.from(new Set(summary.rows.map((row) => row.status))).sort(),
        [summary.rows],
    );
    const shownFinders = allFinders ? summary.finders : summary.finders.slice(0, INITIAL_FINDERS);

    const toggleSort = (column: BatchSortColumn) =>
        setSort((current) =>
            current?.column === column && current.direction === 'ascending'
                ? { column, direction: 'descending' }
                : { column, direction: 'ascending' },
        );

    return (
        <Card className="batch-dashboard" aria-labelledby="batch-counts-heading">
            <h2 id="batch-counts-heading">{t('batchCountsTitle')}</h2>
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
            <DefinitionList
                className="capability-list batch-count-list"
                items={[
                    { label: t('batchExpected'), value: formatNumber(counts.expected) },
                    {
                        label: t('analysisStatusCompleted'),
                        value: formatNumber(completed),
                    },
                    { label: t('analysisStatusFailed'), value: formatNumber(failed) },
                    {
                        label: stoppedShort ? t('batchNotAnalysed') : t('batchStillProcessing'),
                        value: formatNumber(remaining),
                    },
                ]}
            />
            {summary.completedCount > 0 && (
                <>
                    <DefinitionList
                        className="capability-list batch-count-list"
                        items={[
                            ...summary.families.map((family) => ({
                                label: t(FAMILY_LABEL_KEYS[family]),
                                value: formatNumber(summary.totals[family]),
                            })),
                            {
                                label: t('batchTotalFindings'),
                                value: formatNumber(summary.totalFindings),
                            },
                            {
                                label: t('batchWithoutFindings'),
                                value: formatNumber(summary.withoutFindings),
                            },
                        ]}
                    />
                    {summary.finders.length > 0 && (
                        <section aria-labelledby="batch-finders-heading">
                            <h3 id="batch-finders-heading">{t('batchFrequentFindings')}</h3>
                            <ul className="batch-finder-list">
                                {shownFinders.map((finder) => (
                                    <li key={finder.finderId}>
                                        {/* Choosing one narrows the table to the analyses that reported it,
                                            which is the question the list raises. */}
                                        <button
                                            type="button"
                                            aria-pressed={filters.finder === finder.finderId}
                                            onClick={() =>
                                                setFilters((current) => ({
                                                    ...current,
                                                    finder:
                                                        current.finder === finder.finderId
                                                            ? 'all'
                                                            : finder.finderId,
                                                }))
                                            }
                                        >
                                            {/* Which of the three this is. The name of a finder says what it
                                                looks for, never whether finding it is a complaint or praise. */}
                                            <span
                                                className={`batch-finder-family batch-finder-family-${finder.family}`}
                                            >
                                                <FamilyIcon family={finder.family} />
                                                <span className="visually-hidden">
                                                    {t(FAMILY_LABEL_KEYS[finder.family])}
                                                </span>
                                            </span>
                                            <span className="batch-finder-name">
                                                {finder.finderName}
                                            </span>
                                            {/* Two counts, so two plurals: i18next can only agree with one
                                                number at a time, and "1 occurrences in 1 analyses" is not a
                                                sentence in any of the four languages. */}
                                            <span className="batch-finder-count">
                                                {`${t('batchFinderOccurrences', {
                                                    count: finder.occurrences,
                                                    formatted: formatNumber(finder.occurrences),
                                                })} ${t('batchFinderAnalyses', {
                                                    count: finder.analyses,
                                                    formatted: formatNumber(finder.analyses),
                                                })}`}
                                            </span>
                                        </button>
                                    </li>
                                ))}
                            </ul>
                            {summary.finders.length > INITIAL_FINDERS && !allFinders && (
                                <button type="button" onClick={() => setAllFinders(true)}>
                                    {t('batchShowAllFinders', {
                                        count: summary.finders.length,
                                        formatted: formatNumber(summary.finders.length),
                                    })}
                                </button>
                            )}
                        </section>
                    )}
                </>
            )}
            <BatchFailures rows={summary.rows} />
            <section aria-labelledby="batch-results-heading">
                <h3 id="batch-results-heading">{t('batchResultsTitle')}</h3>
                <p className="hint">{t('batchSelectionHint')}</p>
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
                    onFilter={(changes) => setFilters((current) => ({ ...current, ...changes }))}
                    onSort={toggleSort}
                    onReset={() => {
                        setFilters(NO_BATCH_FILTERS);
                        setSort(undefined);
                    }}
                />
                {/* The rows as the teacher has them arranged, not the response order: a set narrowed to the
                    projects that reported one finding is a question they asked, and the file should answer it. */}
                <BatchCsvExport
                    token={value.token ?? ''}
                    rows={visibleRows}
                    families={summary.families}
                    measurements={summary.measurements}
                    finders={summary.finders}
                />
            </section>
        </Card>
    );
}
