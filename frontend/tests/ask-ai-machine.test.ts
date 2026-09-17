// SPDX-License-Identifier: EUPL-1.2
// SPDX-FileCopyrightText: 2026 LitterBox-Web contributors
import { describe, expect, it } from 'vitest';
import {
    commonQuestionSelector,
    type AskAiBlock,
    type AskAiFollowUpId,
    type AskAiMessageStatus,
} from '../src/api/ask-ai';
import {
    askAiPageReducer,
    initialAskAiPageState,
    offeredFollowUps,
    outOfReplies,
    shownBlocks,
    type AskAiAction,
    type AskAiPageState,
    type ConversationState,
    type TranscriptEntry,
    type TranscriptUserEntry,
} from '../src/pages/ask-ai-machine';

const reduce = (state: AskAiPageState, ...actions: AskAiAction[]): AskAiPageState =>
    actions.reduce(askAiPageReducer, state);

const inquiryScope = {
    kind: 'inquiry' as const,
    selector: 'inquiry:v1-a',
    label: 'What happens?',
    inquiryKind: 'other',
};
const otherInquiryScope = {
    kind: 'inquiry' as const,
    selector: 'inquiry:v1-b',
    label: 'And then?',
    inquiryKind: 'other',
};

const askEntry: TranscriptUserEntry = { sender: 'user', action: 'ASK', followUp: null };

describe('the Ask AI page state machine', () => {
    it('starts choosing, with the question list loading', () => {
        const state = initialAskAiPageState();
        expect(state.conversation).toBeUndefined();
        expect(state.questions).toEqual({ status: 'loading' });
    });

    it('ignores a question-list answer that arrived for an earlier request', () => {
        const requested = reduce(initialAskAiPageState(), {
            type: 'questions-requested',
            requestId: 2,
        });
        const staleId = requested.questionsRequestId - 1;
        const stale = reduce(requested, {
            type: 'questions-settled',
            requestId: staleId,
            result: { status: 'failed', category: 'failed' },
        });
        expect(stale).toBe(requested);
        expect(stale.questions).toEqual({ status: 'loading' });
    });

    it('accepts a question-list answer that matches the current request', () => {
        const requested = reduce(initialAskAiPageState(), {
            type: 'questions-requested',
            requestId: 1,
        });
        const value = {
            schemaVersion: 1 as const,
            inquiries: [],
            findings: [],
            targets: [],
            truncated: false,
            previewsTruncated: false,
        };
        const loaded = reduce(requested, {
            type: 'questions-settled',
            requestId: requested.questionsRequestId,
            result: { status: 'loaded', value },
        });
        expect(loaded.questions).toEqual({ status: 'loaded', value });
    });

    it('keeps the list already on screen while a new one is fetched', () => {
        const value = {
            schemaVersion: 1 as const,
            inquiries: [],
            findings: [],
            targets: [],
            truncated: false,
            previewsTruncated: false,
        };
        const loaded = reduce(
            reduce(initialAskAiPageState(), { type: 'questions-requested', requestId: 1 }),
            {
                type: 'questions-settled',
                requestId: 1,
                result: { status: 'loaded', value },
            },
        );

        const again = reduce(loaded, { type: 'questions-requested', requestId: 2 });

        expect(again.questions).toEqual({ status: 'loading', previous: value });
        const failed = reduce(again, {
            type: 'questions-settled',
            requestId: again.questionsRequestId,
            result: { status: 'failed', category: 'failed' },
        });
        expect(failed.questions).toEqual({ status: 'failed', category: 'failed', previous: value });
        expect(reduce(failed, { type: 'questions-requested', requestId: 3 }).questions).toEqual({
            status: 'loading',
            previous: value,
        });
    });

    it('opens a conversation on the first selection, moving out of the chooser', () => {
        const selected = reduce(initialAskAiPageState(), {
            type: 'select-scope',
            scope: inquiryScope,
            locale: 'en',
        });
        expect(selected.conversation).not.toBeUndefined();
        expect(selected.conversation).toEqual({
            phase: 'creating',
            scope: inquiryScope,
            messages: [],
            // Keep the creation locale for the conversation.
            askedIn: 'en',
        });
    });

    it('ignores a conversation-created answer belonging to a run the reader has already left', () => {
        const selected = reduce(initialAskAiPageState(), {
            type: 'select-scope',
            scope: inquiryScope,
            locale: 'en',
        });
        const staleRunId = selected.runId;
        const reselected = reduce(selected, {
            type: 'select-scope',
            scope: otherInquiryScope,
            locale: 'en',
        });
        const late = reduce(reselected, {
            type: 'conversation-created',
            runId: staleRunId,
            conversationId: 'stale-conversation',
            scope: inquiryScope,
            repliesRemaining: 8,
        });
        expect(late).toBe(reselected);
        expect(late.conversation?.conversationId).toBeUndefined();
    });

    it('picking a different scope starts a new conversation with no history carried over', () => {
        const opened = reduce(
            initialAskAiPageState(),
            { type: 'select-scope', scope: inquiryScope, locale: 'en' },
            {
                type: 'conversation-created',
                runId: 1,
                conversationId: 'conversation-a',
                scope: inquiryScope,
                repliesRemaining: 8,
            },
        );
        const withHistory = reduce(
            opened,
            {
                type: 'message-sent',
                runId: opened.runId,
                clientMessageId: 'msg-1',
                entry: askEntry,
            },
            {
                type: 'message-answered',
                runId: opened.runId,
                clientMessageId: 'msg-1',
                entry: {
                    sender: 'assistant',
                    status: 'answer',
                    blocks: [],
                    followUps: [],
                },
                repliesRemaining: 7,
            },
        );
        expect(withHistory.conversation?.messages).toHaveLength(2);

        const reselected = reduce(withHistory, {
            type: 'select-scope',
            scope: otherInquiryScope,
            locale: 'en',
        });
        expect(reselected.conversation).toEqual({
            phase: 'creating',
            scope: otherInquiryScope,
            messages: [],
            askedIn: 'en',
        });
        expect(reselected.runId).not.toBe(withHistory.runId);
    });

    it('selecting the same scope again while it is already open is a no-op', () => {
        const opened = reduce(
            initialAskAiPageState(),
            { type: 'select-scope', scope: inquiryScope, locale: 'en' },
            {
                type: 'conversation-created',
                runId: 1,
                conversationId: 'conversation-a',
                scope: inquiryScope,
                repliesRemaining: 8,
            },
        );
        const reselected = reduce(opened, {
            type: 'select-scope',
            scope: inquiryScope,
            locale: 'en',
        });
        expect(reselected).toBe(opened);
    });

    it('returns to the chooser and invalidates whatever the abandoned conversation still has in flight', () => {
        const creating = reduce(initialAskAiPageState(), {
            type: 'select-scope',
            scope: inquiryScope,
            locale: 'en',
        });
        const left = reduce(creating, { type: 'return-to-chooser' });
        expect(left.conversation).toBeUndefined();

        const late = reduce(left, {
            type: 'conversation-created',
            runId: creating.runId,
            conversationId: 'too-late',
            scope: inquiryScope,
            repliesRemaining: 8,
        });
        expect(late).toBe(left);
    });

    it('keeps the asked question visible and reuses the same client message id on retry', () => {
        const opened = reduce(
            initialAskAiPageState(),
            { type: 'select-scope', scope: inquiryScope, locale: 'en' },
            {
                type: 'conversation-created',
                runId: 1,
                conversationId: 'conversation-a',
                scope: inquiryScope,
                repliesRemaining: 8,
            },
        );
        const sent = reduce(opened, {
            type: 'message-sent',
            runId: opened.runId,
            clientMessageId: 'retry-me',
            entry: askEntry,
        });
        expect(sent.conversation?.phase).toBe('thinking');

        const failed = reduce(sent, {
            type: 'message-failed',
            runId: opened.runId,
            clientMessageId: 'retry-me',
            category: 'provider_unavailable',
        });
        expect(failed.conversation?.phase).toBe('error');
        expect(failed.conversation?.messages).toEqual([askEntry]);
        expect(failed.conversation?.pendingClientMessageId).toBe('retry-me');

        const retried = reduce(failed, { type: 'message-retry', runId: opened.runId });
        expect(retried.conversation?.phase).toBe('thinking');
        expect(retried.conversation?.messages).toEqual([askEntry]);
        expect(retried.conversation?.pendingClientMessageId).toBe('retry-me');
        // A retry that must start afresh — the id is bound to another message — waits for its own id instead.
        const renamed = reduce(failed, {
            type: 'message-retry',
            runId: opened.runId,
            clientMessageId: 'retry-anew',
        });
        expect(renamed.conversation?.pendingClientMessageId).toBe('retry-anew');
        // A failed attempt gives its reply back on the server, so the count stands.
        expect(retried.conversation?.repliesRemaining).toBe(sent.conversation?.repliesRemaining);

        const answered = reduce(retried, {
            type: 'message-answered',
            runId: opened.runId,
            clientMessageId: 'retry-me',
            entry: {
                sender: 'assistant',
                status: 'answer',
                blocks: [],
                followUps: [],
            },
            repliesRemaining: 7,
        });
        expect(answered.conversation?.phase).toBe('active');
        expect(answered.conversation?.messages).toHaveLength(2);
    });

    it('ignores a reply that answers a send the reader has already moved past', () => {
        const opened = reduce(
            initialAskAiPageState(),
            { type: 'select-scope', scope: inquiryScope, locale: 'en' },
            {
                type: 'conversation-created',
                runId: 1,
                conversationId: 'conversation-a',
                scope: inquiryScope,
                repliesRemaining: 8,
            },
        );
        const sent = reduce(opened, {
            type: 'message-sent',
            runId: opened.runId,
            clientMessageId: 'first',
            entry: askEntry,
        });
        const stray = reduce(sent, {
            type: 'message-answered',
            runId: opened.runId,
            clientMessageId: 'not-first',
            entry: {
                sender: 'assistant',
                status: 'answer',
                blocks: [],
                followUps: [],
            },
            repliesRemaining: 7,
        });
        expect(stray).toBe(sent);
    });

    it('enters the quota-exhausted phase on that problem code, disabling the composer', () => {
        const opened = reduce(
            initialAskAiPageState(),
            { type: 'select-scope', scope: inquiryScope, locale: 'en' },
            {
                type: 'conversation-created',
                runId: 1,
                conversationId: 'conversation-a',
                scope: inquiryScope,
                repliesRemaining: 1,
            },
        );
        const sent = reduce(opened, {
            type: 'message-sent',
            runId: opened.runId,
            clientMessageId: 'last-try',
            entry: askEntry,
        });
        const exhausted = reduce(sent, {
            type: 'message-failed',
            runId: opened.runId,
            clientMessageId: 'last-try',
            category: 'quota_exhausted',
        });
        expect(exhausted.conversation?.phase).toBe('quota-exhausted');
        expect(offeredFollowUps(exhausted.conversation!)).toEqual([]);
        expect(exhausted.conversation?.messages).toEqual([askEntry]);
    });

    it('is as spent once out of attempts as out of replies, whatever the count says', () => {
        const opened = reduce(
            initialAskAiPageState(),
            { type: 'select-scope', scope: inquiryScope, locale: 'en' },
            {
                type: 'conversation-created',
                runId: 1,
                conversationId: 'conversation-a',
                scope: inquiryScope,
                repliesRemaining: 8,
            },
        );
        const sent = reduce(opened, {
            type: 'message-sent',
            runId: opened.runId,
            clientMessageId: 'one-too-many',
            entry: askEntry,
        });
        const exhausted = reduce(sent, {
            type: 'message-failed',
            runId: opened.runId,
            clientMessageId: 'one-too-many',
            category: 'attempts_exhausted',
        });
        expect(exhausted.conversation?.phase).toBe('quota-exhausted');
        expect(exhausted.conversation?.errorCategory).toBe('attempts_exhausted');
        // Every failed attempt gave its reply back, so the count is honest: they are all still there.
        expect(exhausted.conversation?.repliesRemaining).toBe(8);
        expect(offeredFollowUps(exhausted.conversation!)).toEqual([]);
    });

    it('reads the same problem code on creation as the other limit it can only be', () => {
        const refused = reduce(
            initialAskAiPageState(),
            { type: 'select-scope', scope: inquiryScope, locale: 'en' },
            { type: 'conversation-create-failed', runId: 1, category: 'quota_exhausted' },
        );

        // The creation failure does not spend this conversation's reply budget.
        expect(refused.conversation?.phase).toBe('conversation-limit');
        expect(refused.conversation?.conversationId).toBeUndefined();
        expect(offeredFollowUps(refused.conversation!)).toEqual([]);
    });

    it('disables the composer once the reply budget is spent, without a special phase for it', () => {
        const opened = reduce(
            initialAskAiPageState(),
            { type: 'select-scope', scope: inquiryScope, locale: 'en' },
            {
                type: 'conversation-created',
                runId: 1,
                conversationId: 'conversation-a',
                scope: inquiryScope,
                repliesRemaining: 1,
            },
        );
        const spent = reduce(
            opened,
            { type: 'message-sent', runId: opened.runId, clientMessageId: 'm', entry: askEntry },
            {
                type: 'message-answered',
                runId: opened.runId,
                clientMessageId: 'm',
                entry: {
                    sender: 'assistant',
                    status: 'answer',
                    blocks: [],
                    followUps: [],
                },
                repliesRemaining: 0,
            },
        );
        expect(spent.conversation?.phase).toBe('active');
        expect(offeredFollowUps(spent.conversation!)).toEqual([]);
        expect(outOfReplies(spent.conversation!)).toBe(true);
    });

    it('does not report replies remaining or a retryable error as exhausted', () => {
        const opened = reduce(
            initialAskAiPageState(),
            { type: 'select-scope', scope: inquiryScope, locale: 'en' },
            {
                type: 'conversation-created',
                runId: 1,
                conversationId: 'conversation-a',
                scope: inquiryScope,
                repliesRemaining: 2,
            },
        );
        expect(outOfReplies(opened.conversation!)).toBe(false);

        const sent = reduce(opened, {
            type: 'message-sent',
            runId: opened.runId,
            clientMessageId: 'm',
            entry: askEntry,
        });
        const failed = reduce(sent, {
            type: 'message-failed',
            runId: opened.runId,
            clientMessageId: 'm',
            category: 'timeout',
        });
        expect(outOfReplies(failed.conversation!)).toBe(false);
    });

    it('rejects a new send while a failed send is waiting for retry', () => {
        const failed = reduce(
            initialAskAiPageState(),
            { type: 'select-scope', scope: inquiryScope, locale: 'en' },
            {
                type: 'conversation-created',
                runId: 1,
                conversationId: 'conversation-a',
                scope: inquiryScope,
                repliesRemaining: 8,
            },
            { type: 'message-sent', runId: 1, clientMessageId: 'first', entry: askEntry },
            {
                type: 'message-failed',
                runId: 1,
                clientMessageId: 'first',
                category: 'provider_unavailable',
            },
        );

        const again = reduce(failed, {
            type: 'message-sent',
            runId: 1,
            clientMessageId: 'second',
            entry: askEntry,
        });
        expect(again).toBe(failed);
    });

    it('leaves a conversation for good when the reader goes back to the questions', () => {
        const opened = reduce(
            initialAskAiPageState(),
            { type: 'select-scope', scope: inquiryScope, locale: 'en' },
            {
                type: 'conversation-created',
                runId: 1,
                conversationId: 'conversation-a',
                scope: inquiryScope,
                repliesRemaining: 8,
            },
        );
        const left = reduce(opened, { type: 'return-to-chooser' });
        expect(left.conversation).toBeUndefined();
        expect(left.runId).toBe(opened.runId + 1);
    });
});

describe('the follow-ups a reply is worth offering', () => {
    const improveScope = {
        kind: 'common' as const,
        selector: 'common:PROVIDE_FEEDBACK@target:v1-banana',
        label: 'What works well in Banana, and what could be improved?',
    };
    const answered = (
        followUps: AskAiFollowUpId[],
        overrides: Partial<ConversationState> = {},
    ): ConversationState => ({
        phase: 'active',
        scope: inquiryScope,
        conversationId: 'conversation-a',
        messages: [askEntry, { sender: 'assistant', status: 'answer', blocks: [], followUps }],
        ...overrides,
    });

    it('passes on what the last reply suggested', () => {
        expect(offeredFollowUps(answered(['EXPLAIN_SIMPLY', 'SHOW_RELEVANT_BLOCKS']))).toEqual([
            'EXPLAIN_SIMPLY',
            'SHOW_RELEVANT_BLOCKS',
        ]);
    });

    it('does not offer to show blocks that the reply already shows', () => {
        const withCode = answered(['EXPLAIN_SIMPLY', 'SHOW_RELEVANT_BLOCKS'], {
            messages: [
                askEntry,
                {
                    sender: 'assistant',
                    status: 'answer',
                    blocks: [{ kind: 'scratchblocks', role: 'existing', code: 'move (10) steps' }],
                    followUps: ['EXPLAIN_SIMPLY', 'SHOW_RELEVANT_BLOCKS'],
                },
            ],
        });

        expect(offeredFollowUps(withCode)).toEqual(['EXPLAIN_SIMPLY']);
    });

    it('drops one that has already been asked, because asking it again sends the same request', () => {
        const twice = answered(['EXPLAIN_SIMPLY', 'SHOW_RELEVANT_BLOCKS'], {
            messages: [
                askEntry,
                {
                    sender: 'assistant',
                    status: 'answer',
                    blocks: [],
                    followUps: ['EXPLAIN_SIMPLY', 'SHOW_RELEVANT_BLOCKS'],
                },
                { sender: 'user', action: 'FOLLOW_UP', followUp: 'SHOW_RELEVANT_BLOCKS' },
                {
                    sender: 'assistant',
                    status: 'answer',
                    blocks: [],
                    followUps: ['EXPLAIN_SIMPLY', 'SHOW_RELEVANT_BLOCKS'],
                },
            ],
        });
        expect(offeredFollowUps(twice)).toEqual(['EXPLAIN_SIMPLY']);
    });

    it('re-offers simplification after blocks were requested following an earlier simplification', () => {
        const multiTurn = answered(['EXPLAIN_SIMPLY'], {
            messages: [
                askEntry,
                {
                    sender: 'assistant',
                    status: 'answer',
                    blocks: [],
                    followUps: ['EXPLAIN_SIMPLY', 'SHOW_RELEVANT_BLOCKS'],
                },
                { sender: 'user', action: 'FOLLOW_UP', followUp: 'EXPLAIN_SIMPLY' },
                {
                    sender: 'assistant',
                    status: 'answer',
                    blocks: [],
                    followUps: ['SHOW_RELEVANT_BLOCKS'],
                },
                { sender: 'user', action: 'FOLLOW_UP', followUp: 'SHOW_RELEVANT_BLOCKS' },
                {
                    sender: 'assistant',
                    status: 'answer',
                    blocks: [],
                    followUps: ['EXPLAIN_SIMPLY'],
                },
            ],
        });
        expect(offeredFollowUps(multiTurn)).toEqual(['EXPLAIN_SIMPLY']);
    });

    it('retires follow-ups once code blocks have been simplified', () => {
        const completed = answered(['EXPLAIN_SIMPLY', 'SHOW_RELEVANT_BLOCKS'], {
            messages: [
                askEntry,
                {
                    sender: 'assistant',
                    status: 'answer',
                    blocks: [],
                    followUps: ['EXPLAIN_SIMPLY', 'SHOW_RELEVANT_BLOCKS'],
                },
                { sender: 'user', action: 'FOLLOW_UP', followUp: 'SHOW_RELEVANT_BLOCKS' },
                {
                    sender: 'assistant',
                    status: 'answer',
                    blocks: [],
                    followUps: ['EXPLAIN_SIMPLY'],
                },
                { sender: 'user', action: 'FOLLOW_UP', followUp: 'EXPLAIN_SIMPLY' },
                {
                    sender: 'assistant',
                    status: 'answer',
                    blocks: [],
                    followUps: ['EXPLAIN_SIMPLY', 'SHOW_RELEVANT_BLOCKS'],
                },
            ],
        });
        expect(offeredFollowUps(completed)).toEqual([]);
    });

    it('keeps a hint only where the answer left something to work out', () => {
        expect(offeredFollowUps(answered(['GIVE_HINT', 'EXPLAIN_SIMPLY']))).toEqual([
            'EXPLAIN_SIMPLY',
        ]);
        const finding = answered(['GIVE_HINT'], {
            scope: { kind: 'finding', selector: 'finding:v1-a', label: 'Missing loop' },
        });
        expect(offeredFollowUps(finding)).toEqual(['GIVE_HINT']);
        const summary = answered(['GIVE_HINT'], {
            scope: {
                kind: 'common',
                selector: 'common:SUMMARISE@target:v1-cat',
                label: 'What does Cat do?',
            },
        });
        expect(offeredFollowUps(summary)).toEqual([]);
        const feedback = answered(['GIVE_HINT'], { scope: improveScope });
        expect(offeredFollowUps(feedback)).not.toContain('GIVE_HINT');
    });

    const addScope = {
        kind: 'common' as const,
        selector: commonQuestionSelector('SUGGEST_EXTENSION'),
        label: 'How could this project grow?',
    };

    it.each([improveScope, addScope])(
        'offers the change straight away where the answer is already the hint: %o',
        (scope) => {
            const opening = answered(['EXPLAIN_SIMPLY'], { scope });
            expect(offeredFollowUps(opening)).toEqual(['SHOW_THE_FIX', 'EXPLAIN_SIMPLY']);
            expect(offeredFollowUps(answered(['GIVE_HINT'], { scope }))).not.toContain('GIVE_HINT');

            const shown = answered(['EXPLAIN_SIMPLY'], {
                scope,
                messages: [
                    askEntry,
                    {
                        sender: 'assistant',
                        status: 'answer',
                        blocks: [],
                        followUps: ['EXPLAIN_SIMPLY'],
                    },
                    { sender: 'user', action: 'FOLLOW_UP', followUp: 'SHOW_THE_FIX' },
                    {
                        sender: 'assistant',
                        status: 'answer',
                        blocks: [],
                        followUps: ['EXPLAIN_SIMPLY'],
                    },
                ],
            });
            expect(offeredFollowUps(shown)).toEqual(['EXPLAIN_SIMPLY']);
        },
    );

    it('adds the fix to no other question, however the answer was worded', () => {
        const summary = answered(['EXPLAIN_SIMPLY'], {
            scope: {
                kind: 'common',
                selector: 'common:SUMMARISE@target:v1-cat',
                label: 'What does Cat do?',
            },
        });
        expect(offeredFollowUps(summary)).toEqual(['EXPLAIN_SIMPLY']);
    });

    it('treats the startup inquiry exactly like a finding: a hint first, and the fix only once it was asked for', () => {
        const startupScope = {
            kind: 'inquiry' as const,
            selector: 'inquiry:v1-c',
            label: 'Why does nothing happen when I click the green flag?',
            inquiryKind: 'startup',
        };
        const opening = answered(['GIVE_HINT'], { scope: startupScope });
        expect(offeredFollowUps(opening)).toEqual(['GIVE_HINT']);

        const beforeHint = answered(['GIVE_HINT', 'SHOW_THE_FIX'], { scope: startupScope });
        expect(offeredFollowUps(beforeHint)).toEqual(['GIVE_HINT']);

        const afterHint = answered(['SHOW_THE_FIX'], {
            scope: startupScope,
            messages: [
                askEntry,
                { sender: 'assistant', status: 'answer', blocks: [], followUps: ['GIVE_HINT'] },
                { sender: 'user', action: 'FOLLOW_UP', followUp: 'GIVE_HINT' },
                { sender: 'assistant', status: 'answer', blocks: [], followUps: ['SHOW_THE_FIX'] },
            ],
        });
        expect(offeredFollowUps(afterHint)).toEqual(['SHOW_THE_FIX']);
    });

    it('offers the change straight away for an idea-shaped inquiry, and never offers a hint towards it', () => {
        const scoreIdeaScope = {
            kind: 'inquiry' as const,
            selector: 'inquiry:v1-d',
            label: 'How could this project keep score, or show a timer?',
            inquiryKind: 'score-idea',
        };
        const smoothMotionScope = {
            kind: 'inquiry' as const,
            selector: 'inquiry:v1-e',
            label: 'How could Cat move more smoothly?',
            inquiryKind: 'smooth-motion',
        };
        for (const scope of [scoreIdeaScope, smoothMotionScope]) {
            const opening = answered(['EXPLAIN_SIMPLY'], { scope });
            expect(offeredFollowUps(opening)).toEqual(['SHOW_THE_FIX', 'EXPLAIN_SIMPLY']);
            expect(offeredFollowUps(answered(['GIVE_HINT', 'EXPLAIN_SIMPLY'], { scope }))).toEqual([
                'SHOW_THE_FIX',
                'EXPLAIN_SIMPLY',
            ]);
        }
    });

    it('leaves a plain generated question with neither', () => {
        const loopScope = {
            kind: 'inquiry' as const,
            selector: 'inquiry:v1-f',
            label: 'How often does this loop repeat?',
            inquiryKind: 'loop',
        };
        expect(
            offeredFollowUps(answered(['GIVE_HINT', 'SHOW_THE_FIX'], { scope: loopScope })),
        ).toEqual([]);
    });

    it('never offers the fix a second time, or for anything other than a finding', () => {
        const messagesAfterHintAndFix: TranscriptEntry[] = [
            askEntry,
            { sender: 'assistant', status: 'answer', blocks: [], followUps: ['GIVE_HINT'] },
            { sender: 'user', action: 'FOLLOW_UP', followUp: 'GIVE_HINT' },
            { sender: 'assistant', status: 'answer', blocks: [], followUps: ['SHOW_THE_FIX'] },
            { sender: 'user', action: 'FOLLOW_UP', followUp: 'SHOW_THE_FIX' },
            { sender: 'assistant', status: 'answer', blocks: [], followUps: ['SHOW_THE_FIX'] },
        ];
        const askedTwice = answered(['SHOW_THE_FIX'], {
            scope: { kind: 'finding', selector: 'finding:v1-a', label: 'Missing loop' },
            messages: messagesAfterHintAndFix,
        });
        expect(offeredFollowUps(askedTwice)).toEqual([]);

        const notAFinding = answered(['SHOW_THE_FIX'], {
            scope: inquiryScope,
            messages: [
                askEntry,
                { sender: 'assistant', status: 'answer', blocks: [], followUps: ['GIVE_HINT'] },
                { sender: 'user', action: 'FOLLOW_UP', followUp: 'GIVE_HINT' },
                { sender: 'assistant', status: 'answer', blocks: [], followUps: ['SHOW_THE_FIX'] },
            ],
        });
        expect(offeredFollowUps(notAFinding)).toEqual([]);
    });

    it('offers nothing at all under a refusal, however much the scope would otherwise call for the change', () => {
        const nonAnswerStatuses: AskAiMessageStatus[] = ['out_of_scope', 'unsafe', 'cannot_answer'];
        for (const status of nonAnswerStatuses) {
            const refused = answered([], {
                scope: addScope,
                messages: [askEntry, { sender: 'assistant', status, blocks: [], followUps: [] }],
            });
            expect(offeredFollowUps(refused)).toEqual([]);
        }
        expect(offeredFollowUps(answered([], { scope: addScope }))).toEqual(['SHOW_THE_FIX']);
    });

    it('comes back in a fixed order regardless of what order the model listed it in', () => {
        expect(
            offeredFollowUps(answered(['OBSERVE_BEHAVIOUR', 'EXPLAIN_CONCEPT', 'EXPLAIN_SIMPLY'])),
        ).toEqual(['EXPLAIN_SIMPLY', 'OBSERVE_BEHAVIOUR', 'EXPLAIN_CONCEPT']);
    });

    it('puts the fix first once it is on offer, ahead of everything else that survived filtering', () => {
        const afterHint = answered(['EXPLAIN_CONCEPT', 'SHOW_THE_FIX'], {
            scope: { kind: 'finding', selector: 'finding:v1-a', label: 'Missing loop' },
            messages: [
                askEntry,
                { sender: 'assistant', status: 'answer', blocks: [], followUps: ['GIVE_HINT'] },
                { sender: 'user', action: 'FOLLOW_UP', followUp: 'GIVE_HINT' },
                {
                    sender: 'assistant',
                    status: 'answer',
                    blocks: [],
                    followUps: ['EXPLAIN_CONCEPT', 'SHOW_THE_FIX'],
                },
            ],
        });
        expect(offeredFollowUps(afterHint)).toEqual(['SHOW_THE_FIX', 'EXPLAIN_CONCEPT']);
    });

    it('offers nothing while a reply is still coming, or after one that failed', () => {
        expect(offeredFollowUps(answered(['EXPLAIN_SIMPLY'], { phase: 'thinking' }))).toEqual([]);
        expect(
            offeredFollowUps(
                answered(['EXPLAIN_SIMPLY'], {
                    phase: 'error',
                    errorCategory: 'timeout',
                }),
            ),
        ).toEqual([]);
    });
});

describe('the code a reply still has to show', () => {
    const code = (source: string, role: 'existing' | 'suggested' = 'existing'): AskAiBlock => ({
        kind: 'scratchblocks',
        role,
        code: source,
    });
    const words = (text: string): AskAiBlock => ({ kind: 'text', text });
    const reply = (blocks: AskAiBlock[]): TranscriptEntry => ({
        sender: 'assistant',
        status: 'answer',
        blocks,
        followUps: [],
    });
    const followUp: TranscriptEntry = {
        sender: 'user',
        action: 'FOLLOW_UP',
        followUp: 'EXPLAIN_SIMPLY',
    };

    it('leaves out a script the transcript has already shown', () => {
        const messages = [
            askEntry,
            reply([
                words('It waits, then moves.'),
                code('when green flag clicked\nmove (10) steps'),
            ]),
            followUp,
            reply([
                words('It moves a little when you start it.'),
                code('when green flag clicked\n  move (10) steps  '),
            ]),
        ];
        expect(shownBlocks(messages, 3)).toEqual([words('It moves a little when you start it.')]);
    });

    it('shows a script again when the second reply means something else by it', () => {
        const messages = [
            askEntry,
            reply([code('move (10) steps')]),
            followUp,
            reply([words('You could change it to:'), code('move (10) steps', 'suggested')]),
        ];
        expect(shownBlocks(messages, 3)).toEqual([
            words('You could change it to:'),
            code('move (10) steps', 'suggested'),
        ]);
    });

    it('keeps a reply that is nothing but a script it has shown, rather than emptying it', () => {
        const messages = [
            askEntry,
            reply([code('move (10) steps')]),
            followUp,
            reply([code('move (10) steps')]),
        ];
        expect(shownBlocks(messages, 3)).toEqual([code('move (10) steps')]);
    });

    it('shows a script quoted twice within the one reply once, not twice', () => {
        const messages = [
            askEntry,
            reply([
                code('when I receive [msg v]'),
                words('This block is for listening.'),
                words('Look at this block and think about what happens next.'),
                code('when I receive [msg v]'),
            ]),
        ];
        expect(shownBlocks(messages, 1)).toEqual([
            code('when I receive [msg v]'),
            words('This block is for listening.'),
            words('Look at this block and think about what happens next.'),
        ]);
    });

    it('shows one copy, not zero, of a script quoted twice in a reply that repeats an earlier answer', () => {
        const messages = [
            askEntry,
            reply([code('move (10) steps')]),
            followUp,
            reply([code('move (10) steps'), code('move (10) steps')]),
        ];
        expect(shownBlocks(messages, 3)).toEqual([code('move (10) steps')]);
    });

    it('shows a script again where the reader pressed the button that asked for it', () => {
        const asked: TranscriptEntry = {
            sender: 'user',
            action: 'FOLLOW_UP',
            followUp: 'SHOW_RELEVANT_BLOCKS',
        };
        const messages = [
            askEntry,
            reply([
                words('It always starts at the top.'),
                code('go to random position\nset y to (170)'),
            ]),
            asked,
            reply([
                words('These blocks put it there.'),
                code('go to random position\nset y to (170)'),
            ]),
        ];
        expect(shownBlocks(messages, 3)).toEqual([
            words('These blocks put it there.'),
            code('go to random position\nset y to (170)'),
        ]);
    });

    it('still leaves out a repeat nobody asked to see', () => {
        const messages = [
            askEntry,
            reply([code('move (10) steps')]),
            followUp,
            reply([words('It moves a bit.'), code('move (10) steps')]),
        ];
        expect(shownBlocks(messages, 3)).toEqual([words('It moves a bit.')]);
    });

    it('has nothing to show for a question', () => {
        expect(shownBlocks([askEntry], 0)).toEqual([]);
        expect(shownBlocks([askEntry], 4)).toEqual([]);
    });
});

describe('two question-list fetches started before either has rendered', () => {
    it('answers the second one rather than throwing it away', () => {
        // Allocate request IDs synchronously to distinguish same-tick fetches.
        const first = reduce(initialAskAiPageState(), {
            type: 'questions-requested',
            requestId: 1,
        });
        const second = reduce(first, { type: 'questions-requested', requestId: 2 });
        const value = {
            schemaVersion: 1 as const,
            inquiries: [],
            findings: [],
            targets: [],
            truncated: false,
            previewsTruncated: false,
        };

        const settled = reduce(second, {
            type: 'questions-settled',
            requestId: 2,
            result: { status: 'loaded', value },
        });

        expect(settled.questions).toEqual({ status: 'loaded', value });
    });
});
