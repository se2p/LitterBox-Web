// SPDX-License-Identifier: EUPL-1.2
// SPDX-FileCopyrightText: 2026 LitterBox-Web contributors

import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { SupportedLocale } from '../../../api/capabilities';
import type { ExportRequestDto } from '../../../api/generated';
import {
    EXPORT_FORMATS,
    EXPORT_FORMAT_METADATA,
    ExportApiError,
    fetchExport,
    fetchExportTargets,
    isExportFormat,
    type ExportErrorCategory,
    type ExportFormat,
    type ExportResult,
    type ExportTargets,
} from '../../../api/exports';
import { exportEligible } from '../../../lib/export-eligibility';
import type { TranslationKey } from '../../../i18n/locales';
import { Alert } from '../../Alert';
import {
    ExportTargetSelector,
    type ExportTargetSelectionKind,
    type TargetCatalogueState,
} from './ExportTargetSelector';

type TargetKind = 'program' | ExportTargetSelectionKind;
type CatalogueRequestReason = 'initial' | 'retry' | 'target-not-found';

type ExportState =
    | { status: 'idle' }
    | { status: 'preparing' }
    | { status: 'prepared'; result: ExportResult }
    | { status: 'error'; category: ExportErrorCategory };

const errorKeys: Record<ExportErrorCategory, TranslationKey> = {
    validation: 'exportErrorValidation',
    capability_disabled: 'exportErrorDisabled',
    authorization_required: 'exportErrorAuthorization',
    analysis_not_found: 'exportErrorNotFound',
    analysis_not_ready: 'exportErrorNotReady',
    capability_limit_exceeded: 'exportErrorLimit',
    unsupported_source_format: 'exportErrorUnsupported',
    target_not_found: 'exportErrorTargetNotFound',
    capability_unavailable: 'exportErrorUnavailable',
    capability_timeout: 'exportErrorTimeout',
    malformed_request: 'exportErrorRequest',
    malformed_response: 'exportErrorResponse',
    network_failure: 'exportErrorNetwork',
    canceled: 'exportErrorCanceled',
};

const formatKeys: Record<ExportFormat, { label: TranslationKey; description: TranslationKey }> = {
    scratchblocks: {
        label: 'exportFormatScratchblocks',
        description: 'exportFormatScratchblocksDescription',
    },
    goboscript: {
        label: 'exportFormatGoboscript',
        description: 'exportFormatGoboscriptDescription',
    },
    pystage: {
        label: 'exportFormatPystage',
        description: 'exportFormatPystageDescription',
    },
};

interface ExportControlsProps {
    enabled: boolean;
    token: string;
    analysisId: number;
    inputFormat: string | null | undefined;
    locale: SupportedLocale;
    /** Set where the surrounding page already names this section, so the name is not printed twice. */
    headingHidden?: boolean;
}

export function ExportControls(props: ExportControlsProps) {
    if (!exportEligible(props.enabled, props.analysisId, props.inputFormat)) return null;
    return <EligibleExportControls {...props} />;
}

function EligibleExportControls({
    token,
    analysisId,
    locale,
    headingHidden = false,
}: ExportControlsProps) {
    const { t } = useTranslation();
    const [format, setFormat] = useState<ExportFormat>('scratchblocks');
    const [targetKind, setTargetKind] = useState<TargetKind>('program');
    const [spriteName, setSpriteName] = useState('');
    const [scriptId, setScriptId] = useState('');
    const [targets, setTargets] = useState<ExportTargets | null>(null);
    const [catalogueState, setCatalogueState] = useState<TargetCatalogueState>({
        status: 'idle',
    });
    const [sourceTargetsChanged, setSourceTargetsChanged] = useState(false);
    const [state, setState] = useState<ExportState>({ status: 'idle' });
    const requestController = useRef<AbortController | undefined>(undefined);
    const requestSequence = useRef(0);
    const catalogueController = useRef<AbortController | undefined>(undefined);
    const catalogueSequence = useRef(0);
    const objectUrl = useRef<string | undefined>(undefined);
    const statusHeading = useRef<HTMLHeadingElement>(null);

    const revokeObjectUrl = () => {
        if (!objectUrl.current) return;
        if (typeof URL.revokeObjectURL === 'function') URL.revokeObjectURL(objectUrl.current);
        objectUrl.current = undefined;
    };

    const invalidatePrepared = () => {
        requestSequence.current += 1;
        requestController.current?.abort();
        requestController.current = undefined;
        revokeObjectUrl();
        setState({ status: 'idle' });
    };

    useEffect(() => {
        if (state.status === 'idle') return;
        statusHeading.current?.focus();
    }, [state.status]);

    const loadTargetCatalogue = useCallback(
        async (
            kind: ExportTargetSelectionKind,
            currentSelection: string,
            reason: CatalogueRequestReason,
        ): Promise<boolean | undefined> => {
            catalogueController.current?.abort();
            const sequence = ++catalogueSequence.current;
            const controller = new AbortController();
            catalogueController.current = controller;
            setTargets(null);
            setCatalogueState({ status: 'loading' });
            try {
                const result = await fetchExportTargets(token, analysisId, controller.signal);
                if (controller.signal.aborted || sequence !== catalogueSequence.current)
                    return undefined;

                setTargets(result);
                setCatalogueState({ status: 'ready' });
                let preserved = false;
                if (kind === 'sprite') {
                    const selectedSprite = result.sprites.find(
                        (sprite) => !sprite.stage && sprite.name === currentSelection,
                    );
                    const firstSprite = result.sprites.find((sprite) => !sprite.stage);
                    setSpriteName(
                        selectedSprite?.name ??
                            (currentSelection.length === 0 ? (firstSprite?.name ?? '') : ''),
                    );
                    preserved = selectedSprite !== undefined;
                } else {
                    const selectedScript = result.scripts.find(
                        (script) => script.scriptId === currentSelection,
                    );
                    setScriptId(
                        selectedScript?.scriptId ??
                            (currentSelection.length === 0
                                ? (result.scripts[0]?.scriptId ?? '')
                                : ''),
                    );
                    preserved = selectedScript !== undefined;
                }

                setSourceTargetsChanged(
                    !preserved && currentSelection.length > 0 && reason !== 'initial',
                );
                return preserved;
            } catch (error) {
                if (controller.signal.aborted || sequence !== catalogueSequence.current)
                    return undefined;
                const category =
                    error instanceof ExportApiError ? error.category : 'malformed_response';
                setCatalogueState({ status: 'error', category });
                return undefined;
            } finally {
                if (sequence === catalogueSequence.current) catalogueController.current = undefined;
            }
        },
        [analysisId, token],
    );

    useEffect(() => {
        catalogueSequence.current += 1;
        catalogueController.current?.abort();
        catalogueController.current = undefined;
        setTargets(null);
        setCatalogueState({ status: 'idle' });
        setSpriteName('');
        setScriptId('');
        setSourceTargetsChanged(false);

        if (targetKind === 'program') {
            return () => {
                catalogueSequence.current += 1;
                catalogueController.current?.abort();
                catalogueController.current = undefined;
            };
        }

        void loadTargetCatalogue(targetKind, '', 'initial');
        return () => {
            catalogueSequence.current += 1;
            catalogueController.current?.abort();
            catalogueController.current = undefined;
        };
    }, [loadTargetCatalogue, targetKind]);

    useEffect(
        () => () => {
            requestSequence.current += 1;
            requestController.current?.abort();
            revokeObjectUrl();
            catalogueSequence.current += 1;
            catalogueController.current?.abort();
            catalogueController.current = undefined;
        },
        [],
    );

    const target = (): ExportRequestDto['target'] => {
        if (targetKind === 'program') return { kind: 'program', spriteName: null, scriptId: null };
        if (targetKind === 'sprite') return { kind: 'sprite', spriteName, scriptId: null };
        return { kind: 'script', spriteName: null, scriptId };
    };

    const selectedSprite = targets?.sprites.find(
        (sprite) => !sprite.stage && sprite.name === spriteName,
    );
    const selectedScript = targets?.scripts.find((script) => script.scriptId === scriptId);
    const hasSelectableTarget =
        targetKind === 'program' ||
        (catalogueState.status === 'ready' &&
            (targetKind === 'sprite'
                ? selectedSprite !== undefined
                : selectedScript !== undefined));

    const prepare = async () => {
        if (!hasSelectableTarget) return;
        requestController.current?.abort();
        revokeObjectUrl();
        const sequence = ++requestSequence.current;
        const controller = new AbortController();
        requestController.current = controller;
        setState({ status: 'preparing' });
        try {
            const result = await fetchExport(
                token,
                analysisId,
                { format, target: target() },
                controller.signal,
            );
            if (controller.signal.aborted || sequence !== requestSequence.current) return;
            if (typeof URL.createObjectURL !== 'function') {
                throw new ExportApiError('malformed_response');
            }
            objectUrl.current = URL.createObjectURL(result.blob);
            setState({ status: 'prepared', result });
        } catch (error) {
            if (sequence !== requestSequence.current) return;
            const category =
                error instanceof ExportApiError ? error.category : 'malformed_response';
            if (category === 'target_not_found' && targetKind !== 'program') {
                await loadTargetCatalogue(
                    targetKind,
                    targetKind === 'sprite' ? spriteName : scriptId,
                    'target-not-found',
                );
                if (controller.signal.aborted || sequence !== requestSequence.current) return;
            }
            setState({ status: 'error', category });
        } finally {
            if (sequence === requestSequence.current) requestController.current = undefined;
        }
    };

    const cancel = () => {
        requestSequence.current += 1;
        requestController.current?.abort();
        requestController.current = undefined;
        setState({ status: 'error', category: 'canceled' });
    };

    const download = () => {
        if (state.status !== 'prepared' || !objectUrl.current) return;
        const link = document.createElement('a');
        link.href = objectUrl.current;
        link.download = state.result.metadata.filename;
        link.rel = 'noopener';
        document.body.appendChild(link);
        link.click();
        link.remove();
    };

    const changeFormat = (value: string) => {
        if (!isExportFormat(value)) return;
        invalidatePrepared();
        setFormat(value);
    };

    const changeTargetKind = (value: string) => {
        if (!['program', 'sprite', 'script'].includes(value)) return;
        invalidatePrepared();
        setSpriteName('');
        setScriptId('');
        setSourceTargetsChanged(false);
        setTargetKind(value as TargetKind);
    };

    const changeSprite = (value: string) => {
        invalidatePrepared();
        setSourceTargetsChanged(false);
        setSpriteName(value);
    };

    const changeScript = (value: string) => {
        invalidatePrepared();
        setSourceTargetsChanged(false);
        setScriptId(value);
    };

    const retryTargetCatalogue = () => {
        if (targetKind === 'program') return;
        void loadTargetCatalogue(
            targetKind,
            targetKind === 'sprite' ? spriteName : scriptId,
            'retry',
        );
    };

    const selectedFormat = EXPORT_FORMAT_METADATA[format];
    const selectedFormatDescription = t(formatKeys[format].description);
    const targetDescription =
        targetKind === 'program'
            ? t('exportTargetProgramDescription')
            : targetKind === 'sprite'
              ? t('exportTargetSpriteDescription')
              : t('exportTargetScriptDescription');

    return (
        <section className="card export-card" aria-labelledby="export-heading" lang={locale}>
            <h2
                id="export-heading"
                className={headingHidden ? 'visually-hidden' : undefined}
                tabIndex={-1}
            >
                {t('exportTitle')}
            </h2>
            <p className="export-lead">{t('exportLead')}</p>
            <p className="hint">{t('exportAuthoritativeResolution')}</p>
            <div className="export-form">
                <div className="export-field-grid">
                    <div className="form-field">
                        <label htmlFor="export-format">{t('exportFormat')}</label>
                        <select
                            id="export-format"
                            value={format}
                            onChange={(event) => changeFormat(event.target.value)}
                            disabled={state.status === 'preparing'}
                        >
                            {EXPORT_FORMATS.map((item) => (
                                <option key={item} value={item}>
                                    {t(formatKeys[item].label)} —{' '}
                                    {EXPORT_FORMAT_METADATA[item].extension}
                                </option>
                            ))}
                        </select>
                        <p id="export-format-hint" className="hint">
                            {selectedFormatDescription}{' '}
                            {t('exportExtension', { extension: selectedFormat.extension })}
                        </p>
                    </div>
                    <div className="form-field">
                        <label htmlFor="export-target">{t('exportTarget')}</label>
                        <select
                            id="export-target"
                            value={targetKind}
                            onChange={(event) => changeTargetKind(event.target.value)}
                            disabled={state.status === 'preparing'}
                        >
                            <option value="program">{t('exportTargetProgram')}</option>
                            <option value="sprite">{t('exportTargetSprite')}</option>
                            <option value="script">{t('exportTargetScript')}</option>
                        </select>
                        <p className="hint">{targetDescription}</p>
                    </div>
                </div>
                {targetKind === 'sprite' && (
                    <ExportTargetSelector
                        kind="sprite"
                        targets={targets}
                        catalogueState={catalogueState}
                        selectedSpriteName={spriteName}
                        selectedScriptId={scriptId}
                        locale={locale}
                        sourceTargetsChanged={sourceTargetsChanged}
                        onSpriteChange={changeSprite}
                        onScriptChange={changeScript}
                        onRetryCatalogue={retryTargetCatalogue}
                        disabled={state.status === 'preparing'}
                    />
                )}
                {targetKind === 'script' && (
                    <ExportTargetSelector
                        kind="script"
                        targets={targets}
                        catalogueState={catalogueState}
                        selectedSpriteName={spriteName}
                        selectedScriptId={scriptId}
                        locale={locale}
                        sourceTargetsChanged={sourceTargetsChanged}
                        onSpriteChange={changeSprite}
                        onScriptChange={changeScript}
                        onRetryCatalogue={retryTargetCatalogue}
                        disabled={state.status === 'preparing'}
                    />
                )}
                <div className="export-actions">
                    <button
                        type="button"
                        className="primary-action"
                        onClick={() => void prepare()}
                        disabled={state.status === 'preparing' || !hasSelectableTarget}
                    >
                        {state.status === 'preparing'
                            ? t('exportPreparingButton')
                            : t('exportPrepare')}
                    </button>
                    {state.status === 'preparing' && (
                        <button type="button" onClick={cancel}>
                            {t('exportCancel')}
                        </button>
                    )}
                </div>
            </div>
            {state.status === 'preparing' && (
                <div className="export-status" role="status" aria-live="polite">
                    <h3 ref={statusHeading} tabIndex={-1}>
                        {t('exportPreparing')}
                    </h3>
                    <p>{t('exportPreparingBody')}</p>
                </div>
            )}
            {state.status === 'prepared' && (
                <div
                    className="export-status export-status-prepared"
                    role="status"
                    aria-live="polite"
                >
                    <h3 ref={statusHeading} tabIndex={-1}>
                        {t('exportPrepared')}
                    </h3>
                    <p>{t('exportPreparedBody')}</p>
                    <dl className="export-metadata">
                        <div>
                            <dt>{t('exportFilename')}</dt>
                            <dd>{state.result.metadata.filename}</dd>
                        </div>
                        <div>
                            <dt>{t('exportOutputFormat')}</dt>
                            <dd>{t(formatKeys[state.result.metadata.format].label)}</dd>
                        </div>
                        <div>
                            <dt>{t('exportOutputTarget')}</dt>
                            <dd>
                                {state.result.metadata.target.kind === 'program'
                                    ? t('exportTargetProgram')
                                    : state.result.metadata.target.kind === 'sprite'
                                      ? `${t('exportTargetSprite')}: ${state.result.metadata.target.spriteName}`
                                      : selectedScript
                                        ? `${t('exportTargetScript')}: ${t('exportScriptSummary', {
                                              spriteName: selectedScript.spriteName,
                                              ordinal: selectedScript.ordinal,
                                          })}`
                                        : t('exportTargetScript')}
                            </dd>
                        </div>
                    </dl>
                    <button type="button" className="primary-action" onClick={download}>
                        {t('exportDownload')}
                    </button>
                </div>
            )}
            {state.status === 'error' && (
                <div className="export-status export-status-error" aria-live="assertive">
                    <h3 ref={statusHeading} tabIndex={-1}>
                        {t('exportRequestFailed')}
                    </h3>
                    <Alert tone="error">
                        <p>{t(errorKeys[state.category])}</p>
                    </Alert>
                    <div className="export-actions">
                        <button
                            type="button"
                            className="primary-action"
                            onClick={() => void prepare()}
                            disabled={!hasSelectableTarget}
                        >
                            {t('exportRetry')}
                        </button>
                    </div>
                </div>
            )}
        </section>
    );
}
