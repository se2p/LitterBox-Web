// SPDX-License-Identifier: EUPL-1.2
// SPDX-FileCopyrightText: 2026 LitterBox-Web contributors

import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { fetchExportTargets, type ExportTargets } from '../../api/exports';
import { ScratchblocksPreview } from '../single-project/ScratchblocksPreview';
import { spriteDisplayName } from '../single-project/sprite-name';

type CodeState =
    | { status: 'idle' }
    | { status: 'loading' }
    | { status: 'ready'; targets: ExportTargets }
    | { status: 'error' };

/**
 * The project's own scripts, sprite by sprite, beside the questions about them.
 *
 * "How many scripts does Stage have?" is not a question anyone can answer from memory, and half the generated set is
 * of that kind: they ask about the program as a whole, so unlike the questions about one script they arrive with no
 * blocks attached. Without the code a reader is guessing, and a guess marked wrong teaches nothing.
 *
 * A fold rather than a modal window. The question is what the code is being read for, and a modal would cover it.
 *
 * The sprite shown is never chosen from the question being asked. Several of the questions are about which sprite a
 * script belongs to, and opening this on the answer would give it away.
 */
export function ProjectCode({
    token,
    analysisId,
    locale,
}: {
    token: string;
    analysisId: number;
    locale: string;
}) {
    const { t } = useTranslation();
    const selectId = useId();
    const [state, setState] = useState<CodeState>({ status: 'idle' });
    const [chosen, setChosen] = useState<string>();

    const load = () => {
        if (state.status === 'loading' || state.status === 'ready') return;
        setState({ status: 'loading' });
        fetchExportTargets(token, analysisId)
            .then((targets) => setState({ status: 'ready', targets }))
            .catch(() => setState({ status: 'error' }));
    };

    const targets = state.status === 'ready' ? state.targets : undefined;
    const sprites = targets?.sprites ?? [];
    const selected = sprites.find((sprite) => sprite.name === chosen) ?? sprites[0];
    const scripts = (targets?.scripts ?? []).filter(
        (script) => selected !== undefined && script.spriteName === selected.name,
    );

    return (
        <details
            className="project-code"
            onToggle={(event) => {
                if (event.currentTarget.open) load();
            }}
        >
            <summary>{t('projectCodeTitle')}</summary>
            <p className="hint">{t('projectCodeLead')}</p>

            {state.status === 'loading' && <p role="status">{t('projectCodeLoading')}</p>}
            {state.status === 'error' && (
                <p role="alert">
                    {t('projectCodeError')}{' '}
                    {/* The fold is already open, so nothing else is going to ask for the code again. */}
                    <button type="button" onClick={load}>
                        {t('retry')}
                    </button>
                </p>
            )}

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
                    {/* Its own scroll, so a sprite with twenty scripts does not push the question it is being
                        read for off the top of the screen. */}
                    <div className="project-code-scripts">
                        {scripts.length === 0 ? (
                            /* Not "no code": that this sprite has no scripts is one of the things the questions
                               ask about, and it is as much an answer as any other number. */
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
        </details>
    );
}
