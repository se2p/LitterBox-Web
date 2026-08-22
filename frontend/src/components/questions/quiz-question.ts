// SPDX-License-Identifier: EUPL-1.2
// SPDX-FileCopyrightText: 2026 LitterBox-Web contributors

/**
 * The four shapes a comprehension question can take. The analysis answers with the core's own names; anything else,
 * including a report written before the type travelled with the question, is treated as free text.
 */
export const QUIZ_QUESTION_TYPES = ['MULTIPLE_CHOICE', 'YES_NO', 'NUMBER', 'FREE_TEXT'] as const;

export type QuizQuestionType = (typeof QUIZ_QUESTION_TYPES)[number];

/** The block model the questions are drawn from: what is being looked at, and how widely. */
export const PROGRAM_DIMENSIONS = ['TEXT', 'EXECUTION', 'PURPOSE'] as const;
export const SCOPES_OF_FOCUS = ['ATOM', 'BLOCK', 'RELATION', 'MACRO'] as const;

export type ProgramDimension = (typeof PROGRAM_DIMENSIONS)[number];
export type ScopeOfFocus = (typeof SCOPES_OF_FOCUS)[number];

export interface QuizQuestion {
    questionId: string;
    question: string;
    options: string[];
    questionType: QuizQuestionType;
    /**
     * Whether the analysis said which type this is, as opposed to the type being inferred here. Both end up
     * answerable as text, but only a declared type is the analysis's own statement about the question — and a
     * report written before the field travelled would otherwise look exactly like a free-text question.
     */
    typeDeclared: boolean;
    sprite?: string;
    scratchBlocks?: string;
    hint?: string;
    programDimension?: ProgramDimension;
    scopeOfFocus?: ScopeOfFocus;
    /** How many answers the question expects. Part of the question, not of the answer key. */
    expectedAnswers: number;
}

const text = (value: unknown): string | undefined => {
    if (typeof value !== 'string') return undefined;
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
};

const member = <T extends string>(options: readonly T[], value: unknown): T | undefined =>
    typeof value === 'string' && (options as readonly string[]).includes(value)
        ? (value as T)
        : undefined;

/**
 * A question is only usable when it has an identity and something to ask. Everything else degrades: an unrecognised
 * type falls back to a text answer, which every question can be answered with.
 */
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

/**
 * A handful of questions that still spans the block model, picked the way the analyser picks its own balanced set:
 * one from every cell first, then whatever comes next in order. The reader gets variety without a wall of questions,
 * and the choice is stable so a reload asks the same things.
 */
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

/**
 * The handful a learner is asked, out of everything the analysis generated.
 *
 * Free text is left out. The service does mark it — a short or numeric expected answer has to appear as a whole word,
 * a longer one anywhere in the sentence — but that reads a child's phrasing rather than their understanding, and the
 * way it fails is to tell someone who was right that they were wrong. A teacher browsing the same analysis still sees
 * every question, free text included; it is the marking that is unsafe here, not the question.
 *
 * Only a type the analysis actually declared counts. A question whose type never travelled arrives here looking like
 * free text, and dropping it would quietly empty the page for a report written before the field existed.
 */
export const learnerQuizQuestions = (questions: QuizQuestion[], limit: number): QuizQuestion[] =>
    balancedQuizSample(
        questions.filter(
            (question) => !(question.typeDeclared && question.questionType === 'FREE_TEXT'),
        ),
        limit,
    );

/**
 * Several answers are expected only when the question offers choices and asks for more than one. The backend refuses
 * a multiple selection for a single-answer question, so this has to agree with it.
 */
export const isMultipleSelection = (question: QuizQuestion): boolean =>
    question.questionType === 'MULTIPLE_CHOICE' && question.expectedAnswers > 1;

/** The backend reads a multiple selection as a pipe-separated list. */
export const joinSelectedAnswers = (answers: string[]): string => answers.join('|');
