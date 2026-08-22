// SPDX-License-Identifier: EUPL-1.2
// SPDX-FileCopyrightText: 2026 LitterBox-Web contributors

import { useState, type ChangeEvent, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { submitFile, submitProjectUrl } from '../../api/submissions';
import { isNumericScratchProjectUrl } from '../../lib/archive-preflight';
import { preflightMessageKey } from '../../lib/archive-preflight-messages';
import { useProjectSource } from '../../lib/use-project-source';
import { Alert } from '../Alert';
import { FormField } from '../Form';

interface ProjectSubmissionFormProps {
    /** Suffix for the input identifiers, so two forms can share a page. */
    idPrefix?: string;
    className?: string;
    legend: string;
    description?: string;
    submitLabel: string;
    onAccepted: (token: string) => void;
}

/**
 * The single-project entry — upload an archive or paste a Scratch project link. Shared so that every page which can
 * start an analysis offers the same two ways in, rather than sending people back to the home page first.
 */
export function ProjectSubmissionForm({
    idPrefix = 'project',
    className = '',
    legend,
    description,
    submitLabel,
    onAccepted,
}: ProjectSubmissionFormProps) {
    const { t } = useTranslation();
    const source = useProjectSource();
    const { file, url, preflight, preflightBusy, busy, fileInput } = source;
    const [error, setError] = useState(false);

    const chooseFile = (candidate?: File) => {
        setError(false);
        source.chooseFile(candidate);
    };

    const chooseUrl = (value: string) => {
        setError(false);
        source.chooseUrl(value);
    };

    const urlValid = url.trim() === '' || isNumericScratchProjectUrl(url.trim());
    const canSubmit =
        !busy && !preflightBusy && Boolean((file && preflight?.valid) || (url.trim() && urlValid));
    // A greyed-out button says no without saying why, and the two ways in mean the reason is not obvious.
    const blockedReason = canSubmit
        ? undefined
        : busy
          ? undefined
          : preflightBusy
            ? t('submitBlockedChecking')
            : file && preflight && !preflight.valid
              ? t('submitBlockedFile')
              : url.trim() && !urlValid
                ? t('submitBlockedUrl')
                : t('submitBlockedEmpty');

    const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        if (!canSubmit) return;
        setError(false);
        try {
            const accepted = await source.submit((options) =>
                file && preflight?.valid
                    ? submitFile(file, options)
                    : submitProjectUrl(url.trim(), options),
            );
            if (!accepted) return;
            if (!accepted.token) throw new Error('missing token');
            onAccepted(accepted.token);
        } catch {
            setError(true);
        }
    };

    const fileId = `${idPrefix}-file`;
    const urlId = `${idPrefix}-url`;

    return (
        <form
            className={`submit-form ${className}`.trim()}
            onSubmit={(event) => void onSubmit(event)}
        >
            <fieldset className="analysis-choice-group analysis-choice-group-primary">
                <legend>{legend}</legend>
                {description && <p className="choice-description">{description}</p>}
                <div className="analysis-choice-grid">
                    <FormField label={t('uploadLabel')} labelFor={fileId}>
                        <input
                            ref={fileInput}
                            id={fileId}
                            type="file"
                            accept=".sb3,.mblock"
                            disabled={busy}
                            aria-describedby={`${fileId}-hint`}
                            onChange={(event: ChangeEvent<HTMLInputElement>) =>
                                chooseFile(event.target.files?.[0])
                            }
                        />
                        <p id={`${fileId}-hint`} className="hint">
                            {t('uploadHint')}
                        </p>
                        {preflight &&
                            (preflight.valid ? (
                                <p role="status">{t('preflightReady')}</p>
                            ) : (
                                <p role="alert">
                                    {t(preflightMessageKey(preflight.reason ?? 'invalid-archive'))}
                                </p>
                            ))}
                    </FormField>
                    <FormField label={t('urlLabel')} labelFor={urlId}>
                        <input
                            id={urlId}
                            type="url"
                            inputMode="url"
                            value={url}
                            disabled={busy}
                            aria-invalid={url.trim() !== '' && !urlValid}
                            aria-describedby={`${urlId}-validation`}
                            onChange={(event) => chooseUrl(event.target.value)}
                            placeholder="https://scratch.mit.edu/projects/12345/"
                        />
                        {/* The friendly hint stands until the link is actually wrong; only then does the rule
                            behind it need saying. */}
                        <p
                            id={`${urlId}-validation`}
                            className={urlValid ? 'hint' : 'validation-error'}
                            role={urlValid ? undefined : 'alert'}
                        >
                            {urlValid ? t('urlHint') : t('urlError')}
                        </p>
                    </FormField>
                </div>
            </fieldset>
            {error && (
                <Alert tone="error">
                    <p>
                        {t('submitError')}: {t('submitErrorBody')}
                    </p>
                </Alert>
            )}
            {blockedReason && (
                <p className="hint submit-blocked-reason" role="status">
                    {blockedReason}
                </p>
            )}
            <button
                className="submit-analysis-button"
                type="submit"
                disabled={!canSubmit}
                aria-busy={busy}
            >
                {busy ? t('submitting') : error ? t('retry') : submitLabel}
            </button>
        </form>
    );
}
