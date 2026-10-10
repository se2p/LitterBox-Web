// SPDX-License-Identifier: EUPL-1.2
// SPDX-FileCopyrightText: 2026 LitterBox-Web contributors

import { isObject } from '../../api/validation';
import { readRaw, storage } from '../../lib/device-store';
import type { AssessmentQuestionDraft } from './AssessmentQuestionCard';
import { reconcileChoiceAnswers } from './correct-answer-rules';
import { PROGRAM_DIMENSIONS, QUIZ_QUESTION_TYPES, SCOPES_OF_FOCUS, isOneOf } from './quiz-question';

export interface SavedAssessmentDraft {
    title: string;
    instructions: string;
    drafts: AssessmentQuestionDraft[];
}

const KEY_PREFIX = 'litterbox.assessment-draft.';
const MAX_DRAFTS = 5;
const keyFor = (token: string, analysisId: number): string => `${KEY_PREFIX}${token}.${analysisId}`;

const draftKeys = (store: Storage): string[] =>
    Array.from({ length: store.length }, (_, index) => store.key(index)).filter(
        (key): key is string => key !== null && key.startsWith(KEY_PREFIX),
    );

export const forgetAssessmentDrafts = (): void => {
    const store = storage();
    if (!store) return;
    try {
        for (const key of draftKeys(store)) store.removeItem(key);
    } catch {
        return;
    }
};

const stringList = (value: unknown): value is string[] =>
    Array.isArray(value) && value.every((entry) => typeof entry === 'string');

const validDraft = (value: unknown): value is AssessmentQuestionDraft =>
    isObject(value) &&
    typeof value.draftId === 'string' &&
    value.draftId.length > 0 &&
    typeof value.questionId === 'string' &&
    value.questionId.length > 0 &&
    (value.source === 'generated' || value.source === 'teacher') &&
    typeof value.selected === 'boolean' &&
    typeof value.question === 'string' &&
    typeof value.typeDeclared === 'boolean' &&
    isOneOf(QUIZ_QUESTION_TYPES, value.questionType) &&
    typeof value.expectedAnswers === 'number' &&
    Number.isSafeInteger(value.expectedAnswers) &&
    stringList(value.options) &&
    stringList(value.correctAnswers) &&
    typeof value.answerGuide === 'string' &&
    ['hint', 'sprite', 'scratchBlocks', 'optionsText', 'acceptedAnswersText'].every(
        (key) => value[key] === undefined || typeof value[key] === 'string',
    ) &&
    (value.programDimension === undefined || isOneOf(PROGRAM_DIMENSIONS, value.programDimension)) &&
    (value.scopeOfFocus === undefined || isOneOf(SCOPES_OF_FOCUS, value.scopeOfFocus));

export const readAssessmentDraft = (
    token: string,
    analysisId: number,
): SavedAssessmentDraft | undefined => {
    try {
        const value: unknown = JSON.parse(readRaw(keyFor(token, analysisId)) ?? 'null');
        if (
            !isObject(value) ||
            value.schemaVersion !== 1 ||
            typeof value.title !== 'string' ||
            typeof value.instructions !== 'string' ||
            !Array.isArray(value.drafts) ||
            !value.drafts.every(validDraft) ||
            new Set(value.drafts.map((draft) => draft.draftId)).size !== value.drafts.length
        )
            return undefined;
        return {
            title: value.title,
            instructions: value.instructions,
            drafts: value.drafts.map((draft) =>
                draft.questionType === 'MULTIPLE_CHOICE'
                    ? { ...draft, ...reconcileChoiceAnswers(draft) }
                    : draft,
            ),
        };
    } catch {
        return undefined;
    }
};

export const saveAssessmentDraft = (
    token: string,
    analysisId: number,
    draft: SavedAssessmentDraft,
): boolean => {
    try {
        const store = storage();
        if (!store) return false;
        const key = keyFor(token, analysisId);
        const savedAt = (key: string): number => {
            try {
                const value: unknown = JSON.parse(store.getItem(key) ?? 'null');
                return isObject(value) && typeof value.savedAt === 'number' ? value.savedAt : 0;
            } catch {
                return 0;
            }
        };
        const older = draftKeys(store).filter((candidate) => candidate !== key);
        older.sort((a, b) => savedAt(b) - savedAt(a));
        store.setItem(key, JSON.stringify({ schemaVersion: 1, ...draft, savedAt: Date.now() }));
        for (const obsolete of older.slice(MAX_DRAFTS - 1)) store.removeItem(obsolete);
        return true;
    } catch {
        return false;
    }
};
