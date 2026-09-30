// SPDX-License-Identifier: EUPL-1.2
// SPDX-FileCopyrightText: 2026 LitterBox-Web contributors

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type {
    ActorDiffViewDto,
    DiffIssueViewDto,
    DiffViewDto,
    ScriptDiffViewDto,
} from '../../../api/generated';
import { formatNumber } from '../../../i18n';
import type { TranslationKey } from '../../../i18n/locales';
import { Card } from '../../Card';
import { DefinitionList } from '../../DataList';
import { EmptyState } from '../../States';
import { ScratchblocksPreview } from '../../single-project/ScratchblocksPreview';
import { ScriptDiffPanels } from '../../single-project/ScriptDiffPanels';
import { spriteDisplayName } from '../../single-project/sprite-name';

type IssueCategory = 'newIssues' | 'fixed' | 'removed' | 'persisting';
type DiffSection = IssueCategory | 'structure';

/**
 * What changed first, what stayed last. The findings that are in both versions are the bulk of any comparison of two
 * drafts of the same project, and leading with them would make the page read as though nothing had been compared
 * at all.
 */
const CATEGORIES: IssueCategory[] = ['newIssues', 'fixed', 'removed', 'persisting'];

const categoryLabel = (category: IssueCategory, t: (key: TranslationKey) => string): string => {
    switch (category) {
        case 'newIssues':
            return t('diffNewIssues');
        case 'fixed':
            return t('diffFixed');
        case 'removed':
            return t('diffRemoved');
        case 'persisting':
            return t('diffPersisting');
    }
};

const categoryMeaning = (category: IssueCategory, t: (key: TranslationKey) => string): string => {
    switch (category) {
        case 'newIssues':
            return t('diffNewIssuesMeaning');
        case 'fixed':
            return t('diffFixedMeaning');
        case 'removed':
            return t('diffRemovedMeaning');
        case 'persisting':
            return t('diffPersistingMeaning');
    }
};

const sectionElementId = (section: DiffSection): string => `diff-section-${section}`;

function SourceSummary({
    side,
    source,
}: {
    side: 'before' | 'after';
    source: DiffViewDto['before'];
}) {
    const { t } = useTranslation();
    return (
        <article className={`diff-source diff-source-${side}`}>
            <h3>{side === 'before' ? t('diffBefore') : t('diffAfter')}</h3>
            <DefinitionList
                items={[
                    { label: t('diffSourceName'), value: source.name },
                    { label: t('diffAnalysisId'), value: source.analysisId },
                ]}
            />
        </article>
    );
}

function DiffSummary({ value }: { value: DiffViewDto }) {
    const { t } = useTranslation();
    const counts = value.counts;
    return (
        <>
            <Card className="diff-summary" aria-labelledby="diff-sources-heading">
                <h2 id="diff-sources-heading">{t('diffSourcesTitle')}</h2>
                <div className="diff-source-grid">
                    <SourceSummary side="before" source={value.before} />
                    <SourceSummary side="after" source={value.after} />
                </div>
            </Card>
            <Card className="diff-count-summary" aria-labelledby="diff-counts-heading">
                <h2 id="diff-counts-heading">{t('diffCountsTitle')}</h2>
                <DefinitionList
                    className="diff-counts"
                    items={[
                        { label: t('diffBeforeTotal'), value: formatNumber(counts.beforeTotal) },
                        { label: t('diffAfterTotal'), value: formatNumber(counts.afterTotal) },
                        { label: t('diffNewIssues'), value: formatNumber(counts.newIssues) },
                        { label: t('diffFixed'), value: formatNumber(counts.fixed) },
                        { label: t('diffRemoved'), value: formatNumber(counts.removed) },
                        { label: t('diffPersisting'), value: formatNumber(counts.persisting) },
                    ]}
                />
                {/* Six numbers on their own invite the reader to check them against the list underneath and
                    conclude that it has not been filtered. Both totals are spelled out as the sums they are. */}
                <ul className="diff-counts-explained">
                    <li>
                        {t('diffCountsBeforeExplained', {
                            total: formatNumber(counts.beforeTotal),
                            fixed: formatNumber(counts.fixed),
                            removed: formatNumber(counts.removed),
                            persisting: formatNumber(counts.persisting),
                        })}
                    </li>
                    <li>
                        {t('diffCountsAfterExplained', {
                            total: formatNumber(counts.afterTotal),
                            added: formatNumber(counts.newIssues),
                            persisting: formatNumber(counts.persisting),
                        })}
                    </li>
                </ul>
            </Card>
        </>
    );
}

function DiffIssueCard({ issue }: { issue: DiffIssueViewDto }) {
    const { t, i18n } = useTranslation();
    const finderLabel = issue.finderName || t('diffUnnamedFinder');
    return (
        <article className="diff-issue-card">
            <div className="diff-issue-heading">
                <h4>{finderLabel}</h4>
                <span className="diff-issue-type">
                    {issue.issueType || t('diffUnknownIssueType')}
                </span>
            </div>
            {/* The block identifier names nothing a reader could look up — the script it belongs to is drawn
                below. What heads this card is the finder's own name, with its catalogue key under it for anyone
                matching this against the pattern catalogue. */}
            {issue.finderId && (
                <p className="diff-issue-finder-id">
                    <span>{t('diffFinderId')}:</span> <code>{issue.finderId}</code>
                </p>
            )}
            <DefinitionList
                className="diff-issue-details"
                items={[
                    { label: t('diffSeverity'), value: formatNumber(issue.severity) },
                    { label: t('diffSprite'), value: issue.sprite || t('diffNotProvided') },
                ]}
            />
            <ScratchblocksPreview
                source={issue.scratchblocks}
                locale={i18n.language}
                label={t('diffScratchblocksFor', { finder: finderLabel })}
                textAlternativeLabel={t('textAlternative')}
            />
        </article>
    );
}

function IssueCategorySection({
    category,
    issues,
    open,
    onToggle,
}: {
    category: IssueCategory;
    issues: DiffIssueViewDto[];
    open: boolean;
    onToggle: (open: boolean) => void;
}) {
    const { t } = useTranslation();
    const label = categoryLabel(category, t);
    return (
        <details
            id={sectionElementId(category)}
            className={`diff-category diff-category-${category}`}
            open={open}
            onToggle={(event) => onToggle(event.currentTarget.open)}
        >
            <summary className="diff-category-heading">
                <h3>{label}</h3>
                <span className="diff-category-count">{formatNumber(issues.length)}</span>
            </summary>
            <p className="diff-category-meaning">{categoryMeaning(category, t)}</p>
            {issues.length > 0 ? (
                <div className="diff-issue-list">
                    {issues.map((issue, index) => (
                        <DiffIssueCard
                            key={`${issue.finderId}-${issue.blockId ?? 'none'}-${index}`}
                            issue={issue}
                        />
                    ))}
                </div>
            ) : (
                <EmptyState>{t('diffCategoryEmpty', { category: label })}</EmptyState>
            )}
        </details>
    );
}

const changeTypeLabel = (changeType: string, t: (key: TranslationKey) => string): string => {
    switch (changeType.toLowerCase()) {
        case 'added':
            return t('diffChangeAdded');
        case 'removed':
            return t('diffChangeRemoved');
        case 'changed':
        case 'modified':
            return t('diffChangeChanged');
        case 'unchanged':
            return t('diffChangeUnchanged');
        default:
            return changeType;
    }
};

function CodeField({ label, source }: { label: string; source: string | null }) {
    const { t, i18n } = useTranslation();
    if (source === null) return null;
    if (!source.trim()) return <p className="code-empty">{t('diffCodeEmpty', { label })}</p>;
    return (
        <ScratchblocksPreview
            source={source}
            locale={i18n.language}
            label={label}
            textAlternativeLabel={t('textAlternative')}
        />
    );
}

function ScriptChange({ script }: { script: ScriptDiffViewDto }) {
    const { t, i18n } = useTranslation();
    const typeLabel = changeTypeLabel(script.changeType, t);
    const bothSidesEmpty =
        !script.beforeScratchblocks?.trim() && !script.afterScratchblocks?.trim();
    return (
        <article className="diff-script-change">
            <h4>{typeLabel}</h4>
            {/* The service marks up which blocks changed. Printing those markings as two further copies of the
                script beside the plain ones would give four drawings where the reader wanted one comparison. The
                marked-up pair is the comparison, and the plain text stands behind each side. */}
            {bothSidesEmpty ? (
                <div className="diff-script-fields">
                    <CodeField label={t('diffBeforeCode')} source={script.beforeScratchblocks} />
                    <CodeField label={t('diffAfterCode')} source={script.afterScratchblocks} />
                </div>
            ) : (
                <ScriptDiffPanels
                    before={script.beforeScratchblocks}
                    after={script.afterScratchblocks}
                    annotatedBefore={script.annotatedBeforeScratchblocks}
                    annotatedAfter={script.annotatedAfterScratchblocks}
                    locale={i18n.language}
                    beforeLabel={t('diffBeforeCode')}
                    afterLabel={t('diffAfterCode')}
                />
            )}
        </article>
    );
}

function ActorChanges({ actor }: { actor: ActorDiffViewDto }) {
    const { t } = useTranslation();
    return (
        <article className="diff-actor-change">
            <div className="diff-actor-heading">
                <h3>{spriteDisplayName(actor.actorName, t('stageName'))}</h3>
                <span className="diff-actor-kind">
                    {actor.stage ? t('diffStage') : t('diffSprite')}
                </span>
            </div>
            <div className="diff-script-list">
                {actor.scripts.map((script, index) => (
                    <ScriptChange key={`${script.changeType}-${index}`} script={script} />
                ))}
            </div>
        </article>
    );
}

function StructuralChanges({
    actors,
    open,
    onToggle,
}: {
    actors: ActorDiffViewDto[];
    open: boolean;
    onToggle: (open: boolean) => void;
}) {
    const { t } = useTranslation();
    const changedActors = actors.filter((actor) => actor.scripts.length > 0);
    return (
        <Card className="diff-structure" aria-labelledby="diff-structure-heading">
            <details
                id={sectionElementId('structure')}
                open={open}
                onToggle={(event) => onToggle(event.currentTarget.open)}
            >
                {/* A peer of the issue changes above, not one of their categories, so it keeps their level. */}
                <summary className="diff-category-heading">
                    <h2 id="diff-structure-heading">{t('diffStructureTitle')}</h2>
                    <span className="diff-category-count">
                        {formatNumber(changedActors.length)}
                    </span>
                </summary>
                {changedActors.length > 0 ? (
                    <div className="diff-actor-list">
                        {changedActors.map((actor, index) => (
                            <ActorChanges key={`${actor.actorName}-${index}`} actor={actor} />
                        ))}
                    </div>
                ) : (
                    <EmptyState>{t('diffStructureEmpty')}</EmptyState>
                )}
            </details>
        </Card>
    );
}

/**
 * A comparison is four lists of findings and a list of changed scripts, and any one of them can run to dozens of
 * cards. This says how big each part is and takes the reader to it, so nobody has to scroll past the parts they did
 * not come for.
 */
function DiffNavigation({
    counts,
    structureCount,
    onReveal,
}: {
    counts: Record<IssueCategory, number>;
    structureCount: number;
    onReveal: (section: DiffSection) => void;
}) {
    const { t } = useTranslation();
    const entries: { section: DiffSection; label: string; count: number }[] = [
        ...CATEGORIES.map((category) => ({
            section: category as DiffSection,
            label: categoryLabel(category, t),
            count: counts[category],
        })),
        { section: 'structure', label: t('diffStructureTitle'), count: structureCount },
    ];
    return (
        <nav className="diff-result-nav" aria-label={t('diffNavigationLabel')}>
            <ul>
                {entries.map((entry) => (
                    <li key={entry.section}>
                        <button type="button" onClick={() => onReveal(entry.section)}>
                            <span>{entry.label}</span>
                            <span className="diff-result-nav-count">
                                {formatNumber(entry.count)}
                            </span>
                        </button>
                    </li>
                ))}
            </ul>
        </nav>
    );
}

export function DiffResult({ value }: { value: DiffViewDto }) {
    const { t } = useTranslation();
    const changedActors = value.actors.filter((actor) => actor.scripts.length > 0);
    const counts: Record<IssueCategory, number> = {
        newIssues: value.newIssues.length,
        fixed: value.fixed.length,
        removed: value.removed.length,
        persisting: value.persisting.length,
    };
    // What changed is what the reader came for, so those parts start unrolled. The findings that are in both
    // versions start folded: they are usually the longest list and the least news.
    const [open, setOpen] = useState<Record<DiffSection, boolean>>(() => ({
        newIssues: counts.newIssues > 0,
        fixed: counts.fixed > 0,
        removed: counts.removed > 0,
        persisting: false,
        structure: changedActors.length > 0,
    }));
    const hasIssues = CATEGORIES.some((category) => counts[category] > 0);
    const changeSection = (section: DiffSection, next: boolean) =>
        setOpen((current) =>
            current[section] === next ? current : { ...current, [section]: next },
        );
    const reveal = (section: DiffSection) => {
        changeSection(section, true);
        document.getElementById(sectionElementId(section))?.scrollIntoView?.({ block: 'start' });
    };

    return (
        <div className="diff-result">
            <DiffSummary value={value} />
            <DiffNavigation
                counts={counts}
                structureCount={changedActors.length}
                onReveal={reveal}
            />
            <Card className="diff-issues" aria-labelledby="diff-issues-heading">
                <h2 id="diff-issues-heading">{t('diffIssuesTitle')}</h2>
                <div className="diff-category-list">
                    {CATEGORIES.map((category) => (
                        <IssueCategorySection
                            key={category}
                            category={category}
                            issues={value[category]}
                            open={open[category]}
                            onToggle={(next) => changeSection(category, next)}
                        />
                    ))}
                </div>
            </Card>
            {!hasIssues && changedActors.length === 0 && (
                <Card className="diff-identical" aria-labelledby="diff-identical-heading">
                    <h2 id="diff-identical-heading">{t('diffIdenticalTitle')}</h2>
                    <p>{t('diffIdenticalBody')}</p>
                </Card>
            )}
            <StructuralChanges
                actors={value.actors}
                open={open.structure}
                onToggle={(next) => changeSection('structure', next)}
            />
        </div>
    );
}
