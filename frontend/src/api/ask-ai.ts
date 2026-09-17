// SPDX-License-Identifier: EUPL-1.2
// SPDX-FileCopyrightText: 2026 LitterBox-Web contributors

import { isAbortError } from '../lib/abort-error';
import { BASE_URL } from '../lib/base-url';
import { SUPPORTED_LOCALES, type SupportedLocale } from './capabilities';
import {
    boundedNonblankString,
    boundedString,
    hasExactKeys,
    isJsonContentType,
    isObject,
    isProblemJsonContentType,
    nonnegativeSafeInteger,
    positiveSafeInteger,
    problemCodeFrom,
    readBoundedText,
} from './validation';

export const ASK_AI_ELIGIBILITY_URL = `${BASE_URL}api/v1/ask-ai/eligibility`;

// Bound responses before parsing them.
const MAX_ELIGIBILITY_RESPONSE_BYTES = 4096;

export type AskAiErrorCategory =
    | 'network_denied'
    | 'context_not_found'
    | 'quota_exhausted'
    | 'attempts_exhausted'
    | 'capacity_exhausted'
    | 'provider_unavailable'
    | 'timeout'
    | 'invalid_model_response'
    | 'idempotency_conflict'
    | 'turn_in_progress'
    | 'unavailable'
    | 'malformed_response'
    | 'failed'
    | 'canceled';

export class AskAiApiError extends Error {
    public readonly category: AskAiErrorCategory;
    public readonly status?: number;

    public constructor(category: AskAiErrorCategory, status?: number) {
        super(category);
        this.name = 'AskAiApiError';
        this.category = category;
        this.status = status;
    }
}

export const isAskAiCancellation = (error: unknown): boolean =>
    isAbortError(error) || (error instanceof AskAiApiError && error.category === 'canceled');

export interface AskAiEligibility {
    schemaVersion: 1;
    available: boolean;
}

const readAskAiResponseText = (response: Response, maximum: number): Promise<string> =>
    readBoundedText(response, maximum, {
        tooLarge: () => new AskAiApiError('malformed_response', response.status),
        readFailed: (error) =>
            isAbortError(error)
                ? new AskAiApiError('canceled', response.status)
                : new AskAiApiError('malformed_response', response.status),
        malformed: () => new AskAiApiError('malformed_response', response.status),
    });

const parseEligibility = (value: unknown): AskAiEligibility => {
    if (
        !hasExactKeys(value, ['schemaVersion', 'available']) ||
        value.schemaVersion !== 1 ||
        typeof value.available !== 'boolean'
    ) {
        throw new AskAiApiError('malformed_response');
    }
    return { schemaVersion: 1, available: value.available };
};

const MAX_TOKEN_LENGTH = 128;
const MAX_SELECTOR_LENGTH = 256;
const MAX_INQUIRY_KIND_LENGTH = 64;
const MAX_FINDER_LENGTH = 128;
const MAX_LABEL_LENGTH = 4096;
const MAX_CONVERSATION_ID_LENGTH = 128;
const MAX_CLIENT_MESSAGE_ID_LENGTH = 128;
const MAX_REFERENCE_KIND_LENGTH = 64;
// Bound model output before rendering it; the text limits match the server's response rules, so nothing the
// server has already validated and stored is refused here.
const MAX_BLOCK_TEXT_LENGTH = 10_000;
const MAX_REFERENCE_LABEL_LENGTH = MAX_BLOCK_TEXT_LENGTH;
const MAX_BLOCK_CODE_LENGTH = 4_096;
// Mirrors AskAiResponseRules.MAX_BLOCKS: the server keeps the first this many blocks of an answer, so nothing it
// has stored is refused here. It is a sanity bound, not a length the prompt asks for.
const MAX_BLOCKS_PER_MESSAGE = 256;
const MAX_REFERENCES_PER_MESSAGE = 32;
const MAX_FOLLOW_UPS_PER_MESSAGE = 8;
const MAX_REPLIES_REMAINING = 1_000;
const MAX_INQUIRIES = 500;
const MAX_FINDINGS = 2_000;
const MAX_TARGETS = 20_000;
const MAX_SCRATCHBLOCKS_LENGTH = 8_192;

const MAX_QUESTIONS_RESPONSE_BYTES = 4 * 1024 * 1024;
const MAX_CONVERSATION_RESPONSE_BYTES = 64 * 1024;
const MAX_MESSAGE_RESPONSE_BYTES = 512 * 1024;
const MAX_PROBLEM_RESPONSE_BYTES = 16 * 1024;

const ASK_AI_GENERAL_INTENTS = [
    'SUMMARISE',
    'EXPLAIN',
    'SUGGEST_EXTENSION',
    'PROVIDE_FEEDBACK',
] as const;
export type AskAiGeneralIntent = (typeof ASK_AI_GENERAL_INTENTS)[number];

const ASK_AI_FOLLOW_UP_IDS = [
    'EXPLAIN_SIMPLY',
    'SHOW_RELEVANT_BLOCKS',
    'GIVE_HINT',
    'OBSERVE_BEHAVIOUR',
    'EXPLAIN_CONCEPT',
    'SHOW_THE_FIX',
] as const;
export type AskAiFollowUpId = (typeof ASK_AI_FOLLOW_UP_IDS)[number];

const ASK_AI_SCOPE_KINDS = ['inquiry', 'common', 'finding'] as const;
export type AskAiScopeKind = (typeof ASK_AI_SCOPE_KINDS)[number];

const ASK_AI_MESSAGE_STATUSES = ['answer', 'out_of_scope', 'unsafe', 'cannot_answer'] as const;
export type AskAiMessageStatus = (typeof ASK_AI_MESSAGE_STATUSES)[number];

const ASK_AI_BLOCK_ROLES = ['existing', 'suggested', 'example'] as const;
export type AskAiBlockRole = (typeof ASK_AI_BLOCK_ROLES)[number];

// Keep response validation tied to the API vocabulary rather than UI-layer types.
const ASK_AI_FINDING_FAMILIES = ['bug', 'smell', 'perfume', 'other'] as const;
export type AskAiFindingFamily = (typeof ASK_AI_FINDING_FAMILIES)[number];

export type AskAiBlock =
    { kind: 'text'; text: string } | { kind: 'scratchblocks'; role: AskAiBlockRole; code: string };

export interface AskAiReference {
    kind: string;
    label: string;
}

export interface AskAiInquiry {
    selector: string;
    kind: string;
    label: string;
    /** Key of the target this question is about. */
    target: string;
}

export interface AskAiFinding {
    selector: string;
    label: string;
    family: AskAiFindingFamily;
    /** Target where the finding was reported. */
    target: string;
    /** Matches the finding's `finderId` in the analysis result. */
    finder: string;
    /** Reported code with the matching block marked; empty for sprite-level findings. */
    scratchblocks: string;
}

const ASK_AI_TARGET_KINDS = ['program', 'stage', 'sprite', 'script', 'procedure'] as const;
export type AskAiTargetKind = (typeof ASK_AI_TARGET_KINDS)[number];

/** A target in the project; `parent` links scripts to sprites and `intents` lists supported general questions. */
export interface AskAiTarget {
    key: string;
    kind: AskAiTargetKind;
    label: string;
    parent: string;
    scratchblocks: string;
    thumbnail: string | null;
    intents: AskAiGeneralIntent[];
}

export interface AskAiQuestions {
    schemaVersion: 1;
    inquiries: AskAiInquiry[];
    findings: AskAiFinding[];
    targets: AskAiTarget[];
    /** True when the service returned only a selection of the available questions. */
    truncated: boolean;
    /** True when some scripts come without their code preview, the listing being too big to carry it all. */
    previewsTruncated: boolean;
}

export interface AskAiScopeRequest {
    kind: AskAiScopeKind;
    selector: string;
}

export interface AskAiScope {
    kind: AskAiScopeKind;
    label: string;
}

export interface AskAiConversationCreated {
    schemaVersion: 1;
    conversationId: string;
    scope: AskAiScope;
    repliesRemaining: number;
}

export type AskAiMessageRequest =
    | { clientMessageId: string; action: 'ASK' }
    | { clientMessageId: string; action: 'FOLLOW_UP'; followUp: AskAiFollowUpId };

export interface AskAiMessage {
    schemaVersion: 1;
    messageId: string;
    status: AskAiMessageStatus;
    blocks: AskAiBlock[];
    references: AskAiReference[];
    followUps: AskAiFollowUpId[];
    repliesRemaining: number;
}

/** Wire selector for a general question, optionally scoped to a target. */
export const commonQuestionSelector = (intent: AskAiGeneralIntent, target?: string): string =>
    target ? `common:${intent}@${target}` : `common:${intent}`;

/** A type guard for one of a `const` list's literal members. */
const oneOf =
    <T extends string>(members: readonly T[]) =>
    (value: unknown): value is T =>
        typeof value === 'string' && (members as readonly string[]).includes(value);

const isGeneralIntent = oneOf(ASK_AI_GENERAL_INTENTS);

/** Read the general-question intent from a common selector. */
export const commonQuestionIntent = (selector: string): AskAiGeneralIntent | undefined => {
    if (!selector.startsWith('common:')) return undefined;
    const named = selector.slice('common:'.length).split('@', 1)[0];
    return isGeneralIntent(named) ? named : undefined;
};

const isFollowUpId = oneOf(ASK_AI_FOLLOW_UP_IDS);

const isScopeKind = oneOf(ASK_AI_SCOPE_KINDS);

const isMessageStatus = oneOf(ASK_AI_MESSAGE_STATUSES);

const isBlockRole = oneOf(ASK_AI_BLOCK_ROLES);

const isAskAiFindingFamily = oneOf(ASK_AI_FINDING_FAMILIES);

const isLocale = oneOf(SUPPORTED_LOCALES);

const assertTokenAndAnalysis = (token: string, analysisId: number): void => {
    if (!boundedNonblankString(token, MAX_TOKEN_LENGTH) || !positiveSafeInteger(analysisId))
        throw new AskAiApiError('failed');
};

const assertLocale = (locale: SupportedLocale): void => {
    if (!isLocale(locale)) throw new AskAiApiError('failed');
};

const askAiUrl = (token: string, analysisId: number): string =>
    `${BASE_URL}api/v1/submissions/${encodeURIComponent(token)}/analyses/${encodeURIComponent(
        String(analysisId),
    )}/ask-ai`;

export const askAiQuestionsUrl = (
    token: string,
    analysisId: number,
    locale: SupportedLocale,
): string => {
    assertTokenAndAnalysis(token, analysisId);
    assertLocale(locale);
    const query = new URLSearchParams({ locale });
    return `${askAiUrl(token, analysisId)}/questions?${query.toString()}`;
};

export const askAiConversationsUrl = (token: string, analysisId: number): string => {
    assertTokenAndAnalysis(token, analysisId);
    return `${askAiUrl(token, analysisId)}/conversations`;
};

const assertConversationId = (conversationId: string): void => {
    if (!boundedNonblankString(conversationId, MAX_CONVERSATION_ID_LENGTH))
        throw new AskAiApiError('failed');
};

const askAiConversationUrl = (
    token: string,
    analysisId: number,
    conversationId: string,
): string => {
    assertConversationId(conversationId);
    return `${askAiConversationsUrl(token, analysisId)}/${encodeURIComponent(conversationId)}`;
};

export const askAiMessagesUrl = (
    token: string,
    analysisId: number,
    conversationId: string,
): string => `${askAiConversationUrl(token, analysisId, conversationId)}/messages`;

const askAiCloseConversationUrl = (
    token: string,
    analysisId: number,
    conversationId: string,
): string => `${askAiConversationUrl(token, analysisId, conversationId)}/close`;

const overLength = (value: unknown, field: string, maximum: number): boolean => {
    const candidate = isObject(value) ? value[field] : undefined;
    return Array.isArray(candidate) && candidate.length > maximum;
};

const isAskAiInquiry = (value: unknown): value is AskAiInquiry =>
    hasExactKeys(value, ['selector', 'kind', 'label', 'target']) &&
    boundedNonblankString(value.selector, MAX_SELECTOR_LENGTH) &&
    boundedNonblankString(value.kind, MAX_INQUIRY_KIND_LENGTH) &&
    boundedString(value.label, MAX_LABEL_LENGTH) &&
    boundedString(value.target, MAX_SELECTOR_LENGTH);

const isAskAiFinding = (value: unknown): value is AskAiFinding =>
    hasExactKeys(value, ['selector', 'label', 'family', 'target', 'finder', 'scratchblocks']) &&
    boundedNonblankString(value.selector, MAX_SELECTOR_LENGTH) &&
    boundedString(value.label, MAX_LABEL_LENGTH) &&
    isAskAiFindingFamily(value.family) &&
    boundedString(value.target, MAX_SELECTOR_LENGTH) &&
    boundedString(value.finder, MAX_FINDER_LENGTH) &&
    boundedString(value.scratchblocks, MAX_SCRATCHBLOCKS_LENGTH);

const isAskAiTargetKind = oneOf(ASK_AI_TARGET_KINDS);

const isAskAiTarget = (value: unknown): value is AskAiTarget =>
    hasExactKeys(value, [
        'key',
        'kind',
        'label',
        'parent',
        'scratchblocks',
        'thumbnail',
        'intents',
    ]) &&
    boundedNonblankString(value.key, MAX_SELECTOR_LENGTH) &&
    isAskAiTargetKind(value.kind) &&
    boundedString(value.label, MAX_LABEL_LENGTH) &&
    boundedString(value.parent, MAX_SELECTOR_LENGTH) &&
    boundedString(value.scratchblocks, MAX_SCRATCHBLOCKS_LENGTH) &&
    (value.thumbnail === null || boundedNonblankString(value.thumbnail, MAX_SELECTOR_LENGTH)) &&
    Array.isArray(value.intents) &&
    value.intents.length <= ASK_AI_GENERAL_INTENTS.length &&
    value.intents.every(isGeneralIntent);

const validateQuestionsResponse = (value: unknown): AskAiQuestions => {
    if (
        overLength(value, 'inquiries', MAX_INQUIRIES) ||
        overLength(value, 'findings', MAX_FINDINGS) ||
        overLength(value, 'targets', MAX_TARGETS)
    )
        throw new AskAiApiError('malformed_response');
    if (
        !hasExactKeys(value, [
            'schemaVersion',
            'inquiries',
            'findings',
            'targets',
            'truncated',
            'previewsTruncated',
        ]) ||
        value.schemaVersion !== 1 ||
        typeof value.truncated !== 'boolean' ||
        typeof value.previewsTruncated !== 'boolean' ||
        !Array.isArray(value.inquiries) ||
        !value.inquiries.every(isAskAiInquiry) ||
        !Array.isArray(value.findings) ||
        !value.findings.every(isAskAiFinding) ||
        !Array.isArray(value.targets) ||
        !value.targets.every(isAskAiTarget)
    )
        throw new AskAiApiError('malformed_response');
    return value as unknown as AskAiQuestions;
};

const isAskAiScope = (value: unknown): value is AskAiScope =>
    hasExactKeys(value, ['kind', 'label']) &&
    isScopeKind(value.kind) &&
    boundedString(value.label, MAX_LABEL_LENGTH);

const validateConversationCreated = (value: unknown): AskAiConversationCreated => {
    if (
        !hasExactKeys(value, ['schemaVersion', 'conversationId', 'scope', 'repliesRemaining']) ||
        value.schemaVersion !== 1 ||
        !boundedNonblankString(value.conversationId, MAX_CONVERSATION_ID_LENGTH) ||
        !isAskAiScope(value.scope) ||
        !nonnegativeSafeInteger(value.repliesRemaining, MAX_REPLIES_REMAINING)
    )
        throw new AskAiApiError('malformed_response');
    return value as unknown as AskAiConversationCreated;
};

const isAskAiBlock = (value: unknown): value is AskAiBlock => {
    if (!isObject(value)) return false;
    if (value.kind === 'text')
        return (
            hasExactKeys(value, ['kind', 'text']) &&
            boundedString(value.text, MAX_BLOCK_TEXT_LENGTH)
        );
    if (value.kind === 'scratchblocks')
        return (
            hasExactKeys(value, ['kind', 'role', 'code']) &&
            isBlockRole(value.role) &&
            boundedString(value.code, MAX_BLOCK_CODE_LENGTH)
        );
    return false;
};

const isAskAiReference = (value: unknown): value is AskAiReference =>
    hasExactKeys(value, ['kind', 'label']) &&
    boundedNonblankString(value.kind, MAX_REFERENCE_KIND_LENGTH) &&
    boundedNonblankString(value.label, MAX_REFERENCE_LABEL_LENGTH);

const validateMessageResponse = (value: unknown): AskAiMessage => {
    if (
        overLength(value, 'blocks', MAX_BLOCKS_PER_MESSAGE) ||
        overLength(value, 'references', MAX_REFERENCES_PER_MESSAGE) ||
        overLength(value, 'followUps', MAX_FOLLOW_UPS_PER_MESSAGE)
    )
        throw new AskAiApiError('malformed_response');
    if (
        !hasExactKeys(value, [
            'schemaVersion',
            'messageId',
            'status',
            'blocks',
            'references',
            'followUps',
            'repliesRemaining',
        ]) ||
        value.schemaVersion !== 1 ||
        !boundedNonblankString(value.messageId, MAX_CONVERSATION_ID_LENGTH) ||
        !isMessageStatus(value.status) ||
        !Array.isArray(value.blocks) ||
        !value.blocks.every(isAskAiBlock) ||
        !Array.isArray(value.references) ||
        !value.references.every(isAskAiReference) ||
        !Array.isArray(value.followUps) ||
        !value.followUps.every(isFollowUpId) ||
        !nonnegativeSafeInteger(value.repliesRemaining, MAX_REPLIES_REMAINING)
    )
        throw new AskAiApiError('malformed_response');
    return value as unknown as AskAiMessage;
};

// The server's problem codes are the client categories under an `ask_ai_` prefix.
const CODED_CATEGORIES = [
    'unavailable',
    'context_not_found',
    'quota_exhausted',
    'attempts_exhausted',
    'capacity_exhausted',
    'provider_unavailable',
    'timeout',
    'invalid_model_response',
    'idempotency_conflict',
    'turn_in_progress',
] as const;
const PROBLEM_CODE_PREFIX = 'ask_ai_';
type AskAiProblemCode = `${typeof PROBLEM_CODE_PREFIX}${(typeof CODED_CATEGORIES)[number]}`;

const isKnownAskAiProblemCode = oneOf(
    CODED_CATEGORIES.map((category): AskAiProblemCode => `${PROBLEM_CODE_PREFIX}${category}`),
);

const categoryForConversationStatus = (
    status: number,
    code?: AskAiProblemCode,
): AskAiErrorCategory => {
    if (code) return code.slice(PROBLEM_CODE_PREFIX.length) as AskAiErrorCategory;
    if (status === 403) return 'network_denied';
    if (status === 404) return 'context_not_found';
    // Without a problem code the answer is a proxy's or a gateway's, not Ask AI's, so it never ends the
    // conversation: a 409, 429 or 502 that does carries its code. A bare 429 is a rate limit to wait out.
    if (status === 429) return 'capacity_exhausted';
    if (status === 504) return 'timeout';
    return status >= 500 ? 'unavailable' : 'failed';
};

/** The error a failed response stands for; unknown or oversized problem details count as absent. */
const failureOf = async (response: Response): Promise<AskAiApiError> => {
    let code: AskAiProblemCode | undefined;
    if (isProblemJsonContentType(response.headers.get('Content-Type'))) {
        try {
            code = problemCodeFrom(
                await readAskAiResponseText(response, MAX_PROBLEM_RESPONSE_BYTES),
                isKnownAskAiProblemCode,
            );
        } catch (error) {
            if (error instanceof AskAiApiError && error.category === 'canceled') return error;
        }
    }
    return new AskAiApiError(categoryForConversationStatus(response.status, code), response.status);
};

const requestAskAi = async (url: string, init: RequestInit): Promise<Response> => {
    try {
        return await fetch(url, init);
    } catch (error) {
        if (isAbortError(error)) throw new AskAiApiError('canceled');
        throw new AskAiApiError('failed');
    }
};

const readSuccessfulAskAiJson = async (response: Response, maximum: number): Promise<unknown> => {
    if (!response.ok) throw await failureOf(response);
    if (response.status !== 200 || !isJsonContentType(response.headers.get('Content-Type')))
        throw new AskAiApiError('malformed_response', response.status);
    const text = await readAskAiResponseText(response, maximum);
    try {
        return JSON.parse(text) as unknown;
    } catch {
        throw new AskAiApiError('malformed_response', response.status);
    }
};

const authorizedJsonHeaders = (token: string): HeadersInit => ({
    Accept: 'application/json',
    Authorization: `Bearer ${token}`,
});

/** Eligibility is request-scoped; advertised capability only says the feature is built. */
export async function fetchAskAiEligibility(options?: {
    signal?: AbortSignal;
}): Promise<AskAiEligibility> {
    const response = await requestAskAi(ASK_AI_ELIGIBILITY_URL, {
        headers: { Accept: 'application/json' },
        signal: options?.signal,
    });
    return parseEligibility(
        await readSuccessfulAskAiJson(response, MAX_ELIGIBILITY_RESPONSE_BYTES),
    );
}

export async function fetchAskAiQuestions(
    token: string,
    analysisId: number,
    locale: SupportedLocale,
    signal?: AbortSignal,
): Promise<AskAiQuestions> {
    const response = await requestAskAi(askAiQuestionsUrl(token, analysisId, locale), {
        headers: authorizedJsonHeaders(token),
        signal,
    });
    const payload = await readSuccessfulAskAiJson(response, MAX_QUESTIONS_RESPONSE_BYTES);
    return validateQuestionsResponse(payload);
}

export async function createAskAiConversation(
    token: string,
    analysisId: number,
    locale: SupportedLocale,
    scope: AskAiScopeRequest,
    signal?: AbortSignal,
): Promise<AskAiConversationCreated> {
    assertLocale(locale);
    if (!isScopeKind(scope.kind) || !boundedNonblankString(scope.selector, MAX_SELECTOR_LENGTH))
        throw new AskAiApiError('failed');
    const response = await requestAskAi(askAiConversationsUrl(token, analysisId), {
        method: 'POST',
        headers: { ...authorizedJsonHeaders(token), 'Content-Type': 'application/json' },
        body: JSON.stringify({ locale, scope: { kind: scope.kind, selector: scope.selector } }),
        signal,
    });
    const payload = await readSuccessfulAskAiJson(response, MAX_CONVERSATION_RESPONSE_BYTES);
    return validateConversationCreated(payload);
}

/** The client message ID must be reused when retrying the same logical send. */
export async function sendAskAiMessage(
    token: string,
    analysisId: number,
    conversationId: string,
    message: AskAiMessageRequest,
    signal?: AbortSignal,
): Promise<AskAiMessage> {
    if (!boundedNonblankString(message.clientMessageId, MAX_CLIENT_MESSAGE_ID_LENGTH))
        throw new AskAiApiError('failed');
    if (message.action === 'FOLLOW_UP' && !isFollowUpId(message.followUp))
        throw new AskAiApiError('failed');
    const response = await requestAskAi(askAiMessagesUrl(token, analysisId, conversationId), {
        method: 'POST',
        headers: { ...authorizedJsonHeaders(token), 'Content-Type': 'application/json' },
        body: JSON.stringify(message),
        signal,
    });
    const payload = await readSuccessfulAskAiJson(response, MAX_MESSAGE_RESPONSE_BYTES);
    return validateMessageResponse(payload);
}

/** `keepalive` lets the unload handler release a conversation after the page starts closing. */
export async function closeAskAiConversation(
    token: string,
    analysisId: number,
    conversationId: string,
    signal?: AbortSignal,
    keepalive = false,
): Promise<void> {
    const response = await requestAskAi(
        askAiCloseConversationUrl(token, analysisId, conversationId),
        {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}` },
            signal,
            keepalive,
        },
    );
    if (response.status === 204) return;
    if (!response.ok) throw await failureOf(response);
    throw new AskAiApiError('malformed_response', response.status);
}
