// SPDX-License-Identifier: EUPL-1.2
// SPDX-FileCopyrightText: 2025 LitterBox-Web contributors

import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { fetchCatalogue } from '../api/submissions';
import { CatalogueControls } from '../components/catalogue/CatalogueControls';
import { CatalogueEntryCard } from '../components/catalogue/CatalogueEntryCard';
import {
    catalogueBlockSet,
    catalogueHasContent,
    catalogueIssueType,
    catalogueSearchText,
    type CatalogueBlockSet,
} from '../components/catalogue/catalogue-utils';
import { Alert } from '../components/Alert';
import { Card } from '../components/Card';
import { EmptyState, ErrorState, LoadingState } from '../components/States';
import { PageMain } from '../components/Page';
import { issueFamily, type IssueFamily } from '../components/single-project/issue-family';
import { useAsync } from '../lib/useAsync';

interface CataloguePageProps {
    applicationLocale: string;
    serverLocales?: string[];
    capabilitiesLoading: boolean;
    capabilityMismatch: boolean;
}

const localeMismatch = (applicationLocale: string, serverLocales?: string[]): boolean =>
    Boolean(serverLocales && !serverLocales.includes(applicationLocale));

export function CataloguePage({
    applicationLocale,
    serverLocales,
    capabilitiesLoading,
    capabilityMismatch,
}: CataloguePageProps) {
    const { t } = useTranslation();
    const [query, setQuery] = useState('');
    const [type, setType] = useState('all');
    const [family, setFamily] = useState<'all' | IssueFamily>('all');
    const [blockSet, setBlockSet] = useState<'all' | CatalogueBlockSet>('all');
    const activeLocaleMismatch = localeMismatch(applicationLocale, serverLocales);
    const clearFilters = () => {
        setQuery('');
        setType('all');
        setFamily('all');
        setBlockSet('all');
    };

    const { state, reload } = useAsync(
        (signal) => fetchCatalogue(applicationLocale, signal),
        [applicationLocale],
        { enabled: !capabilitiesLoading && !capabilityMismatch && !activeLocaleMismatch },
    );

    const entries = useMemo(
        // Umbrella finders whose variants carry the text answer with their own id as the description; an entry that
        // only repeats its own name is not a catalogue entry.
        () => (state.status === 'ready' ? state.value.filter(catalogueHasContent) : []),
        [state],
    );
    /*
     * Titles that more than one entry carries. Taken over the whole catalogue rather than over what the filters
     * left standing, so a qualifier does not appear and disappear as a reader narrows the list: whether two entries
     * are called the same thing is a fact about the catalogue, not about the current view of it.
     */
    const sharedTitles = useMemo(() => {
        const seen = new Set<string>();
        const shared = new Set<string>();
        entries.forEach((entry) => {
            if (seen.has(entry.title)) shared.add(entry.title);
            seen.add(entry.title);
        });
        return shared;
    }, [entries]);
    const types = useMemo(
        () =>
            Array.from(
                new Set(
                    entries.map(catalogueIssueType).filter((item): item is string => Boolean(item)),
                ),
            ).sort((a, b) => a.localeCompare(b)),
        [entries],
    );
    // Each of the two headline filters counts what the other one has already left standing, so the number on a button
    // is the number of entries clicking it would actually show.
    const familyCounts = useMemo<Record<IssueFamily, number>>(
        () =>
            entries
                .filter((entry) => blockSet === 'all' || catalogueBlockSet(entry) === blockSet)
                .reduce<Record<IssueFamily, number>>(
                    (counts, entry) => {
                        counts[issueFamily(catalogueIssueType(entry))] += 1;
                        return counts;
                    },
                    { bug: 0, smell: 0, perfume: 0, other: 0 },
                ),
        [entries, blockSet],
    );
    const blockSetCounts = useMemo<Record<CatalogueBlockSet, number>>(
        () =>
            entries
                .filter(
                    (entry) =>
                        family === 'all' || issueFamily(catalogueIssueType(entry)) === family,
                )
                .reduce<Record<CatalogueBlockSet, number>>(
                    (counts, entry) => {
                        counts[catalogueBlockSet(entry)] += 1;
                        return counts;
                    },
                    { scratch: 0, qscratch: 0, mblock: 0 },
                ),
        [entries, family],
    );
    const visibleEntries = useMemo(() => {
        const normalizedQuery = query.trim().toLocaleLowerCase();
        return (
            [...entries]
                .filter(
                    (entry) =>
                        !normalizedQuery || catalogueSearchText(entry).includes(normalizedQuery),
                )
                .filter((entry) => type === 'all' || catalogueIssueType(entry) === type)
                .filter(
                    (entry) =>
                        family === 'all' || issueFamily(catalogueIssueType(entry)) === family,
                )
                .filter((entry) => blockSet === 'all' || catalogueBlockSet(entry) === blockSet)
                // A reader looking for a pattern knows what it is called. The id after it only breaks ties between
                // entries sharing a title: it sorts by a string the page never shows and groups entries by nothing
                // a reader can see, so the name is the only order this list is read in.
                .sort(
                    (left, right) =>
                        left.title.localeCompare(right.title, applicationLocale) ||
                        left.id.localeCompare(right.id),
                )
        );
    }, [applicationLocale, blockSet, entries, family, query, type]);

    return (
        <PageMain>
            <section className="hero" aria-labelledby="catalogue-heading">
                <h1 id="catalogue-heading">{t('catalogueTitle')}</h1>
                <p className="lead">{t('catalogueLead')}</p>
            </section>

            {capabilitiesLoading && (
                <LoadingState heading={t('catalogueTitle')} message={t('catalogueLoading')} />
            )}
            {(capabilityMismatch || activeLocaleMismatch) && (
                <Card aria-labelledby="catalogue-locale-heading">
                    <h2 id="catalogue-locale-heading">{t('localeIncompatibilityTitle')}</h2>
                    <Alert tone="error">
                        <p>
                            {t(
                                capabilityMismatch
                                    ? 'localeSetIncompatibilityBody'
                                    : 'localeIncompatibilityBody',
                            )}
                        </p>
                    </Alert>
                </Card>
            )}
            {!capabilitiesLoading && !capabilityMismatch && !activeLocaleMismatch && (
                <>
                    {state.status === 'loading' && (
                        <LoadingState
                            heading={t('catalogueTitle')}
                            message={t('catalogueLoading')}
                        />
                    )}
                    {state.status === 'error' && (
                        <ErrorState
                            heading={t('catalogueTitle')}
                            message={t('catalogueError')}
                            technicalDetail={state.error}
                            retryLabel={t('catalogueRetry')}
                            onRetry={reload}
                        />
                    )}
                    {state.status === 'ready' && (
                        <Card className="catalogue-panel">
                            <CatalogueControls
                                query={query}
                                type={type}
                                family={family}
                                familyCounts={familyCounts}
                                blockSet={blockSet}
                                blockSetCounts={blockSetCounts}
                                types={types}
                                onQueryChange={setQuery}
                                onTypeChange={(value) => {
                                    setType(value);
                                    setFamily('all');
                                }}
                                onFamilyChange={(value) => {
                                    setFamily(value);
                                    setType('all');
                                }}
                                onBlockSetChange={setBlockSet}
                            />
                            <p className="catalogue-result-count" role="status" aria-live="polite">
                                {t('catalogueResultsCount', { count: visibleEntries.length })}
                            </p>
                            {visibleEntries.length > 0 ? (
                                <div className="catalogue-list">
                                    {visibleEntries.map((entry) => (
                                        <CatalogueEntryCard
                                            key={entry.id}
                                            entry={entry}
                                            requestedLocale={applicationLocale}
                                            titleShared={sharedTitles.has(entry.title)}
                                        />
                                    ))}
                                </div>
                            ) : (
                                <EmptyState>
                                    {t('catalogueEmpty')}
                                    {/* Nothing left to look at is the one place a reader cannot see which
                                        filter did it, so the way out is offered rather than described. */}
                                    <button
                                        type="button"
                                        className="catalogue-clear-filters"
                                        onClick={clearFilters}
                                    >
                                        {t('catalogueClearFilters')}
                                    </button>
                                </EmptyState>
                            )}
                        </Card>
                    )}
                </>
            )}
        </PageMain>
    );
}
