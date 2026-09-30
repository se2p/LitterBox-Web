// SPDX-License-Identifier: EUPL-1.2
// SPDX-FileCopyrightText: 2026 LitterBox-Web contributors

import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { scrollToProjectReports } from './batch-utils';
import { useProjectSetFilter } from './project-set-filter';

export function BatchTableActionButton({
    pressed,
    onPress,
    children,
}: {
    pressed: boolean;
    onPress: () => void;
    children: ReactNode;
}) {
    return (
        <button
            type="button"
            className="batch-table-action"
            aria-pressed={pressed}
            onClick={() => {
                onPress();
                scrollToProjectReports();
            }}
        >
            {children}
        </button>
    );
}

export function ProjectSetFilterButton({
    filterKey,
    ids,
    label,
    hiddenLabel,
    children,
}: {
    filterKey: string;
    ids: Iterable<string>;
    label: string;
    hiddenLabel?: string;
    children: ReactNode;
}) {
    const { t } = useTranslation();
    const filter = useProjectSetFilter();
    if (!filter) return null;
    const pressed = filter.activeKey === filterKey;
    return (
        <BatchTableActionButton
            pressed={pressed}
            onPress={() => filter.toggle(filterKey, new Set(ids), label)}
        >
            {hiddenLabel && (
                <>
                    <span className="visually-hidden">{hiddenLabel}</span>{' '}
                </>
            )}
            {pressed ? t('batchShowAllProjects') : children}
        </BatchTableActionButton>
    );
}
