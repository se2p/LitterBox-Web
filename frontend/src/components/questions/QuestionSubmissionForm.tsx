// SPDX-License-Identifier: EUPL-1.2
// SPDX-FileCopyrightText: 2026 LitterBox-Web contributors

import { useState, type ChangeEvent, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import { Alert } from '../Alert';
import { FormField } from '../Form';
import { submitQuestionFile, submitQuestionProjectUrl } from '../../api/submissions';
import { preflightMessageKey } from '../../lib/archive-preflight-messages';
import { canonicalProjectUrl } from '../../lib/project-submission';
import { useProjectSource } from '../../lib/use-project-source';

/**
 * The same submission machinery serves two readers: a learner, who gets a handful of questions to answer, and a
 * teacher, who gets everything the project yields laid out against the block model.
 */
export type QuestionsVariant = 'learner' | 'teacher';

const questionsBasePath = (variant: QuestionsVariant): string =>
    variant === 'teacher' ? '/teacher/questions' : '/questions';

interface QuestionSubmissionFormProps {
    variant: QuestionsVariant;
    /** Suffix for the input identifiers, so the form can sit on a page that already has one. */
    idPrefix?: string;
    className?: string;
    legend: string;
    description?: string;
}

/**
 * Upload a project, or name it by link, and get its questions back. Kept apart from the page around it so the teacher
 * page can offer the same two ways in without first sending the teacher to a page that only holds this form.
 */
export function QuestionSubmissionForm({
    variant,
    idPrefix = 'questions-project',
    className = '',
    legend,
    description,
}: QuestionSubmissionFormProps) {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const source = useProjectSource();
    const { file, url, preflight, preflightBusy, busy, fileInput } = source;
    const [error, setError] = useState('');

    const chooseFile = (candidate?: File) => {
        setError('');
        source.chooseFile(candidate);
    };

    const chooseUrl = (value: string) => {
        setError('');
        source.chooseUrl(value);
    };

    const canonicalUrl = canonicalProjectUrl(url.trim());
    const urlAcceptable = url.trim() === '' || Boolean(canonicalUrl);
    const canSubmit =
        !busy && !preflightBusy && Boolean((file && preflight?.valid) || (!file && canonicalUrl));

    const submit = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        if (!canSubmit) return;
        setError('');
        try {
            const accepted = await source.submit((options) =>
                file
                    ? submitQuestionFile(file, options)
                    : submitQuestionProjectUrl(canonicalUrl ?? '', options),
            );
            if (!accepted) return;
            if (!accepted.token || !accepted.token.trim()) throw new Error('missing-token');
            navigate(`${questionsBasePath(variant)}/${encodeURIComponent(accepted.token)}`);
        } catch {
            setError(t('questionsSubmitError'));
        }
    };

    const fileId = `${idPrefix}-file`;
    const urlId = `${idPrefix}-url`;

    return (
        <form
            className={`submit-form questions-form ${className}`.trim()}
            onSubmit={(event) => void submit(event)}
        >
            <fieldset className="analysis-choice-group analysis-choice-group-primary">
                <legend>{legend}</legend>
                {description && <p className="choice-description">{description}</p>}
                <div className="analysis-choice-grid">
                    <FormField label={t('questionsUploadLabel')} labelFor={fileId}>
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
                    <FormField label={t('questionsUrlLabel')} labelFor={urlId}>
                        <input
                            id={urlId}
                            type="text"
                            inputMode="url"
                            value={url}
                            disabled={busy}
                            aria-invalid={!urlAcceptable}
                            aria-describedby={`${urlId}-hint`}
                            onChange={(event) => chooseUrl(event.target.value)}
                            placeholder="https://scratch.mit.edu/projects/12345/"
                        />
                        <p
                            id={`${urlId}-hint`}
                            className={urlAcceptable ? 'hint' : 'validation-error'}
                            role={urlAcceptable ? undefined : 'alert'}
                        >
                            {urlAcceptable ? t('questionsUrlHint') : t('questionsUrlError')}
                        </p>
                    </FormField>
                </div>
            </fieldset>
            {error && (
                <Alert tone="error">
                    <p>{error}</p>
                </Alert>
            )}
            <button
                className="submit-analysis-button"
                type="submit"
                disabled={!canSubmit}
                aria-busy={busy}
            >
                {busy
                    ? t('submitting')
                    : error
                      ? t('retry')
                      : t(variant === 'teacher' ? 'teacherQuestionsSubmit' : 'questionsSubmit')}
            </button>
        </form>
    );
}
