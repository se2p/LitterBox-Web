// SPDX-License-Identifier: EUPL-1.2
// SPDX-FileCopyrightText: 2026 LitterBox-Web contributors

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { AssessmentLimits } from '../../api/capabilities';
import { fetchQuizAnswerKey } from '../../api/submissions';
import { downloadText } from '../../lib/download-blob';
import type { AssessmentQuestionDraft } from './AssessmentQuestionCard';
import { exportQuestion } from './assessment-draft';
import {
    assessmentHasBlocks,
    assessmentHtml,
    assessmentJson,
    parseAssessmentImport,
    prepareAssessmentBlocks,
    safeAssessmentFilename,
    type AssessmentAnswerKey,
    type AssessmentExport,
    type AssessmentExportLabels,
    type AssessmentExportQuestion,
    type AssessmentImportResult,
} from './assessment-export';

export interface AssessmentImport {
    title: string;
    instructions: string;
    questions: AssessmentExportQuestion[];
}

export type AssessmentImportOutcome =
    { ok: true; count: number } | Extract<AssessmentImportResult, { ok: false }>;

const MAX_IMPORT_BYTES = 4_000_000;

export interface UseAssessmentExportResult {
    exportError: boolean;
    answerKeyWarning: boolean;
    importResult: AssessmentImportOutcome | undefined;
    download: (kind: 'json' | 'student' | 'teacher') => Promise<void>;
    importAssessment: (file: File) => void;
}

export function useAssessmentExport({
    token,
    analysisId,
    locale,
    projectName,
    title,
    instructions,
    selected,
    limits,
    onImport,
}: {
    token: string;
    analysisId: number;
    locale: string;
    projectName: string;
    title: string;
    instructions: string;
    selected: AssessmentQuestionDraft[];
    limits: AssessmentLimits;
    onImport: (result: AssessmentImport) => void;
}): UseAssessmentExportResult {
    const { t } = useTranslation('assessment');
    const [exportError, setExportError] = useState(false);
    const [answerKeyWarning, setAnswerKeyWarning] = useState(false);
    const [importResult, setImportResult] = useState<AssessmentImportOutcome>();

    const exportValue = (): AssessmentExport => ({
        title: title.trim(),
        instructions: instructions.trim(),
        locale,
        project: projectName,
        analysisId,
        questions: selected.map(exportQuestion),
    });

    const exportLabels = (): AssessmentExportLabels => ({
        studentName: t('studentName'),
        studentClass: t('studentClass'),
        question: t('exportQuestion'),
        hint: t('questionHint'),
        codeContext: t('codeContext'),
        answerGuide: t('answerGuide'),
        answerGuideMissing: t('answerGuideMissing'),
        correctAnswers: t('correctAnswers'),
        yes: t('yes'),
        no: t('no'),
        generatedBy: t('generatedBy'),
    });

    const download = async (kind: 'json' | 'student' | 'teacher') => {
        setExportError(false);
        setAnswerKeyWarning(false);
        try {
            const assessment = exportValue();
            const stem = safeAssessmentFilename(assessment.title);
            if (kind === 'json') {
                if (
                    !downloadText(
                        assessmentJson(assessment),
                        'application/json;charset=utf-8',
                        `${stem}.json`,
                    )
                )
                    setExportError(true);
                return;
            }
            let answerKey: AssessmentAnswerKey | undefined;
            const blocks =
                kind === 'teacher' && assessmentHasBlocks(assessment, kind)
                    ? prepareAssessmentBlocks()
                    : undefined;
            if (kind === 'teacher') {
                try {
                    const key = await fetchQuizAnswerKey(token, analysisId);
                    answerKey = new Map(
                        key.questions.map((question) => [
                            question.questionId,
                            question.correctAnswers,
                        ]),
                    );
                } catch {
                    setAnswerKeyWarning(true);
                }
            }
            if (
                !downloadText(
                    await assessmentHtml(assessment, kind, exportLabels(), answerKey, blocks),
                    'text/html;charset=utf-8',
                    `${stem}-${kind === 'student' ? 'quiz' : 'answer-key'}.html`,
                )
            )
                setExportError(true);
        } catch {
            setExportError(true);
        }
    };

    const applyImportedText = (text: string) => {
        const result = parseAssessmentImport(text, limits, projectName);
        if (!result.ok) {
            setImportResult(result);
            return;
        }
        onImport({
            title: result.title,
            instructions: result.instructions,
            questions: result.questions,
        });
        setImportResult({ ok: true, count: result.questions.length });
    };

    const importAssessment = (file: File): void => {
        if (file.size > MAX_IMPORT_BYTES) {
            setImportResult({ ok: false, reason: 'too-large' });
            return;
        }
        const reader = new FileReader();
        reader.onload = () =>
            applyImportedText(typeof reader.result === 'string' ? reader.result : '');
        reader.onerror = () => setImportResult({ ok: false, reason: 'unreadable' });
        reader.readAsText(file);
    };

    return { exportError, answerKeyWarning, importResult, download, importAssessment };
}
