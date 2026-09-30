// SPDX-License-Identifier: EUPL-1.2
// SPDX-FileCopyrightText: 2026 LitterBox-Web contributors

import { Fragment, useMemo } from 'react';
import { useIdSet } from '../../lib/useIdSet';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import type { SupportedLocale } from '../../api/capabilities';
import type { AnalysisIssue, CatalogueEntry } from '../../api/submissions';
import type { TranslationKey } from '../../i18n/locales';
import { formatNumber } from '../../i18n';
import { DataTable, SortableColumnHeader, type SortDirection } from '../Table';
import { useSortState, type SortState } from '../../lib/useSortState';
import { Disclosure } from '../Disclosure';
import { EmptyState } from '../States';
import { groupFindings, namedSprites, type FindingGroup } from '../single-project/finding-groups';
import { FamilyIcon } from '../single-project/FamilyIcon';
import {
    FAMILIES,
    FAMILY_LABEL_KEYS,
    familyTranslations,
    issueFamily,
    type IssueFamily,
} from '../single-project/issue-family';
import {
    buildCatalogueLookup,
    catalogueForFinder,
    completeProse,
    type CatalogueLookup,
} from '../single-project/catalogue-lookup';
import { RichHint } from '../single-project/RichHint';
import { CatalogueExampleList } from '../single-project/CatalogueExampleList';
import { spriteDisplayName } from '../single-project/sprite-name';
import { issueFinderLabel, compareIssueText } from '../../pages/submission-utils';

const NAMED_SPRITES = 3;

type SortColumn = 'name' | 'family' | 'severity' | 'count' | 'sprites';

interface FinderRow {
    key: string;
    finderId: string;
    name: string;
    family: IssueFamily;
    severity: number;
    count: number;
    sprites: string[];
    description?: string;
    instruction?: string;
    examples: readonly { label: string; scratchblocks: string }[];
    entryLocale: string;
    borrowedLanguage: boolean;
}

const toRow = (
    group: FindingGroup,
    catalogue: CatalogueLookup,
    untitled: string,
    stageLabel: string,
    locale: SupportedLocale,
): FinderRow => {
    const entry = catalogueForFinder(group.finderId, catalogue);
    return {
        key: group.key,
        finderId: group.finderId,
        name: issueFinderLabel(group.occurrences[0], untitled),
        family: issueFamily(group.type),
        severity: Math.max(...group.occurrences.map((occurrence) => occurrence.severity)),
        count: group.occurrences.length,
        sprites: group.sprites.map((sprite) => spriteDisplayName(sprite, stageLabel)),
        description: completeProse(entry?.description),
        instruction: completeProse(entry?.instruction),
        examples: entry?.examples ?? [],
        entryLocale: entry?.locale ?? locale,
        borrowedLanguage:
            entry !== undefined &&
            (entry.fallback || entry.locale.toLowerCase() !== locale.toLowerCase()),
    };
};

const sortRows = (
    rows: readonly FinderRow[],
    sort: SortState<SortColumn>,
    familyLabels: Record<IssueFamily, string>,
) => {
    const factor = sort.direction === 'ascending' ? 1 : -1;
    return [...rows].sort((left, right) => {
        switch (sort.column) {
            case 'name':
                return factor * compareIssueText(left.name, right.name);
            case 'family':
                return (
                    factor *
                        compareIssueText(familyLabels[left.family], familyLabels[right.family]) ||
                    right.count - left.count
                );
            case 'severity':
                return (
                    factor * (left.severity - right.severity) ||
                    compareIssueText(left.name, right.name)
                );
            case 'count':
                return (
                    factor * (left.count - right.count) || compareIssueText(left.name, right.name)
                );
            case 'sprites':
                return (
                    factor * (left.sprites.length - right.sprites.length) ||
                    compareIssueText(left.name, right.name)
                );
        }
    });
};

const defaultDirection = (column: SortColumn): SortDirection =>
    column === 'count' || column === 'sprites' || column === 'severity'
        ? 'descending'
        : 'ascending';

function FinderDetail({
    row,
    token,
    detailId,
}: {
    row: FinderRow;
    token: string;
    detailId: string;
}) {
    const { t } = useTranslation();
    const hasCatalogueText = row.description !== undefined || row.instruction !== undefined;
    // Avoid repeating catalogue entries whose instruction adds no detail.
    const instructionAddsDetail =
        row.instruction !== undefined && row.instruction !== row.description;
    return (
        <div className="task-findings-finder-detail">
            {row.borrowedLanguage && (
                <p>
                    <span className="fallback-badge">{t('catalogueEnglishFallback')}</span>
                </p>
            )}
            {row.description !== undefined && (
                <div className="task-findings-finder-explanation">
                    <p className="task-findings-finder-explanation-label">
                        {t('taskFindingsFinderWhatLabel')}
                    </p>
                    <p>
                        <RichHint value={row.description} locale={row.entryLocale} />
                    </p>
                </div>
            )}
            {instructionAddsDetail && (
                <div className="task-findings-finder-explanation">
                    <p className="task-findings-finder-explanation-label">
                        {t('taskFindingsFinderDoLabel')}
                    </p>
                    <p>
                        <RichHint value={row.instruction} locale={row.entryLocale} />
                    </p>
                </div>
            )}
            {!hasCatalogueText && row.examples.length === 0 && (
                <p className="hint">{t('taskFindingsFinderNoCatalogue')}</p>
            )}
            {row.examples.length > 0 && (
                <section aria-labelledby={`${detailId}-examples`}>
                    <p
                        className="task-findings-finder-explanation-label"
                        id={`${detailId}-examples`}
                    >
                        {t('catalogueExamples')}
                    </p>
                    <CatalogueExampleList examples={row.examples} locale={row.entryLocale} />
                </section>
            )}
            <Link
                className="task-findings-finder-link"
                to={`/submissions/${token}#issue-family-${row.family}`}
                target="_blank"
                rel="noreferrer noopener"
            >
                {t('taskFindingsFinderReportLink')}
                <span className="visually-hidden"> {t('taskFindingsFinderReportHint')}</span>
            </Link>
        </div>
    );
}

function SpritesCell({ sprites, locale }: { sprites: readonly string[]; locale: SupportedLocale }) {
    const { t } = useTranslation();
    if (sprites.length === 0) return <>—</>;
    const { named, remaining } = namedSprites(sprites, NAMED_SPRITES);
    return (
        <>
            {named.join(', ')}
            {remaining > 0 &&
                ` ${t('findingMoreSprites', { count: remaining, formatted: formatNumber(remaining, locale) })}`}
        </>
    );
}

function FinderTable({
    rows,
    token,
    locale,
    showFamily,
    showSeverity,
    familyLabels,
    caption,
    tableId,
}: {
    rows: readonly FinderRow[];
    token: string;
    locale: SupportedLocale;
    showFamily: boolean;
    showSeverity: boolean;
    familyLabels: Record<IssueFamily, string>;
    caption: string;
    tableId: string;
}) {
    const { t } = useTranslation();
    const { sort, toggle: toggleSort } = useSortState<SortColumn>(
        { column: 'count', direction: 'descending' },
        defaultDirection,
    );
    const expanded = useIdSet();
    const sorted = useMemo(() => sortRows(rows, sort, familyLabels), [rows, sort, familyLabels]);

    const columnHeader = (column: SortColumn, labelKey: TranslationKey, numeric = false) => (
        <SortableColumnHeader
            label={t(labelKey)}
            className={numeric ? 'task-findings-numeric' : undefined}
            direction={sort.column === column ? sort.direction : undefined}
            onSort={() => toggleSort(column)}
            spokenDirection={{
                ascending: t('taskFindingsSortAscending'),
                descending: t('taskFindingsSortDescending'),
            }}
        />
    );

    const columnCount = 1 + (showFamily ? 1 : 0) + (showSeverity ? 1 : 0) + 2;

    return (
        <DataTable
            className="task-findings-table"
            caption={caption}
            captionClassName="visually-hidden"
        >
            <thead>
                <tr>
                    {columnHeader('name', 'taskFindingsColumnFinder')}
                    {showFamily && columnHeader('family', 'taskFindingsColumnFamily')}
                    {showSeverity && columnHeader('severity', 'taskFindingsColumnSeverity', true)}
                    {columnHeader('count', 'taskFindingsColumnOccurrences', true)}
                    {columnHeader('sprites', 'taskFindingsColumnSprites')}
                </tr>
            </thead>
            <tbody>
                {sorted.map((row) => {
                    const isOpen = expanded.has(row.key);
                    const detailId = `task-findings-detail-${tableId}-${row.key}`;
                    return (
                        <Fragment key={row.key}>
                            <tr>
                                <td>
                                    <Disclosure
                                        variant="inline"
                                        expanded={isOpen}
                                        controls={detailId}
                                        onClick={() => expanded.toggle(row.key)}
                                    >
                                        {row.name}
                                    </Disclosure>
                                </td>
                                {showFamily && (
                                    <td>
                                        <span className="task-findings-family-cell">
                                            <FamilyIcon family={row.family} />
                                            {familyLabels[row.family]}
                                        </span>
                                    </td>
                                )}
                                {showSeverity && (
                                    <td className="task-findings-numeric">
                                        {formatNumber(row.severity, locale)}
                                    </td>
                                )}
                                <td className="task-findings-numeric">
                                    {formatNumber(row.count, locale)}
                                </td>
                                <td>
                                    <SpritesCell sprites={row.sprites} locale={locale} />
                                </td>
                            </tr>
                            {isOpen && (
                                <tr>
                                    <td id={detailId} colSpan={columnCount}>
                                        <FinderDetail row={row} token={token} detailId={detailId} />
                                    </td>
                                </tr>
                            )}
                        </Fragment>
                    );
                })}
            </tbody>
        </DataTable>
    );
}

export function TaskFindingsOverview({
    issues,
    token,
    locale,
    catalogueEntries = [],
}: {
    issues: readonly AnalysisIssue[];
    token: string;
    locale: SupportedLocale;
    catalogueEntries?: readonly CatalogueEntry[];
}) {
    const { t } = useTranslation();
    const familyLabels = useMemo(() => familyTranslations(FAMILY_LABEL_KEYS, t), [t]);
    const catalogue = useMemo(() => buildCatalogueLookup(catalogueEntries), [catalogueEntries]);
    const untitled = t('issueUntitled');
    const stageLabel = t('stageName');

    const familyCounts = useMemo(() => {
        const counts = FAMILIES.map((family) => ({
            family,
            count: issues.filter((issue) => issueFamily(issue.type) === family).length,
        }));
        const hasOther = counts.some(({ family, count }) => family === 'other' && count > 0);
        return hasOther ? counts : counts.filter(({ family }) => family !== 'other');
    }, [issues]);

    const groups = useMemo(() => groupFindings(issues), [issues]);
    const { reviewRows, strengthRows } = useMemo(() => {
        const review: FinderRow[] = [];
        const strengths: FinderRow[] = [];
        groups.forEach((group) => {
            const row = toRow(group, catalogue, untitled, stageLabel, locale);
            (issueFamily(group.type) === 'perfume' ? strengths : review).push(row);
        });
        return { reviewRows: review, strengthRows: strengths };
    }, [groups, catalogue, untitled, stageLabel, locale]);

    return (
        <>
            {issues.length === 0 ? (
                <EmptyState>{t('taskFindingsEmpty')}</EmptyState>
            ) : (
                <>
                    <dl
                        className="data-list task-findings-family-counts"
                        aria-label={t('taskFindingsByFamilyLabel')}
                    >
                        {familyCounts.map(({ family, count }) => (
                            <div key={family}>
                                <dt>
                                    <FamilyIcon family={family} />
                                    {familyLabels[family]}
                                </dt>
                                <dd>{formatNumber(count, locale)}</dd>
                            </div>
                        ))}
                    </dl>
                    <div className="task-findings-tables">
                        {reviewRows.length > 0 && (
                            <div className="task-findings-table-group">
                                <h3>{t('taskFindingsTopFindersTitle')}</h3>
                                <p className="hint">{t('taskFindingsReviewLead')}</p>
                                <FinderTable
                                    rows={reviewRows}
                                    token={token}
                                    locale={locale}
                                    showFamily
                                    showSeverity
                                    familyLabels={familyLabels}
                                    caption={t('taskFindingsTopFindersTitle')}
                                    tableId="review"
                                />
                            </div>
                        )}
                        {strengthRows.length > 0 && (
                            <div className="task-findings-table-group">
                                <h3>{t('taskFindingsStrengthsTitle')}</h3>
                                <p className="hint">{t('taskFindingsStrengthsLead')}</p>
                                <FinderTable
                                    rows={strengthRows}
                                    token={token}
                                    locale={locale}
                                    showFamily={false}
                                    showSeverity={false}
                                    familyLabels={familyLabels}
                                    caption={t('taskFindingsStrengthsTitle')}
                                    tableId="strengths"
                                />
                            </div>
                        )}
                    </div>
                </>
            )}
            <p className="task-findings-full-link">
                <Link
                    className="action-button"
                    to={`/submissions/${token}`}
                    target="_blank"
                    rel="noreferrer noopener"
                >
                    {t('taskFindingsViewFull')}
                    <span className="visually-hidden"> {t('taskFindingsFinderReportHint')}</span>
                </Link>
            </p>
        </>
    );
}
