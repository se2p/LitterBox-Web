// SPDX-License-Identifier: EUPL-1.2
// SPDX-FileCopyrightText: 2026 LitterBox-Web contributors

import { useMemo, useRef, useState } from 'react';
import type { TFunction } from 'i18next';
import type { AnalysisIssue } from '../../api/submissions';
import {
    compareIssueText,
    DEFAULT_ISSUE_FILTERS,
    issueFinderLabel,
    issueFinderValue,
    issueSpriteValue,
    type IssueFilterState,
    type IssueSort,
} from '../../pages/submission-utils';
import { FAMILIES, FAMILY_LABEL_KEYS, issueFamily, type IssueFamily } from './issue-family';
import { spriteDisplayName } from './sprite-name';

export interface UseIssueFiltersResult {
    types: string[];
    finders: Array<{ value: string; label: string }>;
    spriteOptions: Array<{
        value: string;
        label: string;
        count: number;
        thumbnailRef?: string | null;
    }>;
    severities: number[];
    familyOptions: Array<{ value: IssueFamily; label: string; count: number }>;
    sortOptions: Array<{ value: IssueSort; label: string }>;
    activeFilters: IssueFilterState;
    updateFilters: (changes: Partial<IssueFilterState>) => void;
    visibleIssues: AnalysisIssue[];
    groupedIssues: Map<IssueFamily, AnalysisIssue[]>;
    displayedFamilies: IssueFamily[];
    familyOpen: (family: IssueFamily) => boolean;
    openFamilies: React.RefObject<Partial<Record<IssueFamily, boolean>>>;
}

/**
 * Turns the findings of one analysis into what the result page's filter bar and finding folds actually draw: the
 * option lists a reader picks from, the reader's own filter selection normalised against the analysis they are
 * currently looking at, the findings that selection leaves visible in their sorted order, and the per-family folds
 * those findings are grouped into.
 *
 * @param analysisKey identifies which analysis the reader's filter selection belongs to, so switching to another
 * completed analysis in a batch does not carry over a selection that no longer matches it.
 */
export function useIssueFilters(
    issues: AnalysisIssue[],
    analysisKey: string,
    t: TFunction,
): UseIssueFiltersResult {
    const [filtersByAnalysis, setFiltersByAnalysis] = useState<Record<string, IssueFilterState>>(
        {},
    );
    /**
     * Which finding families the reader has unrolled or rolled up; the rest follow the default below. Remembered
     * rather than held in state, because the fold draws itself and nothing else on the page depends on it.
     */
    const openFamilies = useRef<Partial<Record<IssueFamily, boolean>>>({});
    const filters = filtersByAnalysis[analysisKey] ?? DEFAULT_ISSUE_FILTERS;
    const types = useMemo(
        () =>
            Array.from(new Set(issues.map((issue) => issue.type?.trim() ?? '')))
                .filter((value) => value.length > 0)
                .sort(),
        [issues],
    );
    const finders = useMemo(() => {
        const labels = new Map<string, string>();
        issues.forEach((issue) => {
            const value = issueFinderValue(issue);
            if (!labels.has(value))
                labels.set(
                    value,
                    `${t('issueFilterFinder')}: ${issueFinderLabel(issue, t('issueUntitled'))}`,
                );
        });
        return Array.from(labels, ([value, label]) => ({ value, label })).sort((left, right) => {
            const labelOrder = compareIssueText(left.label, right.label);
            return labelOrder || compareIssueText(left.value, right.value);
        });
    }, [issues, t]);
    const sprites = useMemo(
        () =>
            Array.from(new Set(issues.map(issueSpriteValue)))
                .filter((value) => value.length > 0)
                .sort(compareIssueText),
        [issues],
    );
    // A child picks a figure by looking at it, so each sprite filter carries that sprite's own costume.
    const spriteOptions = useMemo(() => {
        const byName = new Map<string, { count: number; thumbnailRef?: string | null }>();
        issues.forEach((issue) => {
            const name = issueSpriteValue(issue);
            if (!name) return;
            const existing = byName.get(name);
            byName.set(name, {
                count: (existing?.count ?? 0) + 1,
                thumbnailRef: existing?.thumbnailRef ?? issue.thumbnailRef,
            });
        });
        return sprites.map((name) => ({
            value: name,
            // The value stays the analyser's own name, because that is what the findings are filtered against.
            label: spriteDisplayName(name, t('stageName')),
            count: byName.get(name)?.count ?? 0,
            thumbnailRef: byName.get(name)?.thumbnailRef,
        }));
    }, [issues, sprites, t]);
    const severities = useMemo(
        () => Array.from(new Set(issues.map((issue) => issue.severity))).sort((a, b) => a - b),
        [issues],
    );
    const familyOptions = useMemo<Array<{ value: IssueFamily; label: string; count: number }>>(
        () =>
            FAMILIES.map((value) => ({
                value,
                label: t(FAMILY_LABEL_KEYS[value]),
                count: issues.filter((issue) => issueFamily(issue.type) === value).length,
            })),
        [issues, t],
    );
    const sortOptions = useMemo<Array<{ value: IssueSort; label: string }>>(
        () => [
            { value: 'result', label: t('issueSortResultOrder') },
            { value: 'sprite-finder', label: t('issueSortSpriteFinder') },
            { value: 'finder-sprite', label: t('issueSortFinderSprite') },
            { value: 'severity-desc', label: t('issueSortSeverityDescending') },
            { value: 'severity-asc', label: t('issueSortSeverityAscending') },
        ],
        [t],
    );
    const activeFilters = useMemo<IssueFilterState>(
        () => ({
            family: familyOptions.some((option) => option.value === filters.family)
                ? filters.family
                : 'all',
            type: filters.type === 'all' || types.includes(filters.type) ? filters.type : 'all',
            finder:
                filters.finder === 'all' ||
                finders.some((option) => option.value === filters.finder)
                    ? filters.finder
                    : 'all',
            sprite:
                filters.sprite === 'all' || sprites.includes(filters.sprite)
                    ? filters.sprite
                    : 'all',
            severity:
                filters.severity === 'all' ||
                severities.some((option) => String(option) === filters.severity)
                    ? filters.severity
                    : 'all',
            sort: sortOptions.some((option) => option.value === filters.sort)
                ? filters.sort
                : 'result',
        }),
        [familyOptions, filters, finders, severities, sortOptions, sprites, types],
    );
    const updateFilters = (changes: Partial<IssueFilterState>) => {
        setFiltersByAnalysis((current) => ({
            ...current,
            [analysisKey]: {
                ...(current[analysisKey] ?? DEFAULT_ISSUE_FILTERS),
                ...changes,
            },
        }));
    };
    const visibleIssues = useMemo(() => {
        const matchingIssues = issues
            .map((issue, index) => ({ issue, index }))
            .filter(({ issue }) => {
                const familyMatches =
                    activeFilters.family === 'all' ||
                    issueFamily(issue.type) === activeFilters.family;
                const typeMatches =
                    activeFilters.type === 'all' || issue.type === activeFilters.type;
                const finderMatches =
                    activeFilters.finder === 'all' ||
                    issueFinderValue(issue) === activeFilters.finder;
                const spriteMatches =
                    activeFilters.sprite === 'all' ||
                    issueSpriteValue(issue) === activeFilters.sprite;
                const severityMatches =
                    activeFilters.severity === 'all' ||
                    String(issue.severity) === activeFilters.severity;
                return (
                    familyMatches &&
                    typeMatches &&
                    finderMatches &&
                    spriteMatches &&
                    severityMatches
                );
            });

        if (activeFilters.sort === 'result') return matchingIssues.map(({ issue }) => issue);

        return matchingIssues
            .sort((left, right) => {
                if (activeFilters.sort === 'severity-desc') {
                    return right.issue.severity - left.issue.severity || left.index - right.index;
                }
                if (activeFilters.sort === 'severity-asc') {
                    return left.issue.severity - right.issue.severity || left.index - right.index;
                }
                const leftSprite = issueSpriteValue(left.issue);
                const rightSprite = issueSpriteValue(right.issue);
                const leftFinder = issueFinderLabel(left.issue, t('issueUntitled'));
                const rightFinder = issueFinderLabel(right.issue, t('issueUntitled'));
                const primary =
                    activeFilters.sort === 'sprite-finder'
                        ? compareIssueText(leftSprite, rightSprite)
                        : compareIssueText(leftFinder, rightFinder);
                const secondary =
                    activeFilters.sort === 'sprite-finder'
                        ? compareIssueText(leftFinder, rightFinder)
                        : compareIssueText(leftSprite, rightSprite);
                return primary || secondary || left.index - right.index;
            })
            .map(({ issue }) => issue);
    }, [activeFilters, issues, t]);
    const groupedIssues = useMemo(() => {
        const groups = new Map<IssueFamily, AnalysisIssue[]>();
        visibleIssues.forEach((issue) => {
            const family = issueFamily(issue.type);
            const group = groups.get(family);
            if (group) group.push(issue);
            else groups.set(family, [issue]);
        });
        return groups;
    }, [visibleIssues]);
    const displayedFamilies = useMemo<IssueFamily[]>(() => {
        const defaultFamilies: IssueFamily[] =
            activeFilters.type === 'all'
                ? FAMILIES.filter((family) => family !== 'other' || groupedIssues.has('other'))
                : [issueFamily(activeFilters.type)];
        if (activeFilters.family !== 'all') return [activeFilters.family as IssueFamily];
        if (activeFilters.sort === 'result') return defaultFamilies;
        // Sorted, the families follow the findings: the part holding the first finding is drawn first.
        const firstPosition = (family: IssueFamily): number => {
            const index = visibleIssues.findIndex((issue) => issueFamily(issue.type) === family);
            return index < 0 ? Number.MAX_SAFE_INTEGER : index;
        };
        return [...defaultFamilies].sort(
            (left, right) =>
                firstPosition(left) - firstPosition(right) ||
                defaultFamilies.indexOf(left) - defaultFamilies.indexOf(right),
        );
    }, [
        activeFilters.family,
        activeFilters.sort,
        activeFilters.type,
        groupedIssues,
        visibleIssues,
    ]);
    // Only one part is unrolled to begin with, and it is the first one that found anything: a reader arrives at
    // findings rather than at three closed doors, and still sees the whole shape of the result above them.
    const leadingFamily = displayedFamilies.find(
        (family) => (groupedIssues.get(family) ?? []).length > 0,
    );
    const familyOpen = (family: IssueFamily): boolean =>
        openFamilies.current[family] ??
        (displayedFamilies.length === 1 || family === leadingFamily);

    return {
        types,
        finders,
        spriteOptions,
        severities,
        familyOptions,
        sortOptions,
        activeFilters,
        updateFilters,
        visibleIssues,
        groupedIssues,
        displayedFamilies,
        familyOpen,
        openFamilies,
    };
}
