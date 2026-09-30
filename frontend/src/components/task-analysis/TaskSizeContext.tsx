// SPDX-License-Identifier: EUPL-1.2
// SPDX-FileCopyrightText: 2026 LitterBox-Web contributors

import { useTranslation } from 'react-i18next';
import type { SupportedLocale } from '../../api/capabilities';
import { formatNumber } from '../../i18n';
import type { TranslationKey } from '../../i18n/locales';
import type { MetricBand } from '../../api/metric-reference';
import { useMetricReference } from '../../lib/use-metric-reference';
import { metricValue, overviewMetricNames } from '../../lib/overview-metrics';
import { BAND_LABEL_KEYS, bandFor, tercile } from '../capabilities/metrics/metric-utils';
import { MetricBoxPlot } from '../MetricBoxPlot';
import { markerRangeState, type MetricBoxPlotBand } from '../metric-box-plot';
import { DataTable } from '../Table';

const MARKER_LABEL_KEYS = {
    below: 'taskSizeMarkerBelowRange',
    within: 'taskSizeMarkerWithinRange',
    above: 'taskSizeMarkerAboveRange',
} as const satisfies Record<'below' | 'within' | 'above', TranslationKey>;

const TASK_SIZE_METRICS = [
    { names: overviewMetricNames('metricBlocks'), nameKey: 'metricBlocks' },
    { names: overviewMetricNames('metricScripts'), nameKey: 'metricScripts' },
    { names: overviewMetricNames('metricSprites'), nameKey: 'metricSprites' },
    { names: ['length_longest_script'], nameKey: 'taskSizeLongestScript' },
    { names: ['max_nested_block_count'], nameKey: 'taskSizeMaxNesting' },
    { names: ['most_complex_script'], nameKey: 'taskSizeMostComplexScript' },
    { names: ['weighted_method_count'], nameKey: 'taskSizeWeightedMethodCount' },
    {
        names: ['interprocedural_cyclomatic_complexity'],
        nameKey: 'taskSizeCyclomaticComplexity',
    },
] as const satisfies readonly { names: readonly string[]; nameKey: TranslationKey }[];

const distributionOf = (band: MetricBand): MetricBoxPlotBand | undefined =>
    band.minimum === undefined ||
    band.q1 === undefined ||
    band.median === undefined ||
    band.q3 === undefined ||
    band.maximum === undefined
        ? undefined
        : {
              minimum: band.minimum,
              q1: band.q1,
              median: band.median,
              q3: band.q3,
              maximum: band.maximum,
          };

function TaskSizeComparison({
    value,
    band,
    locale,
}: {
    value: number;
    band: MetricBand;
    locale: SupportedLocale;
}) {
    const { t } = useTranslation();
    const distribution = distributionOf(band);
    if (!distribution) {
        return <>{t(BAND_LABEL_KEYS[tercile(value, band)])}</>;
    }
    const state = markerRangeState(value, distribution);
    const distributionLabel = t('batchMetricDistributionLabel', {
        median: formatNumber(distribution.median, locale),
        q1: formatNumber(distribution.q1, locale),
        q3: formatNumber(distribution.q3, locale),
        min: formatNumber(distribution.minimum, locale),
        max: formatNumber(distribution.maximum, locale),
    });
    const markerLabel = t(MARKER_LABEL_KEYS[state], { value: formatNumber(value, locale) });
    return (
        <>
            <MetricBoxPlot
                band={distribution}
                marker={{ value }}
                ariaLabel={`${distributionLabel} ${markerLabel}`}
            />
            <div className="metric-box-plot-labels" aria-hidden="true">
                <span>{formatNumber(distribution.minimum, locale)}</span>
                <strong>{formatNumber(distribution.median, locale)}</strong>
                <span>{formatNumber(distribution.maximum, locale)}</span>
            </div>
        </>
    );
}

export function TaskSizeContext({
    metrics,
    locale,
}: {
    metrics: unknown;
    locale: SupportedLocale;
}) {
    const { t } = useTranslation();
    const reference = useMetricReference();
    const rows = TASK_SIZE_METRICS.map(({ names, nameKey }) => ({
        referenceName: names[0],
        nameKey,
        value: metricValue(metrics, names),
    }));

    return (
        <>
            <DataTable
                className="task-size-table"
                caption={t('taskSizeTitle')}
                captionClassName="visually-hidden"
            >
                <thead>
                    <tr>
                        <th scope="col">{t('taskSizeColumnMeasurement')}</th>
                        <th scope="col">{t('metricsColumnValue')}</th>
                        <th scope="col">{t('taskSizeColumnComparison')}</th>
                    </tr>
                </thead>
                <tbody>
                    {rows.map((row) => {
                        const { value } = row;
                        const band =
                            value === undefined
                                ? undefined
                                : bandFor(
                                      {
                                          id: row.referenceName,
                                          label: t(row.nameKey),
                                          value,
                                          translated: true,
                                      },
                                      reference,
                                  );
                        return (
                            <tr key={row.referenceName}>
                                <th scope="row">{t(row.nameKey)}</th>
                                <td className="metric-value">
                                    {value === undefined
                                        ? t('taskAnalysisNotReported')
                                        : formatNumber(value, locale)}
                                </td>
                                <td className="task-size-comparison">
                                    {value !== undefined && band ? (
                                        <>
                                            <TaskSizeComparison
                                                value={value}
                                                band={band}
                                                locale={locale}
                                            />
                                            <p className="task-size-sample-note">
                                                {t('metricComparisonBasis', {
                                                    count: band.sampleSize,
                                                    formatted: formatNumber(
                                                        band.sampleSize,
                                                        locale,
                                                    ),
                                                })}
                                            </p>
                                        </>
                                    ) : (
                                        '—'
                                    )}
                                </td>
                            </tr>
                        );
                    })}
                </tbody>
            </DataTable>
            {reference.length > 0 && (
                <p className="task-size-reference-note">{t('metricComparisonNote')}</p>
            )}
        </>
    );
}
