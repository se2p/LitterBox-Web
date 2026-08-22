// SPDX-License-Identifier: EUPL-1.2
// SPDX-FileCopyrightText: 2025 LitterBox-Web contributors

import { useTranslation } from 'react-i18next';
import { FAMILY_LABEL_KEYS, issueFamily, type IssueFamily } from '../single-project/issue-family';
import type { CatalogueBlockSet } from './catalogue-utils';

export interface CatalogueControlsProps {
    query: string;
    type: string;
    family: 'all' | IssueFamily;
    familyCounts: Record<IssueFamily, number>;
    blockSet: 'all' | CatalogueBlockSet;
    blockSetCounts: Record<CatalogueBlockSet, number>;
    types: string[];
    onQueryChange: (value: string) => void;
    onTypeChange: (value: string) => void;
    onFamilyChange: (value: 'all' | IssueFamily) => void;
    onBlockSetChange: (value: 'all' | CatalogueBlockSet) => void;
}

export function CatalogueControls({
    query,
    type,
    family,
    familyCounts,
    blockSet,
    blockSetCounts,
    types,
    onQueryChange,
    onTypeChange,
    onFamilyChange,
    onBlockSetChange,
}: CatalogueControlsProps) {
    const { t } = useTranslation();
    // A filter that no entry can satisfy is a dead end, so only families that are actually catalogued get a button.
    const familyOptions = (
        [
            {
                value: 'all',
                label: t('catalogueFamilyAll'),
                count: Object.values(familyCounts).reduce((total, count) => total + count, 0),
            },
            { value: 'bug', label: t(FAMILY_LABEL_KEYS.bug), count: familyCounts.bug },
            { value: 'smell', label: t(FAMILY_LABEL_KEYS.smell), count: familyCounts.smell },
            { value: 'perfume', label: t(FAMILY_LABEL_KEYS.perfume), count: familyCounts.perfume },
            { value: 'other', label: t(FAMILY_LABEL_KEYS.other), count: familyCounts.other },
        ] satisfies { value: 'all' | IssueFamily; label: string; count: number }[]
    ).filter((option) => option.value === 'all' || option.count > 0);
    // The type of an entry is usually just its family spelled out, in which case the buttons above already cover it.
    const typesAddDetail = types.some((item) => item.trim().toLowerCase() !== issueFamily(item));
    // Offering the choice only makes sense where more than one block ecosystem is actually represented.
    const blockSetsAreMixed = Object.values(blockSetCounts).filter((count) => count > 0).length > 1;
    return (
        <form
            className="catalogue-controls"
            role="search"
            onSubmit={(event) => event.preventDefault()}
        >
            <fieldset className="catalogue-family-controls">
                <legend>{t('catalogueFamilies')}</legend>
                <div className="catalogue-family-buttons">
                    {familyOptions.map((option) => (
                        <button
                            key={option.value}
                            type="button"
                            className={`catalogue-family-button catalogue-family-button-${option.value}`}
                            aria-pressed={family === option.value}
                            onClick={() => onFamilyChange(option.value)}
                        >
                            <span>{option.label}</span>
                            <span className="catalogue-family-count" aria-hidden="true">
                                {option.count}
                            </span>
                        </button>
                    ))}
                </div>
            </fieldset>
            <label>
                {t('catalogueSearchLabel')}
                <input
                    type="search"
                    value={query}
                    placeholder={t('catalogueSearchPlaceholder')}
                    onChange={(event) => onQueryChange(event.target.value)}
                />
            </label>
            {blockSetsAreMixed && (
                <label>
                    {t('catalogueBlockSetLabel')}
                    <select
                        value={blockSet}
                        onChange={(event) =>
                            onBlockSetChange(event.target.value as 'all' | CatalogueBlockSet)
                        }
                    >
                        <option value="all">
                            {t('catalogueBlockSetAll', {
                                count: Object.values(blockSetCounts).reduce(
                                    (total, count) => total + count,
                                    0,
                                ),
                            })}
                        </option>
                        <option value="scratch">
                            {t('catalogueBlockSetScratch', { count: blockSetCounts.scratch })}
                        </option>
                        <option value="qscratch">
                            {t('catalogueBlockSetQscratch', { count: blockSetCounts.qscratch })}
                        </option>
                        <option value="mblock">
                            {t('catalogueBlockSetMblock', { count: blockSetCounts.mblock })}
                        </option>
                    </select>
                </label>
            )}
            {typesAddDetail && (
                <label>
                    {t('catalogueTypeLabel')}
                    <select value={type} onChange={(event) => onTypeChange(event.target.value)}>
                        <option value="all">{t('catalogueAllTypes')}</option>
                        {types.map((item) => (
                            <option key={item} value={item}>
                                {item}
                            </option>
                        ))}
                    </select>
                </label>
            )}
        </form>
    );
}
