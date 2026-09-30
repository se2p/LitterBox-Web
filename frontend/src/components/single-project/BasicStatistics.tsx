// SPDX-License-Identifier: EUPL-1.2
// SPDX-FileCopyrightText: 2026 LitterBox-Web contributors

import { useTranslation } from 'react-i18next';
import type { SupportedLocale } from '../../api/capabilities';
import { formatNumber } from '../../i18n';
import { BAND_LABEL_KEYS, tercile } from '../capabilities/metrics/metric-utils';
import { useMetricReference } from '../../lib/use-metric-reference';
import {
    metricValue,
    OVERVIEW_METRIC_ORDER,
    overviewMetricNames,
} from '../../lib/overview-metrics';

/**
 * @param names every name the measurement goes by. A report may call it "blocks" where the stored measurement it is
 *              compared against is called "block_count", so both the value and the distribution are looked up by
 *              the whole set rather than by whichever name happened to match first.
 */
interface Measurement {
    label: string;
    names: readonly string[];
}

export function BasicStatistics({
    metrics,
    locale,
}: {
    metrics: unknown;
    locale: SupportedLocale;
}) {
    const { t } = useTranslation();
    const reference = useMetricReference();

    // Findings are counted next to the findings themselves, and the number of distinct types and severity levels is
    // a statistic about the report rather than about the project — neither earns a place above the results.
    const measurements: readonly Measurement[] = OVERVIEW_METRIC_ORDER.map((metric) => ({
        label: t(metric),
        names: overviewMetricNames(metric),
    }));

    const items = measurements
        .map((measurement) => ({
            ...measurement,
            value: metricValue(metrics, measurement.names),
        }))
        .filter((item): item is Measurement & { value: number } => item.value !== undefined);

    if (items.length === 0) return null;

    const compared = items
        .map((item) => ({
            ...item,
            band: reference.find((candidate) => item.names.includes(candidate.name)),
        }))
        .map((item) => ({
            ...item,
            qualifier:
                item.band === undefined
                    ? undefined
                    : t(BAND_LABEL_KEYS[tercile(item.value, item.band)]),
        }));

    // Every qualifier on the line was drawn from the same query, so they rest on the same number of projects; the
    // smallest of them is the honest one to quote.
    const sampleSize = compared.reduce<number | undefined>(
        (smallest, item) =>
            item.band === undefined
                ? smallest
                : smallest === undefined
                  ? item.band.sampleSize
                  : Math.min(smallest, item.band.sampleSize),
        undefined,
    );

    // One quiet line above the findings: the project at a glance, not a section competing with the results.
    return (
        <div className="basic-statistics-panel">
            <dl className="basic-statistics" aria-label={t('basicStatisticsTitle')}>
                {compared.map((item) => (
                    <div key={item.label}>
                        <dt>{item.label}</dt>
                        <dd>
                            {formatNumber(item.value, locale)}
                            {/* Where the number sits among the projects analysed here, on the number rather than
                                in a legend somewhere else. A position in a distribution, not a mark. */}
                            {item.qualifier && (
                                <span className="basic-statistics-band"> ({item.qualifier})</span>
                            )}
                        </dd>
                    </div>
                ))}
            </dl>
            {sampleSize !== undefined && (
                <p className="basic-statistics-basis">
                    {t('metricComparisonBasis', {
                        count: sampleSize,
                        formatted: formatNumber(sampleSize, locale),
                    })}{' '}
                    {t('metricComparisonNote')}
                </p>
            )}
        </div>
    );
}
