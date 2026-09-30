// SPDX-License-Identifier: EUPL-1.2
// SPDX-FileCopyrightText: 2026 LitterBox-Web contributors

import { ASSESSMENT_FLOORS } from '../api/assessments';
import { boundedNonblankString, isObject } from '../api/validation';
import { readValidatedList, storedTimestamp, writeList } from './device-store';

export interface StoredQuizVerdict {
    correct: boolean;
    correctAnswers: string[];
}

export interface StoredQuizAnswer {
    questionId: string;
    verdict: StoredQuizVerdict | null;
}

export interface QuizAttempt {
    publicToken: string;
    attemptId: string;
    answers: StoredQuizAnswer[];
    at: number;
}

const STORAGE_KEY = 'litterbox.quiz-attempts';
const MAX_REMEMBERED = 10;
const MAX_TOKEN_LENGTH = 128;
const MAX_QUESTION_COUNT = ASSESSMENT_FLOORS.questions;
const MAX_ANSWER_OPTIONS = ASSESSMENT_FLOORS.options;
const MAX_ANSWER_TEXT_LENGTH = ASSESSMENT_FLOORS.longText;

const validVerdict = (value: unknown): StoredQuizVerdict | null | undefined => {
    if (value === null) return null;
    if (!isObject(value)) return undefined;
    const candidate = value as Partial<StoredQuizVerdict>;
    if (typeof candidate.correct !== 'boolean') return undefined;
    if (
        !Array.isArray(candidate.correctAnswers) ||
        candidate.correctAnswers.length > MAX_ANSWER_OPTIONS ||
        !candidate.correctAnswers.every(
            (answer) => typeof answer === 'string' && answer.length <= MAX_ANSWER_TEXT_LENGTH,
        )
    )
        return undefined;
    return { correct: candidate.correct, correctAnswers: candidate.correctAnswers };
};

const validAnswer = (value: unknown): StoredQuizAnswer | undefined => {
    if (!isObject(value)) return undefined;
    const candidate = value as Partial<StoredQuizAnswer>;
    if (!boundedNonblankString(candidate.questionId, MAX_TOKEN_LENGTH)) return undefined;
    const verdict = validVerdict(candidate.verdict);
    if (verdict === undefined) return undefined;
    return { questionId: candidate.questionId, verdict };
};

const validEntry = (value: unknown): QuizAttempt | undefined => {
    if (!isObject(value)) return undefined;
    const candidate = value as Partial<QuizAttempt>;
    if (
        !boundedNonblankString(candidate.publicToken, MAX_TOKEN_LENGTH) ||
        !boundedNonblankString(candidate.attemptId, MAX_TOKEN_LENGTH)
    )
        return undefined;
    if (!Array.isArray(candidate.answers) || candidate.answers.length > MAX_QUESTION_COUNT)
        return undefined;
    const answers = candidate.answers.map(validAnswer);
    if (answers.some((answer) => answer === undefined)) return undefined;
    const at = storedTimestamp(candidate.at) ?? Date.now();
    return {
        publicToken: candidate.publicToken,
        attemptId: candidate.attemptId,
        answers: answers as StoredQuizAnswer[],
        at,
    };
};

const readAll = (): QuizAttempt[] => readValidatedList(STORAGE_KEY, validEntry);

const writeAll = (entries: QuizAttempt[]): void => {
    writeList(STORAGE_KEY, entries.slice(0, MAX_REMEMBERED));
};

export const storedQuizAttempt = (publicToken: string): QuizAttempt | undefined =>
    readAll().find((entry) => entry.publicToken === publicToken);

export const rememberQuizAttempt = (publicToken: string, attemptId: string): void => {
    if (publicToken.trim().length === 0 || attemptId.trim().length === 0) return;
    const known = readAll().filter((entry) => entry.publicToken !== publicToken);
    writeAll([{ publicToken, attemptId, answers: [], at: Date.now() }, ...known]);
};

export const rememberQuizAnswer = (
    publicToken: string,
    attemptId: string,
    questionId: string,
    verdict: StoredQuizVerdict | undefined,
): void => {
    const known = readAll();
    const current = known.find((entry) => entry.publicToken === publicToken);
    if (!current || current.attemptId !== attemptId) return;
    const answers = [
        ...current.answers.filter((answer) => answer.questionId !== questionId),
        { questionId, verdict: verdict ?? null },
    ];
    if (answers.length > MAX_QUESTION_COUNT) return;
    writeAll([
        { ...current, answers, at: Date.now() },
        ...known.filter((entry) => entry.publicToken !== publicToken),
    ]);
};

export const forgetQuizAttempt = (publicToken: string): void => {
    writeAll(readAll().filter((entry) => entry.publicToken !== publicToken));
};
