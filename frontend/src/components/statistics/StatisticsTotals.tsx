// SPDX-License-Identifier: EUPL-1.2
// SPDX-FileCopyrightText: 2026 LitterBox-Web contributors

import { useTranslation } from 'react-i18next';
import type { StatisticsTotals as Totals } from '../../api/statistics';
import { formatNumber, type Locale } from '../../i18n';

export function StatisticsTotals({ totals, locale }: { totals: Totals; locale: Locale }) {
    const { t } = useTranslation();
    const values = [
        ['statisticsTotalProjects', totals.projects],
        ['statisticsTotalBlocks', totals.blocks],
        ['statisticsTotalSprites', totals.sprites],
        ['statisticsTotalScripts', totals.scripts],
    ] as const;
    return (
        <section className="statistics-section" aria-labelledby="statistics-totals-heading">
            <h2 id="statistics-totals-heading" tabIndex={-1}>
                {t('statisticsTotalsHeading')}
            </h2>
            <dl className="statistics-totals">
                {values.map(([label, value]) => (
                    <div key={label}>
                        <dt>{t(label)}</dt>
                        <dd>{formatNumber(value, locale)}</dd>
                    </div>
                ))}
            </dl>
        </section>
    );
}
