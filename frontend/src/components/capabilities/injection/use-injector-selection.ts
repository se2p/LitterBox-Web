// SPDX-License-Identifier: EUPL-1.2
// SPDX-FileCopyrightText: 2026 LitterBox-Web contributors

import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { SupportedLocale } from '../../../api/capabilities';
import type { InjectorCatalogueViewDto, InjectorViewDto } from '../../../api/generated';
import { normalizeSearchText, searchableInjectorText } from './injection-utils';

export type InjectorSelectionMode = 'explicit' | 'all';

interface UseInjectorSelectionParams {
    catalogue: InjectorCatalogueViewDto | undefined;
    injectors: InjectorViewDto[];
    locale: SupportedLocale;
    busy: boolean;
    /** A catalogue on its way in; whatever was chosen belonged to the one being replaced. */
    loading: boolean;
    /** Called before every change to the selection; the request hook decides what that invalidates. */
    onSelectionChange: () => void;
}

export interface InjectorSelection {
    searchTerm: string;
    setSearchTerm: (value: string) => void;
    expandedInjectorIds: Set<string>;
    toggleDescription: (injectorId: string) => void;
    selectedInjectorIds: string[];
    selectionMode: InjectorSelectionMode;
    selectionAnnouncement: string;
    visibleInjectors: InjectorViewDto[];
    filteredSelectedInjectors: InjectorViewDto[];
    duplicateNames: Map<string, number>;
    explicitLimit: number;
    selectedCount: number;
    /** One line for the whole chooser: how many are chosen, out of how many allowed, out of how many shown. */
    catalogueStatus: string;
    selectAllVisibleIsDistinct: boolean;
    visibleSelectionCount: number;
    selectAllVisibleTooLarge: boolean;
    changeInjectorSelection: (injectorId: string, checked: boolean) => void;
    clearSelection: () => void;
    selectAll: () => void;
    chooseCustomSubset: () => void;
    selectAllVisible: () => void;
}

/**
 * The injector catalogue as the reader sees it: what the search box leaves visible, which injectors are ticked, in
 * which mode, and what has been said out loud about each change.
 */
export function useInjectorSelection({
    catalogue,
    injectors,
    locale,
    busy,
    loading,
    onSelectionChange,
}: UseInjectorSelectionParams): InjectorSelection {
    const { t } = useTranslation();
    const [selectedInjectorIds, setSelectedInjectorIds] = useState<string[]>([]);
    const [selectionMode, setSelectionMode] = useState<InjectorSelectionMode>('explicit');
    const [searchTerm, setSearchTerm] = useState('');
    const [expandedInjectorIds, setExpandedInjectorIds] = useState<Set<string>>(() => new Set());
    const [selectionAnnouncement, setSelectionAnnouncement] = useState('');

    /**
     * Back to the blank slate a fresh catalogue starts from. The collections are replaced only when they hold
     * something, so a reset of an already-empty chooser — which is every first load — costs no render.
     */
    useEffect(() => {
        if (!loading) return;
        setSelectedInjectorIds((previous) => (previous.length === 0 ? previous : []));
        setExpandedInjectorIds((previous) => (previous.size === 0 ? previous : new Set()));
        setSelectionMode('explicit');
        setSearchTerm('');
        setSelectionAnnouncement('');
    }, [loading]);

    const normalizedSearchTerm = normalizeSearchText(searchTerm, locale);
    const injectorSearchText = useMemo(
        () =>
            new Map(
                injectors.map((injector) => [
                    injector.injectorId,
                    searchableInjectorText(injector, locale),
                ]),
            ),
        [injectors, locale],
    );
    const visibleInjectors = useMemo(
        () =>
            injectors.filter(
                (injector) =>
                    !normalizedSearchTerm ||
                    injectorSearchText.get(injector.injectorId)?.includes(normalizedSearchTerm),
            ),
        [injectorSearchText, injectors, normalizedSearchTerm],
    );
    const visibleInjectorIds = useMemo(
        () => new Set(visibleInjectors.map((injector) => injector.injectorId)),
        [visibleInjectors],
    );
    const filteredSelectedInjectors = useMemo(
        () =>
            injectors.filter(
                (injector) =>
                    selectionMode === 'explicit' &&
                    selectedInjectorIds.includes(injector.injectorId) &&
                    !visibleInjectorIds.has(injector.injectorId),
            ),
        [injectors, selectedInjectorIds, selectionMode, visibleInjectorIds],
    );
    const duplicateNames = useMemo(() => {
        const counts = new Map<string, number>();
        for (const injector of injectors)
            counts.set(injector.name, (counts.get(injector.name) ?? 0) + 1);
        return counts;
    }, [injectors]);

    const explicitLimit = catalogue?.maxSelectedInjectors ?? 0;
    const selectedCount = selectionMode === 'all' ? injectors.length : selectedInjectorIds.length;

    /** Back to picking injectors one at a time, with nothing picked. Said differently depending on how it was asked for. */
    const chooseExplicitSelection = (announcement: string) => {
        onSelectionChange();
        setSelectionMode('explicit');
        setSelectedInjectorIds([]);
        setSelectionAnnouncement(announcement);
    };

    const changeInjectorSelection = (injectorId: string, checked: boolean) => {
        if (selectionMode === 'all') {
            setSelectionAnnouncement(
                t('injectionBulkModeAnnouncement', { count: injectors.length }),
            );
            return;
        }
        if (
            checked &&
            !selectedInjectorIds.includes(injectorId) &&
            selectedInjectorIds.length >= explicitLimit
        ) {
            setSelectionAnnouncement(t('injectionSelectionRejected', { limit: explicitLimit }));
            return;
        }
        onSelectionChange();
        setSelectionAnnouncement(
            t(checked ? 'injectionSelectionAdded' : 'injectionSelectionRemoved', {
                name:
                    injectors.find((injector) => injector.injectorId === injectorId)?.name ??
                    injectorId,
                count: checked ? selectedInjectorIds.length + 1 : selectedInjectorIds.length - 1,
                limit: explicitLimit,
            }),
        );
        setSelectedInjectorIds((previous) => {
            if (checked)
                return previous.includes(injectorId) ? previous : [...previous, injectorId];
            return previous.filter((value) => value !== injectorId);
        });
    };

    const clearSelection = () => {
        if (selectionMode === 'explicit' && selectedInjectorIds.length === 0) return;
        chooseExplicitSelection(t('injectionSelectionClearedAnnouncement'));
    };

    const selectAll = () => {
        if (!catalogue?.allSelectionSupported || injectors.length === 0 || busy) return;
        onSelectionChange();
        setSelectionMode('all');
        setSelectedInjectorIds([]);
        setSelectionAnnouncement(t('injectionBulkModeAnnouncement', { count: injectors.length }));
    };

    const chooseCustomSubset = () => {
        if (selectionMode !== 'all' || busy) return;
        chooseExplicitSelection(t('injectionCustomModeAnnouncement', { limit: explicitLimit }));
    };

    const selectAllVisible = () => {
        if (selectionMode !== 'explicit' || visibleInjectors.length === 0) return;
        const visibleSelection = [
            ...selectedInjectorIds,
            ...visibleInjectors
                .map((injector) => injector.injectorId)
                .filter((injectorId) => !selectedInjectorIds.includes(injectorId)),
        ];
        if (visibleSelection.length > explicitLimit) {
            setSelectionAnnouncement(
                t('injectionVisibleSelectionRejected', {
                    count: visibleSelection.length,
                    limit: explicitLimit,
                }),
            );
            return;
        }
        onSelectionChange();
        setSelectedInjectorIds(visibleSelection);
        setSelectionAnnouncement(
            t('injectionVisibleSelectionAnnouncement', {
                count: visibleSelection.length,
                limit: explicitLimit,
            }),
        );
    };

    const toggleDescription = (injectorId: string) => {
        setExpandedInjectorIds((previous) => {
            const next = new Set(previous);
            if (next.has(injectorId)) next.delete(injectorId);
            else next.add(injectorId);
            return next;
        });
    };

    const catalogueStatus =
        selectionMode === 'all'
            ? t('injectionBulkMode', { count: injectors.length })
            : t('injectionCatalogueStatus', {
                  visible: visibleInjectors.length,
                  total: injectors.length,
                  selected: selectedCount,
                  limit: explicitLimit,
              });
    const selectAllVisibleIsDistinct =
        visibleInjectors.length > 0 &&
        visibleInjectors.some((injector) => !selectedInjectorIds.includes(injector.injectorId)) &&
        (!catalogue?.allSelectionSupported || visibleInjectors.length < injectors.length);
    const visibleSelectionCount = new Set([
        ...selectedInjectorIds,
        ...visibleInjectors.map((injector) => injector.injectorId),
    ]).size;
    const selectAllVisibleTooLarge = visibleSelectionCount > explicitLimit;

    return {
        searchTerm,
        setSearchTerm,
        expandedInjectorIds,
        toggleDescription,
        selectedInjectorIds,
        selectionMode,
        selectionAnnouncement,
        visibleInjectors,
        filteredSelectedInjectors,
        duplicateNames,
        explicitLimit,
        selectedCount,
        catalogueStatus,
        selectAllVisibleIsDistinct,
        visibleSelectionCount,
        selectAllVisibleTooLarge,
        changeInjectorSelection,
        clearSelection,
        selectAll,
        chooseCustomSubset,
        selectAllVisible,
    };
}
