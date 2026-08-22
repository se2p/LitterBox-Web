// SPDX-License-Identifier: EUPL-1.2
// SPDX-FileCopyrightText: 2026 LitterBox-Web contributors

import { useTranslation } from 'react-i18next';
import { spriteDisplayName } from '../../single-project/sprite-name';
import type { SupportedLocale } from '../../../api/capabilities';
import type { ExportErrorCategory, ExportTargets } from '../../../api/exports';
import type { TranslationKey } from '../../../i18n/locales';
import { Alert } from '../../Alert';
import { ScratchblocksPreview } from '../../single-project/ScratchblocksPreview';

export type ExportTargetSelectionKind = 'sprite' | 'script';

export type TargetCatalogueState =
    | { status: 'idle' }
    | { status: 'loading' }
    | { status: 'ready' }
    | { status: 'error'; category: ExportErrorCategory };

interface ExportTargetSelectorProps {
    kind: ExportTargetSelectionKind;
    targets: ExportTargets | null;
    catalogueState: TargetCatalogueState;
    selectedSpriteName: string;
    selectedScriptId: string;
    locale: SupportedLocale;
    disabled: boolean;
    sourceTargetsChanged: boolean;
    onSpriteChange: (value: string) => void;
    onScriptChange: (value: string) => void;
    onRetryCatalogue: () => void;
}

const catalogueErrorKeys: Partial<Record<ExportErrorCategory, TranslationKey>> = {
    capability_disabled: 'exportErrorDisabled',
    authorization_required: 'exportErrorAuthorization',
    analysis_not_found: 'exportErrorNotFound',
    analysis_not_ready: 'exportErrorNotReady',
    capability_limit_exceeded: 'exportErrorLimit',
    unsupported_source_format: 'exportErrorUnsupported',
    capability_unavailable: 'exportErrorUnavailable',
    capability_timeout: 'exportErrorTimeout',
    malformed_response: 'exportErrorResponse',
    malformed_request: 'exportErrorRequest',
    network_failure: 'exportErrorNetwork',
    canceled: 'exportErrorCanceled',
    validation: 'exportErrorValidation',
};

function CatalogueStatus({
    kind,
    targets,
    catalogueState,
    onRetryCatalogue,
}: Pick<ExportTargetSelectorProps, 'kind' | 'targets' | 'catalogueState' | 'onRetryCatalogue'>) {
    const { t } = useTranslation();
    const emptyKey: TranslationKey =
        kind === 'sprite' ? 'exportTargetsEmptySprites' : 'exportTargetsEmptyScripts';

    if (catalogueState.status === 'loading') {
        return (
            <p className="export-target-status" role="status" aria-live="polite" aria-busy="true">
                {t('exportTargetsLoading')}
            </p>
        );
    }

    if (catalogueState.status === 'error') {
        const messageKey = catalogueErrorKeys[catalogueState.category] ?? 'exportErrorResponse';
        return (
            <Alert tone="error">
                <p>{t(messageKey)}</p>
                <button type="button" onClick={onRetryCatalogue}>
                    {t('exportTargetsRetry')}
                </button>
            </Alert>
        );
    }

    const availableTargets =
        kind === 'sprite'
            ? (targets?.sprites.filter((sprite) => !sprite.stage) ?? [])
            : (targets?.scripts ?? []);
    if (catalogueState.status === 'ready' && availableTargets.length === 0) {
        return (
            <p className="export-target-status" role="status" aria-live="polite">
                {t(emptyKey)}
            </p>
        );
    }

    return null;
}

export function ExportTargetSelector({
    kind,
    targets,
    catalogueState,
    selectedSpriteName,
    selectedScriptId,
    locale,
    disabled,
    sourceTargetsChanged,
    onSpriteChange,
    onScriptChange,
    onRetryCatalogue,
}: ExportTargetSelectorProps) {
    const { t } = useTranslation();
    const sprites = targets?.sprites.filter((sprite) => !sprite.stage) ?? [];
    const scripts = targets?.scripts ?? [];

    if (kind === 'sprite') {
        return (
            <div className="form-field export-target-field export-target-selector">
                <label htmlFor="export-sprite-choice">{t('exportSpriteChoice')}</label>
                <select
                    id="export-sprite-choice"
                    value={selectedSpriteName}
                    onChange={(event) => onSpriteChange(event.target.value)}
                    disabled={disabled || catalogueState.status !== 'ready' || sprites.length === 0}
                    aria-describedby="export-sprite-choice-hint"
                >
                    <option value="">{t('exportSelectSprite')}</option>
                    {sprites.map((sprite) => (
                        <option key={sprite.name} value={sprite.name}>
                            {sprite.name}
                        </option>
                    ))}
                </select>
                <p id="export-sprite-choice-hint" className="hint">
                    {t('exportSpriteChoiceHint')}
                </p>
                {sourceTargetsChanged && (
                    <p className="export-target-notice" role="status" aria-live="polite">
                        {t('exportTargetsChanged')}
                    </p>
                )}
                <CatalogueStatus
                    kind={kind}
                    targets={targets}
                    catalogueState={catalogueState}
                    onRetryCatalogue={onRetryCatalogue}
                />
            </div>
        );
    }

    const selectedIndex = scripts.findIndex((script) => script.scriptId === selectedScriptId);
    const selectedScript = selectedIndex >= 0 ? scripts[selectedIndex] : undefined;
    const previewLabel = selectedScript
        ? t('exportScriptPreviewLabel', {
              spriteName: spriteDisplayName(selectedScript.spriteName, t('stageName')),
              ordinal: selectedScript.ordinal,
          })
        : t('exportScriptPreview');

    return (
        <fieldset className="export-target-field export-script-browser">
            <legend>{t('exportScriptChoice')}</legend>
            <label htmlFor="export-script-choice">{t('exportScriptChoice')}</label>
            <select
                id="export-script-choice"
                value={selectedScriptId}
                onChange={(event) => onScriptChange(event.target.value)}
                disabled={disabled || catalogueState.status !== 'ready' || scripts.length === 0}
            >
                <option value="">{t('exportSelectScript')}</option>
                {scripts.map((script) => (
                    <option key={script.scriptId} value={script.scriptId}>
                        {t('exportScriptSummary', {
                            spriteName: spriteDisplayName(script.spriteName, t('stageName')),
                            ordinal: script.ordinal,
                        })}
                    </option>
                ))}
            </select>
            {selectedScript && (
                <>
                    <div
                        className="export-script-navigation"
                        role="group"
                        aria-label={t('exportScriptNavigation')}
                    >
                        <button
                            type="button"
                            onClick={() => onScriptChange(scripts[selectedIndex - 1]!.scriptId)}
                            disabled={
                                disabled || selectedIndex <= 0 || catalogueState.status !== 'ready'
                            }
                        >
                            {t('exportPreviousScript')}
                        </button>
                        <span className="export-script-position" role="status" aria-live="polite">
                            {t('exportScriptPosition', {
                                current: selectedIndex + 1,
                                total: scripts.length,
                            })}
                        </span>
                        <button
                            type="button"
                            onClick={() => onScriptChange(scripts[selectedIndex + 1]!.scriptId)}
                            disabled={
                                disabled ||
                                selectedIndex < 0 ||
                                selectedIndex >= scripts.length - 1 ||
                                catalogueState.status !== 'ready'
                            }
                        >
                            {t('exportNextScript')}
                        </button>
                    </div>
                    <p className="export-script-summary" aria-live="polite">
                        {t('exportScriptSummary', {
                            spriteName: selectedScript.spriteName,
                            ordinal: selectedScript.ordinal,
                        })}
                    </p>
                    <div id="export-script-preview" className="export-script-preview">
                        {selectedScript.scratchblocks.trim() ? (
                            <ScratchblocksPreview
                                source={selectedScript.scratchblocks}
                                locale={locale}
                                label={previewLabel}
                                textAlternativeLabel={t('exportScriptPreviewTextAlternative')}
                            />
                        ) : (
                            <p className="export-target-status" role="status" aria-live="polite">
                                {t('exportScriptPreviewEmpty')}
                            </p>
                        )}
                    </div>
                </>
            )}
            <CatalogueStatus
                kind={kind}
                targets={targets}
                catalogueState={catalogueState}
                onRetryCatalogue={onRetryCatalogue}
            />
            {sourceTargetsChanged && (
                <p className="export-target-notice" role="status" aria-live="polite">
                    {t('exportTargetsChanged')}
                </p>
            )}
        </fieldset>
    );
}
