// SPDX-License-Identifier: EUPL-1.2
// SPDX-FileCopyrightText: 2026 LitterBox-Web contributors

import type { AssessmentQuestionInput } from '../../api/assessments';
import type { AssessmentLimits } from '../../api/capabilities';
import type { AssessmentQuestionDraft } from './AssessmentQuestionCard';
import type { AssessmentExportQuestion } from './assessment-export';
import { carriedCorrectAnswers, normalizedChoice } from './correct-answer-rules';
import { CHOICE_ANSWER_SEPARATOR, type QuizQuestion } from './quiz-question';

const draftId = (question: QuizQuestion, index: number): string =>
    `generated-${index}-${question.questionId}`;

export const generatedDrafts = (questions: QuizQuestion[]): AssessmentQuestionDraft[] =>
    questions.map((question, index) => ({
        ...question,
        draftId: draftId(question, index),
        source: 'generated',
        selected: false,
        answerGuide: '',
        correctAnswers: [],
    }));

// The editor shows the marked count as the expected count, so export and publish must say the same.
const effectiveExpectedAnswers = (draft: AssessmentQuestionDraft): number =>
    draft.questionType === 'MULTIPLE_CHOICE' && draft.correctAnswers.length > 0
        ? draft.correctAnswers.length
        : draft.expectedAnswers;

export const exportQuestion = (draft: AssessmentQuestionDraft): AssessmentExportQuestion => ({
    id: draft.draftId,
    sourceQuestionId: draft.source === 'generated' ? draft.questionId : undefined,
    source: draft.source,
    question: draft.question.trim(),
    questionType: draft.questionType,
    options: [...draft.options],
    correctAnswers: [...draft.correctAnswers],
    expectedAnswers: effectiveExpectedAnswers(draft),
    answerGuide: draft.answerGuide.trim() || undefined,
    hint: draft.hint,
    sprite: draft.sprite,
    scratchBlocks: draft.scratchBlocks,
    programDimension: draft.programDimension,
    scopeOfFocus: draft.scopeOfFocus,
});

export const importedDraft = (
    question: AssessmentExportQuestion,
    index: number,
    originalsByQuestionId: ReadonlyMap<string, AssessmentQuestionDraft>,
): AssessmentQuestionDraft => {
    const matched = question.sourceQuestionId
        ? originalsByQuestionId.get(question.sourceQuestionId)
        : undefined;
    return {
        draftId: matched ? matched.draftId : `imported-${index}-${question.id}`,
        questionId: matched ? matched.questionId : (question.sourceQuestionId ?? question.id),
        source: matched ? 'generated' : 'teacher',
        selected: true,
        question: question.question,
        options: [...question.options],
        questionType: question.questionType,
        typeDeclared: true,
        expectedAnswers: question.expectedAnswers,
        answerGuide: question.answerGuide ?? '',
        correctAnswers: carriedCorrectAnswers(
            question.questionType,
            question.options,
            question.correctAnswers ?? [],
        ),
        hint: question.hint,
        sprite: question.sprite,
        scratchBlocks: question.scratchBlocks,
        programDimension: question.programDimension,
        scopeOfFocus: question.scopeOfFocus,
    };
};

const isUnedited = (
    draft: AssessmentQuestionDraft,
    originals: ReadonlyMap<string, AssessmentQuestionDraft>,
): boolean => {
    if (draft.source !== 'generated') return false;
    const original = originals.get(draft.draftId);
    return (
        original !== undefined &&
        draft.question === original.question &&
        draft.questionType === original.questionType &&
        draft.expectedAnswers === original.expectedAnswers &&
        JSON.stringify(draft.options) === JSON.stringify(original.options) &&
        (draft.hint ?? '') === (original.hint ?? '') &&
        (draft.scratchBlocks ?? '') === (original.scratchBlocks ?? '') &&
        draft.programDimension === original.programDimension &&
        draft.scopeOfFocus === original.scopeOfFocus &&
        JSON.stringify(draft.correctAnswers) === JSON.stringify(original.correctAnswers)
    );
};

export const publishQuestion = (
    draft: AssessmentQuestionDraft,
    originals: ReadonlyMap<string, AssessmentQuestionDraft>,
): AssessmentQuestionInput =>
    isUnedited(draft, originals)
        ? {
              source: 'GENERATED',
              questionId: draft.questionId,
          }
        : {
              source: 'CUSTOM',
              questionText: draft.question.trim(),
              questionType: draft.questionType,
              options: draft.questionType === 'MULTIPLE_CHOICE' ? draft.options : undefined,
              expectedAnswers:
                  draft.questionType === 'MULTIPLE_CHOICE' ? effectiveExpectedAnswers(draft) : 1,
              correctAnswers: draft.correctAnswers.length > 0 ? draft.correctAnswers : undefined,
          };

export const unmarkedOnPublish = (
    draft: AssessmentQuestionDraft,
    originals: ReadonlyMap<string, AssessmentQuestionDraft>,
): boolean => {
    return !isUnedited(draft, originals) && draft.correctAnswers.length === 0;
};

export interface DraftLimitBreaches {
    questionTooLong: boolean;
    answerGuideTooLong: boolean;
    tooManyOptions: boolean;
    optionTooLong: boolean;
    tooManyAccepted: boolean;
    acceptedTooLong: boolean;
}

const breaches = (entries: readonly string[], limits: AssessmentLimits) => ({
    tooMany: entries.length > limits.maxOptions,
    tooLong: entries.some((entry) => entry.length > limits.maxOptionLength),
});

export const draftLimitBreaches = (
    draft: AssessmentQuestionDraft,
    limits: AssessmentLimits,
    originals: ReadonlyMap<string, AssessmentQuestionDraft>,
): DraftLimitBreaches => {
    const options = breaches(draft.questionType === 'MULTIPLE_CHOICE' ? draft.options : [], limits);
    const accepted = breaches(draft.correctAnswers, limits);
    return {
        questionTooLong:
            draft.question.trim().length > limits.maxQuestionTextLength &&
            !isUnedited(draft, originals),
        answerGuideTooLong: draft.answerGuide.trim().length > limits.maxAnswerGuideLength,
        tooManyOptions: options.tooMany,
        optionTooLong: options.tooLong,
        tooManyAccepted: accepted.tooMany,
        acceptedTooLong: accepted.tooLong,
    };
};

export const withinLimits = (
    draft: AssessmentQuestionDraft,
    limits: AssessmentLimits,
    originals: ReadonlyMap<string, AssessmentQuestionDraft>,
): boolean =>
    Object.values(draftLimitBreaches(draft, limits, originals)).every((breached) => !breached);

export const structurallyInvalid = (draft: AssessmentQuestionDraft): boolean => {
    if (draft.questionType !== 'MULTIPLE_CHOICE') return false;
    const options = draft.options.map((option) => option.trim()).filter(Boolean);
    if (options.length === 0) return true;
    if (new Set(options.map(normalizedChoice)).size !== options.length) return true;
    if (options.some((option) => option.includes(CHOICE_ANSWER_SEPARATOR))) return true;
    return draft.expectedAnswers < 1 || draft.expectedAnswers > options.length;
};
