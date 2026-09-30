// SPDX-License-Identifier: EUPL-1.2
// SPDX-FileCopyrightText: 2025 LitterBox-Web contributors

import { useId, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { SupportedLocale } from '../../../api/capabilities';
import { formatNumber } from '../../../i18n';
import { useMetricReference } from '../../../lib/use-metric-reference';
import {
    BAND_LABEL_KEYS,
    bandFor,
    metricEntries,
    overviewEntries,
    searchMetrics,
    tercile,
} from './metric-utils';

/**
 * Everything the analysis measured: the four measurements most readers want, and then all of them.
 *
 * The identifier and the raw value stay visible in the table. A researcher reading this against the report needs the
 * name the report used, not the sentence this frontend made out of it.
 */
export function MetricSummary({
    metrics,
    locale,
    headingHidden = false,
}: {
    metrics: unknown;
    locale: SupportedLocale;
    /** Set where the fold around this section already carries its name, so the name is not printed twice. */
    headingHidden?: boolean;
}) {
    const { t } = useTranslation();
    const searchId = useId();
    const [query, setQuery] = useState('');
    const reference = useMetricReference();

    const summary = useMemo(() => metricEntries(metrics, (key) => t(key)), [metrics, t]);
    const overview = useMemo(
        () => overviewEntries(summary.entries, (key) => t(key)),
        [summary.entries, t],
    );
    const matching = useMemo(() => searchMetrics(summary.entries, query), [summary.entries, query]);
    const metricCount = summary.entries.length;

    return (
        <section className="metric-summary" aria-labelledby="metrics-heading">
            <h3 id="metrics-heading" className={headingHidden ? 'visually-hidden' : undefined}>
                {t('metricsTitle')}
            </h3>
            {!summary.hasInput && <p className="metric-empty">{t('metricsUnavailable')}</p>}
            {summary.hasInput && metricCount === 0 && summary.invalidCount === 0 && (
                <p className="metric-empty">{t('metricsEmpty')}</p>
            )}
            {summary.hasInput && metricCount === 0 && summary.invalidCount > 0 && (
                <p className="metric-empty">{t('metricsInvalidOnly')}</p>
            )}
            {summary.invalidCount > 0 && (
                <p className="metric-warning" role="status">
                    {t('metricsInvalid', {
                        count: summary.invalidCount,
                        formatted: formatNumber(summary.invalidCount, locale),
                    })}
                </p>
            )}

            {overview.length > 0 && (
                <dl className="data-list metric-list metric-overview">
                    {overview.map((entry) => (
                        <div key={entry.id}>
                            <dt title={entry.id}>{entry.label}</dt>
                            <dd>{formatNumber(entry.value, locale)}</dd>
                        </div>
                    ))}
                </dl>
            )}

            {metricCount > 0 && (
                <>
                    <label className="metric-search" htmlFor={searchId}>
                        <span>{t('metricsSearch')}</span>
                        <input
                            id={searchId}
                            type="search"
                            value={query}
                            onChange={(event) => setQuery(event.target.value)}
                        />
                    </label>
                    <div className="table-region">
                        <table className="data-table metric-table">
                            <caption className="visually-hidden">{t('metricsAllTitle')}</caption>
                            <thead>
                                <tr>
                                    <th scope="col">{t('metricsColumnMetric')}</th>
                                    <th scope="col">{t('metricsColumnId')}</th>
                                    <th scope="col">{t('metricsColumnValue')}</th>
                                    <th scope="col">{t('metricsColumnPosition')}</th>
                                    <th scope="col">{t('metricsColumnRange')}</th>
                                    <th scope="col">{t('metricsColumnSample')}</th>
                                </tr>
                            </thead>
                            <tbody>
                                {matching.map((entry) => {
                                    const band = bandFor(entry, reference);
                                    return (
                                        <tr key={entry.id}>
                                            <th scope="row">{entry.label}</th>
                                            {/* The name the report used, in the table rather than in a tooltip
                                                nobody can reach with a keyboard. */}
                                            <td className="metric-id">
                                                <code>{entry.id}</code>
                                            </td>
                                            <td className="metric-value">
                                                {formatNumber(entry.value, locale)}
                                            </td>
                                            <td>
                                                {band
                                                    ? t(BAND_LABEL_KEYS[tercile(entry.value, band)])
                                                    : '—'}
                                            </td>
                                            <td className="metric-value">
                                                {band
                                                    ? `${formatNumber(band.lowerBound, locale)} – ${formatNumber(band.upperBound, locale)}`
                                                    : '—'}
                                            </td>
                                            <td className="metric-value">
                                                {band ? formatNumber(band.sampleSize, locale) : '—'}
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                    {/* A search that found nothing is not an analysis without measurements, and saying so with the
                        same sentence would confuse the two. */}
                    {matching.length === 0 && (
                        <p className="metric-empty" role="status">
                            {t('metricsSearchEmpty', { query: query.trim() })}
                        </p>
                    )}
                    {reference.length > 0 && (
                        <p className="metric-reference-note">{t('metricComparisonNote')}</p>
                    )}
                </>
            )}
        </section>
    );
}
