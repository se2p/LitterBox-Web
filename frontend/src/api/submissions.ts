// SPDX-License-Identifier: EUPL-1.2
// SPDX-FileCopyrightText: 2025 LitterBox-Web contributors

import { BASE_URL } from '../lib/base-url';
import { isJsonContentType, isObject, readBoundedText } from './validation';
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

/**
 * LitterBox's own report for one analysis, as the tool has always written it. Served with a disposition header, so
 * an ordinary link is the whole of the client side: nothing to fetch, nothing to hold in memory, and a browser that
 * already knows how to save a file.
 */
export const analysisReportUrl = (token: string, analysisId: number): string =>
    `${SUBMISSIONS_URL}/${encodeURIComponent(token)}/analyses/${analysisId}/report.html`;
export const QUESTION_SUBMISSIONS_URL = `${BASE_URL}api/v1/question-submissions`;
export const STUDIOS_URL = `${BASE_URL}api/v1/studios`;

export type SubmissionStatus =
    | 'queued'
    | 'processing'
    | 'completed'
    | 'partial'
    | 'failed'
    | 'cancelled'
    | string;

export type AnalysisIssue = IssueViewDto;
export type AnalysisRelationship = RelationshipViewDto;
export type CatalogueEntry = CatalogueViewDto;
export type BatchAnalysis = AnalysisViewDto;

export type SubmissionStatusResponse = SubmissionViewDto & {
    // These optional fields keep old synthetic fixtures and unversioned callers readable while
    // the frozen v1 response remains the source of truth for the rendered result.
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

/**
 * What these endpoints answer with: a link, a summary, a catalogue. Generous for all of them, and low enough that
 * nothing can talk this client into holding a response it will never finish reading.
 */
const MAX_RESPONSE_BYTES = 4 * 1024 * 1024;

/**
 * A submission's own state is the exception, because a studio may hold ten thousand projects and the response
 * carries every one of their analyses. Measured against a real one: the envelope alone is 580 bytes per project,
 * and each finding about 600 more. Ten thousand projects with ten findings apiece is a little over 60 MiB, so
 * that is what this leaves room for. A ceiling below it would refuse a result the service is entitled to give,
 * and refuse it after the work had been done.
 */
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
    // Said in the same terms as every other capability: a response is untrusted until it has declared itself
    // JSON and come in under a ceiling this client set, not one the sender claimed.
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

/**
 * What a submission is answered with: the token everything afterwards is addressed by. A form that got something
 * else would take the reader to a result that cannot exist, so it is refused here as a failed request instead.
 */
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

/**
 * Runs another kind of analysis over a project the service already holds. The project is named by the result it
 * produced, so a reader who has just checked a project can ask questions about it without finding the file again.
 */
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

/**
 * Reads what a studio holds before anything is sent. A studio runs until it is done and no project can be taken back
 * out of it, so its size belongs on the form rather than in the result.
 */
export async function fetchStudioSummary(
    studioId: string,
    signal?: AbortSignal,
): Promise<StudioSummary> {
    return requestJson<StudioSummary>(`${STUDIOS_URL}/${encodeURIComponent(studioId)}`, { signal });
}

/**
 * Everything downstream reads the state of a submission off its status, and reads it unguarded, because a result
 * that does not say where it has got to is not a result.
 */
const namesItsState = (value: unknown): value is SubmissionStatusResponse =>
    isObject(value) && typeof value.status === 'string';

const objects = (value: unknown): Record<string, unknown>[] =>
    Array.isArray(value) ? value.filter(isObject) : [];

const list = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);

const strings = (value: unknown): string[] =>
    list(value).filter((one): one is string => typeof one === 'string');

/**
 * A field the schema declares as text and the pages read as text — trimmed, lowercased, compared, put on the page.
 * Anything that is not text cannot be read as text, so it is reported as absent rather than as itself.
 */
const text = (value: unknown): string | null => (typeof value === 'string' ? value : null);

/** The same, where the reader does not check first because the schema promised the field would be there. */
const required = (value: unknown): string => (typeof value === 'string' ? value : '');

/** Only the entries whose value is the text the schema said it would be. */
const textMap = (value: unknown): Record<string, string> =>
    isObject(value)
        ? Object.fromEntries(
              Object.entries(value).filter(
                  (entry): entry is [string, string] => typeof entry[1] === 'string',
              ),
          )
        : {};

/**
 * What the catalogue says about one finder. Its locale, title and id are read without being checked first — the
 * schema promised them — so they are held to being text here rather than throwing three components down.
 */
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

/**
 * A finding, with its lists held to being lists and its text held to being text.
 *
 * Nothing here invents a field or repairs a value: a response that disagrees with the schema is wrong however it
 * is read, and this only decides where the wrongness stops. A missing list becomes an empty one and unusable text
 * becomes absent, both of which draw as "nothing to show" — the true answer for a response that showed nothing.
 */
const asIssue = (value: Record<string, unknown>): AnalysisIssue =>
    ({
        ...value,
        finderId: required(value.finderId),
        finderName: required(value.finderName),
        type: required(value.type),
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

/**
 * The response, in the shape the pages are entitled to assume.
 *
 * They are entitled to assume it because the schema says so, and they read it that way: an analysis arriving as
 * null, or its findings arriving as an object, threw during the render. React has no boundary above these pages,
 * so what a reader got for a response the service should never have sent was a blank white screen and no way
 * back. One pass here is what stands between a malformed field and that.
 */
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
    // A catalogue that is not a list of entries is not a catalogue, and the page has an error state for a
    // service that cannot answer. An entry that is merely wrong in a field is held to the shape instead.
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

/** The verdict, once the answer has been sent. Older deployments answered with no body at all. */
export interface QuizAnswerResult {
    correct: boolean;
    correctAnswers: string[];
}

/**
 * A deployment that still answers with no body has recorded the answer but cannot say whether it was right, which is
 * not the same as saying it was wrong.
 */
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
