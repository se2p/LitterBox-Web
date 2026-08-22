// SPDX-License-Identifier: EUPL-1.2
// SPDX-FileCopyrightText: 2026 LitterBox-Web contributors

import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import type { StatisticsDistribution } from '../../api/statistics';
import { formatNumber, formatPercent, type Locale } from '../../i18n';

const PLOT = {
    width: 600,
    height: 300,
    left: 34,
    right: 18,
    top: 32,
    bottom: 34,
    medianLabelY: 20,
    edgeLabelThreshold: 48,
    tickLength: 5,
    tickLabelOffset: 18,
} as const;
const NICE_TICK_MULTIPLIERS = [1, 2, 5] as const;
const distinct = (values: number[]) =>
    values.filter((value, index) => index === 0 || value !== values[index - 1]);

const logarithmicTicks = (minimum: number, maximum: number, maximumTickCount: number): number[] => {
    if (minimum === maximum) return [minimum];
    const candidates = minimum === 0 ? [0] : [];
    const lowestExponent = Math.floor(Math.log10(Math.max(1, minimum)));
    const highestExponent = Math.ceil(Math.log10(Math.max(1, maximum)));
    for (let exponent = lowestExponent; exponent <= highestExponent; exponent += 1) {
        for (const multiplier of NICE_TICK_MULTIPLIERS) {
            const value = multiplier * 10 ** exponent;
            if (value >= minimum && value <= maximum) candidates.push(value);
        }
    }
    if (candidates.length === 0) return [minimum, maximum];
    if (candidates.length <= maximumTickCount) return candidates;
    return distinct(
        Array.from({ length: maximumTickCount }, (_, index) => {
            const candidateIndex = Math.round(
                (index * (candidates.length - 1)) / (maximumTickCount - 1),
            );
            return candidates[candidateIndex];
        }),
    );
};

const linePath = (points: { x: number; y: number }[]): string =>
    points.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`).join(' ');

export function DistributionPlot({
    distribution,
    label,
    locale,
    showZeroShare = false,
}: {
    distribution?: StatisticsDistribution;
    label: string;
    locale: Locale;
    showZeroShare?: boolean;
}) {
    const { t } = useTranslation();
    const titleId = useId();
    const descriptionId = useId();
    if (!distribution) {
        return (
            <section className="statistics-chart" aria-labelledby={titleId}>
                <h3 id={titleId}>{label}</h3>
                <p className="statistics-muted">{t('statisticsDistributionUnavailable')}</p>
            </section>
        );
    }

    const chartWidth = PLOT.width - PLOT.left - PLOT.right;
    const chartHeight = PLOT.height - PLOT.top - PLOT.bottom;
    const xDomainMinimum = Math.log1p(distribution.minimum);
    const xDomainMaximum = Math.log1p(distribution.displayMaximum);
    const xDomainRange = xDomainMaximum - xDomainMinimum;
    const x = (value: number) => {
        if (xDomainRange === 0) return PLOT.left + chartWidth / 2;
        const boundedValue = Math.min(
            distribution.displayMaximum,
            Math.max(distribution.minimum, value),
        );
        return (
            PLOT.left + ((Math.log1p(boundedValue) - xDomainMinimum) / xDomainRange) * chartWidth
        );
    };
    const y = (value: number) => PLOT.top + (1 - value) * chartHeight;
    const baseline = PLOT.top + chartHeight;
    const points = [...distribution.points]
        .sort((left, right) => left.value - right.value)
        .map((point) => ({
            x: x(point.value),
            y: y(point.relativeDensity),
        }));
    const curve = linePath(points);
    const area = curve
        ? `${curve} L ${points[points.length - 1].x} ${baseline} L ${points[0].x} ${baseline} Z`
        : '';
    const widestBoundaryLabel = Math.max(
        formatNumber(distribution.minimum, locale).length,
        formatNumber(distribution.displayMaximum, locale).length,
    );
    const xTicks = logarithmicTicks(
        distribution.minimum,
        distribution.displayMaximum,
        widestBoundaryLabel >= 6 ? 3 : 5,
    );
    const labelAnchor = (position: number) =>
        position < PLOT.left + PLOT.edgeLabelThreshold
            ? 'start'
            : position > PLOT.width - PLOT.right - PLOT.edgeLabelThreshold
              ? 'end'
              : 'middle';
    const medianX = x(distribution.median);
    const medianAnchor = labelAnchor(medianX);
    const percentileSummary = [
        ['statisticsPercentileMinimum', distribution.minimum],
        ['statisticsPercentileP25', distribution.p25],
        ['statisticsPercentileMedian', distribution.median],
        ['statisticsPercentileP75', distribution.p75],
        ['statisticsPercentileP95', distribution.p95],
    ] as const;

    return (
        <figure className="statistics-chart" aria-labelledby={titleId}>
            <figcaption>
                <h3 id={titleId}>{label}</h3>
                <p className="statistics-muted">
                    {t('statisticsSampleSize', {
                        formatted: formatNumber(distribution.sampleSize, locale),
                    })}
                </p>
                {showZeroShare && (
                    <p className="statistics-zero-share">
                        {t('statisticsZeroShare', {
                            percentage: formatPercent(distribution.zeroPrevalence, locale),
                        })}
                    </p>
                )}
            </figcaption>
            <svg
                className="statistics-curve"
                viewBox={`0 0 ${PLOT.width} ${PLOT.height}`}
                role="img"
                aria-labelledby={`${titleId} ${descriptionId}`}
            >
                <desc id={descriptionId}>
                    {t('statisticsCurveDescription', {
                        metric: label,
                        minimum: formatNumber(distribution.minimum, locale),
                        median: formatNumber(distribution.median, locale),
                        maximum: formatNumber(distribution.displayMaximum, locale),
                    })}
                </desc>
                <line
                    className="statistics-axis"
                    x1={PLOT.left}
                    x2={PLOT.width - PLOT.right}
                    y1={baseline}
                    y2={baseline}
                />
                {xTicks.map((tick) => (
                    <g key={tick}>
                        <line
                            className="statistics-tick"
                            x1={x(tick)}
                            x2={x(tick)}
                            y1={baseline}
                            y2={baseline + PLOT.tickLength}
                        />
                        <text
                            className="statistics-axis-label"
                            x={x(tick)}
                            y={baseline + PLOT.tickLabelOffset}
                            textAnchor={labelAnchor(x(tick))}
                        >
                            {formatNumber(tick, locale)}
                        </text>
                    </g>
                ))}
                {area && <path className="statistics-curve-area" d={area} />}
                {curve && <path className="statistics-curve-line" d={curve} />}
                <line
                    className="statistics-median-marker"
                    x1={medianX}
                    x2={medianX}
                    y1={PLOT.top}
                    y2={baseline}
                />
                <text
                    className="statistics-median-label"
                    x={medianX}
                    y={PLOT.medianLabelY}
                    textAnchor={medianAnchor}
                >
                    {t('statisticsMedianMarker')}
                </text>
            </svg>
            <dl className="statistics-percentiles" aria-label={t('statisticsPercentileSummary')}>
                {percentileSummary.map(([key, value]) => (
                    <div key={key}>
                        <dt>{t(key)}</dt>
                        <dd>{formatNumber(value, locale)}</dd>
                    </div>
                ))}
            </dl>
        </figure>
    );
}
