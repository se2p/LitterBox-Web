// SPDX-License-Identifier: EUPL-1.2
// SPDX-FileCopyrightText: 2026 LitterBox-Web contributors

import { useTranslation } from 'react-i18next';
import type { ChangeEvent } from 'react';
import type { AnalysisReferenceDto } from '../../../api/generated';
import type { ArchivePreflightResult } from '../../../lib/archive-preflight';
import { formatRelativeTime } from '../../../i18n';
import type { TranslationKey } from '../../../i18n/locales';
import { choiceKey, choiceLabel, type AnalysedChoice } from '../../../pages/comparison-utils';

export type ComparisonSide = 'before' | 'after';
export type ComparisonInputMode = 'upload' | 'url' | 'analysed';

export interface ComparisonSideInput {
    mode: ComparisonInputMode;
    file?: File;
    url: string;
    /** The already-analysed project chosen for this side; nothing is uploaded and nothing is analysed again. */
    analysed?: AnalysedChoice;
    preflight?: ArchivePreflightResult;
    preflightBusy: boolean;
}

export interface ComparisonSideProgress {
    status: 'idle' | 'submitting' | 'queued' | 'processing' | 'completed' | 'failed' | 'cancelled';
    message?: string;
    /** Present once this side has been analysed, so a retry of the other side does not analyse it again. */
    reference?: AnalysisReferenceDto;
}

const sideLabel = (side: ComparisonSide, t: (key: TranslationKey) => string): string =>
    side === 'before' ? t('diffProjectBefore') : t('diffProjectAfter');

/** What one side has been given, independent of any run: each mode reaches these through its own route. */
type ComparisonSourceState = 'empty' | 'validating' | 'ready' | 'invalid';

const sourceState = (value: ComparisonSideInput, urlValid: boolean): ComparisonSourceState => {
    if (value.mode === 'analysed') return value.analysed ? 'ready' : 'empty';
    if (value.mode === 'url') {
        if (value.url.trim().length === 0) return 'empty';
        return urlValid ? 'ready' : 'invalid';
    }
    if (!value.file) return 'empty';
    // A chosen file is neither good nor bad until the archive has been looked into.
    if (value.preflightBusy || !value.preflight) return 'validating';
    return value.preflight.valid ? 'ready' : 'invalid';
};

export function ComparisonSideField({
    side,
    value,
    progress,
    urlValid,
    preflightMessage,
    disabled,
    analysedChoices,
    onModeChange,
    onFileChange,
    onUrlChange,
    onAnalysedChange,
    onRetry,
}: {
    side: ComparisonSide;
    value: ComparisonSideInput;
    progress: ComparisonSideProgress;
    urlValid: boolean;
    preflightMessage?: string;
    disabled: boolean;
    /** Projects this service already holds; empty on a device that has not analysed anything yet. */
    analysedChoices: AnalysedChoice[];
    onModeChange: (mode: ComparisonInputMode) => void;
    onFileChange: (file?: File) => void;
    onUrlChange: (url: string) => void;
    onAnalysedChange: (choice?: AnalysedChoice) => void;
    onRetry?: () => void;
}) {
    const { t } = useTranslation();
    const label = sideLabel(side, t);
    const modeId = `diff-${side}-mode`;
    const fileId = `diff-${side}-file`;
    const urlId = `diff-${side}-url`;
    const analysedId = `diff-${side}-analysed`;
    const hintId = `diff-${side}-hint`;
    const statusId = `diff-${side}-status`;
    const inputDisabled = disabled || progress.status === 'submitting';
    const state = sourceState(value, urlValid);
    // Each mode explains itself: the upload hint is not the URL hint, which talks about canonical Scratch links
    // and has nothing to say to a reader looking at a file picker.
    const hint =
        value.mode === 'analysed'
            ? t('diffProjectAnalysedHint')
            : value.mode === 'url'
              ? t('diffProjectUrlHint')
              : (preflightMessage ?? t('uploadHint'));
    // A run's own message wins once there is one; until then the side says what it has, and a chosen analysis
    // says it is ready rather than that it is still being waited for.
    const statusMessage =
        progress.message ??
        (state === 'ready'
            ? t('diffProjectSourceReady')
            : state === 'validating'
              ? t('diffProjectValidating')
              : state === 'invalid'
                ? t('diffProjectSourceInvalid')
                : t('diffProjectWaiting'));

    const changeFile = (event: ChangeEvent<HTMLInputElement>) =>
        onFileChange(event.target.files?.[0]);

    return (
        <fieldset className="diff-project-side" aria-describedby={`${hintId} ${statusId}`}>
            <legend>{label}</legend>
            <div className="diff-project-mode" id={modeId} role="radiogroup">
                <label>
                    <input
                        type="radio"
                        name={`diff-${side}-source-mode`}
                        value="upload"
                        checked={value.mode === 'upload'}
                        disabled={inputDisabled}
                        onChange={() => onModeChange('upload')}
                    />
                    {t('diffProjectUploadSource')}
                </label>
                <label>
                    <input
                        type="radio"
                        name={`diff-${side}-source-mode`}
                        value="url"
                        checked={value.mode === 'url'}
                        disabled={inputDisabled}
                        onChange={() => onModeChange('url')}
                    />
                    {t('diffProjectUrlSource')}
                </label>
                {/* A project this service has already analysed does not have to be found on disk or fetched
                    again. Offered only where there is one, so the form gains nothing on a fresh device. */}
                {analysedChoices.length > 0 && (
                    <label>
                        <input
                            type="radio"
                            name={`diff-${side}-source-mode`}
                            value="analysed"
                            checked={value.mode === 'analysed'}
                            disabled={inputDisabled}
                            onChange={() => onModeChange('analysed')}
                        />
                        {t('diffProjectAnalysedSource')}
                    </label>
                )}
            </div>

            {value.mode === 'analysed' ? (
                <div className="form-field">
                    <label htmlFor={analysedId}>{t('diffProjectAnalysedLabel')}</label>
                    <select
                        key="analysed"
                        id={analysedId}
                        name={analysedId}
                        value={value.analysed ? choiceKey(value.analysed) : ''}
                        disabled={inputDisabled}
                        aria-describedby={hintId}
                        onChange={(event) =>
                            onAnalysedChange(
                                analysedChoices.find(
                                    (choice) => choiceKey(choice) === event.target.value,
                                ),
                            )
                        }
                    >
                        <option value="">{t('diffProjectAnalysedNone')}</option>
                        {analysedChoices.map((choice) => (
                            <option key={choiceKey(choice)} value={choiceKey(choice)}>
                                {choiceLabel(choice, (at) => formatRelativeTime(at))}
                            </option>
                        ))}
                    </select>
                </div>
            ) : value.mode === 'upload' ? (
                <div className="form-field diff-project-file-field">
                    <label htmlFor={fileId}>{t('uploadLabel')}</label>
                    <input
                        key="upload"
                        id={fileId}
                        name={fileId}
                        type="file"
                        accept=".sb3,.mblock"
                        disabled={inputDisabled}
                        aria-describedby={hintId}
                        onChange={changeFile}
                    />
                    {value.file && <p className="diff-project-file-name">{value.file.name}</p>}
                </div>
            ) : (
                <div className="form-field">
                    <label htmlFor={urlId}>{t('urlLabel')}</label>
                    <input
                        key="url"
                        id={urlId}
                        name={urlId}
                        type="url"
                        inputMode="url"
                        value={value.url ?? ''}
                        disabled={inputDisabled}
                        aria-invalid={value.url.trim().length > 0 && !urlValid}
                        aria-describedby={hintId}
                        placeholder="https://scratch.mit.edu/projects/12345/"
                        onChange={(event) => onUrlChange(event.target.value)}
                    />
                </div>
            )}

            <p className={state === 'invalid' ? 'validation-error' : 'hint'} id={hintId}>
                {hint}
            </p>
            <p className="diff-project-side-status" id={statusId} role="status" aria-live="polite">
                <strong>{t('diffProjectStatusLabel')}:</strong> {statusMessage}
            </p>
            {onRetry && (progress.status === 'failed' || progress.status === 'cancelled') && (
                <button type="button" onClick={onRetry} disabled={disabled}>
                    {t('diffProjectRetry')}
                </button>
            )}
        </fieldset>
    );
}

export function ComparisonProgress({
    before,
    after,
    disabled,
    canCompare,
    disabledReason,
    onSubmit,
    onCancel,
}: {
    before: ComparisonSideProgress;
    after: ComparisonSideProgress;
    disabled: boolean;
    canCompare: boolean;
    disabledReason: string;
    onSubmit: () => void;
    onCancel: () => void;
}) {
    const { t } = useTranslation();
    return (
        <div className="diff-project-actions">
            <p className="hint" role="status" aria-live="polite">
                {canCompare ? t('diffProjectReady') : disabledReason}
            </p>
            <div className="diff-form-actions">
                <button
                    type="button"
                    className="primary-action"
                    disabled={disabled || !canCompare}
                    onClick={onSubmit}
                >
                    {disabled ? t('diffProjectWorking') : t('diffProjectCompare')}
                </button>
                {disabled && (
                    <button type="button" onClick={onCancel}>
                        {t('diffProjectCancel')}
                    </button>
                )}
            </div>
            <div className="diff-project-progress-grid" aria-label={t('diffProjectProgressLabel')}>
                <span>{before.message ?? t('diffProjectWaiting')}</span>
                <span>{after.message ?? t('diffProjectWaiting')}</span>
            </div>
        </div>
    );
}
