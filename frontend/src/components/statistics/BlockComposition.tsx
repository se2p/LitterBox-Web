// SPDX-License-Identifier: EUPL-1.2
// SPDX-FileCopyrightText: 2026 LitterBox-Web contributors

import { useTranslation } from 'react-i18next';
import type { StatisticsBlockCategory } from '../../api/statistics';
import { formatNumber, formatPercent, type Locale } from '../../i18n';
import { blockCategoryClass, blockCategoryLabel } from './block-categories';

export function BlockComposition({
    categories,
    locale,
}: {
    categories: StatisticsBlockCategory[];
    locale: Locale;
}) {
    const { t } = useTranslation();
    const visible = categories
        .filter((category) => category.blocks > 0 && category.blockShare > 0)
        .sort((left, right) => {
            const residualOrder =
                Number(left.metric.toLowerCase() === 'other_block_count') -
                Number(right.metric.toLowerCase() === 'other_block_count');
            return (
                residualOrder ||
                right.blockShare - left.blockShare ||
                left.metric.localeCompare(right.metric)
            );
        });
    if (visible.length === 0) return null;
    let cumulative = 0;
    const segments = visible.map((category) => {
        const start = cumulative;
        cumulative += category.blockShare;
        return {
            category,
            className: `statistics-composition-${blockCategoryClass(category.metric)}`,
            start,
            name: blockCategoryLabel(category.metric, t),
        };
    });
    return (
        <section className="statistics-section" aria-labelledby="statistics-composition-heading">
            <h2 id="statistics-composition-heading" tabIndex={-1}>
                {t('statisticsCompositionHeading')}
            </h2>
            <p className="statistics-section-lead">{t('statisticsCompositionLead')}</p>
            <svg
                className="statistics-composition"
                viewBox="0 0 1000 64"
                role="img"
                aria-label={t('statisticsCompositionAccessible')}
            >
                {segments.map(({ category, className, start }) => {
                    return (
                        <rect
                            key={category.metric}
                            className={`statistics-composition-segment ${className}`}
                            x={start * 1000}
                            y={0}
                            width={category.blockShare * 1000}
                            height={64}
                        >
                            <title>
                                {t('statisticsCompositionLegend', {
                                    share: formatPercent(category.blockShare, locale),
                                    prevalence: formatPercent(category.prevalence, locale),
                                    blocks: formatNumber(category.blocks, locale),
                                })}
                            </title>
                        </rect>
                    );
                })}
            </svg>
            <ul className="statistics-composition-legend">
                {segments.map(({ category, className, name }) => (
                    <li key={category.metric}>
                        <span className={`statistics-composition-swatch ${className}`} />
                        <span>
                            <strong>{name}</strong>
                            <small>
                                {t('statisticsCompositionLegend', {
                                    share: formatPercent(category.blockShare, locale),
                                    prevalence: formatPercent(category.prevalence, locale),
                                    blocks: formatNumber(category.blocks, locale),
                                })}
                            </small>
                        </span>
                    </li>
                ))}
            </ul>
        </section>
    );
}
