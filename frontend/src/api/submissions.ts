// SPDX-License-Identifier: EUPL-1.2
// SPDX-FileCopyrightText: 2025 LitterBox-Web contributors

import { BASE_URL } from '../lib/base-url';
import {
    boundedNonblankString,
    boundedString,
    hasExactKeys,
    isJsonContentType,
    isObject,
    MAX_SEVERITY,
    nonnegativeSafeInteger,
    readBoundedText,
} from './validation';
import type {
    AnalysisViewDto,
    CatalogueViewDto,
    CreatedSubmissionDto,
    FeedbackRequestDto,
    IssueViewDto,
    QuizAnswerRequestDto,
    QuizAnswerResultDto,
    RelationshipViewDto,
    StudioSummaryViewDto,
    SubmissionViewDto,
} from './generated';

export const SUBMISSIONS_URL = `${BASE_URL}api/v1/submissions`;

export const analysisReportUrl = (token: string, analysisId: number): string =>
    `${SUBMISSIONS_URL}/${encodeURIComponent(token)}/analyses/${analysisId}/report.html`;
export const QUESTION_SUBMISSIONS_URL = `${BASE_URL}api/v1/question-submissions`;
export const STUDIOS_URL = `${BASE_URL}api/v1/studios`;

export type AnalysisIssue = IssueViewDto;
export type AnalysisRelationship = RelationshipViewDto;
export type CatalogueEntry = CatalogueViewDto;
export type BatchAnalysis = AnalysisViewDto;

export type SubmissionStatusResponse = SubmissionViewDto & {
    issues?: AnalysisIssue[];
    relationships?: AnalysisRelationship[];
    catalogueEntries?: CatalogueEntry[];
};

export type SubmissionAccepted = CreatedSubmissionDto;
export type StudioSummary = StudioSummaryViewDto;

export type FeedbackPayload = Pick<FeedbackRequestDto, 'finderId' | 'reaction'>;
export type QuizAnswerPayload = Pick<QuizAnswerRequestDto, 'questionId' | 'answer'>;

export interface SubmissionRequestOptions {
    signal?: AbortSignal;
    idempotencyKey?: string;
    locale?: string;
}

export class SubmissionApiError extends Error {
    public readonly status?: number;

    public constructor(message: string, status?: number) {
        super(message);
        this.name = 'SubmissionApiError';
        this.status = status;
    }
}

const asOptions = (value?: AbortSignal | SubmissionRequestOptions): SubmissionRequestOptions => {
    if (typeof AbortSignal !== 'undefined' && value instanceof AbortSignal)
        return { signal: value };
    return value ? (value as SubmissionRequestOptions) : {};
};

const MAX_RESPONSE_BYTES = 4 * 1024 * 1024;

const MAX_SUBMISSION_BYTES = 64 * 1024 * 1024;

const requestJson = async <T>(
    url: string,
    init?: RequestInit,
    maximum = MAX_RESPONSE_BYTES,
): Promise<T> => {
    const response = await fetch(url, {
        ...init,
        headers: { Accept: 'application/json', ...(init?.headers ?? {}) },
    });
    if (!response.ok) {
        throw new SubmissionApiError(`Request failed (${response.status})`, response.status);
    }
    if (response.status === 204) return undefined as T;
    if (!isJsonContentType(response.headers.get('Content-Type')))
        throw new SubmissionApiError('Response was not JSON', response.status);
    const text = await readBoundedText(response, maximum, {
        tooLarge: () => new SubmissionApiError('Response was too large', response.status),
    });
    if (!text) return undefined as T;
    try {
        return JSON.parse(text) as T;
    } catch {
        throw new SubmissionApiError('Response was not valid JSON', response.status);
    }
};

const accepted = (value: unknown): SubmissionAccepted => {
    if (!isObject(value) || typeof value.token !== 'string' || value.token.trim() === '')
        throw new SubmissionApiError('Response carried no submission token');
    return value as unknown as SubmissionAccepted;
};

const submissionHeaders = (options: SubmissionRequestOptions): Record<string, string> => ({
    ...(options.idempotencyKey ? { 'Idempotency-Key': options.idempotencyKey } : {}),
    ...(options.locale ? { 'Accept-Language': options.locale } : {}),
});

export async function submitFile(
    file: File,
    optionsOrSignal?: AbortSignal | SubmissionRequestOptions,
): Promise<SubmissionAccepted> {
    const options = asOptions(optionsOrSignal);
    const form = new FormData();
    form.append('file', file, file.name);
    return accepted(
        await requestJson<unknown>(SUBMISSIONS_URL, {
            method: 'POST',
            body: form,
            headers: submissionHeaders(options),
            signal: options.signal,
        }),
    );
}

export async function submitQuestionFile(
    file: File,
    optionsOrSignal?: AbortSignal | SubmissionRequestOptions,
): Promise<SubmissionAccepted> {
    const options = asOptions(optionsOrSignal);
    const form = new FormData();
    form.append('file', file, file.name);
    return accepted(
        await requestJson<unknown>(QUESTION_SUBMISSIONS_URL, {
            method: 'POST',
            body: form,
            headers: submissionHeaders(options),
            signal: options.signal,
        }),
    );
}

export async function submitProjectUrl(
    projectUrl: string,
    optionsOrSignal?: AbortSignal | SubmissionRequestOptions,
): Promise<SubmissionAccepted> {
    const options = asOptions(optionsOrSignal);
    return accepted(
        await requestJson<unknown>(SUBMISSIONS_URL, {
            method: 'POST',
            body: JSON.stringify({ projectUrl }),
            headers: { 'Content-Type': 'application/json', ...submissionHeaders(options) },
            signal: options.signal,
        }),
    );
}

export async function submitQuestionProjectUrl(
    projectUrl: string,
    optionsOrSignal?: AbortSignal | SubmissionRequestOptions,
): Promise<SubmissionAccepted> {
    const options = asOptions(optionsOrSignal);
    return accepted(
        await requestJson<unknown>(QUESTION_SUBMISSIONS_URL, {
            method: 'POST',
            body: JSON.stringify({ projectUrl }),
            headers: { 'Content-Type': 'application/json', ...submissionHeaders(options) },
            signal: options.signal,
        }),
    );
}

export async function reuseSubmission(
    token: string,
    analysis: 'issues' | 'questions',
    optionsOrSignal?: AbortSignal | SubmissionRequestOptions,
): Promise<SubmissionAccepted> {
    const options = asOptions(optionsOrSignal);
    return accepted(
        await requestJson<unknown>(`${SUBMISSIONS_URL}/${encodeURIComponent(token)}/reuse`, {
            method: 'POST',
            body: JSON.stringify({ analysis }),
            headers: { 'Content-Type': 'application/json', ...submissionHeaders(options) },
            signal: options.signal,
        }),
    );
}

export async function submitStudio(
    studioId: string,
    optionsOrSignal?: AbortSignal | SubmissionRequestOptions,
): Promise<SubmissionAccepted> {
    const options = asOptions(optionsOrSignal);
    return accepted(
        await requestJson<unknown>(SUBMISSIONS_URL, {
            method: 'POST',
            body: JSON.stringify({ studioId }),
            headers: { 'Content-Type': 'application/json', ...submissionHeaders(options) },
            signal: options.signal,
        }),
    );
}

export async function fetchStudioSummary(
    studioId: string,
    signal?: AbortSignal,
): Promise<StudioSummary> {
    return requestJson<StudioSummary>(`${STUDIOS_URL}/${encodeURIComponent(studioId)}`, { signal });
}

const namesItsState = (value: unknown): value is SubmissionStatusResponse =>
    isObject(value) && typeof value.status === 'string';

const objects = (value: unknown): Record<string, unknown>[] =>
    Array.isArray(value) ? value.filter(isObject) : [];

const list = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);

const strings = (value: unknown): string[] =>
    list(value).filter((one): one is string => typeof one === 'string');

const text = (value: unknown): string | null => (typeof value === 'string' ? value : null);

const required = (value: unknown): string => (typeof value === 'string' ? value : '');

const severity = (value: unknown): number =>
    nonnegativeSafeInteger(value, MAX_SEVERITY) ? value : 0;

const textMap = (value: unknown): Record<string, string> =>
    isObject(value)
        ? Object.fromEntries(
              Object.entries(value).filter(
                  (entry): entry is [string, string] => typeof entry[1] === 'string',
              ),
          )
        : {};

const asCatalogueEntry = (value: Record<string, unknown>): CatalogueEntry =>
    ({
        ...value,
        id: required(value.id),
        title: required(value.title),
        locale: required(value.locale),
        description: text(value.description),
        instruction: text(value.instruction),
        examples: objects(value.examples).map((example) => ({
            ...example,
            label: required(example.label),
            scratchblocks: required(example.scratchblocks),
        })),
    }) as unknown as CatalogueEntry;

const asIssue = (value: Record<string, unknown>): AnalysisIssue =>
    ({
        ...value,
        finderId: required(value.finderId),
        finderName: required(value.finderName),
        type: required(value.type),
        severity: severity(value.severity),
        sprite: required(value.sprite),
        hint: required(value.hint),
        scratchblocks: required(value.scratchblocks),
        blockId: text(value.blockId),
        costume: text(value.costume),
        refactoringScratchblocks: text(value.refactoringScratchblocks),
        thumbnailRef: text(value.thumbnailRef),
        duplicates: list(value.duplicates),
        subsumedBy: list(value.subsumedBy),
        coupledWith: list(value.coupledWith),
        costumes: list(value.costumes),
        similarTo: objects(value.similarTo),
    }) as unknown as AnalysisIssue;

const asAnalysis = (value: Record<string, unknown>): BatchAnalysis =>
    ({
        ...value,
        status: required(value.status),
        name: text(value.name),
        failureType: text(value.failureType),
        failureMessage: text(value.failureMessage),
        reportSchemaVersion: text(value.reportSchemaVersion),
        litterboxVersion: text(value.litterboxVersion),
        locale: text(value.locale),
        provenance: text(value.provenance),
        sourceSha256: text(value.sourceSha256),
        inputFormat: text(value.inputFormat),
        configuration: textMap(value.configuration),
        detectors: strings(value.detectors),
        assetRefs: strings(value.assetRefs),
        issues: objects(value.issues).map(asIssue),
        relationships: objects(value.relationships),
        catalogue: objects(value.catalogue).map(asCatalogueEntry),
        quiz: objects(value.quiz),
    }) as unknown as BatchAnalysis;

const asSubmission = (value: SubmissionStatusResponse): SubmissionStatusResponse => ({
    ...value,
    token: required(value.token),
    sourceType: required(value.sourceType),
    locale: required(value.locale),
    analysis: isObject(value.analysis) ? asAnalysis(value.analysis) : null,
    analyses: objects(value.analyses).map(asAnalysis),
    ...(value.issues === undefined ? {} : { issues: objects(value.issues).map(asIssue) }),
    ...(value.catalogueEntries === undefined
        ? {}
        : { catalogueEntries: objects(value.catalogueEntries).map(asCatalogueEntry) }),
    ...(value.relationships === undefined
        ? {}
        : { relationships: objects(value.relationships) as unknown as AnalysisRelationship[] }),
});

export async function fetchSubmission(
    token: string,
    signal?: AbortSignal,
): Promise<SubmissionStatusResponse> {
    const value = await requestJson<unknown>(
        `${SUBMISSIONS_URL}/${encodeURIComponent(token)}`,
        { signal },
        MAX_SUBMISSION_BYTES,
    );
    if (!namesItsState(value)) throw new SubmissionApiError('Response was not a submission');
    return asSubmission(value);
}

export const submissionEventsUrl = (token: string): string =>
    `${SUBMISSIONS_URL}/${encodeURIComponent(token)}/events`;

export async function cancelSubmission(token: string, signal?: AbortSignal): Promise<void> {
    await requestJson<unknown>(`${SUBMISSIONS_URL}/${encodeURIComponent(token)}/cancel`, {
        method: 'POST',
        signal,
    });
}

export async function fetchCatalogue(
    locale: string,
    signal?: AbortSignal,
): Promise<CatalogueEntry[]> {
    const query = new URLSearchParams({ locale });
    const value = await requestJson<unknown>(`${BASE_URL}api/v1/catalogue?${query}`, { signal });
    if (!Array.isArray(value)) throw new SubmissionApiError('Response was not a catalogue');
    return value.filter(isObject).map(asCatalogueEntry);
}

export async function sendFeedback(
    token: string,
    analysisId: string | number,
    payload: FeedbackPayload,
    signal?: AbortSignal,
): Promise<void> {
    const body: FeedbackRequestDto = {
        finderId: payload.finderId,
        reaction: payload.reaction,
    };
    await requestJson<unknown>(
        `${BASE_URL}api/v1/analyses/${encodeURIComponent(String(analysisId))}/feedback`,
        {
            method: 'POST',
            body: JSON.stringify(body),
            headers: {
                Authorization: `Bearer ${token}`,
                'Content-Type': 'application/json',
            },
            signal,
        },
    );
}

export interface QuizAnswerResult {
    correct: boolean;
    correctAnswers: string[];
}

const quizAnswerResult = (value: unknown): QuizAnswerResult | undefined => {
    if (!value || typeof value !== 'object') return undefined;
    const candidate = value as Partial<QuizAnswerResultDto>;
    if (typeof candidate.correct !== 'boolean') return undefined;
    return {
        correct: candidate.correct,
        correctAnswers: Array.isArray(candidate.correctAnswers)
            ? candidate.correctAnswers.filter((answer) => typeof answer === 'string')
            : [],
    };
};

export async function sendQuizAnswer(
    token: string,
    analysisId: string | number,
    payload: QuizAnswerPayload,
    signal?: AbortSignal,
): Promise<QuizAnswerResult | undefined> {
    const body: QuizAnswerRequestDto = {
        questionId: payload.questionId,
        answer: payload.answer,
    };
    const result = await requestJson<unknown>(
        `${BASE_URL}api/v1/analyses/${encodeURIComponent(String(analysisId))}/quiz-answers`,
        {
            method: 'POST',
            body: JSON.stringify(body),
            headers: {
                Authorization: `Bearer ${token}`,
                'Content-Type': 'application/json',
            },
            signal,
        },
    );
    return quizAnswerResult(result);
}

export interface QuizAnswerKeyQuestion {
    questionId: string;
    correctAnswers: string[];
}

export interface QuizAnswerKey {
    schemaVersion: number;
    questions: QuizAnswerKeyQuestion[];
}

const MAX_ANSWER_KEY_QUESTIONS = 1000;
const MAX_ANSWER_KEY_ANSWERS = 50;
const MAX_ANSWER_KEY_ID_LENGTH = 128;
const MAX_ANSWER_KEY_ANSWER_LENGTH = 500;

const isQuizAnswerKeyQuestion = (value: unknown): value is QuizAnswerKeyQuestion =>
    hasExactKeys(value, ['questionId', 'correctAnswers']) &&
    boundedNonblankString(value.questionId, MAX_ANSWER_KEY_ID_LENGTH) &&
    Array.isArray(value.correctAnswers) &&
    value.correctAnswers.length <= MAX_ANSWER_KEY_ANSWERS &&
    value.correctAnswers.every((answer) => boundedString(answer, MAX_ANSWER_KEY_ANSWER_LENGTH));

const asQuizAnswerKey = (value: unknown): QuizAnswerKey => {
    if (
        !hasExactKeys(value, ['schemaVersion', 'questions']) ||
        value.schemaVersion !== 1 ||
        !Array.isArray(value.questions) ||
        value.questions.length > MAX_ANSWER_KEY_QUESTIONS ||
        !value.questions.every(isQuizAnswerKeyQuestion)
    )
        throw new SubmissionApiError('Response did not match the quiz answer key format');
    return {
        schemaVersion: 1,
        questions: (value.questions as QuizAnswerKeyQuestion[]).map((question) => ({
            questionId: question.questionId,
            correctAnswers: [...question.correctAnswers],
        })),
    };
};

export async function fetchQuizAnswerKey(
    token: string,
    analysisId: number,
    signal?: AbortSignal,
): Promise<QuizAnswerKey> {
    const value = await requestJson<unknown>(
        `${BASE_URL}api/v1/analyses/${encodeURIComponent(String(analysisId))}/quiz-answer-key`,
        {
            headers: { Authorization: `Bearer ${token}` },
            signal,
        },
    );
    return asQuizAnswerKey(value);
}
