// SPDX-License-Identifier: EUPL-1.2
// SPDX-FileCopyrightText: 2026 LitterBox-Web contributors

import { useTranslation } from 'react-i18next';
import type { SupportedLocale } from '../../api/capabilities';
import { formatNumber } from '../../i18n';
import { DataTable } from '../Table';
import {
    CT_BAND_DESCRIPTION_KEYS,
    CT_DIMENSIONS,
    ctProfile,
    ctTotal,
    ctTotalBand,
} from '../../lib/program-concepts';

function CtLevelBar({ level, label }: { level: 0 | 1 | 2 | 3; label: string }) {
    return (
        <span className="task-ct-level-bar" role="img" aria-label={label}>
            {([1, 2, 3] as const).map((segment) => (
                <span
                    key={segment}
                    aria-hidden="true"
                    className={`task-ct-level-segment${segment <= level ? ' is-reached' : ''}`}
                />
            ))}
        </span>
    );
}

export function TaskThinkingProfile({
    metrics,
    locale,
}: {
    metrics: unknown;
    locale: SupportedLocale;
}) {
    const { t } = useTranslation();
    const profile = ctProfile(metrics);
    const total = ctTotal(metrics);
    const band = total.score === undefined ? undefined : ctTotalBand(total.score);

    return (
        <>
            <div className="task-ct-result" role="group" aria-label={t('ctProfileOverall')}>
                <span>{t('ctProfileOverall')}</span>
                <strong className="task-ct-total">
                    {total.score === undefined
                        ? t('ctProfileTotalNotReported')
                        : t('ctProfileTotal', {
                              score: formatNumber(total.score, locale),
                              max: formatNumber(total.max, locale),
                          })}
                </strong>
                {band !== undefined && (
                    <>
                        <p className="task-ct-total-band">{t(CT_BAND_DESCRIPTION_KEYS[band])}</p>
                        <p className="task-ct-total-note">{t('ctTotalBandNote')}</p>
                    </>
                )}
            </div>
            <DataTable
                className="task-ct-table"
                caption={t('ctProfileTitle')}
                captionClassName="visually-hidden"
            >
                <thead>
                    <tr>
                        <th scope="col">{t('ctProfileColumnDimension')}</th>
                        <th scope="col">{t('ctProfileColumnLevel')}</th>
                        <th scope="col">{t('ctProfileColumnMeaning')}</th>
                    </tr>
                </thead>
                <tbody>
                    {profile.map((entry) => {
                        const dimension = CT_DIMENSIONS[entry.id];
                        return (
                            <tr key={entry.id}>
                                <th scope="row">
                                    <span className="task-ct-dimension-name">
                                        {t(dimension.nameKey)}
                                    </span>
                                    <span className="task-ct-dimension-description">
                                        {t(dimension.descriptionKey)}
                                    </span>
                                    <a
                                        className="task-ct-dimension-link"
                                        href={dimension.learnUrl}
                                        target="_blank"
                                        rel="noreferrer noopener"
                                    >
                                        {t('ctProfileDimensionLink')}
                                    </a>
                                </th>
                                <td className="metric-value">
                                    {entry.level === undefined ? (
                                        t('taskAnalysisNotReported')
                                    ) : (
                                        <CtLevelBar
                                            level={entry.level}
                                            label={
                                                entry.level === 0
                                                    ? t('ctLevelNotShown')
                                                    : t('ctLevelBarLabel', {
                                                          level: formatNumber(entry.level, locale),
                                                          max: formatNumber(3, locale),
                                                      })
                                            }
                                        />
                                    )}
                                </td>
                                <td>
                                    {entry.level === undefined ? (
                                        '—'
                                    ) : (
                                        <details className="task-ct-descriptors">
                                            <summary>{t(dimension.levelKeys[entry.level])}</summary>
                                            <ol className="task-ct-descriptor-list">
                                                {([1, 2, 3] as const).map((level) => {
                                                    const reached = entry.level === level;
                                                    return (
                                                        <li
                                                            key={level}
                                                            className={
                                                                reached
                                                                    ? 'task-ct-descriptor-reached'
                                                                    : undefined
                                                            }
                                                        >
                                                            {reached && (
                                                                <span aria-hidden="true">✓ </span>
                                                            )}
                                                            {reached && (
                                                                <span className="visually-hidden">
                                                                    {t(
                                                                        'ctProfileLevelReachedLabel',
                                                                    )}{' '}
                                                                </span>
                                                            )}
                                                            {t(dimension.levelKeys[level])}
                                                        </li>
                                                    );
                                                })}
                                            </ol>
                                        </details>
                                    )}
                                </td>
                            </tr>
                        );
                    })}
                </tbody>
            </DataTable>
        </>
    );
}
