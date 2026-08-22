// SPDX-License-Identifier: EUPL-1.2
// SPDX-FileCopyrightText: 2026 LitterBox-Web contributors

import { useTranslation } from 'react-i18next';
import type { SupportedLocale } from '../../../api/capabilities';
import type { InjectorViewDto } from '../../../api/generated';
import { RichHint } from '../../single-project/RichHint';

export function InjectorItem({
    injector,
    index,
    checked,
    expanded,
    busy,
    bulkMode,
    hasFinderContext,
    searchId,
    locale,
    onToggleDescription,
    onChangeSelection,
}: {
    injector: InjectorViewDto;
    index: number;
    checked: boolean;
    expanded: boolean;
    busy: boolean;
    bulkMode: boolean;
    hasFinderContext: boolean;
    searchId: string;
    locale: SupportedLocale;
    onToggleDescription: (injectorId: string) => void;
    onChangeSelection: (injectorId: string, checked: boolean) => void;
}) {
    const { t } = useTranslation();
    const descriptionId = `injection-description-${index}`;
    const contextId = `injection-context-${index}`;
    const describedBy = [
        hasFinderContext ? contextId : undefined,
        bulkMode ? `${searchId}-bulk-hint` : undefined,
    ]
        .filter(Boolean)
        .join(' ');

    return (
        <li
            className={`injection-injector${checked ? ' injection-injector-selected' : ''}`}
            key={injector.injectorId}
        >
            <div className="injection-injector-row">
                <label className="injection-injector-select">
                    {/* Left clickable at the selection limit on purpose: refusing with a reason teaches more than a
                        control that cannot be pressed and does not say why. */}
                    <input
                        type="checkbox"
                        value={injector.injectorId}
                        checked={checked}
                        onChange={(event) =>
                            onChangeSelection(injector.injectorId, event.target.checked)
                        }
                        disabled={busy || bulkMode}
                        aria-describedby={describedBy || undefined}
                    />
                    <span className="injection-injector-copy">
                        <span>{injector.name}</span>
                        {hasFinderContext && (
                            <span id={contextId} className="injection-finder-id">
                                {t('injectionFinderContext', { finderId: injector.finderId })}
                            </span>
                        )}
                    </span>
                </label>
                {/* A mark, not a sentence: the word "Description" repeated down a list of fifty is the list's noise. */}
                <button
                    type="button"
                    className="injection-injector-explain"
                    aria-expanded={expanded}
                    aria-controls={descriptionId}
                    aria-label={t('injectionExplain', { name: injector.name })}
                    onClick={() => onToggleDescription(injector.injectorId)}
                >
                    <span aria-hidden="true">?</span>
                </button>
            </div>
            {expanded && (
                <div
                    id={descriptionId}
                    className="injection-injector-description"
                    aria-label={t('injectionDescriptionFor', { name: injector.name })}
                >
                    <RichHint
                        value={injector.description}
                        locale={locale}
                        scratchblocksLabel={t('scratchblocks')}
                        textAlternativeLabel={t('textAlternative')}
                    />
                </div>
            )}
        </li>
    );
}
