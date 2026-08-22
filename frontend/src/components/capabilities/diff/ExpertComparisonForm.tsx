// SPDX-License-Identifier: EUPL-1.2
// SPDX-FileCopyrightText: 2026 LitterBox-Web contributors

import type { FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Card } from '../../Card';
import type { ReferenceInput } from '../../../pages/comparison-utils';

function ReferenceFields({
    side,
    value,
    invalid,
    onChange,
    disabled,
}: {
    side: 'before' | 'after';
    value: ReferenceInput;
    invalid: boolean;
    onChange: (value: ReferenceInput) => void;
    disabled: boolean;
}) {
    const { t } = useTranslation();
    const label = side === 'before' ? t('diffBefore') : t('diffAfter');
    const tokenId = `diff-${side}-token`;
    const analysisId = `diff-${side}-analysis-id`;
    const descriptionId = `diff-${side}-hint`;
    return (
        <fieldset className="diff-reference-fieldset">
            <legend>{label}</legend>
            <div className="diff-reference-fields">
                <div className="form-field">
                    {/* What a result hands back is its address, so that is what this field takes; the bare code
                        out of an older note still works. */}
                    <label htmlFor={tokenId}>{t('diffSubmissionReference')}</label>
                    <input
                        id={tokenId}
                        name={tokenId}
                        type="text"
                        value={value.submissionToken}
                        maxLength={512}
                        autoComplete="off"
                        spellCheck={false}
                        aria-invalid={invalid}
                        aria-describedby={descriptionId}
                        disabled={disabled}
                        onChange={(event) =>
                            onChange({ ...value, submissionToken: event.target.value })
                        }
                    />
                </div>
                <div className="form-field">
                    <label htmlFor={analysisId}>{t('diffAnalysisId')}</label>
                    <input
                        id={analysisId}
                        name={analysisId}
                        type="text"
                        inputMode="numeric"
                        value={value.analysisId}
                        autoComplete="off"
                        aria-invalid={invalid}
                        aria-describedby={descriptionId}
                        disabled={disabled}
                        onChange={(event) => onChange({ ...value, analysisId: event.target.value })}
                    />
                </div>
            </div>
            <p className="hint" id={descriptionId}>
                {t('diffReferenceHint')}
            </p>
        </fieldset>
    );
}

export function ExpertComparisonForm({
    before,
    after,
    validationError,
    loading,
    onBeforeChange,
    onAfterChange,
    onSwap,
    onSubmit,
    onCancel,
}: {
    before: ReferenceInput;
    after: ReferenceInput;
    validationError: 'before' | 'after' | null;
    loading: boolean;
    onBeforeChange: (value: ReferenceInput) => void;
    onAfterChange: (value: ReferenceInput) => void;
    onSwap: () => void;
    onSubmit: (event: FormEvent<HTMLFormElement>) => void;
    onCancel: () => void;
}) {
    const { t } = useTranslation();
    return (
        <Card className="diff-input-card" aria-labelledby="diff-input-heading">
            {/* Folded away: the sources above cover getting here from a result or from a file, and this is the
                way in for someone who has an analysis identifier and knows what it is for. */}
            <details className="diff-expert-disclosure">
                <summary>{t('diffProjectAdvanced')}</summary>
                <h2 id="diff-input-heading">{t('diffInputsTitle')}</h2>
                <p>{t('diffInputsLead')}</p>
                <form onSubmit={onSubmit} noValidate>
                    <div className="diff-reference-grid">
                        <ReferenceFields
                            side="before"
                            value={before}
                            invalid={validationError === 'before'}
                            disabled={loading}
                            onChange={onBeforeChange}
                        />
                        <ReferenceFields
                            side="after"
                            value={after}
                            invalid={validationError === 'after'}
                            disabled={loading}
                            onChange={onAfterChange}
                        />
                    </div>
                    {validationError && (
                        <p className="validation-error" aria-live="polite">
                            {t('diffValidationError')}
                        </p>
                    )}
                    <div className="diff-form-actions">
                        <button type="button" onClick={onSwap} disabled={loading}>
                            {t('diffSwap')}
                        </button>
                        <button type="submit" className="primary-action" disabled={loading}>
                            {loading ? t('diffComparing') : t('diffSubmit')}
                        </button>
                        {loading && (
                            <button type="button" onClick={onCancel}>
                                {t('diffCancel')}
                            </button>
                        )}
                    </div>
                </form>
            </details>
        </Card>
    );
}
