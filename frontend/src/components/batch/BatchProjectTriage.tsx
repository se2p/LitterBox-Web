// SPDX-License-Identifier: EUPL-1.2
// SPDX-FileCopyrightText: 2026 LitterBox-Web contributors

import type { TFunction } from 'i18next';
import { useTranslation } from 'react-i18next';
import { formatNumber } from '../../i18n';
import type { TranslationKey } from '../../i18n/locales';
import { ProjectSetFilterButton } from './ProjectSetFilterButton';
import type { ProjectTriage, TriageEntry, TriageReasonId } from './batch-analytics';

const reasonLabels: Record<TriageReasonId, TranslationKey> = {
    mostBugs: 'batchTriageReasonBugs',
    mostSmells: 'batchTriageReasonSmells',
    smallProject: 'batchTriageReasonSmall',
    largeProject: 'batchTriageReasonLarge',
};

const countText = (t: TFunction, entry: TriageEntry): string =>
    [
        t('batchTriageBugs', { count: entry.bugs, formatted: formatNumber(entry.bugs) }),
        t('batchTriageSmells', { count: entry.smells, formatted: formatNumber(entry.smells) }),
        entry.blocks === undefined
            ? t('batchTriageBlocksMissing')
            : t('batchTriageBlocks', {
                  count: entry.blocks,
                  formatted: formatNumber(entry.blocks),
              }),
    ].join(' · ');

export function BatchProjectTriage({
    triage,
    onProjectInspect,
}: {
    triage: ProjectTriage;
    onProjectInspect?: (id: string) => void;
}) {
    const { t } = useTranslation();

    return (
        <div className="batch-triage">
            <p className="hint">{t('batchTriageLead')}</p>
            <ul className="batch-triage-list">
                {triage.entries.map((entry) => (
                    <li key={entry.id}>
                        <span className="batch-triage-project">{entry.name}</span>
                        <span
                            className="batch-triage-reasons"
                            aria-label={t('batchTriageReasonsLabel')}
                        >
                            {entry.reasons.map((reason) => (
                                <span className="batch-triage-reason" key={reason}>
                                    {t(reasonLabels[reason])}
                                </span>
                            ))}
                        </span>
                        <span className="batch-triage-measurement">{countText(t, entry)}</span>
                        {onProjectInspect && (
                            <button
                                type="button"
                                className="batch-table-action"
                                onClick={() => onProjectInspect(entry.id)}
                            >
                                <span className="visually-hidden">{entry.name}</span>{' '}
                                {t('batchInspectProject')}
                            </button>
                        )}
                    </li>
                ))}
            </ul>
            <ProjectSetFilterButton
                filterKey="triage"
                ids={triage.entries.map((entry) => entry.id)}
                label={t('batchTriageTitle')}
                hiddenLabel={t('batchTriageTitle')}
            >
                {t('batchTriageShowProjects', {
                    count: triage.entries.length,
                    formatted: formatNumber(triage.entries.length),
                })}
            </ProjectSetFilterButton>
            {triage.unsized > 0 && (
                <p className="hint">
                    {t('batchTriageUnsized', {
                        count: triage.unsized,
                        formatted: formatNumber(triage.unsized),
                    })}
                </p>
            )}
        </div>
    );
}
