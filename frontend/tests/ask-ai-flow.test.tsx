// SPDX-License-Identifier: EUPL-1.2
// SPDX-FileCopyrightText: 2026 LitterBox-Web contributors

import { act, renderHook, screen, waitFor, within } from '@testing-library/react';
import { StrictMode } from 'react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import i18n from '../src/i18n';
import type { ConversationScope } from '../src/pages/ask-ai-machine';
import { useAskAiService } from '../src/pages/ask-ai-service';
import { capabilitiesResponse, response } from './helpers';
import { renderAt } from './render';

const TOKEN = 'proj-token';

const completedSubmission = () =>
    response({
        schemaVersion: 1,
        submissionId: 9,
        token: TOKEN,
        status: 'completed',
        locale: 'en',
        sourceType: 'UPLOAD',
        analysis: {
            id: 21,
            status: 'completed',
            name: 'cat-chase.sb3',
            locale: 'en',
            issues: [],
            metrics: { blocks: 4 },
        },
        analyses: [],
        counts: { expected: 1, completed: 1, failed: 0 },
    });

const questionsPayload = () =>
    response({
        schemaVersion: 1,
        truncated: false,
        previewsTruncated: false,
        inquiries: [
            {
                selector: 'inquiry:v1-click',
                kind: 'event',
                label: 'What happens when clicked?',
                target: 'target:v1-program',
            },
        ],
        findings: [],
        targets: [
            {
                key: 'target:v1-program',
                kind: 'program',
                label: '',
                parent: '',
                scratchblocks: '',
                thumbnail: null,
                intents: ['SUMMARISE', 'EXPLAIN', 'SUGGEST_EXTENSION', 'PROVIDE_FEEDBACK'],
            },
        ],
    });

const conversationCreated = () =>
    response({
        schemaVersion: 1,
        conversationId: 'conv-1',
        scope: { kind: 'inquiry', label: 'What happens when clicked?' },
        repliesRemaining: 8,
    });

const answerWithScript = (repliesRemaining: number) =>
    response({
        schemaVersion: 1,
        messageId: 'm-1',
        status: 'answer',
        blocks: [
            { kind: 'text', text: 'When the flag is clicked the sprite moves.' },
            { kind: 'scratchblocks', role: 'existing', code: 'move (10) steps' },
        ],
        references: [{ kind: 'actor', label: 'Cat' }],
        followUps: ['EXPLAIN_SIMPLY'],
        repliesRemaining,
    });

const questionsInsideASprite = () =>
    response({
        schemaVersion: 1,
        truncated: false,
        previewsTruncated: false,
        inquiries: [
            {
                selector: 'inquiry:v1-click',
                kind: 'event',
                label: 'What happens when clicked?',
                target: 'target:v1-cat-flag',
            },
            {
                selector: 'inquiry:v1-message',
                kind: 'event',
                label: 'Which scripts does this message reach?',
                target: 'target:v1-cat-message',
            },
        ],
        findings: [],
        targets: [
            {
                key: 'target:v1-program',
                kind: 'program',
                label: '',
                parent: '',
                scratchblocks: '',
                thumbnail: null,
                intents: ['SUMMARISE'],
            },
            {
                key: 'target:v1-cat',
                kind: 'sprite',
                label: 'Cat',
                parent: 'target:v1-program',
                scratchblocks: '',
                thumbnail: null,
                intents: ['SUMMARISE', 'EXPLAIN'],
            },
            {
                key: 'target:v1-cat-flag',
                kind: 'script',
                label: 'when green flag clicked',
                parent: 'target:v1-cat',
                scratchblocks: 'when green flag clicked\nmove (10) steps',
                thumbnail: null,
                intents: ['EXPLAIN'],
            },
            {
                key: 'target:v1-cat-message',
                kind: 'script',
                label: 'when I receive [go v]',
                parent: 'target:v1-cat',
                scratchblocks: 'when I receive [go v]\nsay [hi]',
                thumbnail: null,
                intents: ['EXPLAIN'],
            },
        ],
    });

function mockAskAi(
    messageResponses: (Response | (() => Promise<Response>))[],
    createResponse?: Response,
    questions: () => Response = questionsPayload,
) {
    let messageCallIndex = 0;
    return vi.spyOn(globalThis, 'fetch').mockImplementation((input, init) => {
        const url = String(input);
        const method = (init?.method ?? 'GET').toUpperCase();
        if (url.includes('/api/v1/capabilities'))
            return Promise.resolve(capabilitiesResponse(['ask-ai']));
        if (url.endsWith('/api/v1/ask-ai/eligibility'))
            return Promise.resolve(response({ schemaVersion: 1, available: true }));
        if (url.endsWith(`/api/v1/submissions/${TOKEN}`))
            return Promise.resolve(completedSubmission());
        if (url.includes('/ask-ai/questions')) return Promise.resolve(questions());
        if (url.endsWith('/ask-ai/conversations') && method === 'POST')
            return Promise.resolve(createResponse ?? conversationCreated());
        if (url.includes('/ask-ai/conversations/conv-1/messages') && method === 'POST') {
            const next = messageResponses[messageCallIndex];
            messageCallIndex += 1;
            if (typeof next === 'function') return next();
            return Promise.resolve(next ?? new Response(null, { status: 500 }));
        }
        if (url.includes('/ask-ai/conversations/conv-1/close') && method === 'POST')
            return Promise.resolve(new Response(null, { status: 204 }));
        return Promise.reject(new Error(`unexpected fetch ${method} ${url}`));
    });
}

const ask = async (
    user: ReturnType<typeof userEvent.setup>,
    goal: string,
    question: string | RegExp,
    part?: string | RegExp,
) => {
    await user.click(await screen.findByRole('button', { name: new RegExp(`^${goal}`) }));
    if (part) await user.click(await screen.findByRole('button', { name: part }));
    await user.click(await screen.findByRole('button', { name: question }));
};

const UNDERSTAND = 'Understand how it works';

describe('the Ask AI conversation flow', () => {
    beforeEach(async () => {
        await i18n.changeLanguage('en');
        vi.restoreAllMocks();
        vi.stubGlobal('EventSource', undefined);
    });

    it('asks the opening question automatically and shows the answer, including a quoted script', async () => {
        mockAskAi([answerWithScript(7)]);
        const user = userEvent.setup();
        renderAt(`/ask-ai/submissions/${TOKEN}`);

        await ask(user, UNDERSTAND, 'What happens when clicked?');

        expect(
            await screen.findByText('When the flag is clicked the sprite moves.'),
        ).toBeInTheDocument();
        expect(screen.getByText('move (10) steps')).toBeInTheDocument();
        expect(screen.getByText('From your project')).toBeInTheDocument();
        expect(screen.queryByText(/^About:/)).toBeNull();
        expect(
            screen.getByRole('button', { name: 'Can you explain that more simply?' }),
        ).toBeInTheDocument();
    });

    it('keeps a generated question’s own kind once the conversation exists, so a startup inquiry still offers a hint', async () => {
        const startupQuestions = () =>
            response({
                schemaVersion: 1,
                truncated: false,
                previewsTruncated: false,
                inquiries: [
                    {
                        selector: 'inquiry:v1-startup',
                        kind: 'startup',
                        label: 'Why does nothing happen when I click the green flag?',
                        target: 'target:v1-program',
                    },
                ],
                findings: [],
                targets: [
                    {
                        key: 'target:v1-program',
                        kind: 'program',
                        label: '',
                        parent: '',
                        scratchblocks: '',
                        thumbnail: null,
                        intents: ['SUMMARISE'],
                    },
                ],
            });
        const startupConversationCreated = response({
            schemaVersion: 1,
            conversationId: 'conv-1',
            scope: {
                kind: 'inquiry',
                label: 'Why does nothing happen when I click the green flag?',
            },
            repliesRemaining: 8,
        });
        const startupAnswer = response({
            schemaVersion: 1,
            messageId: 'm-startup-1',
            status: 'answer',
            blocks: [{ kind: 'text', text: 'Nothing is attached to the green flag yet.' }],
            references: [],
            followUps: ['GIVE_HINT'],
            repliesRemaining: 7,
        });
        mockAskAi([startupAnswer], startupConversationCreated, startupQuestions);
        const user = userEvent.setup();
        renderAt(`/ask-ai/submissions/${TOKEN}`);

        await ask(user, UNDERSTAND, 'Why does nothing happen when I click the green flag?');

        expect(
            await screen.findByText('Nothing is attached to the green flag yet.'),
        ).toBeInTheDocument();
        expect(
            screen.getByRole('button', { name: 'Can you give me a hint so I can try it myself?' }),
        ).toBeInTheDocument();
    });

    it('sends a follow-up with its own client message id once the reader picks one', async () => {
        const fetchMock = mockAskAi([answerWithScript(7), answerWithScript(6)]);
        const user = userEvent.setup();
        renderAt(`/ask-ai/submissions/${TOKEN}`);
        await ask(user, UNDERSTAND, 'What happens when clicked?');
        await user.click(
            await screen.findByRole('button', { name: 'Can you explain that more simply?' }),
        );

        await waitFor(() => {
            const messageCalls = fetchMock.mock.calls.filter(([input]) =>
                String(input).includes('/messages'),
            );
            expect(messageCalls).toHaveLength(2);
        });
        const bodies = fetchMock.mock.calls
            .filter(([input]) => String(input).includes('/messages'))
            .map(
                ([, init]) =>
                    JSON.parse(String((init as RequestInit).body)) as Record<string, unknown>,
            );
        expect(bodies[0]).toMatchObject({ action: 'ASK' });
        expect(bodies[1]).toMatchObject({ action: 'FOLLOW_UP', followUp: 'EXPLAIN_SIMPLY' });
        expect(bodies[0].clientMessageId).not.toBe(bodies[1].clientMessageId);
    });

    it('retries a failed send under the id it was sent under', async () => {
        const fetchMock = mockAskAi([new Response(null, { status: 504 }), answerWithScript(7)]);
        const user = userEvent.setup();
        renderAt(`/ask-ai/submissions/${TOKEN}`);
        await ask(user, UNDERSTAND, 'What happens when clicked?');

        expect(
            await screen.findByText('Generating the answer took too long. Please try again.'),
        ).toBeInTheDocument();
        await user.click(screen.getByRole('button', { name: 'Retry' }));
        expect(
            await screen.findByText('When the flag is clicked the sprite moves.'),
        ).toBeInTheDocument();

        const bodies = fetchMock.mock.calls
            .filter(([input]) => String(input).includes('/messages'))
            .map(
                ([, init]) =>
                    JSON.parse(String((init as RequestInit).body)) as Record<string, unknown>,
            );
        expect(bodies).toHaveLength(2);
        // Retry the same logical send with the same idempotency key.
        expect(bodies[1].clientMessageId).toBe(bodies[0].clientMessageId);
    });

    it('retries an id the server says is taken under a fresh one, since the old one can never be answered', async () => {
        const fetchMock = mockAskAi([
            response({ code: 'ask_ai_idempotency_conflict' }, 409),
            answerWithScript(7),
        ]);
        const user = userEvent.setup();
        renderAt(`/ask-ai/submissions/${TOKEN}`);
        await ask(user, UNDERSTAND, 'What happens when clicked?');

        expect(await screen.findByText(/could not be sent again the same way/)).toBeInTheDocument();
        await user.click(screen.getByRole('button', { name: 'Retry' }));
        expect(
            await screen.findByText('When the flag is clicked the sprite moves.'),
        ).toBeInTheDocument();

        const bodies = fetchMock.mock.calls
            .filter(([input]) => String(input).includes('/messages'))
            .map(
                ([, init]) =>
                    JSON.parse(String((init as RequestInit).body)) as Record<string, unknown>,
            );
        expect(bodies).toHaveLength(2);
        expect(bodies[1].clientMessageId).not.toBe(bodies[0].clientMessageId);
        expect(bodies[1]).toMatchObject({ action: 'ASK' });
    });

    it('says this conversation is finished once its own replies are spent', async () => {
        mockAskAi([response({ code: 'ask_ai_quota_exhausted' }, 429)]);
        const user = userEvent.setup();
        renderAt(`/ask-ai/submissions/${TOKEN}`);
        await ask(user, UNDERSTAND, 'What happens when clicked?');

        expect(
            await screen.findByText(/This conversation has used up the replies it had/),
        ).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'Retry' })).not.toBeInTheDocument();
        expect(screen.getAllByText('What happens when clicked?').length).toBeGreaterThan(0);
        expect(
            within(screen.getByRole('status')).getByRole('button', {
                name: 'Choose another question',
            }),
        ).toBeInTheDocument();
    });

    it('says which limit it was when the conversation could not even be opened', async () => {
        mockAskAi([], response({ code: 'ask_ai_quota_exhausted' }, 429));
        const user = userEvent.setup();
        renderAt(`/ask-ai/submissions/${TOKEN}`);
        await ask(user, UNDERSTAND, 'What happens when clicked?');

        expect(
            await screen.findByText(/Too many conversations about this project are open/),
        ).toBeInTheDocument();
        expect(screen.queryByText(/used up the replies/)).toBeNull();
        expect(
            within(screen.getByRole('status')).getByRole('button', {
                name: 'Choose another question',
            }),
        ).toBeInTheDocument();
    });

    it('asks in the language the reader is reading, not the one the project was analysed in', async () => {
        // Use the reader locale, not the analysis locale.
        await i18n.changeLanguage('de');
        const fetchMock = mockAskAi([answerWithScript(7)]);
        const user = userEvent.setup();
        renderAt(`/ask-ai/submissions/${TOKEN}`);
        await ask(user, 'Verstehen, wie es funktioniert', 'What happens when clicked?');
        await screen.findByText('When the flag is clicked the sprite moves.');

        const asked = fetchMock.mock.calls.map(([input]) => String(input));
        expect(asked.find((url) => url.includes('/ask-ai/questions'))).toContain('locale=de');
        const created = fetchMock.mock.calls.find(
            ([input, init]) =>
                String(input).endsWith('/ask-ai/conversations') &&
                (init?.method ?? 'GET').toUpperCase() === 'POST',
        );
        expect(JSON.parse(String((created?.[1] as RequestInit).body))).toMatchObject({
            locale: 'de',
        });
    });

    it('heads a general question with the words it was asked in, not the name of the intent', async () => {
        mockAskAi(
            [answerWithScript(7)],
            response({
                schemaVersion: 1,
                conversationId: 'conv-1',
                scope: { kind: 'common', label: 'SUMMARISE' },
                repliesRemaining: 8,
            }),
        );
        const user = userEvent.setup();
        renderAt(`/ask-ai/submissions/${TOKEN}`);
        await ask(user, UNDERSTAND, 'What does this project do?');

        const heading = await screen.findByRole('heading', {
            name: 'What does this project do?',
        });
        expect(heading.textContent).not.toContain('SUMMARISE');
    });

    it('lets go of the conversation when the page itself is left', async () => {
        const fetchSpy = mockAskAi([answerWithScript(7)]);
        const user = userEvent.setup();
        const { unmount } = renderAt(`/ask-ai/submissions/${TOKEN}`);
        await ask(user, UNDERSTAND, 'What happens when clicked?');
        await screen.findByText('When the flag is clicked the sprite moves.');

        const closes = () =>
            fetchSpy.mock.calls.filter(
                ([input, init]) =>
                    String(input).includes('/ask-ai/conversations/conv-1/close') &&
                    (init?.method ?? 'GET').toUpperCase() === 'POST',
            );
        // Preserve conversations restored from the back-forward cache.
        window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: true }));
        expect(closes()).toHaveLength(0);

        // Release the open-conversation quota when the page is discarded.
        window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: false }));
        expect(closes()).toHaveLength(1);
        expect((closes()[0][1] as RequestInit).keepalive).toBe(true);

        unmount();
        expect(closes()).toHaveLength(2);
    });

    it('carries the way in into the conversation, and steps back out to where it leads', async () => {
        mockAskAi([answerWithScript(7)], undefined, questionsInsideASprite);
        const user = userEvent.setup();
        renderAt(`/ask-ai/submissions/${TOKEN}`);
        await ask(user, UNDERSTAND, 'What happens when clicked?', /^Cat, script 1/);
        await screen.findByText('When the flag is clicked the sprite moves.');

        const script = 'Cat, script 1: when green flag clicked';
        const trail = screen.getByRole('navigation', { name: 'Where you are' });
        expect(
            within(trail)
                .getAllByRole('listitem')
                .map((step) => step.textContent),
        ).toEqual(['All questions', UNDERSTAND, script, 'What happens when clicked?']);

        await user.click(within(trail).getByRole('button', { name: script }));
        expect(
            await screen.findByRole('button', { name: 'What happens when clicked?' }),
        ).toBeInTheDocument();
        expect(
            within(screen.getByRole('navigation', { name: 'Where you are' }))
                .getAllByRole('listitem')
                .map((step) => step.textContent),
        ).toEqual(['All questions', UNDERSTAND, script]);
    });

    it('keeps what a question picked from the shortlist is about, and still goes back to the shortlist', async () => {
        mockAskAi([answerWithScript(7)], undefined, questionsInsideASprite);
        const user = userEvent.setup();
        renderAt(`/ask-ai/submissions/${TOKEN}`);

        await user.click(await screen.findByRole('button', { name: 'Not sure? Show me an idea' }));
        await user.click(
            await screen.findByRole('button', { name: /What happens when clicked\?/ }),
        );
        await screen.findByText('When the flag is clicked the sprite moves.');

        const trail = screen.getByRole('navigation', { name: 'Where you are' });
        expect(
            within(trail)
                .getAllByRole('listitem')
                .map((step) => step.textContent),
        ).toEqual([
            'All questions',
            'Not sure? Show me an idea',
            'What happens when clicked?Cat: when green flag clicked',
        ]);

        await user.click(within(trail).getByRole('button', { name: 'Not sure? Show me an idea' }));
        expect(
            await screen.findByRole('button', { name: /What happens when clicked\?/ }),
        ).toBeInTheDocument();
        expect(
            within(screen.getByRole('navigation', { name: 'Where you are' }))
                .getAllByRole('listitem')
                .map((step) => step.textContent),
        ).toEqual(['All questions', 'Not sure? Show me an idea']);
    });

    it('leaves the reader where they are when they change the language', async () => {
        mockAskAi([answerWithScript(7)], undefined, questionsInsideASprite);
        const user = userEvent.setup();
        renderAt(`/ask-ai/submissions/${TOKEN}`);

        await user.click(await screen.findByRole('button', { name: new RegExp(`^${UNDERSTAND}`) }));
        await user.click(await screen.findByRole('button', { name: /^Cat, script 1/ }));
        await screen.findByRole('button', { name: 'What happens when clicked?' });

        await act(() => i18n.changeLanguage('de'));

        await waitFor(() =>
            expect(
                within(screen.getByRole('navigation', { name: 'Wo du gerade bist' }))
                    .getAllByRole('listitem')
                    .map((step) => step.textContent),
            ).toEqual([
                'Alle Fragen',
                'Verstehen, wie es funktioniert',
                'Cat, Skript 1: when green flag clicked',
            ]),
        );
    });

    it('reopens where the reader was standing when the question list had to be fetched twice', async () => {
        let fetched = 0;
        mockAskAi([answerWithScript(7)], undefined, () => {
            fetched += 1;
            return fetched === 2 ? new Response(null, { status: 503 }) : questionsInsideASprite();
        });
        const user = userEvent.setup();
        renderAt(`/ask-ai/submissions/${TOKEN}`);

        await user.click(await screen.findByRole('button', { name: new RegExp(`^${UNDERSTAND}`) }));
        await user.click(await screen.findByRole('button', { name: /^Cat, script 1/ }));
        await screen.findByRole('button', { name: 'What happens when clicked?' });

        await act(() => i18n.changeLanguage('de'));
        await user.click(await screen.findByRole('button', { name: 'Erneut versuchen' }));

        expect(
            within(await screen.findByRole('navigation', { name: 'Wo du gerade bist' }))
                .getAllByRole('listitem')
                .map((step) => step.textContent),
        ).toEqual([
            'Alle Fragen',
            'Verstehen, wie es funktioniert',
            'Cat, Skript 1: when green flag clicked',
        ]);
    });

    it('says who writes the answers on both screens, below what they came for', async () => {
        mockAskAi([answerWithScript(7)]);
        const user = userEvent.setup();
        renderAt(`/ask-ai/submissions/${TOKEN}`);

        const onChooser = await screen.findByText(
            'The answers are written by an AI helper, and can be wrong.',
        );
        const goal = await screen.findByRole('button', { name: new RegExp(`^${UNDERSTAND}`) });
        expect(
            onChooser.compareDocumentPosition(goal) & Node.DOCUMENT_POSITION_PRECEDING,
        ).toBeTruthy();

        await ask(user, UNDERSTAND, 'What happens when clicked?');
        const answer = await screen.findByText('When the flag is clicked the sprite moves.');

        const inConversation = screen.getByText(
            'The answers are written by an AI helper, and can be wrong.',
        );
        expect(
            inConversation.compareDocumentPosition(answer) & Node.DOCUMENT_POSITION_PRECEDING,
        ).toBeTruthy();
    });

    it('says a conversation goes on in the language it was opened in when the page changes language', async () => {
        mockAskAi([answerWithScript(7)]);
        const user = userEvent.setup();
        renderAt(`/ask-ai/submissions/${TOKEN}`);
        await ask(user, UNDERSTAND, 'What happens when clicked?');
        await screen.findByText('When the flag is clicked the sprite moves.');
        expect(
            screen.queryByText(/This conversation was started in another language/),
        ).not.toBeInTheDocument();

        await act(() => i18n.changeLanguage('de'));

        expect(
            await screen.findByText(/Dieses Gespräch wurde in einer anderen Sprache begonnen/),
        ).toBeInTheDocument();
        expect(screen.getByText('When the flag is clicked the sprite moves.')).toBeInTheDocument();
    });

    it('does not put the reader back into a conversation they already walked out of when the language changes', async () => {
        mockAskAi([answerWithScript(7)], undefined, questionsInsideASprite);
        const user = userEvent.setup();
        renderAt(`/ask-ai/submissions/${TOKEN}`);

        await user.click(await screen.findByRole('button', { name: 'Not sure? Show me an idea' }));
        await user.click(
            await screen.findByRole('button', { name: /What happens when clicked\?/ }),
        );
        await screen.findByText('When the flag is clicked the sprite moves.');
        await user.click(screen.getByRole('button', { name: 'Not sure? Show me an idea' }));
        await user.click(await screen.findByRole('button', { name: 'All questions' }));
        await user.click(await screen.findByRole('button', { name: new RegExp(`^${UNDERSTAND}`) }));
        await screen.findByRole('button', { name: /^Cat, script 1/ });

        await act(() => i18n.changeLanguage('de'));

        await waitFor(() =>
            expect(
                within(screen.getByRole('navigation', { name: 'Wo du gerade bist' }))
                    .getAllByRole('listitem')
                    .map((step) => step.textContent),
            ).toEqual(['Alle Fragen', 'Verstehen, wie es funktioniert']),
        );
    });

    it('puts the reader on the conversation when one opens, and back on the question when they leave it', async () => {
        // Keep keyboard focus after each screen replacement.
        mockAskAi([answerWithScript(7)]);
        const user = userEvent.setup();
        renderAt(`/ask-ai/submissions/${TOKEN}`);

        await ask(user, UNDERSTAND, 'What happens when clicked?');
        await screen.findByText('When the flag is clicked the sprite moves.');
        const heading = screen.getByRole('heading', { name: 'What happens when clicked?' });
        await waitFor(() => expect(document.activeElement).toBe(heading));

        await user.click(screen.getByRole('button', { name: UNDERSTAND }));
        const again = await screen.findByRole('button', { name: 'What happens when clicked?' });
        await waitFor(() => expect(document.activeElement).toBe(again));
    });

    it('returns to the chooser without carrying history into a newly picked question', async () => {
        const fetchSpy = mockAskAi([answerWithScript(7)]);
        const user = userEvent.setup();
        renderAt(`/ask-ai/submissions/${TOKEN}`);
        await ask(user, UNDERSTAND, 'What happens when clicked?');
        await screen.findByText('When the flag is clicked the sprite moves.');

        await user.click(screen.getByRole('button', { name: UNDERSTAND }));
        expect(
            await screen.findByRole('button', { name: 'What happens when clicked?' }),
        ).toBeInTheDocument();
        expect(
            screen.queryByText('When the flag is clicked the sprite moves.'),
        ).not.toBeInTheDocument();
        expect(
            fetchSpy.mock.calls.some(
                ([input, init]) =>
                    String(input).includes('/ask-ai/conversations/conv-1/close') &&
                    (init?.method ?? 'GET').toUpperCase() === 'POST',
            ),
        ).toBe(true);
    });

    it('automatically opens the conversation when arriving with a finding query parameter', async () => {
        const questionsWithFinding = () =>
            response({
                schemaVersion: 1,
                truncated: false,
                previewsTruncated: false,
                inquiries: [],
                findings: [
                    {
                        // Finding selectors are opaque digests, not finder IDs.
                        selector: 'finding:v1-7f3a9c21b48e05d6a1c7fe32089b4d5a',
                        label: 'In sprite Cat: this loop is empty.',
                        family: 'bug',
                        target: 'target:v1-cat-flag',
                        finder: 'EmptyLoopFinder',
                        scratchblocks: 'when green flag clicked\nrepeat (10) :: #ff0000\nend',
                    },
                ],
                targets: [
                    {
                        key: 'target:v1-cat',
                        kind: 'sprite',
                        label: 'Cat',
                        parent: '',
                        scratchblocks: '',
                        thumbnail: 'data:image/svg+xml;base64,mock',
                        intents: [],
                    },
                    {
                        key: 'target:v1-cat-flag',
                        kind: 'script',
                        label: 'when green flag clicked',
                        parent: 'target:v1-cat',
                        scratchblocks: 'when gf clicked\nrepeat (10) {\n}',
                        thumbnail: null,
                        intents: [],
                    },
                ],
            });

        const findingConversationCreated = response({
            schemaVersion: 1,
            conversationId: 'conv-1',
            scope: { kind: 'finding', label: 'In sprite Cat: this loop is empty.' },
            repliesRemaining: 8,
        });

        const findingAnswer = response({
            schemaVersion: 1,
            messageId: 'm-finding-1',
            status: 'answer',
            blocks: [{ kind: 'text', text: 'This repeat loop does nothing because it is empty.' }],
            references: [],
            followUps: ['GIVE_HINT'],
            repliesRemaining: 7,
        });

        mockAskAi([findingAnswer], findingConversationCreated, questionsWithFinding);

        renderAt(
            `/ask-ai/submissions/${TOKEN}?finder=EmptyLoopFinder&sprite=Cat&finding=${encodeURIComponent('In sprite Cat: this loop is empty.')}`,
        );

        await screen.findByText('This repeat loop does nothing because it is empty.');
        expect(
            screen.getByRole('region', { name: 'What LitterBox noticed, and the code' }),
        ).toBeInTheDocument();
        expect(screen.getByText('Bugs')).toBeInTheDocument();
        expect(screen.getByText('Cat')).toBeInTheDocument();
        expect(screen.getByText(/repeat \(10\)/)).toBeInTheDocument();
        expect(screen.getByText('What did LitterBox notice here?')).toBeInTheDocument();
    });

    it('falls back to the problems chooser when a finding query matches no finding', async () => {
        const questionsWithFinding = () =>
            response({
                schemaVersion: 1,
                truncated: false,
                previewsTruncated: false,
                inquiries: [],
                findings: [
                    {
                        selector: 'finding:v1-7f3a9c21b48e05d6a1c7fe32089b4d5a',
                        label: 'In sprite Cat: this loop is empty.',
                        family: 'bug',
                        target: 'target:v1-cat-flag',
                        finder: 'EmptyLoopFinder',
                        scratchblocks: '',
                    },
                    {
                        selector: 'finding:v1-0a1b2c3d4e5f60718293a4b5c6d7e8f9',
                        label: 'In sprite Cat: this variable is never used.',
                        family: 'smell',
                        target: 'target:v1-cat-flag',
                        finder: 'UnusedVariableFinder',
                        scratchblocks: '',
                    },
                ],
                targets: [
                    {
                        key: 'target:v1-cat',
                        kind: 'sprite',
                        label: 'Cat',
                        parent: '',
                        scratchblocks: '',
                        thumbnail: null,
                        intents: [],
                    },
                    {
                        key: 'target:v1-cat-flag',
                        kind: 'script',
                        label: 'when green flag clicked',
                        parent: 'target:v1-cat',
                        scratchblocks: '',
                        thumbnail: null,
                        intents: [],
                    },
                ],
            });
        mockAskAi([], undefined, questionsWithFinding);

        renderAt(`/ask-ai/submissions/${TOKEN}?finder=NoSuchFinder&finding=nothing`);

        expect(
            await screen.findByRole('button', { name: /In sprite Cat: this loop is empty\./ }),
        ).toBeInTheDocument();
        expect(
            screen.queryByRole('button', { name: new RegExp(`^${UNDERSTAND}`) }),
        ).not.toBeInTheDocument();
    });
});

describe('same-tick Ask AI actions', () => {
    const question: ConversationScope = {
        kind: 'inquiry',
        selector: 'inquiry:v1-click',
        label: 'What happens when clicked?',
        inquiryKind: 'event',
    };

    beforeEach(async () => {
        await i18n.changeLanguage('en');
        vi.restoreAllMocks();
        vi.stubGlobal('EventSource', undefined);
    });

    it('opens a conversation after Strict Mode replays effect setup', async () => {
        mockAskAi([answerWithScript(7)]);
        const { result } = renderHook(
            () => useAskAiService({ token: TOKEN, analysisId: 21, locale: 'en' }),
            { wrapper: StrictMode },
        );

        await act(async () => result.current.openScope(question));

        await waitFor(() => expect(result.current.state.conversation?.messages).toHaveLength(2));
        expect(result.current.state.conversation?.phase).toBe('active');
    });

    it('sends a double-clicked follow-up once', async () => {
        const fetchMock = mockAskAi([answerWithScript(7), answerWithScript(6)]);
        const { result } = renderHook(() =>
            useAskAiService({ token: TOKEN, analysisId: 21, locale: 'en' }),
        );
        await act(async () => result.current.openScope(question));
        await waitFor(() => expect(result.current.state.conversation?.messages).toHaveLength(2));

        const service = result.current;
        await act(async () => {
            service.sendFollowUp('EXPLAIN_SIMPLY');
            service.sendFollowUp('EXPLAIN_SIMPLY');
        });

        await waitFor(() => expect(result.current.state.conversation?.messages).toHaveLength(4));
        const messageCalls = fetchMock.mock.calls.filter(
            ([input, init]) => String(input).includes('/messages') && init?.method === 'POST',
        );
        expect(messageCalls).toHaveLength(2);
    });

    it('keeps the latest scope when two are opened in one tick', async () => {
        mockAskAi([answerWithScript(7)]);
        const { result } = renderHook(() =>
            useAskAiService({ token: TOKEN, analysisId: 21, locale: 'en' }),
        );
        const second: ConversationScope = {
            ...question,
            selector: 'inquiry:v1-message',
            label: 'Which scripts does this message reach?',
        };

        const service = result.current;
        await act(async () => {
            service.openScope(question);
            service.openScope(second);
        });

        await waitFor(() => expect(result.current.state.conversation?.phase).toBe('active'));
        expect(result.current.state.conversation?.scope.selector).toBe(second.selector);
    });

    it('closes a conversation the server opened for a question the reader had already left', async () => {
        const fetchMock = mockAskAi([answerWithScript(7)]);
        const created = fetchMock.getMockImplementation()!;
        let creates = 0;
        fetchMock.mockImplementation((input, init) => {
            const url = String(input);
            if (url.endsWith('/ask-ai/conversations') && init?.method === 'POST') {
                creates += 1;
                if (creates === 1)
                    return Promise.resolve(
                        response({
                            schemaVersion: 1,
                            conversationId: 'conv-stale',
                            scope: { kind: 'inquiry', label: 'What happens when clicked?' },
                            repliesRemaining: 8,
                        }),
                    );
            }
            if (url.includes('/ask-ai/conversations/conv-stale/close'))
                return Promise.resolve(new Response(null, { status: 204 }));
            return created(input, init);
        });
        const { result } = renderHook(() =>
            useAskAiService({ token: TOKEN, analysisId: 21, locale: 'en' }),
        );
        const second: ConversationScope = {
            ...question,
            selector: 'inquiry:v1-message',
            label: 'Which scripts does this message reach?',
        };

        const service = result.current;
        await act(async () => {
            service.openScope(question);
            service.openScope(second);
        });

        await waitFor(() => expect(result.current.state.conversation?.phase).toBe('active'));
        expect(result.current.state.conversation?.conversationId).toBe('conv-1');
        expect(
            fetchMock.mock.calls.some(([input]) =>
                String(input).includes('/ask-ai/conversations/conv-stale/close'),
            ),
        ).toBe(true);
    });
});
