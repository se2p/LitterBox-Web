// SPDX-License-Identifier: EUPL-1.2
// SPDX-FileCopyrightText: 2026 LitterBox-Web contributors

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { SupportedLocale } from '../../api/capabilities';
import { formatNumber, formatRate } from '../../i18n';
import {
    blockCategoryShares,
    CONCEPTS,
    conceptCoverage,
    PROGRAMMING_CONCEPT_GROUPS,
    PROGRAMMING_CONCEPT_ORDER,
    type BlockCategoryShare,
    type ConceptCoverage,
    type ConceptId,
} from '../../lib/program-concepts';
import { FoldSection } from '../FoldSection';
import { BlockCategoryTreemap, type TreemapEntry } from './BlockCategoryTreemap';

export function TaskConceptCoverage({
    metrics,
    locale,
}: {
    metrics: unknown;
    locale: SupportedLocale;
}) {
    const { t } = useTranslation();
    const coverage = conceptCoverage(metrics);
    const blocks = blockCategoryShares(metrics);
    const byId = new Map<ConceptId, ConceptCoverage>(coverage.map((entry) => [entry.id, entry]));
    const [unmeasuredOpen, setUnmeasuredOpen] = useState(false);
    const conceptName = (id: ConceptId) => t(CONCEPTS[id].nameKey);
    const share = (value: number) =>
        t('blockCategoriesShareValue', { percent: formatRate(value * 100, 1, locale) });

    const figures = (category: BlockCategoryShare): string => {
        if (category.count === undefined) return t('taskAnalysisNotReported');
        const count = formatNumber(category.count, locale);
        return category.share === undefined
            ? count
            : t('blockCategoriesFigures', { count, share: share(category.share) });
    };

    const treemapEntry = (category: BlockCategoryShare): TreemapEntry => ({
        key: category.id,
        colour: category.colour,
        name: conceptName(category.id),
        value: figures(category),
        title: `${conceptName(category.id)}: ${figures(category)}`,
        weight: category.count ?? 0,
    });

    const counted = (category: BlockCategoryShare) =>
        category.count !== undefined && category.count > 0;
    const tiles = blocks.categories.filter(counted).map(treemapEntry);
    const unplotted = blocks.categories.filter((category) => !counted(category)).map(treemapEntry);

    const unmeasuredConcepts = PROGRAMMING_CONCEPT_ORDER.filter(
        (id) => byId.get(id)?.count === undefined,
    );

    const conceptRow = (id: ConceptId) => {
        const entry = byId.get(id);
        return (
            <li key={id} className="task-concept">
                <span className="task-concept-name">{conceptName(id)}</span>
                {entry?.count !== undefined && (
                    <span className="task-concept-value">{formatNumber(entry.count, locale)}</span>
                )}
            </li>
        );
    };

    return (
        <>
            <section className="task-concepts" aria-labelledby="task-programming-concepts-heading">
                <h3 id="task-programming-concepts-heading" className="task-concept-subheading">
                    {t('programmingConceptsTitle')}
                </h3>
                <p className="hint">{t('programmingConceptsLead')}</p>
                <details className="task-concept-context">
                    <summary>
                        <span>{t('programmingConceptsContextTitle')}</span>
                    </summary>
                    <div className="task-concept-context-body">
                        <p>{t('programmingConceptsContextBody')}</p>
                        <ul>
                            <li>
                                <a
                                    href="https://scratched.gse.harvard.edu/guide/"
                                    target="_blank"
                                    rel="noreferrer noopener"
                                >
                                    {t('programmingConceptsCreativeComputingLink')}
                                </a>
                            </li>
                            <li>
                                <a
                                    href="https://www.lehrplanplus.bayern.de/serviceinformation/l315104"
                                    target="_blank"
                                    rel="noreferrer noopener"
                                >
                                    {t('programmingConceptsGermanyLink')}
                                </a>
                            </li>
                            <li>
                                <a
                                    href="https://www.gov.uk/government/publications/national-curriculum-in-england-computing-programmes-of-study/national-curriculum-in-england-computing-programmes-of-study"
                                    target="_blank"
                                    rel="noreferrer noopener"
                                >
                                    {t('programmingConceptsEnglandLink')}
                                </a>
                            </li>
                        </ul>
                    </div>
                </details>
                {PROGRAMMING_CONCEPT_GROUPS.map(({ titleKey, ids }) => {
                    const measured = ids.filter((id) => byId.get(id)?.count !== undefined);
                    return measured.length > 0 ? (
                        <div key={titleKey}>
                            <h4 className="task-concept-group-heading">{t(titleKey)}</h4>
                            <ul className="task-concept-grid">{measured.map(conceptRow)}</ul>
                        </div>
                    ) : null;
                })}
                {unmeasuredConcepts.length > 0 && (
                    <FoldSection
                        id="task-concepts-unmeasured"
                        title={
                            <h4 className="task-concept-subheading">
                                {t('programmingConceptsUnmeasuredTitle', {
                                    count: unmeasuredConcepts.length,
                                })}
                            </h4>
                        }
                        open={unmeasuredOpen}
                        onToggle={(_id, open) => setUnmeasuredOpen(open)}
                    >
                        <p className="hint">{t('programmingConceptsUnmeasuredHint')}</p>
                        <ul className="task-concept-grid">{unmeasuredConcepts.map(conceptRow)}</ul>
                    </FoldSection>
                )}
            </section>

            <section className="task-blocks" aria-labelledby="task-block-categories-heading">
                <h3 id="task-block-categories-heading" className="task-concept-subheading">
                    {t('blockCategoriesTitle')}
                </h3>
                <p className="hint">{t('blockCategoriesLead')}</p>
                {tiles.length > 0 ? (
                    <BlockCategoryTreemap
                        entries={tiles}
                        unplotted={unplotted}
                        label={t('blockCategoriesTreemapLabel')}
                        unnamedLead={t('blockCategoriesUnnamed')}
                    />
                ) : (
                    <p className="task-blocks-empty">{t('blockCategoriesNoneCounted')}</p>
                )}
                <div className="task-blocks-table-region visually-hidden">
                    <table className="data-table task-blocks-table">
                        <caption>{t('blockCategoriesTableCaption')}</caption>
                        <thead>
                            <tr>
                                <th scope="col">{t('blockCategoriesColumnCategory')}</th>
                                <th scope="col">{t('blockCategoriesColumnBlocks')}</th>
                                <th scope="col">{t('blockCategoriesColumnShare')}</th>
                            </tr>
                        </thead>
                        <tbody>
                            {blocks.categories.map((category) => (
                                <tr key={category.id}>
                                    <th scope="row">{conceptName(category.id)}</th>
                                    <td>
                                        {category.count === undefined
                                            ? t('taskAnalysisNotReported')
                                            : formatNumber(category.count, locale)}
                                    </td>
                                    <td>
                                        {category.share === undefined ? '—' : share(category.share)}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
                <p className="task-blocks-share-note">{t('blockCategoriesShareNote')}</p>
            </section>
        </>
    );
}
