// SPDX-License-Identifier: EUPL-1.2
// SPDX-FileCopyrightText: 2026 LitterBox-Web contributors

export interface QuizVerdict {
    correct: boolean;
    correctAnswers: string[];
}

export type SubmitQuizAnswer = (
    questionId: string,
    answer: string,
    signal?: AbortSignal,
) => Promise<QuizVerdict | undefined>;

export class QuizAnswerAuthorizationError extends Error {
    public constructor() {
        super('Authorization for this answer is no longer valid');
        this.name = 'QuizAnswerAuthorizationError';
    }
}

export class QuizAttemptsExhaustedError extends Error {
    public constructor() {
        super('This quiz has taken every attempt it will take');
        this.name = 'QuizAttemptsExhaustedError';
    }
}

export class QuizClosedError extends Error {
    public constructor() {
        super('This quiz is not open right now');
        this.name = 'QuizClosedError';
    }
}
