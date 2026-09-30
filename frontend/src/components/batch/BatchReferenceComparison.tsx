// SPDX-License-Identifier: EUPL-1.2
// SPDX-FileCopyrightText: 2026 LitterBox-Web contributors

import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { formatNumber, formatRelativeTime } from '../../i18n';
import { CONCEPTS, CT_DIMENSIONS } from '../../lib/program-concepts';
import { analysedProjects } from '../../lib/recent-projects';
import { TASK_ANALYSIS_PATH, type RetainedAnalysisSelection } from '../../lib/retained-analysis';
import { choiceKey, choiceLabel, type AnalysedChoice } from '../../pages/comparison-utils';
import { useRetainedAnalysis } from '../../pages/retained-analysis-page';
import {
    referenceConceptComparison,
    referenceCtComparison,
    referenceSizeComparison,
} from './batch-analytics';
import type { BatchRow } from './batch-summary';

function ReferenceResult({
    referenceMetrics,
    rows,
}: {
    referenceMetrics: unknown;
    rows: readonly BatchRow[];
}) {
    const { t } = useTranslation();
    const { classLacks: gaps, taskLacks: extras } = useMemo(
        () => referenceConceptComparison(referenceMetrics, rows),
        [referenceMetrics, rows],
    );
    const ctComparison = useMemo(
        () => referenceCtComparison(referenceMetrics, rows),
        [referenceMetrics, rows],
    );
    const sizeComparison = useMemo(
        () => referenceSizeComparison(referenceMetrics, rows),
        [referenceMetrics, rows],
    );

    return (
        <div className="batch-reference-result">
            <p className="hint">{t('batchReferenceScopeNote')}</p>
            <section aria-labelledby="batch-reference-gaps-heading">
                <h6 id="batch-reference-gaps-heading">{t('batchReferenceConceptGapTitle')}</h6>
                {gaps.length === 0 ? (
                    <p>
                        {extras.length === 0
                            ? t('batchReferenceConceptNone')
                            : t('batchReferenceConceptGapNone')}
                    </p>
                ) : (
                    <ul>
                        {gaps.map((gap) => (
                            <li key={gap.id}>
                                {gap.unreported === gap.total
                                    ? t('batchReferenceConceptNeverMeasured', {
                                          concept: t(CONCEPTS[gap.id].nameKey),
                                      })
                                    : t('batchReferenceConceptGap', {
                                          concept: t(CONCEPTS[gap.id].nameKey),
                                          count: formatNumber(gap.count),
                                          total: formatNumber(gap.total),
                                      })}
                                {gap.unreported > 0 && gap.unreported < gap.total && (
                                    <span className="hint">
                                        {' '}
                                        {t('batchReferenceConceptGapUnreported', {
                                            count: formatNumber(gap.unreported),
                                        })}
                                    </span>
                                )}
                            </li>
                        ))}
                    </ul>
                )}
            </section>
            {extras.length > 0 && (
                <section aria-labelledby="batch-reference-extra-heading">
                    <h6 id="batch-reference-extra-heading">
                        {t('batchReferenceConceptExtraTitle')}
                    </h6>
                    <ul>
                        {extras.map((extra) => (
                            <li key={extra.id}>
                                {t('batchReferenceConceptExtra', {
                                    concept: t(CONCEPTS[extra.id].nameKey),
                                    count: formatNumber(extra.count),
                                    total: formatNumber(extra.total),
                                })}
                            </li>
                        ))}
                    </ul>
                </section>
            )}
            <section aria-labelledby="batch-reference-ct-heading">
                <h6 id="batch-reference-ct-heading">{t('batchReferenceCtTitle')}</h6>
                <div className="batch-table-scroll">
                    <table className="batch-table">
                        <caption className="visually-hidden">{t('batchReferenceCtTitle')}</caption>
                        <thead>
                            <tr>
                                <th scope="col">{t('ctProfileColumnDimension')}</th>
                                <th scope="col">{t('batchReferenceCtTaskColumn')}</th>
                                <th scope="col">{t('batchReferenceCtClassColumn')}</th>
                            </tr>
                        </thead>
                        <tbody>
                            {ctComparison.map((entry) => (
                                <tr key={entry.id}>
                                    <th scope="row">{t(CT_DIMENSIONS[entry.id].nameKey)}</th>
                                    <td
                                        className="batch-table-numeric"
                                        data-label={t('batchReferenceCtTaskColumn')}
                                    >
                                        {entry.referenceLevel === undefined
                                            ? t('taskAnalysisNotReported')
                                            : formatNumber(entry.referenceLevel)}
                                    </td>
                                    <td
                                        className="batch-table-numeric"
                                        data-label={t('batchReferenceCtClassColumn')}
                                    >
                                        {entry.medianLevel === undefined
                                            ? '—'
                                            : formatNumber(entry.medianLevel)}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </section>
            <section aria-labelledby="batch-reference-size-heading">
                <h6 id="batch-reference-size-heading">{t('batchReferenceSizeTitle')}</h6>
                {sizeComparison.length === 0 ? (
                    <p>{t('batchReferenceSizeNone')}</p>
                ) : (
                    <div className="batch-table-scroll">
                        <table className="batch-table">
                            <caption className="visually-hidden">
                                {t('batchReferenceSizeTitle')}
                            </caption>
                            <thead>
                                <tr>
                                    <th scope="col">{t('metricsColumnMetric')}</th>
                                    <th scope="col">{t('batchReferenceSizeTaskColumn')}</th>
                                    <th scope="col">{t('batchReferenceSizeClassColumn')}</th>
                                </tr>
                            </thead>
                            <tbody>
                                {sizeComparison.map((entry) => (
                                    <tr key={entry.metric}>
                                        <th scope="row">
                                            {t(
                                                entry.metric === 'metricCtScore'
                                                    ? 'metricCtScoreShort'
                                                    : entry.metric,
                                            )}
                                        </th>
                                        <td
                                            className="batch-table-numeric"
                                            data-label={t('batchReferenceSizeTaskColumn')}
                                        >
                                            {entry.referenceValue === undefined
                                                ? t('taskAnalysisNotReported')
                                                : formatNumber(entry.referenceValue)}
                                        </td>
                                        <td
                                            className="batch-table-numeric"
                                            data-label={t('batchReferenceSizeClassColumn')}
                                        >
                                            {entry.medianValue === undefined
                                                ? '—'
                                                : formatNumber(entry.medianValue)}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </section>
        </div>
    );
}

export function BatchReferenceComparison({ rows }: { rows: readonly BatchRow[] }) {
    const { t } = useTranslation();
    const [candidates] = useState<AnalysedChoice[]>(() =>
        analysedProjects().map((project) => ({
            token: project.token,
            analysisId: project.analysisId,
            name: project.name,
            at: project.at,
        })),
    );
    const [selectedKey, setSelectedKey] = useState('');
    const selection = useMemo<RetainedAnalysisSelection | undefined>(() => {
        const candidate = candidates.find((choice) => choiceKey(choice) === selectedKey);
        return candidate
            ? { submissionToken: candidate.token, analysisId: candidate.analysisId }
            : undefined;
    }, [candidates, selectedKey]);
    const { state, reload } = useRetainedAnalysis(selection);

    if (candidates.length === 0)
        return (
            <div>
                <p>{t('batchReferenceEmptyBody')}</p>
                <p>
                    <Link to={TASK_ANALYSIS_PATH}>{t('batchReferenceEmptyLink')}</Link>
                </p>
            </div>
        );

    return (
        <div>
            <p className="hint">{t('batchReferenceLead')}</p>
            <label className="batch-reference-choose">
                <span>{t('batchReferenceChooseLabel')}</span>
                <select
                    value={selectedKey}
                    onChange={(event) => setSelectedKey(event.target.value)}
                >
                    <option value="">{t('batchReferenceChoosePlaceholder')}</option>
                    {candidates.map((choice) => (
                        <option key={choiceKey(choice)} value={choiceKey(choice)}>
                            {choiceLabel(choice, (at) => formatRelativeTime(at))}
                        </option>
                    ))}
                </select>
            </label>
            {state.status === 'loading' && <p role="status">{t('batchReferenceLoading')}</p>}
            {state.status === 'error' && (
                <div role="alert">
                    <p>{t('batchReferenceLoadError')}</p>
                    <button type="button" onClick={reload}>
                        {t('retry')}
                    </button>
                </div>
            )}
            {state.status === 'ready' && (
                <ReferenceResult referenceMetrics={state.value.analysis.metrics} rows={rows} />
            )}
        </div>
    );
}
