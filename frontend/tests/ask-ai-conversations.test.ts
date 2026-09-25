// SPDX-License-Identifier: EUPL-1.2
// SPDX-FileCopyrightText: 2026 LitterBox-Web contributors

import { afterEach, describe, expect, it, vi } from 'vitest';
import {
    AskAiApiError,
    askAiConversationsUrl,
    askAiMessagesUrl,
    askAiQuestionsUrl,
    closeAskAiConversation,
    commonQuestionSelector,
    createAskAiConversation,
    fetchAskAiQuestions,
    sendAskAiMessage,
} from '../src/api/ask-ai';
import { response } from './helpers';

const problemResponse = (code: string, status: number) =>
    new Response(JSON.stringify({ code }), {
        status,
        headers: { 'Content-Type': 'application/problem+json' },
    });

const validQuestions = {
    schemaVersion: 1,
    truncated: false,
    previewsTruncated: false,
    inquiries: [
        {
            selector: 'inquiry:v1-a',
            kind: 'event',
            label: 'What happens when clicked?',
            target: 'target:v1-program',
        },
    ],
    findings: [
        {
            selector: 'finding:v1-a',
            label: '[b]Problem:[/b] a loop never ends',
            family: 'bug',
            target: 'target:v1-program',
            finder: 'EndlessLoop',
            scratchblocks: '',
        },
    ],
    targets: [
        {
            key: 'target:v1-program',
            kind: 'program',
            label: '',
            parent: '',
            scratchblocks: '',
            thumbnail: null,
            intents: ['SUMMARISE', 'EXPLAIN'],
        },
    ],
};

describe('fetchAskAiQuestions', () => {
    afterEach(() => vi.restoreAllMocks());

    it('reads the exact GET contract with the submission token as bearer', async () => {
        const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(response(validQuestions));
        const signal = new AbortController().signal;
        await expect(fetchAskAiQuestions('a-token', 4, 'en', signal)).resolves.toEqual(
            validQuestions,
        );
        expect(fetchMock).toHaveBeenCalledWith(askAiQuestionsUrl('a-token', 4, 'en'), {
            headers: { Accept: 'application/json', Authorization: 'Bearer a-token' },
            signal,
        });
        expect(askAiQuestionsUrl('a-token', 4, 'en')).toContain(
            'submissions/a-token/analyses/4/ask-ai/questions',
        );
    });

    it('rejects a response carrying an unknown finding family', async () => {
        vi.spyOn(globalThis, 'fetch').mockResolvedValue(
            response({
                ...validQuestions,
                findings: [{ selector: 'finding:v1-a', label: 'x', family: 'praise' }],
            }),
        );
        await expect(fetchAskAiQuestions('a-token', 4, 'en')).rejects.toMatchObject({
            category: 'malformed_response',
        });
    });

    it('rejects a place that does not say which general questions it takes', async () => {
        // Reject targets without the service-provided intent list.
        const withoutIntents = { ...validQuestions.targets[0] } as Record<string, unknown>;
        delete withoutIntents.intents;
        vi.spyOn(globalThis, 'fetch').mockResolvedValue(
            response({ ...validQuestions, targets: [withoutIntents] }),
        );
        await expect(fetchAskAiQuestions('a-token', 4, 'en')).rejects.toMatchObject({
            category: 'malformed_response',
        });
    });

    it('rejects a place claiming a general question that does not exist', async () => {
        const [target] = validQuestions.targets;
        vi.spyOn(globalThis, 'fetch').mockResolvedValue(
            response({
                ...validQuestions,
                targets: [{ ...target, intents: ['PROVIDE_PRAISE'] }],
            }),
        );
        await expect(fetchAskAiQuestions('a-token', 4, 'en')).rejects.toMatchObject({
            category: 'malformed_response',
        });
    });

    it('rejects a response with an undocumented top-level field', async () => {
        vi.spyOn(globalThis, 'fetch').mockResolvedValue(response({ ...validQuestions, extra: 1 }));
        await expect(fetchAskAiQuestions('a-token', 4, 'en')).rejects.toMatchObject({
            category: 'malformed_response',
        });
    });

    it.each([
        ['ask_ai_unavailable', 503, 'unavailable'],
        ['ask_ai_context_not_found', 404, 'context_not_found'],
        ['ask_ai_quota_exhausted', 429, 'quota_exhausted'],
        ['ask_ai_attempts_exhausted', 429, 'attempts_exhausted'],
        ['ask_ai_capacity_exhausted', 503, 'capacity_exhausted'],
        ['ask_ai_provider_unavailable', 503, 'provider_unavailable'],
        ['ask_ai_timeout', 504, 'timeout'],
        ['ask_ai_invalid_model_response', 502, 'invalid_model_response'],
        ['ask_ai_idempotency_conflict', 409, 'idempotency_conflict'],
        ['ask_ai_turn_in_progress', 409, 'turn_in_progress'],
    ] as const)('maps the problem code %s to category %s', async (code, status, category) => {
        vi.spyOn(globalThis, 'fetch').mockResolvedValue(problemResponse(code, status));
        const failure = await fetchAskAiQuestions('a-token', 4, 'en').catch(
            (error: unknown) => error,
        );
        expect(failure).toBeInstanceOf(AskAiApiError);
        expect(failure).toMatchObject({ category, status });
    });

    it.each([
        [409, 'failed'],
        [429, 'capacity_exhausted'],
        [502, 'unavailable'],
    ] as const)(
        'never ends the conversation over a bare %s: without a code it is a proxy speaking, not Ask AI',
        async (status, category) => {
            vi.spyOn(globalThis, 'fetch').mockResolvedValue(response(undefined, status));
            const failure = await fetchAskAiQuestions('a-token', 4, 'en').catch(
                (error: unknown) => error,
            );
            expect(failure).toBeInstanceOf(AskAiApiError);
            expect(failure).toMatchObject({ category, status });
        },
    );
});

describe('createAskAiConversation', () => {
    afterEach(() => vi.restoreAllMocks());

    it('posts the locale and scope, and reads back the created conversation', async () => {
        const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
            response({
                schemaVersion: 1,
                conversationId: 'conv-1',
                scope: { kind: 'common', label: 'What does this project do?' },
                repliesRemaining: 8,
            }),
        );
        const result = await createAskAiConversation('a-token', 4, 'en', {
            kind: 'common',
            selector: commonQuestionSelector('SUMMARISE'),
        });
        expect(result.conversationId).toBe('conv-1');
        expect(result.repliesRemaining).toBe(8);
        expect(fetchMock).toHaveBeenCalledWith(askAiConversationsUrl('a-token', 4), {
            method: 'POST',
            headers: {
                Accept: 'application/json',
                Authorization: 'Bearer a-token',
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                locale: 'en',
                scope: { kind: 'common', selector: 'common:SUMMARISE' },
            }),
            signal: undefined,
        });
    });

    it('rejects a response carrying a followUps field, which this endpoint no longer sends', async () => {
        vi.spyOn(globalThis, 'fetch').mockResolvedValue(
            response({
                schemaVersion: 1,
                conversationId: 'conv-1',
                scope: { kind: 'common', label: 'x' },
                followUps: [],
                repliesRemaining: 8,
            }),
        );
        await expect(
            createAskAiConversation('a-token', 4, 'en', {
                kind: 'common',
                selector: 'common:SUMMARISE',
            }),
        ).rejects.toMatchObject({ category: 'malformed_response' });
    });
});

describe('sendAskAiMessage', () => {
    afterEach(() => vi.restoreAllMocks());

    it('sends an ASK action with a caller-supplied client message id', async () => {
        const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
            response({
                schemaVersion: 1,
                messageId: 'm-1',
                status: 'answer',
                blocks: [
                    { kind: 'text', text: 'This project moves a sprite when the flag is clicked.' },
                ],
                references: [{ kind: 'actor', label: 'Cat' }],
                followUps: ['EXPLAIN_SIMPLY', 'GIVE_HINT'],
                repliesRemaining: 7,
            }),
        );
        const result = await sendAskAiMessage('a-token', 4, 'conv-1', {
            clientMessageId: 'client-1',
            action: 'ASK',
        });
        expect(result.status).toBe('answer');
        expect(result.blocks).toHaveLength(1);
        expect(fetchMock).toHaveBeenCalledWith(askAiMessagesUrl('a-token', 4, 'conv-1'), {
            method: 'POST',
            headers: {
                Accept: 'application/json',
                Authorization: 'Bearer a-token',
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ clientMessageId: 'client-1', action: 'ASK' }),
            signal: undefined,
        });
    });

    it('reads the blocks a text names, and rejects a text part that is neither words nor a block', async () => {
        const answer = (parts: unknown) =>
            response({
                schemaVersion: 1,
                messageId: 'm-3',
                status: 'answer',
                blocks: [{ kind: 'text', text: "Use 'hide' now.", parts }],
                references: [],
                followUps: [],
                repliesRemaining: 5,
            });
        const parts = [
            { kind: 'text', text: 'Use ' },
            { kind: 'scratchblocks', code: 'hide' },
            { kind: 'text', text: ' now.' },
        ];
        vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(answer(parts));
        const result = await sendAskAiMessage('a-token', 4, 'conv-1', {
            clientMessageId: 'client-3',
            action: 'ASK',
        });
        expect(result.blocks).toEqual([{ kind: 'text', text: "Use 'hide' now.", parts }]);

        vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
            answer([{ kind: 'scratchblocks', code: 'hide', role: 'existing' }]),
        );
        await expect(
            sendAskAiMessage('a-token', 4, 'conv-1', {
                clientMessageId: 'client-4',
                action: 'ASK',
            }),
        ).rejects.toMatchObject({ category: 'malformed_response' });
    });

    it('sends a FOLLOW_UP action with the follow-up id', async () => {
        const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
            response({
                schemaVersion: 1,
                messageId: 'm-2',
                status: 'answer',
                blocks: [],
                references: [],
                followUps: [],
                repliesRemaining: 6,
            }),
        );
        await sendAskAiMessage('a-token', 4, 'conv-1', {
            clientMessageId: 'client-2',
            action: 'FOLLOW_UP',
            followUp: 'EXPLAIN_SIMPLY',
        });
        expect(fetchMock).toHaveBeenCalledWith(
            askAiMessagesUrl('a-token', 4, 'conv-1'),
            expect.objectContaining({
                body: JSON.stringify({
                    clientMessageId: 'client-2',
                    action: 'FOLLOW_UP',
                    followUp: 'EXPLAIN_SIMPLY',
                }),
            }),
        );
    });

    it('reuses the same client message id when a caller retries', async () => {
        const fetchMock = vi
            .spyOn(globalThis, 'fetch')
            .mockResolvedValueOnce(new Response(null, { status: 504 }))
            .mockResolvedValueOnce(
                response({
                    schemaVersion: 1,
                    messageId: 'm-3',
                    status: 'answer',
                    blocks: [],
                    references: [],
                    followUps: [],
                    repliesRemaining: 5,
                }),
            );
        const request = { clientMessageId: 'retry-me', action: 'ASK' as const };
        await expect(sendAskAiMessage('a-token', 4, 'conv-1', request)).rejects.toMatchObject({
            category: 'timeout',
        });
        await sendAskAiMessage('a-token', 4, 'conv-1', request);
        const bodies = fetchMock.mock.calls.map(([, init]) => (init as RequestInit).body);
        expect(bodies[0]).toBe(bodies[1]);
    });

    it('reports a rejected model answer differently from a failed fetch', async () => {
        const fetchMock = vi.spyOn(globalThis, 'fetch');
        fetchMock.mockResolvedValueOnce(problemResponse('ask_ai_invalid_model_response', 502));
        await expect(
            sendAskAiMessage('a-token', 4, 'conv-1', { clientMessageId: 'c-1', action: 'ASK' }),
        ).rejects.toMatchObject({ category: 'invalid_model_response', status: 502 });

        fetchMock.mockRejectedValueOnce(new TypeError('Network request failed'));
        await expect(
            sendAskAiMessage('a-token', 4, 'conv-1', { clientMessageId: 'c-2', action: 'ASK' }),
        ).rejects.toMatchObject({ category: 'failed' });
    });

    it('rejects a response carrying a block of an unknown kind', async () => {
        vi.spyOn(globalThis, 'fetch').mockResolvedValue(
            response({
                schemaVersion: 1,
                messageId: 'm-4',
                status: 'answer',
                blocks: [{ kind: 'video', text: 'nope' }],
                references: [],
                followUps: [],
                repliesRemaining: 4,
            }),
        );
        await expect(
            sendAskAiMessage('a-token', 4, 'conv-1', { clientMessageId: 'c', action: 'ASK' }),
        ).rejects.toMatchObject({ category: 'malformed_response' });
    });

    it('rejects a scratchblocks block carrying a role this client does not know', async () => {
        vi.spyOn(globalThis, 'fetch').mockResolvedValue(
            response({
                schemaVersion: 1,
                messageId: 'm-5',
                status: 'answer',
                blocks: [
                    { kind: 'scratchblocks', role: 'invented', code: 'when green flag clicked' },
                ],
                references: [],
                followUps: [],
                repliesRemaining: 4,
            }),
        );
        await expect(
            sendAskAiMessage('a-token', 4, 'conv-1', { clientMessageId: 'c', action: 'ASK' }),
        ).rejects.toMatchObject({ category: 'malformed_response' });
    });

    it('accepts every documented scratchblocks role', async () => {
        for (const role of ['existing', 'suggested', 'example']) {
            vi.spyOn(globalThis, 'fetch').mockResolvedValue(
                response({
                    schemaVersion: 1,
                    messageId: `m-${role}`,
                    status: 'answer',
                    blocks: [{ kind: 'scratchblocks', role, code: 'move (10) steps' }],
                    references: [],
                    followUps: [],
                    repliesRemaining: 4,
                }),
            );
            await expect(
                sendAskAiMessage('a-token', 4, 'conv-1', {
                    clientMessageId: `c-${role}`,
                    action: 'ASK',
                }),
            ).resolves.toMatchObject({
                blocks: [{ kind: 'scratchblocks', role, code: 'move (10) steps' }],
            });
            vi.restoreAllMocks();
        }
    });
});

describe('closeAskAiConversation', () => {
    afterEach(() => vi.restoreAllMocks());

    it('resolves with nothing on a 204', async () => {
        vi.spyOn(globalThis, 'fetch').mockResolvedValue(response(undefined, 204));
        await expect(closeAskAiConversation('a-token', 4, 'conv-1')).resolves.toBeUndefined();
    });

    it('maps a problem response on close the same way as every other endpoint', async () => {
        vi.spyOn(globalThis, 'fetch').mockResolvedValue(
            problemResponse('ask_ai_context_not_found', 404),
        );
        await expect(closeAskAiConversation('a-token', 4, 'conv-1')).rejects.toMatchObject({
            category: 'context_not_found',
        });
    });
});
