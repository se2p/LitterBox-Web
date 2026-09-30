// SPDX-License-Identifier: EUPL-1.2
// SPDX-FileCopyrightText: 2026 LitterBox-Web contributors

import { boundedNonblankString, isObject } from '../api/validation';
import { readValidatedList, storedTimestamp, writeList } from './device-store';

export interface PublishedQuiz {
    publicToken: string;
    teacherToken: string;
    title: string;
    at: number;
}

export const learnerQuizPath = (publicToken: string): string =>
    `quiz/${encodeURIComponent(publicToken)}`;

export const quizResultsPath = (publicToken: string, teacherToken: string): string =>
    `${learnerQuizPath(publicToken)}/results#teacherToken=${encodeURIComponent(teacherToken)}`;

const STORAGE_KEY = 'litterbox.published-quizzes';
const MAX_REMEMBERED = 50;
const MAX_TOKEN_LENGTH = 128;
const MAX_TITLE_LENGTH = 300;

const validEntry = (value: unknown): PublishedQuiz | undefined => {
    if (!isObject(value)) return undefined;
    const candidate = value as Partial<PublishedQuiz>;
    if (
        !boundedNonblankString(candidate.publicToken, MAX_TOKEN_LENGTH) ||
        !boundedNonblankString(candidate.teacherToken, MAX_TOKEN_LENGTH)
    )
        return undefined;
    if (typeof candidate.title !== 'string') return undefined;
    const at = storedTimestamp(candidate.at) ?? Date.now();
    return {
        publicToken: candidate.publicToken,
        teacherToken: candidate.teacherToken,
        title: candidate.title.slice(0, MAX_TITLE_LENGTH),
        at,
    };
};

export const publishedQuizzes = (): PublishedQuiz[] =>
    readValidatedList(STORAGE_KEY, validEntry)
        .sort((first, second) => second.at - first.at)
        .slice(0, MAX_REMEMBERED);

export const rememberPublishedQuiz = (entry: PublishedQuiz): void => {
    const valid = validEntry(entry);
    if (!valid) return;
    writeList(
        STORAGE_KEY,
        [
            valid,
            ...publishedQuizzes().filter((quiz) => quiz.publicToken !== valid.publicToken),
        ].slice(0, MAX_REMEMBERED),
    );
};

export const forgetPublishedQuiz = (publicToken: string): void => {
    writeList(
        STORAGE_KEY,
        publishedQuizzes().filter((quiz) => quiz.publicToken !== publicToken),
    );
};
