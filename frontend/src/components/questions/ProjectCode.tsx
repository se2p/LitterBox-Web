// SPDX-License-Identifier: EUPL-1.2
// SPDX-FileCopyrightText: 2026 LitterBox-Web contributors

import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { ExportTargets } from '../../api/exports';
import { useAsync } from '../../lib/useAsync';
import { ScratchblocksPreview } from '../single-project/ScratchblocksPreview';
import { spriteDisplayName } from '../single-project/sprite-name';

export type LoadProjectCode = () => Promise<ExportTargets | undefined>;

export function ProjectCode({
    loadCode,
    locale,
    title,
    lead,
}: {
    loadCode: LoadProjectCode;
    locale: string;
    title?: string;
    lead?: string;
}) {
    const { t } = useTranslation();
    const [opened, setOpened] = useState(false);
    return (
        <details
            className="project-code"
            onToggle={(event) => {
                if (event.currentTarget.open) setOpened(true);
            }}
        >
            <summary>{title ?? t('projectCodeTitle')}</summary>
            <p className="hint">{lead ?? t('projectCodeLead')}</p>
            {opened && <ProjectCodeViewer loadCode={loadCode} locale={locale} />}
        </details>
    );
}

export function ProjectCodeViewer({
    loadCode,
    locale,
}: {
    loadCode: LoadProjectCode;
    locale: string;
}) {
    const { t } = useTranslation();
    const selectId = useId();
    const { state, reload } = useAsync(() => loadCode(), [], { toError: () => undefined });
    const [chosen, setChosen] = useState<string>();

    const targets = state.status === 'ready' ? state.value : undefined;
    const unavailable = state.status === 'ready' && state.value === undefined;
    const sprites = targets?.sprites ?? [];
    const selected = sprites.find((sprite) => sprite.name === chosen) ?? sprites[0];
    const scripts = (targets?.scripts ?? []).filter(
        (script) => selected !== undefined && script.spriteName === selected.name,
    );

    return (
        <div className="project-code-viewer">
            {state.status === 'loading' && <p role="status">{t('projectCodeLoading')}</p>}
            {state.status === 'error' && (
                <p role="alert">
                    {t('projectCodeError')}{' '}
                    <button type="button" onClick={reload}>
                        {t('retry')}
                    </button>
                </p>
            )}
            {unavailable && <p role="status">{t('projectCodeUnavailable')}</p>}

            {targets !== undefined && sprites.length === 0 && (
                <p role="status">{t('projectCodeEmpty')}</p>
            )}

            {selected !== undefined && (
                <>
                    <label className="project-code-sprite" htmlFor={selectId}>
                        <span>{t('projectCodeSprite')}</span>
                        <select
                            id={selectId}
                            value={selected.name}
                            onChange={(event) => setChosen(event.target.value)}
                        >
                            {sprites.map((sprite) => (
                                <option key={sprite.name} value={sprite.name}>
                                    {spriteDisplayName(sprite.name, t('stageName'))}
                                </option>
                            ))}
                        </select>
                    </label>
                    <div className="project-code-scripts">
                        {scripts.length === 0 ? (
                            <p role="status">
                                {t('projectCodeNoScripts', {
                                    sprite: spriteDisplayName(selected.name, t('stageName')),
                                })}
                            </p>
                        ) : (
                            <ol>
                                {scripts.map((script) => (
                                    <li key={script.scriptId}>
                                        <ScratchblocksPreview
                                            source={script.scratchblocks}
                                            locale={locale}
                                            label={t('projectCodeScript', {
                                                number: script.ordinal,
                                            })}
                                            textAlternativeLabel={t('textAlternative')}
                                        />
                                    </li>
                                ))}
                            </ol>
                        )}
                    </div>
                </>
            )}
        </div>
    );
}
