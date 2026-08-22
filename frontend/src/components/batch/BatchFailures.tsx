// SPDX-License-Identifier: EUPL-1.2
// SPDX-FileCopyrightText: 2026 LitterBox-Web contributors

import { useTranslation } from 'react-i18next';
import { formatNumber } from '../../i18n';
import { safeFailureMessage } from './batch-utils';
import type { BatchRow } from './batch-summary';

/**
 * The analyses that did not finish, and what the analyser said about each.
 *
 * A reason is a sentence, and a sentence in a table cell would be the widest column in the table, sitting beside
 * the status of every row and squeezing the project names into three lines. Gathered here it has the width of the
 * card, and it is read the way it is acted on — as a short list of projects to look at again, not as a column to
 * scan past.
 *
 * Every failure in the set, whatever the table is currently filtered to: how many projects went wrong is a fact
 * about the submission, and hiding some of them behind a finder filter would understate it.
 */
export function BatchFailures({ rows }: { rows: readonly BatchRow[] }) {
    const { t } = useTranslation();
    const failed = rows.filter((row) => row.status === 'failed');
    if (failed.length === 0) return null;

    return (
        <section className="batch-failures" aria-labelledby="batch-failures-heading">
            <h3 id="batch-failures-heading">
                {t('batchFailuresTitle', {
                    count: failed.length,
                    formatted: formatNumber(failed.length),
                })}
            </h3>
            <p className="hint">{t('batchFailuresLead')}</p>
            <ul className="batch-failure-list">
                {failed.map((row) => (
                    <li key={row.id}>
                        <span className="batch-failure-project">
                            {row.name ?? `${t('batchProject')} ${row.index + 1}`}
                        </span>
                        {/* What the analyser reported, once it is safe to show. A teacher who can only see that
                            something went wrong cannot do anything about it. */}
                        <span className="batch-failure-reason">
                            {safeFailureMessage(row.analysis.failureMessage, t('statusFailed'))}
                        </span>
                    </li>
                ))}
            </ul>
        </section>
    );
}
