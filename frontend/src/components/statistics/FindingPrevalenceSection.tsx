// SPDX-License-Identifier: EUPL-1.2
// SPDX-FileCopyrightText: 2026 LitterBox-Web contributors

import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import type { StatisticsFinding } from '../../api/statistics';
import { formatNumber, formatPercent, type Locale } from '../../i18n';

type FindingType = 'bug' | 'smell' | 'perfume';

function PrevalenceRows({ findings, locale }: { findings: StatisticsFinding[]; locale: Locale }) {
    const { t } = useTranslation();
    return (
        <ol className="statistics-prevalence-list">
            {findings.map((finding) => {
                const percentage = formatPercent(finding.prevalence, locale);
                const projects = formatNumber(finding.projectsAffected, locale);
                const occurrences = formatNumber(finding.occurrences, locale);
                return (
                    <li key={finding.finderId} className="statistics-prevalence-row">
                        <div className="statistics-prevalence-label">
                            <strong>{finding.name}</strong>
                            <span>{percentage}</span>
                        </div>
                        <progress
                            className="statistics-prevalence-track"
                            max={1}
                            value={finding.prevalence}
                            aria-label={t('statisticsPrevalenceAccessible', {
                                name: finding.name,
                                percentage,
                                projects,
                                occurrences,
                            })}
                        />
                        <dl className="statistics-prevalence-detail">
                            <div>
                                <dt>{t('statisticsProjectsWithPattern')}</dt>
                                <dd>{projects}</dd>
                            </div>
                            <div>
                                <dt>{t('statisticsOccurrences')}</dt>
                                <dd>{occurrences}</dd>
                            </div>
                        </dl>
                    </li>
                );
            })}
        </ol>
    );
}

export function FindingPrevalenceSection({
    type,
    findings,
    locale,
}: {
    type: FindingType;
    findings: StatisticsFinding[];
    locale: Locale;
}) {
    const { t } = useTranslation();
    const headingId = useId();
    const headingKey = {
        bug: 'statisticsFindingsBugs',
        smell: 'statisticsFindingsSmells',
        perfume: 'statisticsFindingsPerfumes',
    } as const;
    return (
        <section className="statistics-prevalence-section" aria-labelledby={headingId}>
            <h3 id={headingId}>{t(headingKey[type])}</h3>
            {findings.length === 0 ? (
                <p className="statistics-muted">{t('statisticsNoFindings')}</p>
            ) : (
                <PrevalenceRows locale={locale} findings={findings} />
            )}
        </section>
    );
}
