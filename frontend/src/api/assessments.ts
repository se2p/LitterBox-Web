// SPDX-License-Identifier: EUPL-1.2
// SPDX-FileCopyrightText: 2026 LitterBox-Web contributors

import {
    isOneOf,
    PROGRAM_DIMENSIONS,
    QUIZ_QUESTION_TYPES,
    SCOPES_OF_FOCUS,
} from '../components/questions/quiz-question';
import { isAbortError } from '../lib/abort-error';
import { BASE_URL } from '../lib/base-url';
import type { AssessmentLimits } from './capabilities';
import { MAX_EXPORT_RESPONSE_BYTES, validateExportTargets, type ExportTargets } from './exports';
import {
    boundedNonblankString,
    boundedString,
    hasExactKeys,
    isJsonContentType,
    nonnegativeSafeInteger,
    nullableBoundedString,
    positiveSafeInteger,
    readBoundedText,
} from './validation';

const ASSESSMENTS_URL = `${BASE_URL}api/v1/assessments`;

export type AssessmentErrorCategory =
    | 'validation'
    | 'not_found'
    | 'unauthorized'
    | 'gone'
    | 'exhausted'
    | 'malformed_request'
    | 'malformed_response'
    | 'network_failure'
    | 'canceled';

const ASSESSMENT_ERROR_MESSAGES: Partial<Record<AssessmentErrorCategory, string>> = {
    validation: 'The assessment request was not valid',
    malformed_response: 'Response did not match the assessment format',
    not_found: 'This quiz could not be found',
    unauthorized: 'This authorization is no longer valid',
    gone: 'This quiz has closed or expired and is no longer answering',
    exhausted: 'This quiz has taken every attempt it will take',
};

export class AssessmentApiError extends Error {
    public readonly category: AssessmentErrorCategory;
    public readonly status?: number;

    public constructor(category: AssessmentErrorCategory, status?: number) {
        super(ASSESSMENT_ERROR_MESSAGES[category] ?? category);
        this.name = 'AssessmentApiError';
        this.category = category;
        this.status = status;
    }
}

const MAX_RESPONSE_BYTES = 4 * 1024 * 1024;
const MAX_TOKEN_LENGTH = 128;

export const ASSESSMENT_SHORT_TEXT_LENGTH = 300;

export const ASSESSMENT_FLOORS = {
    title: 300,
    longText: 20_000,
    questions: 200,
    options: 50,
    optionLength: 300,
} as const;

export interface AssessmentBounds {
    title: number;
    longText: number;
    questions: number;
    options: number;
    optionLength: number;
}

export const assessmentBounds = (limits: AssessmentLimits): AssessmentBounds => ({
    title: Math.max(ASSESSMENT_FLOORS.title, limits.maxTitleLength),
    longText: Math.max(
        ASSESSMENT_FLOORS.longText,
        limits.maxInstructionsLength,
        limits.maxQuestionTextLength,
        limits.maxAnswerGuideLength,
        limits.maxOptionLength,
    ),
    questions: Math.max(ASSESSMENT_FLOORS.questions, limits.maxQuestions),
    options: Math.max(ASSESSMENT_FLOORS.options, limits.maxOptions),
    optionLength: Math.max(ASSESSMENT_FLOORS.optionLength, limits.maxOptionLength),
});

const nullableMember = <T extends string>(
    options: readonly T[],
    value: unknown,
): value is T | null => value === null || isOneOf(options, value);

type AssessmentQuestionSource = 'GENERATED' | 'CUSTOM';

export interface AssessmentQuestionInput {
    source: AssessmentQuestionSource;
    questionId?: string;
    questionText?: string;
    questionType?: string;
    options?: string[];
    expectedAnswers?: number;
    correctAnswers?: string[];
}

export interface PublishAssessmentPayload {
    analysisId: number;
    title: string;
    instructions?: string;
    locale: string;
    questions: AssessmentQuestionInput[];
}

export interface PublishedAssessment {
    schemaVersion: number;
    publicToken: string;
    teacherToken: string;
}

export interface AssessmentLearnerQuestion {
    questionId: string;
    questionText: string;
    options: string[];
    questionType: (typeof QUIZ_QUESTION_TYPES)[number] | null;
    sprite: string | null;
    scratchBlocks: string | null;
    hint: string | null;
    programDimension: (typeof PROGRAM_DIMENSIONS)[number] | null;
    scopeOfFocus: (typeof SCOPES_OF_FOCUS)[number] | null;
    expectedAnswers: number | null;
}

export interface AssessmentLearnerView {
    schemaVersion: number;
    title: string;
    instructions: string;
    locale: string;
    questions: AssessmentLearnerQuestion[];
}

export interface AssessmentAttempt {
    attemptId: string;
}

export interface AssessmentAnswerVerdict {
    questionId: string;
    correct: boolean | null;
    correctAnswers: string[];
}

export interface AssessmentAnswerTally {
    answer: string;
    count: number;
}

export interface AssessmentResultsQuestion {
    questionId: string;
    questionText: string;
    answered: number;
    correct: number;
    incorrect: number;
    notMarkable: number;
    answerTallies: AssessmentAnswerTally[];
    otherAnswers: number;
}

export interface AssessmentScoreDistribution {
    markableQuestions: number;
    completedAttempts: number;
    partialAttempts: number;
    counts: number[];
}

export interface AssessmentResults {
    schemaVersion: number;
    title: string;
    status: 'OPEN' | 'CLOSED';
    expiresAt: string;
    totalAttempts: number;
    questions: AssessmentResultsQuestion[];
    scores: AssessmentScoreDistribution;
}

const categoryForStatus = (status: number): AssessmentErrorCategory => {
    if (status === 400) return 'malformed_request';
    if (status === 401 || status === 403) return 'unauthorized';
    if (status === 404) return 'not_found';
    if (status === 410) return 'gone';
    if (status === 429) return 'exhausted';
    return 'malformed_response';
};

interface RequestOptions {
    method?: string;
    body?: unknown;
    token?: string;
    signal?: AbortSignal;
    maxBytes?: number;
}

async function requestAssessment<T>(
    url: string,
    parse: (value: unknown) => T,
    options?: RequestOptions,
): Promise<T>;
async function requestAssessment(
    url: string,
    parse?: undefined,
    options?: RequestOptions,
): Promise<void>;
async function requestAssessment<T>(
    url: string,
    parse?: (value: unknown) => T,
    options: RequestOptions = {},
): Promise<T | void> {
    let response: Response;
    try {
        response = await fetch(url, {
            method: options.method ?? 'GET',
            signal: options.signal,
            headers: {
                Accept: 'application/json',
                ...(options.body === undefined ? {} : { 'Content-Type': 'application/json' }),
                ...(options.token === undefined
                    ? {}
                    : { Authorization: `Bearer ${options.token}` }),
            },
            ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
        });
    } catch (error) {
        if (isAbortError(error) || options.signal?.aborted)
            throw new AssessmentApiError('canceled');
        throw new AssessmentApiError('network_failure');
    }

    if (!response.ok)
        throw new AssessmentApiError(categoryForStatus(response.status), response.status);

    if (!parse) return;

    if (!isJsonContentType(response.headers.get('Content-Type')))
        throw new AssessmentApiError('malformed_response', response.status);

    try {
        const text = await readBoundedText(response, options.maxBytes ?? MAX_RESPONSE_BYTES, {
            tooLarge: () => new AssessmentApiError('malformed_response', response.status),
            malformed: () => new AssessmentApiError('malformed_response', response.status),
            readFailed: (error) =>
                isAbortError(error) || options.signal?.aborted
                    ? new AssessmentApiError('canceled', response.status)
                    : new AssessmentApiError('malformed_response', response.status),
        });
        return parse(JSON.parse(text) as unknown);
    } catch (error) {
        if (error instanceof AssessmentApiError) throw error;
        if (isAbortError(error) || options.signal?.aborted)
            throw new AssessmentApiError('canceled', response.status);
        throw new AssessmentApiError('malformed_response', response.status);
    }
}

const parsePublished = (value: unknown): PublishedAssessment => {
    if (
        !hasExactKeys(value, ['schemaVersion', 'publicToken', 'teacherToken']) ||
        value.schemaVersion !== 1 ||
        !boundedNonblankString(value.publicToken, MAX_TOKEN_LENGTH) ||
        !boundedNonblankString(value.teacherToken, MAX_TOKEN_LENGTH) ||
        value.publicToken === value.teacherToken
    )
        throw new AssessmentApiError('malformed_response');
    return {
        schemaVersion: 1,
        publicToken: value.publicToken,
        teacherToken: value.teacherToken,
    };
};

const validQuestionInput = (
    question: AssessmentQuestionInput,
    limits: AssessmentLimits,
): boolean => {
    if (question.source === 'GENERATED') {
        return boundedNonblankString(question.questionId, MAX_TOKEN_LENGTH);
    }
    if (
        question.source !== 'CUSTOM' ||
        !boundedNonblankString(question.questionText, limits.maxQuestionTextLength)
    ) {
        return false;
    }
    if (
        question.questionType !== undefined &&
        !(QUIZ_QUESTION_TYPES as readonly string[]).includes(question.questionType)
    )
        return false;
    const options = question.options ?? [];
    if (options.length > limits.maxOptions) return false;
    if (!options.every((option) => boundedNonblankString(option, limits.maxOptionLength)))
        return false;

    const correctAnswers = question.correctAnswers ?? [];
    if (correctAnswers.length > limits.maxOptions) return false;
    if (!correctAnswers.every((answer) => boundedNonblankString(answer, limits.maxOptionLength)))
        return false;

    return question.expectedAnswers === undefined || positiveSafeInteger(question.expectedAnswers);
};

export async function publishAssessment(
    submissionToken: string,
    payload: PublishAssessmentPayload,
    limits: AssessmentLimits,
    signal?: AbortSignal,
): Promise<PublishedAssessment> {
    if (
        !boundedNonblankString(submissionToken, MAX_TOKEN_LENGTH) ||
        !positiveSafeInteger(payload.analysisId) ||
        !boundedNonblankString(payload.title, limits.maxTitleLength) ||
        (payload.instructions !== undefined &&
            !boundedString(payload.instructions, limits.maxInstructionsLength)) ||
        !boundedNonblankString(payload.locale, 16) ||
        payload.questions.length === 0 ||
        payload.questions.length > limits.maxQuestions ||
        !payload.questions.every((question) => validQuestionInput(question, limits))
    )
        throw new AssessmentApiError('validation');

    return requestAssessment(ASSESSMENTS_URL, parsePublished, {
        method: 'POST',
        token: submissionToken,
        signal,
        body: {
            analysisId: payload.analysisId,
            title: payload.title,
            instructions: payload.instructions ?? '',
            locale: payload.locale,
            questions: payload.questions.map((question) => ({
                ...question,
                correctAnswers: question.correctAnswers?.length
                    ? question.correctAnswers
                    : undefined,
            })),
        },
    });
}

const parseLearnerQuestion =
    (bounds: AssessmentBounds) =>
    (value: unknown): AssessmentLearnerQuestion => {
        if (
            !hasExactKeys(value, [
                'questionId',
                'questionText',
                'options',
                'questionType',
                'sprite',
                'scratchBlocks',
                'hint',
                'programDimension',
                'scopeOfFocus',
                'expectedAnswers',
            ]) ||
            !boundedNonblankString(value.questionId, MAX_TOKEN_LENGTH) ||
            !boundedNonblankString(value.questionText, bounds.longText) ||
            !Array.isArray(value.options) ||
            value.options.length > bounds.options ||
            !value.options.every((option) => boundedString(option, bounds.longText)) ||
            !nullableMember(QUIZ_QUESTION_TYPES, value.questionType) ||
            !nullableBoundedString(value.sprite, ASSESSMENT_SHORT_TEXT_LENGTH) ||
            !nullableBoundedString(value.scratchBlocks, bounds.longText) ||
            !nullableBoundedString(value.hint, bounds.longText) ||
            !nullableMember(PROGRAM_DIMENSIONS, value.programDimension) ||
            !nullableMember(SCOPES_OF_FOCUS, value.scopeOfFocus) ||
            (value.expectedAnswers !== null && !positiveSafeInteger(value.expectedAnswers))
        )
            throw new AssessmentApiError('malformed_response');
        return {
            questionId: value.questionId,
            questionText: value.questionText,
            options: value.options as string[],
            questionType: value.questionType,
            sprite: value.sprite,
            scratchBlocks: value.scratchBlocks,
            hint: value.hint,
            programDimension: value.programDimension,
            scopeOfFocus: value.scopeOfFocus,
            expectedAnswers: value.expectedAnswers,
        };
    };

const parseLearnerView =
    (bounds: AssessmentBounds) =>
    (value: unknown): AssessmentLearnerView => {
        if (
            !hasExactKeys(value, [
                'schemaVersion',
                'title',
                'instructions',
                'locale',
                'questions',
            ]) ||
            value.schemaVersion !== 1 ||
            !boundedNonblankString(value.title, bounds.title) ||
            !nullableBoundedString(value.instructions, bounds.longText) ||
            !boundedNonblankString(value.locale, 16) ||
            !Array.isArray(value.questions) ||
            value.questions.length === 0 ||
            value.questions.length > bounds.questions
        )
            throw new AssessmentApiError('malformed_response');
        return {
            schemaVersion: 1,
            title: value.title,
            instructions: value.instructions ?? '',
            locale: value.locale,
            questions: value.questions.map(parseLearnerQuestion(bounds)),
        };
    };

export async function fetchAssessment(
    publicToken: string,
    limits: AssessmentLimits,
    signal?: AbortSignal,
): Promise<AssessmentLearnerView> {
    if (!boundedNonblankString(publicToken, MAX_TOKEN_LENGTH))
        throw new AssessmentApiError('validation');
    return requestAssessment(
        `${ASSESSMENTS_URL}/${encodeURIComponent(publicToken)}`,
        parseLearnerView(assessmentBounds(limits)),
        { signal },
    );
}

export async function fetchAssessmentCode(
    publicToken: string,
    signal?: AbortSignal,
): Promise<ExportTargets> {
    if (!boundedNonblankString(publicToken, MAX_TOKEN_LENGTH))
        throw new AssessmentApiError('validation');
    return requestAssessment(
        `${ASSESSMENTS_URL}/${encodeURIComponent(publicToken)}/code`,
        validateExportTargets,
        { signal, maxBytes: MAX_EXPORT_RESPONSE_BYTES },
    );
}

const parseAttempt = (value: unknown): AssessmentAttempt => {
    if (
        !hasExactKeys(value, ['attemptId']) ||
        !boundedNonblankString(value.attemptId, MAX_TOKEN_LENGTH)
    )
        throw new AssessmentApiError('malformed_response');
    return { attemptId: value.attemptId };
};

export async function startAssessmentAttempt(
    publicToken: string,
    signal?: AbortSignal,
): Promise<AssessmentAttempt> {
    if (!boundedNonblankString(publicToken, MAX_TOKEN_LENGTH))
        throw new AssessmentApiError('validation');
    return requestAssessment(
        `${ASSESSMENTS_URL}/${encodeURIComponent(publicToken)}/attempts`,
        parseAttempt,
        { method: 'POST', signal },
    );
}

const parseVerdict =
    (bounds: AssessmentBounds) =>
    (value: unknown): AssessmentAnswerVerdict => {
        if (
            !hasExactKeys(value, ['questionId', 'correct', 'correctAnswers']) ||
            !boundedNonblankString(value.questionId, MAX_TOKEN_LENGTH) ||
            (typeof value.correct !== 'boolean' && value.correct !== null) ||
            !Array.isArray(value.correctAnswers) ||
            value.correctAnswers.length > bounds.options ||
            !value.correctAnswers.every((answer) => boundedString(answer, bounds.longText))
        )
            throw new AssessmentApiError('malformed_response');
        return {
            questionId: value.questionId,
            correct: value.correct,
            correctAnswers: value.correctAnswers as string[],
        };
    };

export async function submitAssessmentAnswer(
    publicToken: string,
    attemptId: string,
    payload: { questionId: string; answer: string },
    limits: AssessmentLimits,
    signal?: AbortSignal,
): Promise<AssessmentAnswerVerdict> {
    if (
        !boundedNonblankString(publicToken, MAX_TOKEN_LENGTH) ||
        !boundedNonblankString(attemptId, MAX_TOKEN_LENGTH) ||
        !boundedNonblankString(payload.questionId, MAX_TOKEN_LENGTH) ||
        !boundedNonblankString(payload.answer, limits.maxAnswerLength)
    )
        throw new AssessmentApiError('validation');
    return requestAssessment(
        `${ASSESSMENTS_URL}/${encodeURIComponent(publicToken)}/attempts/${encodeURIComponent(attemptId)}/answers`,
        parseVerdict(assessmentBounds(limits)),
        {
            method: 'POST',
            signal,
            body: { questionId: payload.questionId, answer: payload.answer },
        },
    );
}

const parseAnswerTally =
    (bounds: AssessmentBounds, answered: number) =>
    (value: unknown): AssessmentAnswerTally => {
        if (
            !hasExactKeys(value, ['answer', 'count']) ||
            !boundedString(value.answer, bounds.longText) ||
            !nonnegativeSafeInteger(value.count) ||
            value.count > answered
        )
            throw new AssessmentApiError('malformed_response');
        return { answer: value.answer, count: value.count };
    };

const parseResultsQuestion =
    (bounds: AssessmentBounds) =>
    (value: unknown): AssessmentResultsQuestion => {
        if (
            !hasExactKeys(value, [
                'questionId',
                'questionText',
                'answered',
                'correct',
                'incorrect',
                'notMarkable',
                'answerTallies',
                'otherAnswers',
            ]) ||
            !boundedNonblankString(value.questionId, MAX_TOKEN_LENGTH) ||
            !boundedNonblankString(value.questionText, bounds.longText) ||
            !nonnegativeSafeInteger(value.answered) ||
            !nonnegativeSafeInteger(value.correct) ||
            !nonnegativeSafeInteger(value.incorrect) ||
            !nonnegativeSafeInteger(value.notMarkable) ||
            value.correct + value.incorrect + value.notMarkable !== value.answered ||
            !Array.isArray(value.answerTallies) ||
            value.answerTallies.length > bounds.options ||
            !nonnegativeSafeInteger(value.otherAnswers) ||
            value.otherAnswers > value.answered
        )
            throw new AssessmentApiError('malformed_response');
        return {
            questionId: value.questionId,
            questionText: value.questionText,
            answered: value.answered,
            correct: value.correct,
            incorrect: value.incorrect,
            notMarkable: value.notMarkable,
            answerTallies: value.answerTallies.map(parseAnswerTally(bounds, value.answered)),
            otherAnswers: value.otherAnswers,
        };
    };

const parseScores =
    (bounds: AssessmentBounds, totalAttempts: number) =>
    (value: unknown): AssessmentScoreDistribution => {
        if (
            !hasExactKeys(value, [
                'markableQuestions',
                'completedAttempts',
                'partialAttempts',
                'counts',
            ]) ||
            !nonnegativeSafeInteger(value.markableQuestions, bounds.questions) ||
            !nonnegativeSafeInteger(value.completedAttempts) ||
            !nonnegativeSafeInteger(value.partialAttempts) ||
            !Array.isArray(value.counts) ||
            value.counts.length !== value.markableQuestions + 1 ||
            !value.counts.every((count) => nonnegativeSafeInteger(count)) ||
            (value.counts as number[]).reduce((total, count) => total + count, 0) !==
                value.completedAttempts ||
            value.completedAttempts + value.partialAttempts > totalAttempts
        )
            throw new AssessmentApiError('malformed_response');
        return {
            markableQuestions: value.markableQuestions,
            completedAttempts: value.completedAttempts,
            partialAttempts: value.partialAttempts,
            counts: value.counts as number[],
        };
    };

const parseResults =
    (bounds: AssessmentBounds) =>
    (value: unknown): AssessmentResults => {
        if (
            !hasExactKeys(value, [
                'schemaVersion',
                'title',
                'status',
                'expiresAt',
                'totalAttempts',
                'questions',
                'scores',
            ]) ||
            value.schemaVersion !== 1 ||
            !boundedNonblankString(value.title, bounds.title) ||
            (value.status !== 'OPEN' && value.status !== 'CLOSED') ||
            !boundedNonblankString(value.expiresAt, ASSESSMENT_SHORT_TEXT_LENGTH) ||
            Number.isNaN(Date.parse(value.expiresAt)) ||
            !nonnegativeSafeInteger(value.totalAttempts) ||
            !Array.isArray(value.questions) ||
            value.questions.length > bounds.questions
        )
            throw new AssessmentApiError('malformed_response');
        return {
            schemaVersion: 1,
            title: value.title,
            status: value.status,
            expiresAt: value.expiresAt,
            totalAttempts: value.totalAttempts,
            questions: value.questions.map(parseResultsQuestion(bounds)),
            scores: parseScores(bounds, value.totalAttempts)(value.scores),
        };
    };

export async function fetchAssessmentResults(
    publicToken: string,
    teacherToken: string,
    limits: AssessmentLimits,
    signal?: AbortSignal,
): Promise<AssessmentResults> {
    if (
        !boundedNonblankString(publicToken, MAX_TOKEN_LENGTH) ||
        !boundedNonblankString(teacherToken, MAX_TOKEN_LENGTH)
    )
        throw new AssessmentApiError('validation');
    return requestAssessment(
        `${ASSESSMENTS_URL}/${encodeURIComponent(publicToken)}/results`,
        parseResults(assessmentBounds(limits)),
        { token: teacherToken, signal },
    );
}

export interface AssessmentState {
    schemaVersion: number;
    publicToken: string;
    status: 'OPEN' | 'CLOSED';
    expiresAt: string;
    totalAttempts: number;
}

const parseState = (value: unknown): AssessmentState => {
    if (
        !hasExactKeys(value, [
            'schemaVersion',
            'publicToken',
            'status',
            'expiresAt',
            'totalAttempts',
        ]) ||
        value.schemaVersion !== 1 ||
        !boundedNonblankString(value.publicToken, MAX_TOKEN_LENGTH) ||
        (value.status !== 'OPEN' && value.status !== 'CLOSED') ||
        !boundedNonblankString(value.expiresAt, ASSESSMENT_SHORT_TEXT_LENGTH) ||
        Number.isNaN(Date.parse(value.expiresAt)) ||
        !nonnegativeSafeInteger(value.totalAttempts)
    )
        throw new AssessmentApiError('malformed_response');
    return {
        schemaVersion: 1,
        publicToken: value.publicToken,
        status: value.status,
        expiresAt: value.expiresAt,
        totalAttempts: value.totalAttempts,
    };
};

export async function updateAssessment(
    publicToken: string,
    teacherToken: string,
    change: { status?: 'OPEN' | 'CLOSED'; extendByDays?: number },
    signal?: AbortSignal,
): Promise<AssessmentState> {
    if (
        !boundedNonblankString(publicToken, MAX_TOKEN_LENGTH) ||
        !boundedNonblankString(teacherToken, MAX_TOKEN_LENGTH) ||
        (change.status === undefined && change.extendByDays === undefined) ||
        (change.extendByDays !== undefined && !positiveSafeInteger(change.extendByDays))
    )
        throw new AssessmentApiError('validation');
    return requestAssessment(`${ASSESSMENTS_URL}/${encodeURIComponent(publicToken)}`, parseState, {
        method: 'PATCH',
        token: teacherToken,
        signal,
        body: change,
    });
}

export async function deleteAssessment(
    publicToken: string,
    teacherToken: string,
    signal?: AbortSignal,
): Promise<void> {
    if (
        !boundedNonblankString(publicToken, MAX_TOKEN_LENGTH) ||
        !boundedNonblankString(teacherToken, MAX_TOKEN_LENGTH)
    )
        throw new AssessmentApiError('validation');
    await requestAssessment(`${ASSESSMENTS_URL}/${encodeURIComponent(publicToken)}`, undefined, {
        method: 'DELETE',
        token: teacherToken,
        signal,
    });
}
