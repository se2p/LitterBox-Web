// SPDX-License-Identifier: EUPL-1.2
// SPDX-FileCopyrightText: 2026 LitterBox-Web contributors

import type { TranslationKey } from '../../i18n/locales';

export const QUIZ_QUESTION_TYPES = ['MULTIPLE_CHOICE', 'YES_NO', 'NUMBER', 'FREE_TEXT'] as const;

export type QuizQuestionType = (typeof QUIZ_QUESTION_TYPES)[number];

export const PROGRAM_DIMENSIONS = ['TEXT', 'EXECUTION', 'PURPOSE'] as const;
export const SCOPES_OF_FOCUS = ['ATOM', 'BLOCK', 'RELATION', 'MACRO'] as const;

export type ProgramDimension = (typeof PROGRAM_DIMENSIONS)[number];
export type ScopeOfFocus = (typeof SCOPES_OF_FOCUS)[number];

export const typeKey: Record<QuizQuestionType, TranslationKey> = {
    MULTIPLE_CHOICE: 'questionTypeMultipleChoice',
    YES_NO: 'questionTypeYesNo',
    NUMBER: 'questionTypeNumber',
    FREE_TEXT: 'questionTypeFreeText',
};

export const dimensionKey: Record<ProgramDimension, TranslationKey> = {
    TEXT: 'programDimensionText',
    EXECUTION: 'programDimensionExecution',
    PURPOSE: 'programDimensionPurpose',
};

export const scopeKey: Record<ScopeOfFocus, TranslationKey> = {
    ATOM: 'scopeOfFocusAtom',
    BLOCK: 'scopeOfFocusBlock',
    RELATION: 'scopeOfFocusRelation',
    MACRO: 'scopeOfFocusMacro',
};

export interface QuizQuestion {
    questionId: string;
    question: string;
    options: string[];
    questionType: QuizQuestionType;
    /** Whether the report declared the question type. */
    typeDeclared: boolean;
    sprite?: string;
    scratchBlocks?: string;
    hint?: string;
    programDimension?: ProgramDimension;
    scopeOfFocus?: ScopeOfFocus;
    expectedAnswers: number;
}

const text = (value: unknown): string | undefined => {
    if (typeof value !== 'string') return undefined;
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
};

export const isOneOf = <T extends string>(options: readonly T[], value: unknown): value is T =>
    typeof value === 'string' && (options as readonly string[]).includes(value);

export const member = <T extends string>(options: readonly T[], value: unknown): T | undefined =>
    isOneOf(options, value) ? value : undefined;

export const normalizeQuizQuestion = (value: unknown): QuizQuestion | undefined => {
    if (!value || typeof value !== 'object') return undefined;
    const candidate = value as Record<string, unknown>;
    const questionId = text(candidate.questionId);
    const question = typeof candidate.question === 'string' ? candidate.question : undefined;
    if (!questionId || question === undefined) return undefined;
    const options = Array.isArray(candidate.options)
        ? candidate.options.filter((option): option is string => typeof option === 'string')
        : [];
    const declaredType = member(QUIZ_QUESTION_TYPES, candidate.questionType);
    return {
        questionId,
        question,
        options,
        questionType: declaredType ?? 'FREE_TEXT',
        typeDeclared: declaredType !== undefined,
        sprite: text(candidate.sprite),
        scratchBlocks: text(candidate.scratchBlocks),
        hint: text(candidate.hint),
        programDimension: member(PROGRAM_DIMENSIONS, candidate.programDimension),
        scopeOfFocus: member(SCOPES_OF_FOCUS, candidate.scopeOfFocus),
        expectedAnswers:
            typeof candidate.expectedAnswers === 'number' &&
            Number.isSafeInteger(candidate.expectedAnswers) &&
            candidate.expectedAnswers > 0
                ? candidate.expectedAnswers
                : 1,
    };
};

export const blockModelCell = (question: QuizQuestion): string | undefined =>
    question.programDimension && question.scopeOfFocus
        ? `${question.programDimension}/${question.scopeOfFocus}`
        : undefined;

export const balancedQuizSample = (questions: QuizQuestion[], limit: number): QuizQuestion[] => {
    if (limit <= 0) return [];
    const chosen: QuizQuestion[] = [];
    const taken = new Set<string>();
    for (const dimension of PROGRAM_DIMENSIONS) {
        for (const scope of SCOPES_OF_FOCUS) {
            const cell = `${dimension}/${scope}`;
            const first = questions.find(
                (question) => blockModelCell(question) === cell && !taken.has(question.questionId),
            );
            if (first && chosen.length < limit) {
                chosen.push(first);
                taken.add(first.questionId);
            }
        }
    }
    for (const question of questions) {
        if (chosen.length >= limit) break;
        if (taken.has(question.questionId)) continue;
        chosen.push(question);
        taken.add(question.questionId);
    }
    return chosen;
};

// Declared free-text questions are unsafe to auto-mark; legacy undeclared questions remain visible.
export const learnerQuizQuestions = (questions: QuizQuestion[], limit: number): QuizQuestion[] =>
    balancedQuizSample(
        questions.filter(
            (question) => !(question.typeDeclared && question.questionType === 'FREE_TEXT'),
        ),
        limit,
    );

export const isMultipleSelection = (question: QuizQuestion): boolean =>
    question.questionType === 'MULTIPLE_CHOICE' && question.expectedAnswers > 1;

export const CHOICE_ANSWER_SEPARATOR = '|';

export const joinSelectedAnswers = (answers: string[]): string =>
    answers.join(CHOICE_ANSWER_SEPARATOR);
