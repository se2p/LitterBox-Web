// SPDX-License-Identifier: EUPL-1.2
// SPDX-FileCopyrightText: 2026 LitterBox-Web contributors

import type { QuizQuestionType } from './quiz-question';

export const normalizedChoice = (value: string): string =>
    value.trim().replaceAll(/\s+/g, ' ').toLowerCase();

const yesNoToken = (value: string): 'yes' | 'no' | undefined => {
    switch (normalizedChoice(value)) {
        case 'yes':
        case 'true':
        case 'y':
        case 'ja':
        case 'si':
        case 'sí':
            return 'yes';
        case 'no':
        case 'false':
        case 'n':
        case 'nein':
        case 'non':
        case 'nee':
            return 'no';
        default:
            return undefined;
    }
};

// Keep this aligned with the service's Double.parseDouble-compatible input.
const isNumericAnswer = (value: string): boolean =>
    /^[+-]?(\d+\.?\d*|\.\d+)([Ee][+-]?\d+)?$/.test(value.trim());

export const YES_NO_TOKENS = ['yes', 'no'] as const;

export type YesNoToken = (typeof YES_NO_TOKENS)[number];

export const carriedCorrectAnswers = (
    nextType: QuizQuestionType,
    options: readonly string[],
    correctAnswers: readonly string[],
): string[] => {
    switch (nextType) {
        case 'MULTIPLE_CHOICE':
            return correctAnswers.filter((answer) => options.includes(answer));
        case 'YES_NO': {
            const token = selectedYesNo(correctAnswers);
            return token ? [token] : [];
        }
        case 'NUMBER':
            return correctAnswers.length === 1 && isNumericAnswer(correctAnswers[0])
                ? [correctAnswers[0].trim()]
                : [];
        case 'FREE_TEXT':
            return correctAnswers.filter((answer) => answer.trim().length > 0);
    }
};

/**
 * The answer key exactly as the editor would hold it, or undefined when the answers do not fit
 * the question: nothing is dropped or reinterpreted to get there.
 */
export const canonicalCorrectAnswers = (
    type: QuizQuestionType,
    options: readonly string[],
    correctAnswers: readonly string[],
): string[] | undefined => {
    if (correctAnswers.length === 0) return [];
    if (type === 'MULTIPLE_CHOICE') {
        const chosen = correctAnswers.map((answer) =>
            options.find((option) => normalizedChoice(option) === normalizedChoice(answer)),
        );
        const offered = chosen.filter((option): option is string => option !== undefined);
        return offered.length === chosen.length && new Set(offered).size === offered.length
            ? offered
            : undefined;
    }
    const carried = carriedCorrectAnswers(type, options, correctAnswers);
    return carried.length === correctAnswers.length ? carried : undefined;
};

export const selectedYesNo = (correctAnswers: readonly string[]): YesNoToken | undefined =>
    correctAnswers.length === 1 ? yesNoToken(correctAnswers[0]) : undefined;

export const answerLines = (value: string): string[] =>
    value
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean);
