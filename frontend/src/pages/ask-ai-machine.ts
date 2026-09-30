// SPDX-License-Identifier: EUPL-1.2
// SPDX-FileCopyrightText: 2026 LitterBox-Web contributors

import {
    type AskAiBlock,
    type AskAiErrorCategory,
    type AskAiFollowUpId,
    type AskAiMessageStatus,
    type AskAiQuestions,
    type AskAiScopeKind,
} from '../api/ask-ai';

export type ConversationScope =
    | {
          kind: 'inquiry';
          selector: string;
          label: string;
          /** Needed for follow-up policy; selectors are opaque. */
          inquiryKind: string;
      }
    | { kind: Exclude<AskAiScopeKind, 'inquiry'>; selector: string; label: string };

export type TranscriptUserEntry =
    | { sender: 'user'; action: 'ASK'; followUp: null }
    | { sender: 'user'; action: 'FOLLOW_UP'; followUp: AskAiFollowUpId };

export interface TranscriptAssistantEntry {
    sender: 'assistant';
    status: AskAiMessageStatus;
    blocks: AskAiBlock[];
    followUps: AskAiFollowUpId[];
}

export type TranscriptEntry = TranscriptUserEntry | TranscriptAssistantEntry;

export type QuestionsState =
    | { status: 'loading'; previous?: AskAiQuestions }
    | { status: 'loaded'; value: AskAiQuestions }
    | { status: 'failed'; category: AskAiErrorCategory; previous?: AskAiQuestions };

export type ConversationPhase =
    'creating' | 'active' | 'thinking' | 'error' | 'quota-exhausted' | 'conversation-limit';

export interface ConversationState {
    phase: ConversationPhase;
    scope: ConversationScope;
    conversationId?: string;
    messages: TranscriptEntry[];
    repliesRemaining?: number;
    repliesBudget?: number;
    /** Stable ID reused when retrying the same send. */
    pendingClientMessageId?: string;
    /** Locale fixed when the conversation was created. */
    askedIn?: string;
    errorCategory?: AskAiErrorCategory;
}

export interface AskAiPageState {
    questions: QuestionsState;
    questionsRequestId: number;
    conversation?: ConversationState;
    runId: number;
}

export const initialAskAiPageState = (): AskAiPageState => ({
    questions: { status: 'loading' },
    questionsRequestId: 0,
    conversation: undefined,
    runId: 0,
});

export type AskAiAction =
    | { type: 'questions-requested'; requestId: number }
    | { type: 'questions-settled'; requestId: number; result: QuestionsState }
    | { type: 'select-scope'; scope: ConversationScope; locale: string }
    | { type: 'return-to-chooser' }
    | {
          type: 'conversation-created';
          runId: number;
          conversationId: string;
          scope: ConversationScope;
          repliesRemaining: number;
      }
    | { type: 'conversation-create-failed'; runId: number; category: AskAiErrorCategory }
    | { type: 'message-sent'; runId: number; clientMessageId: string; entry: TranscriptUserEntry }
    | { type: 'message-retry'; runId: number; clientMessageId?: string }
    | {
          type: 'message-answered';
          runId: number;
          clientMessageId: string;
          entry: TranscriptAssistantEntry;
          repliesRemaining: number;
      }
    | {
          type: 'message-failed';
          runId: number;
          clientMessageId: string;
          category: AskAiErrorCategory;
      };

// The failures after which a conversation can be given no more, whatever its reply count says.
const SPENT_CATEGORIES: ReadonlySet<AskAiErrorCategory> = new Set([
    'quota_exhausted',
    'attempts_exhausted',
]);

const CONTINUING_PHASES: ReadonlySet<ConversationPhase> = new Set([
    'active',
    'thinking',
    'quota-exhausted',
]);

const isSameOngoingScope = (
    conversation: ConversationState | undefined,
    scope: ConversationScope,
): boolean =>
    conversation !== undefined &&
    CONTINUING_PHASES.has(conversation.phase) &&
    conversation.scope.kind === scope.kind &&
    conversation.scope.selector === scope.selector;

export const loadedQuestions = (questions: QuestionsState): AskAiQuestions | undefined =>
    questions.status === 'loaded' ? questions.value : questions.previous;

export const askAiPageReducer = (state: AskAiPageState, action: AskAiAction): AskAiPageState => {
    switch (action.type) {
        case 'questions-requested':
            // Callers allocate ids synchronously so same-tick loads cannot share one.
            return {
                ...state,
                questions: { status: 'loading', previous: loadedQuestions(state.questions) },
                questionsRequestId: action.requestId,
            };
        case 'questions-settled': {
            if (action.requestId !== state.questionsRequestId) return state;
            // A failed refetch keeps the questions an open conversation is already drawn from.
            const questions =
                action.result.status === 'failed'
                    ? { ...action.result, previous: loadedQuestions(state.questions) }
                    : action.result;
            return { ...state, questions };
        }
        case 'select-scope': {
            if (isSameOngoingScope(state.conversation, action.scope)) return state;
            return {
                ...state,
                runId: state.runId + 1,
                conversation: {
                    phase: 'creating',
                    scope: action.scope,
                    messages: [],
                    askedIn: action.locale,
                },
            };
        }
        case 'return-to-chooser':
            if (!state.conversation) return state;
            return { ...state, runId: state.runId + 1, conversation: undefined };
        case 'conversation-created': {
            if (action.runId !== state.runId) return state;
            return {
                ...state,
                conversation: {
                    phase: 'active',
                    scope: action.scope,
                    conversationId: action.conversationId,
                    askedIn: state.conversation?.askedIn,
                    messages: [],
                    repliesRemaining: action.repliesRemaining,
                    repliesBudget: action.repliesRemaining,
                },
            };
        }
        case 'conversation-create-failed': {
            if (action.runId !== state.runId || !state.conversation) return state;
            return {
                ...state,
                conversation: {
                    ...state.conversation,
                    phase: action.category === 'quota_exhausted' ? 'conversation-limit' : 'error',
                    errorCategory: action.category,
                },
            };
        }
        case 'message-sent': {
            const conversation = state.conversation;
            if (action.runId !== state.runId || !conversation || conversation.phase !== 'active')
                return state;
            return {
                ...state,
                conversation: {
                    ...conversation,
                    phase: 'thinking',
                    pendingClientMessageId: action.clientMessageId,
                    messages: [...conversation.messages, action.entry],
                },
            };
        }
        case 'message-retry': {
            const conversation = state.conversation;
            if (
                action.runId !== state.runId ||
                !conversation ||
                conversation.phase !== 'error' ||
                conversation.pendingClientMessageId === undefined
            )
                return state;
            return {
                ...state,
                conversation: {
                    ...conversation,
                    phase: 'thinking',
                    errorCategory: undefined,
                    pendingClientMessageId:
                        action.clientMessageId ?? conversation.pendingClientMessageId,
                },
            };
        }
        case 'message-answered': {
            const conversation = state.conversation;
            if (
                action.runId !== state.runId ||
                !conversation ||
                conversation.phase !== 'thinking' ||
                conversation.pendingClientMessageId !== action.clientMessageId
            )
                return state;
            return {
                ...state,
                conversation: {
                    ...conversation,
                    phase: 'active',
                    pendingClientMessageId: undefined,
                    repliesRemaining: action.repliesRemaining,
                    messages: [...conversation.messages, action.entry],
                },
            };
        }
        case 'message-failed': {
            const conversation = state.conversation;
            if (
                action.runId !== state.runId ||
                !conversation ||
                conversation.phase !== 'thinking' ||
                conversation.pendingClientMessageId !== action.clientMessageId
            )
                return state;
            // A failed attempt gives its reply back on the server, so the count stands. Out of attempts, the
            // conversation is as finished as one out of replies, though the count may still say otherwise.
            return {
                ...state,
                conversation: {
                    ...conversation,
                    phase: SPENT_CATEGORIES.has(action.category) ? 'quota-exhausted' : 'error',
                    errorCategory: action.category,
                },
            };
        }
    }
};

export const outOfReplies = (conversation: ConversationState): boolean =>
    conversation.phase === 'quota-exhausted' ||
    (conversation.phase === 'active' && conversation.repliesRemaining === 0);

export const aboutAFault = (scope: ConversationScope): boolean =>
    scope.kind === 'finding' || (scope.kind === 'inquiry' && scope.inquiryKind === 'startup');

// A hint before the fix, so that a reader sees the way to work it out first and being told beside it.
const FOLLOW_UP_ORDER: AskAiFollowUpId[] = [
    'GIVE_HINT',
    'SHOW_THE_FIX',
    'EXPLAIN_SIMPLY',
    'SHOW_RELEVANT_BLOCKS',
    'OBSERVE_BEHAVIOUR',
    'EXPLAIN_CONCEPT',
];

export const offeredFollowUps = (conversation: ConversationState): AskAiFollowUpId[] => {
    const last = conversation.messages[conversation.messages.length - 1];
    if (
        conversation.phase !== 'active' ||
        conversation.repliesRemaining === 0 ||
        last?.sender !== 'assistant'
    )
        return [];

    const userFollowUps = conversation.messages.flatMap((entry) =>
        entry.sender === 'user' && entry.followUp !== null ? [entry.followUp] : [],
    );
    const alreadyAsked = new Set(userFollowUps);

    const indexOfBlocks = userFollowUps.indexOf('SHOW_RELEVANT_BLOCKS');
    const simplyAskedAfterBlocks =
        indexOfBlocks >= 0 && userFollowUps.slice(indexOfBlocks + 1).includes('EXPLAIN_SIMPLY');

    // The server decides which follow-ups an answer offers; here only what the transcript already used is
    // left out, and the rest is ordered.
    const suggested = new Set(last.followUps);

    return [...suggested]
        .filter((followUp) => {
            if (followUp === 'GIVE_HINT') {
                return !alreadyAsked.has('GIVE_HINT') && !alreadyAsked.has('SHOW_THE_FIX');
            }
            if (followUp === 'SHOW_RELEVANT_BLOCKS') {
                return (
                    !alreadyAsked.has('SHOW_RELEVANT_BLOCKS') &&
                    !last.blocks.some((block) => block.kind === 'scratchblocks')
                );
            }
            if (followUp === 'EXPLAIN_SIMPLY') {
                if (indexOfBlocks >= 0) {
                    return !simplyAskedAfterBlocks;
                }
                return !alreadyAsked.has('EXPLAIN_SIMPLY');
            }
            return !alreadyAsked.has(followUp);
        })
        .sort((a, b) => FOLLOW_UP_ORDER.indexOf(a) - FOLLOW_UP_ORDER.indexOf(b));
};

const quotedCode = (block: Extract<AskAiBlock, { kind: 'scratchblocks' }>): string =>
    `${block.role}\n${block.code
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line !== '')
        .join('\n')}`;

const ASKS_FOR_BLOCKS: ReadonlySet<AskAiFollowUpId> = new Set<AskAiFollowUpId>([
    'SHOW_RELEVANT_BLOCKS',
    'GIVE_HINT',
    'SHOW_THE_FIX',
]);

export const shownBlocks = (messages: TranscriptEntry[], index: number): AskAiBlock[] => {
    const entry = messages[index];
    if (entry === undefined || entry.sender !== 'assistant') return [];
    const asked = messages[index - 1];
    const askedForBlocks =
        asked !== undefined &&
        asked.sender === 'user' &&
        asked.followUp !== null &&
        ASKS_FOR_BLOCKS.has(asked.followUp);
    const shownEarlier = new Set(
        askedForBlocks
            ? []
            : messages
                  .slice(0, index)
                  .flatMap((earlier) => (earlier.sender === 'assistant' ? earlier.blocks : []))
                  .flatMap((block) => (block.kind === 'scratchblocks' ? [quotedCode(block)] : [])),
    );

    const seenInThisEntry = new Set<string>();
    const distinct = entry.blocks.filter((block) => {
        if (block.kind !== 'scratchblocks') return true;
        const key = quotedCode(block);
        if (seenInThisEntry.has(key)) return false;
        seenInThisEntry.add(key);
        return true;
    });

    const remaining = distinct.filter(
        (block) => block.kind !== 'scratchblocks' || !shownEarlier.has(quotedCode(block)),
    );
    return remaining.length === 0 ? distinct : remaining;
};
