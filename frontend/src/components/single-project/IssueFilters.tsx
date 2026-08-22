// SPDX-License-Identifier: EUPL-1.2
// SPDX-FileCopyrightText: 2025 LitterBox-Web contributors

import { useTranslation } from 'react-i18next';
import { formatNumber } from '../../i18n';
import { Thumbnail } from './Thumbnail';

export interface FamilyChoice {
    value: string;
    label: string;
    count: number;
}

export interface SpriteChoice {
    value: string;
    label: string;
    count: number;
    thumbnailRef?: string | null;
}

/**
 * Only what the filter bar cannot work out for itself. Its own wording it looks up, and the labels shared with
 * the finding cards are handed over so both read the same.
 */
interface IssueFiltersProps {
    spriteThumbnailLabel: (sprite: string) => string;
    thumbnailFallbackLabel: string;
    formatSeverity: (severity: number) => string;
    familyOptions: FamilyChoice[];
    spriteOptions: SpriteChoice[];
    types: string[];
    finders: Array<{ value: string; label: string }>;
    severities: number[];
    sortOptions: Array<{ value: string; label: string }>;
    family: string;
    type: string;
    finder: string;
    sprite: string;
    severity: string;
    sort: string;
    onFamilyChange: (value: string) => void;
    onTypeChange: (value: string) => void;
    onFinderChange: (value: string) => void;
    onSpriteChange: (value: string) => void;
    onSeverityChange: (value: string) => void;
    onSortChange: (value: string) => void;
    onReset: () => void;
}

/**
 * The everyday choices — which kind of finding, and which figure it belongs to — are buttons a child can recognise
 * without reading a label. Everything a teacher might want on top of that stays available behind the disclosure.
 */
export function IssueFilters({
    spriteThumbnailLabel,
    thumbnailFallbackLabel,
    formatSeverity,
    familyOptions,
    spriteOptions,
    types,
    finders,
    severities,
    sortOptions,
    family,
    type,
    finder,
    sprite,
    severity,
    sort,
    onFamilyChange,
    onTypeChange,
    onFinderChange,
    onSpriteChange,
    onSeverityChange,
    onSortChange,
    onReset,
}: IssueFiltersProps) {
    const { t } = useTranslation();
    const families: FamilyChoice[] = [
        { value: 'all', label: t('issueFilterAllFamilies'), count: 0 },
        ...familyOptions.filter((option) => option.count > 0),
    ];
    const showSprites = spriteOptions.length > 1;
    const showTypes = types.length > 1;
    const showFinders = finders.length > 1;
    const showSeverities = severities.length > 1;

    return (
        <div className="issue-filters" role="group" aria-label={t('issueFilter')}>
            <fieldset className="issue-choice-group">
                <legend>{t('issueFilterFamily')}</legend>
                <div className="issue-choice-row">
                    {families.map((option) => (
                        <button
                            key={option.value}
                            type="button"
                            className={`issue-choice issue-choice-${option.value}`}
                            aria-pressed={family === option.value}
                            onClick={() => onFamilyChange(option.value)}
                        >
                            <span className="issue-choice-label">{option.label}</span>
                            {option.value !== 'all' && (
                                <span className="issue-choice-count" aria-hidden="true">
                                    {formatNumber(option.count)}
                                </span>
                            )}
                        </button>
                    ))}
                </div>
            </fieldset>

            {showSprites && (
                <fieldset className="issue-choice-group">
                    <legend>{t('issueFilterSprite')}</legend>
                    <div className="issue-choice-row issue-choice-row-sprites">
                        <button
                            type="button"
                            className="issue-choice issue-choice-all"
                            aria-pressed={sprite === 'all'}
                            onClick={() => onSpriteChange('all')}
                        >
                            <span className="issue-choice-label">{t('issueFilterAllSprites')}</span>
                        </button>
                        {spriteOptions.map((option) => (
                            <button
                                key={option.value}
                                type="button"
                                className="issue-choice issue-choice-sprite"
                                aria-pressed={sprite === option.value}
                                onClick={() => onSpriteChange(option.value)}
                            >
                                {/* Decorative here: the sprite's name is right beside the picture. */}
                                <span aria-hidden="true">
                                    <Thumbnail
                                        sprite={option.value}
                                        thumbnailRef={option.thumbnailRef}
                                        label={spriteThumbnailLabel(option.label)}
                                        fallbackLabel={thumbnailFallbackLabel}
                                    />
                                </span>
                                <span className="issue-choice-label">{option.label}</span>
                                <span className="issue-choice-count" aria-hidden="true">
                                    {formatNumber(option.count)}
                                </span>
                            </button>
                        ))}
                    </div>
                </fieldset>
            )}

            <details className="issue-filters-detailed">
                <summary>{t('issueFilterDetailed')}</summary>
                <div className="issue-filters-detailed-fields">
                    {showTypes && (
                        <label>
                            {t('issueFilterType')}
                            <select
                                value={type}
                                onChange={(event) => onTypeChange(event.target.value)}
                            >
                                <option value="all">{t('catalogueAllTypes')}</option>
                                {types.map((item) => (
                                    <option key={item} value={item}>
                                        {item}
                                    </option>
                                ))}
                            </select>
                        </label>
                    )}
                    {showFinders && (
                        <label>
                            {t('issueFilterFinder')}
                            <select
                                value={finder}
                                onChange={(event) => onFinderChange(event.target.value)}
                            >
                                <option value="all">{t('issueFilterAllFinders')}</option>
                                {finders.map((item) => (
                                    <option key={item.value} value={item.value}>
                                        {item.label}
                                    </option>
                                ))}
                            </select>
                        </label>
                    )}
                    {showSeverities && (
                        <label>
                            {t('issueFilterSeverity')}
                            <select
                                value={severity}
                                onChange={(event) => onSeverityChange(event.target.value)}
                            >
                                <option value="all">{t('catalogueAllSeverities')}</option>
                                {severities.map((item) => (
                                    <option key={item} value={item}>
                                        {formatSeverity(item)}
                                    </option>
                                ))}
                            </select>
                        </label>
                    )}
                    <label>
                        {t('issueSortLabel')}
                        <select value={sort} onChange={(event) => onSortChange(event.target.value)}>
                            {sortOptions.map((item) => (
                                <option key={item.value} value={item.value}>
                                    {item.label}
                                </option>
                            ))}
                        </select>
                    </label>
                    <button type="button" className="issue-filters-reset" onClick={onReset}>
                        {t('issueFilterReset')}
                    </button>
                </div>
            </details>
        </div>
    );
}
