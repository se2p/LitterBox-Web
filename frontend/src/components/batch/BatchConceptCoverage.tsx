// SPDX-License-Identifier: EUPL-1.2
// SPDX-FileCopyrightText: 2026 LitterBox-Web contributors

import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { formatNumber } from '../../i18n';
import { CONCEPTS, PROGRAMMING_CONCEPT_GROUPS } from '../../lib/program-concepts';
import { cohortConceptCoverage, type CohortConceptCoverage } from './batch-analytics';
import { ProjectSetFilterButton } from './ProjectSetFilterButton';
import { useProjectSetFilter } from './project-set-filter';
import type { BatchRow } from './batch-summary';

export function BatchConceptCoverage({ rows }: { rows: readonly BatchRow[] }) {
    const { t } = useTranslation();
    const projectSetFilter = useProjectSetFilter();
    const coverage = useMemo(() => cohortConceptCoverage(rows), [rows]);
    const visible = new Map(
        coverage
            .filter((entry) => entry.total === 0 || entry.unreported < entry.total)
            .map((entry) => [entry.id, entry]),
    );

    const row = (entry: CohortConceptCoverage) => {
        const id = entry.id;
        const conceptName = t(CONCEPTS[id].nameKey);
        return (
            <tr key={id}>
                <th scope="row">{conceptName}</th>
                <td className="batch-table-numeric" data-label={t('batchConceptColumnPresent')}>
                    {t('batchConceptPresentValue', {
                        present: formatNumber(entry.presentIds.length),
                        total: formatNumber(entry.total),
                    })}
                </td>
                <td className="batch-table-numeric" data-label={t('batchConceptColumnZero')}>
                    {formatNumber(entry.zero)}
                </td>
                {projectSetFilter && (
                    <td>
                        {entry.presentIds.length > 0 && (
                            <ProjectSetFilterButton
                                filterKey={`concept:${entry.id}`}
                                ids={entry.presentIds}
                                label={t('batchProjectSetFilterLabel', {
                                    primary: conceptName,
                                    secondary: t('batchConceptColumnPresent'),
                                })}
                            >
                                {t('batchShowAffectedProjects')}
                            </ProjectSetFilterButton>
                        )}
                    </td>
                )}
            </tr>
        );
    };

    return (
        <div>
            <p className="hint">{t('batchConceptCoverageHint')}</p>
            {visible.size > 0 && (
                <div className="batch-table-scroll">
                    <table className="batch-table">
                        <caption className="visually-hidden">
                            {t('batchConceptCoverageTitle')}
                        </caption>
                        <thead>
                            <tr>
                                <th scope="col">{t('batchConceptColumnName')}</th>
                                <th scope="col">{t('batchConceptColumnPresent')}</th>
                                <th scope="col">{t('batchConceptColumnZero')}</th>
                                {projectSetFilter && (
                                    <th scope="col">
                                        <span className="visually-hidden">
                                            {t('batchFindingAction')}
                                        </span>
                                    </th>
                                )}
                            </tr>
                        </thead>
                        {PROGRAMMING_CONCEPT_GROUPS.map(({ titleKey, ids }) => {
                            const group = ids.flatMap((id) => visible.get(id) ?? []);
                            return group.length > 0 ? (
                                <tbody key={titleKey}>
                                    <tr className="batch-concept-group">
                                        <th scope="rowgroup" colSpan={projectSetFilter ? 4 : 3}>
                                            {t(titleKey)}
                                        </th>
                                    </tr>
                                    {group.map(row)}
                                </tbody>
                            ) : null;
                        })}
                    </table>
                </div>
            )}
        </div>
    );
}
