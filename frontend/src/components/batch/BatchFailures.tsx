// SPDX-License-Identifier: EUPL-1.2
// SPDX-FileCopyrightText: 2026 LitterBox-Web contributors

import { useTranslation } from 'react-i18next';
import { formatNumber } from '../../i18n';
import { safeFailureMessage } from './batch-utils';
import { batchProjectName, type BatchRow } from './batch-summary';

export function BatchFailures({ rows }: { rows: readonly BatchRow[] }) {
    const { t } = useTranslation();
    const failed = rows.filter((row) => row.status === 'failed');
    if (failed.length === 0) return null;

    return (
        <section className="batch-failures" aria-labelledby="batch-failures-heading">
            <h5 id="batch-failures-heading" className="batch-fold-title">
                {t('batchFailuresTitle', {
                    count: failed.length,
                    formatted: formatNumber(failed.length),
                })}
            </h5>
            <p className="hint">{t('batchFailuresLead')}</p>
            <ul className="batch-failure-list">
                {failed.map((row) => (
                    <li key={row.id}>
                        <span className="batch-failure-project">{batchProjectName(row, t)}</span>
                        <span className="batch-failure-reason">
                            {safeFailureMessage(row.analysis.failureMessage, t('statusFailed'))}
                        </span>
                    </li>
                ))}
            </ul>
        </section>
    );
}
