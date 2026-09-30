// SPDX-License-Identifier: EUPL-1.2
// SPDX-FileCopyrightText: 2026 LitterBox-Web contributors

import { Fragment, useState } from 'react';
import { useIdSet } from '../../lib/useIdSet';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import type { CatalogueEntry } from '../../api/submissions';
import { formatNumber, formatRate } from '../../i18n';
import { catalogueProse } from '../catalogue/catalogue-utils';
import { catalogueForFinder, type CatalogueLookup } from '../single-project/catalogue-lookup';
import { FamilyIcon } from '../single-project/FamilyIcon';
import { FAMILIES, FAMILY_LABEL_KEYS } from '../single-project/issue-family';
import { RichHint } from '../single-project/RichHint';
import { CatalogueExampleList } from '../single-project/CatalogueExampleList';
import { Disclosure } from '../Disclosure';
import { BatchTableActionButton } from './ProjectSetFilterButton';
import type { CommonIssue, FeatureMatrix } from './batch-analytics';

function FinderExplanation({ entry, locale }: { entry?: CatalogueEntry; locale: string }) {
    const { t } = useTranslation();
    const description = entry && catalogueProse(entry.description, entry);
    const instruction = entry && catalogueProse(entry.instruction, entry);
    const examples = entry?.examples ?? [];
    if (!entry || (!description && !instruction && examples.length === 0))
        return <p className="hint">{t('batchFindingNoCatalogue')}</p>;
    const instructionAddsDetail = instruction !== undefined && instruction !== description;
    const englishFallback = locale.toLowerCase() !== 'en' && entry.locale.toLowerCase() === 'en';
    return (
        <div className="batch-finding-catalogue">
            {englishFallback && (
                <p>
                    <span className="fallback-badge">{t('catalogueEnglishFallback')}</span>
                </p>
            )}
            {description && (
                <p>
                    <RichHint value={description} locale={entry.locale} />
                </p>
            )}
            {instructionAddsDetail && (
                <p>
                    <RichHint value={instruction} locale={entry.locale} />
                </p>
            )}
            {examples.length > 0 && (
                <CatalogueExampleList examples={examples} locale={entry.locale} />
            )}
            <p>
                <Link to="/catalogue">{t('batchFindingCatalogueLink')}</Link>
            </p>
        </div>
    );
}

const FAMILY_PREVIEW = 6;

export function BatchCommonFindings({
    issues,
    matrix,
    catalogueLookup,
    activeFinder,
    onFinderFilter,
}: {
    issues: readonly CommonIssue[];
    matrix: FeatureMatrix;
    catalogueLookup: CatalogueLookup;
    activeFinder?: string;
    onFinderFilter?: (finderId: string) => void;
}) {
    const { t, i18n } = useTranslation();
    const [showAllIssues, setShowAllIssues] = useState(false);
    const expandedFinders = useIdSet();

    const issueGroups = FAMILIES.map((family) => {
        const familyIssues = issues.filter((issue) => issue.family === family);
        return {
            family,
            total: familyIssues.length,
            issues: showAllIssues ? familyIssues : familyIssues.slice(0, FAMILY_PREVIEW),
        };
    }).filter((group) => group.total > 0);

    return (
        <>
            <p className="hint">{t('batchCommonFindingsHint')}</p>
            <div className="batch-finding-family-grid">
                {issueGroups.map((group) => (
                    <section
                        key={group.family}
                        className={`batch-finding-family-panel batch-finding-family-${group.family}`}
                        aria-labelledby={`batch-findings-${group.family}`}
                    >
                        <h6 id={`batch-findings-${group.family}`}>
                            <span
                                className={`batch-finder-family batch-finder-family-${group.family}`}
                            >
                                <FamilyIcon family={group.family} />
                            </span>
                            {t(FAMILY_LABEL_KEYS[group.family])}{' '}
                            <span className="batch-family-total">
                                {t('batchFinderTypes', {
                                    count: group.total,
                                    formatted: formatNumber(group.total),
                                })}
                            </span>
                        </h6>
                        <div className="batch-table-scroll">
                            <table className="batch-table batch-finding-table">
                                <caption className="visually-hidden">
                                    {t(FAMILY_LABEL_KEYS[group.family])}
                                </caption>
                                <thead>
                                    <tr>
                                        <th scope="col">{t('batchFinder')}</th>
                                        <th scope="col">{t('batchOccurrences')}</th>
                                        <th scope="col">{t('batchPrevalence')}</th>
                                        <th scope="col">{t('batchIssueDensity')}</th>
                                        <th scope="col">{t('batchIssueDensityBase')}</th>
                                        {onFinderFilter && (
                                            <th scope="col">
                                                <span className="visually-hidden">
                                                    {t('batchFindingAction')}
                                                </span>
                                            </th>
                                        )}
                                        <th scope="col">
                                            <span className="visually-hidden">
                                                {t('batchFindingExplain')}
                                            </span>
                                        </th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {group.issues.map((issue) => {
                                        const expanded = expandedFinders.has(issue.finderId);
                                        const detailId = `batch-finder-explain-${issue.finderId}`;
                                        return (
                                            <Fragment key={issue.finderId}>
                                                <tr>
                                                    <th scope="row">
                                                        {issue.finderName}
                                                        {issue.analyses === 1 && (
                                                            <span className="hint">
                                                                {' '}
                                                                ({t('batchCommonFindingSingleton')})
                                                            </span>
                                                        )}
                                                    </th>
                                                    <td data-label={t('batchOccurrences')}>
                                                        {formatNumber(issue.occurrences)}
                                                    </td>
                                                    <td data-label={t('batchPrevalence')}>
                                                        {t('batchPrevalenceValue', {
                                                            count: formatNumber(issue.analyses),
                                                            total: formatNumber(matrix.rows.length),
                                                            rate: formatRate(
                                                                issue.prevalence * 100,
                                                                0,
                                                            ),
                                                        })}
                                                    </td>
                                                    <td data-label={t('batchIssueDensity')}>
                                                        {issue.density === undefined
                                                            ? '—'
                                                            : formatRate(issue.density * 1000)}
                                                    </td>
                                                    <td data-label={t('batchIssueDensityBase')}>
                                                        {formatNumber(issue.applicable)}
                                                    </td>
                                                    {onFinderFilter && (
                                                        <td>
                                                            <BatchTableActionButton
                                                                pressed={
                                                                    activeFinder === issue.finderId
                                                                }
                                                                onPress={() =>
                                                                    onFinderFilter(issue.finderId)
                                                                }
                                                            >
                                                                {t(
                                                                    activeFinder === issue.finderId
                                                                        ? 'batchShowAllProjects'
                                                                        : 'batchShowAffectedProjects',
                                                                )}
                                                            </BatchTableActionButton>
                                                        </td>
                                                    )}
                                                    <td>
                                                        <Disclosure
                                                            variant="chip"
                                                            ariaLabel={t('batchFindingExplainFor', {
                                                                finder: issue.finderName,
                                                            })}
                                                            expanded={expanded}
                                                            controls={detailId}
                                                            onClick={() =>
                                                                expandedFinders.toggle(
                                                                    issue.finderId,
                                                                )
                                                            }
                                                        >
                                                            {t('batchFindingExplainShort')}
                                                        </Disclosure>
                                                    </td>
                                                </tr>
                                                <tr>
                                                    <td
                                                        id={detailId}
                                                        colSpan={onFinderFilter ? 7 : 6}
                                                        hidden={!expanded}
                                                    >
                                                        {expanded && (
                                                            <FinderExplanation
                                                                entry={catalogueForFinder(
                                                                    issue.finderId,
                                                                    catalogueLookup,
                                                                )}
                                                                locale={i18n.language}
                                                            />
                                                        )}
                                                    </td>
                                                </tr>
                                            </Fragment>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </section>
                ))}
            </div>
            {issueGroups.some((group) => group.total > FAMILY_PREVIEW) && (
                <button type="button" onClick={() => setShowAllIssues((current) => !current)}>
                    {showAllIssues
                        ? t('batchShowFewerIssues')
                        : t('batchShowAllIssues', {
                              count: issues.length,
                              formatted: formatNumber(issues.length),
                          })}
                </button>
            )}
            <p className="hint">{t('batchIssueDensityHint')}</p>
        </>
    );
}
