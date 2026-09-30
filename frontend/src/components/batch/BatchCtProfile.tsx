// SPDX-License-Identifier: EUPL-1.2
// SPDX-FileCopyrightText: 2026 LitterBox-Web contributors

import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { formatNumber } from '../../i18n';
import { CT_DIMENSIONS } from '../../lib/program-concepts';
import { MetricBoxPlot } from '../MetricBoxPlot';
import { cohortCtProfile, cohortCtTotal, distributionBand } from './batch-analytics';
import { BatchTableActionButton } from './ProjectSetFilterButton';
import { useProjectSetFilter } from './project-set-filter';
import type { BatchRow } from './batch-summary';

const LEVELS = [0, 1, 2, 3] as const;

export function BatchCtProfile({ rows }: { rows: readonly BatchRow[] }) {
    const { t } = useTranslation();
    const projectSetFilter = useProjectSetFilter();
    const profile = useMemo(() => cohortCtProfile(rows), [rows]);
    const overall = useMemo(() => cohortCtTotal(rows), [rows]);
    const measured = overall.count;
    const total = overall.count + overall.missing;
    const band = distributionBand(overall);

    return (
        <div>
            <p className="hint">{t('batchCtProfileHint')}</p>
            <section className="batch-ct-overall" aria-labelledby="batch-ct-overall-heading">
                <h6 id="batch-ct-overall-heading">{t('batchCtOverallTitle')}</h6>
                <p className="hint">
                    {t('batchCtOverallCoverage', {
                        measured: formatNumber(measured),
                        total: formatNumber(total),
                        missing: formatNumber(overall.missing),
                    })}
                </p>
                {band && (
                    <>
                        <MetricBoxPlot
                            band={band}
                            ariaLabel={t('batchCtOverallDistribution', {
                                min: formatNumber(band.minimum),
                                q1: formatNumber(band.q1),
                                median: formatNumber(band.median),
                                q3: formatNumber(band.q3),
                                max: formatNumber(band.maximum),
                            })}
                        />
                        <div className="metric-box-plot-labels" aria-hidden="true">
                            <span>{formatNumber(band.minimum)}</span>
                            <strong>{formatNumber(band.median)}</strong>
                            <span>{formatNumber(band.maximum)}</span>
                        </div>
                    </>
                )}
            </section>
            <div className="batch-table-scroll">
                <table className="batch-table">
                    <caption className="visually-hidden">{t('batchCtProfileTitle')}</caption>
                    <thead>
                        <tr>
                            <th scope="col">{t('ctProfileColumnDimension')}</th>
                            {LEVELS.map((level) => (
                                <th scope="col" key={level}>
                                    {t('batchCtLevelColumn', { level: formatNumber(level) })}
                                </th>
                            ))}
                            <th scope="col">{t('batchCtUnreportedColumn')}</th>
                            <th scope="col">{t('batchCtMedianColumn')}</th>
                        </tr>
                    </thead>
                    <tbody>
                        {profile.map((entry) => {
                            const neverReported =
                                entry.total > 0 && entry.unreported === entry.total;
                            const dimensionName = t(CT_DIMENSIONS[entry.id].nameKey);
                            return (
                                <tr key={entry.id}>
                                    <th scope="row">{dimensionName}</th>
                                    {neverReported ? (
                                        <td colSpan={6} className="hint">
                                            {t('batchNotReportedByClass')}
                                        </td>
                                    ) : (
                                        <>
                                            {LEVELS.map((level) => {
                                                const count = entry.levelIds[level].length;
                                                const key = `ct:${entry.id}:${level}`;
                                                const levelLabel = t('batchCtLevelColumn', {
                                                    level: formatNumber(level),
                                                });
                                                return (
                                                    <td
                                                        key={level}
                                                        className="batch-table-numeric"
                                                        data-label={levelLabel}
                                                    >
                                                        {projectSetFilter && count > 0 ? (
                                                            <BatchTableActionButton
                                                                pressed={
                                                                    projectSetFilter.activeKey ===
                                                                    key
                                                                }
                                                                onPress={() =>
                                                                    projectSetFilter.toggle(
                                                                        key,
                                                                        new Set(
                                                                            entry.levelIds[level],
                                                                        ),
                                                                        t(
                                                                            'batchProjectSetFilterLabel',
                                                                            {
                                                                                primary:
                                                                                    dimensionName,
                                                                                secondary:
                                                                                    levelLabel,
                                                                            },
                                                                        ),
                                                                    )
                                                                }
                                                            >
                                                                <span className="visually-hidden">
                                                                    {dimensionName} {levelLabel}
                                                                    :{' '}
                                                                </span>
                                                                {formatNumber(count)}
                                                            </BatchTableActionButton>
                                                        ) : (
                                                            formatNumber(count)
                                                        )}
                                                    </td>
                                                );
                                            })}
                                            <td
                                                className="batch-table-numeric"
                                                data-label={t('batchCtUnreportedColumn')}
                                            >
                                                {entry.unreported > 0
                                                    ? formatNumber(entry.unreported)
                                                    : '—'}
                                            </td>
                                            <td
                                                className="batch-table-numeric"
                                                data-label={t('batchCtMedianColumn')}
                                            >
                                                {entry.median === undefined
                                                    ? '—'
                                                    : formatNumber(entry.median)}
                                            </td>
                                        </>
                                    )}
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
