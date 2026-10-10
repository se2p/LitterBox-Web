// SPDX-License-Identifier: EUPL-1.2
// SPDX-FileCopyrightText: 2026 LitterBox-Web contributors

import { useTranslation } from 'react-i18next';
import type { AssessmentLimits } from '../../api/capabilities';
import { AssessmentPublishPanel } from './AssessmentPublishPanel';
import type { UseAssessmentDraftsResult } from './use-assessment-drafts';
import type { UseAssessmentExportResult } from './use-assessment-export';
import type { UseAssessmentPublishResult } from './use-assessment-publish';

export function AssessmentBuilderPanel({
    limits,
    title,
    onTitleChange,
    instructions,
    onInstructionsChange,
    exportDisabled,
    drafts,
    exportImport,
    publish,
}: {
    limits: AssessmentLimits;
    title: string;
    onTitleChange: (value: string) => void;
    instructions: string;
    onInstructionsChange: (value: string) => void;
    exportDisabled: boolean;
    drafts: UseAssessmentDraftsResult;
    exportImport: UseAssessmentExportResult;
    publish?: UseAssessmentPublishResult;
}) {
    const { t } = useTranslation('assessment');
    const selectionEmpty = drafts.selected.length === 0;
    const publishing = publish?.publishState.status === 'publishing';
    const onDownload = (kind: 'json' | 'student' | 'teacher') => void exportImport.download(kind);
    const titleTooLong = title.trim().length > limits.maxTitleLength;
    const instructionsTooLong = instructions.trim().length > limits.maxInstructionsLength;
    const tooManySelected = drafts.selected.length > limits.maxQuestions;
    const overLimit =
        drafts.selectedOverLimit || tooManySelected || titleTooLong || instructionsTooLong;
    return (
        <div className="assessment-builder-details">
            <div className="assessment-details">
                <label className="form-field">
                    <span>{t('name')}</span>
                    <input
                        value={title}
                        maxLength={limits.maxTitleLength}
                        onChange={(event) => onTitleChange(event.target.value)}
                    />
                </label>
                {publish && titleTooLong && (
                    <p role="alert">{t('textTooLong', { limit: limits.maxTitleLength })}</p>
                )}
                <label className="form-field">
                    <span>{t('instructions')}</span>
                    <textarea
                        rows={2}
                        value={instructions}
                        maxLength={limits.maxInstructionsLength}
                        onChange={(event) => onInstructionsChange(event.target.value)}
                    />
                </label>
                {publish && instructionsTooLong && (
                    <p role="alert">{t('textTooLong', { limit: limits.maxInstructionsLength })}</p>
                )}
            </div>
            {selectionEmpty && <p className="hint">{t('selectionRequired')}</p>}
            {!publish && <p className="hint">{t('publishingUnavailable')}</p>}
            <div className="assessment-export-actions" role="group" aria-label={t('exportLabel')}>
                <button
                    type="button"
                    disabled={exportDisabled}
                    onClick={() => onDownload('student')}
                >
                    {t('exportStudent')}
                </button>
                <button
                    type="button"
                    disabled={exportDisabled}
                    onClick={() => onDownload('teacher')}
                >
                    {t('exportTeacher')}
                </button>
                <button type="button" disabled={exportDisabled} onClick={() => onDownload('json')}>
                    {t('exportJson')}
                </button>
                {publish && (
                    <button
                        type="button"
                        disabled={exportDisabled || overLimit || publishing}
                        onClick={publish.requestPublish}
                    >
                        {publishing ? t('publishing') : t('publishAction')}
                    </button>
                )}
            </div>
            {drafts.selectedInvalid && <p role="alert">{t('questionRequired')}</p>}
            {drafts.selectedStructurallyInvalid && (
                <p role="alert">{t('multipleChoiceStructureInvalid')}</p>
            )}
            {publish && tooManySelected && (
                <p role="alert">{t('tooManyQuestions', { count: limits.maxQuestions })}</p>
            )}
            {publish && overLimit && <p role="alert">{t('limitsExceeded')}</p>}
            {exportImport.exportError && <p role="alert">{t('exportError')}</p>}
            {exportImport.answerKeyWarning && <p role="alert">{t('answerKeyFetchError')}</p>}
            {publish && (
                <AssessmentPublishPanel publish={publish} questionNumber={drafts.questionNumber} />
            )}
            <div className="assessment-import">
                <label className="form-field">
                    <span>{t('importLabel')}</span>
                    <input
                        type="file"
                        accept="application/json,.json"
                        onChange={(event) => {
                            const file = event.target.files?.[0];
                            event.target.value = '';
                            if (file) exportImport.importAssessment(file);
                        }}
                    />
                </label>
                {exportImport.importResult?.ok === true && (
                    <p role="status">
                        {t('importSuccess', { count: exportImport.importResult.count })}
                    </p>
                )}
                {exportImport.importResult?.ok === false && (
                    <p role="alert">
                        {exportImport.importResult.reason === 'too-large'
                            ? t('importTooLarge')
                            : exportImport.importResult.reason === 'wrong-project'
                              ? t('importWrongProject')
                              : exportImport.importResult.reason === 'over-limit'
                                ? t('importOverLimit')
                                : t('importError')}
                    </p>
                )}
            </div>
        </div>
    );
}
