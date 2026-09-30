// SPDX-License-Identifier: EUPL-1.2
// SPDX-FileCopyrightText: 2026 LitterBox-Web contributors

import { useCallback, useEffect, useRef, useState } from 'react';
import {
    AskAiApiError,
    closeAskAiConversation,
    createAskAiConversation,
    fetchAskAiQuestions,
    isAskAiCancellation,
    sendAskAiMessage,
    type AskAiErrorCategory,
    type AskAiFollowUpId,
    type AskAiMessageRequest,
    type AskAiQuestions,
} from '../api/ask-ai';
import type { SupportedLocale } from '../api/capabilities';
import { newIdempotencyKey } from '../lib/project-submission';
import {
    askAiPageReducer,
    initialAskAiPageState,
    loadedQuestions,
    type AskAiAction,
    type AskAiPageState,
    type ConversationScope,
    type TranscriptUserEntry,
} from './ask-ai-machine';

export interface AskAiService {
    state: AskAiPageState;
    questions: AskAiQuestions | undefined;
    loadQuestions: () => void;
    openScope: (scope: ConversationScope) => void;
    sendFollowUp: (followUp: AskAiFollowUpId) => void;
    retryLastSend: () => void;
    leaveConversation: () => void;
}

export function useAskAiService({
    token,
    analysisId,
    locale,
}: {
    token: string;
    analysisId: number;
    locale: SupportedLocale;
}): AskAiService {
    const [state, setState] = useState(initialAskAiPageState);
    // Async callbacks read the latest state from this ref rather than their render's closure.
    const current = useRef(state);
    const questionsController = useRef<AbortController | undefined>(undefined);
    const conversationController = useRef<AbortController | undefined>(undefined);
    const disposed = useRef(false);

    useEffect(() => {
        disposed.current = false;
        return () => {
            disposed.current = true;
            questionsController.current?.abort();
            conversationController.current?.abort();
        };
    }, []);

    // Reduces synchronously so a second action in the same tick sees the first transition.
    const advance = useCallback((action: AskAiAction): boolean => {
        const previous = current.current;
        const next = askAiPageReducer(previous, action);
        if (next === previous) return false;
        current.current = next;
        setState(next);
        return true;
    }, []);

    const loadQuestions = useCallback(() => {
        questionsController.current?.abort();
        const controller = new AbortController();
        questionsController.current = controller;
        const requestId = current.current.questionsRequestId + 1;
        advance({ type: 'questions-requested', requestId });
        void fetchAskAiQuestions(token, analysisId, locale, controller.signal)
            .then((value) => {
                advance({
                    type: 'questions-settled',
                    requestId,
                    result: { status: 'loaded', value },
                });
            })
            .catch((error: unknown) => {
                if (isAskAiCancellation(error)) return;
                advance({
                    type: 'questions-settled',
                    requestId,
                    result: { status: 'failed', category: categoryOf(error) },
                });
            });
    }, [token, analysisId, locale, advance]);

    useEffect(() => {
        loadQuestions();
    }, [loadQuestions]);

    const performSend = useCallback(
        (conversationId: string, runId: number, request: AskAiMessageRequest) => {
            conversationController.current?.abort();
            const controller = new AbortController();
            conversationController.current = controller;
            void sendAskAiMessage(token, analysisId, conversationId, request, controller.signal)
                .then((message) => {
                    advance({
                        type: 'message-answered',
                        runId,
                        clientMessageId: request.clientMessageId,
                        entry: {
                            sender: 'assistant',
                            status: message.status,
                            blocks: message.blocks,
                            followUps: message.followUps,
                        },
                        repliesRemaining: message.repliesRemaining,
                    });
                })
                .catch((error: unknown) => {
                    if (isAskAiCancellation(error)) return;
                    advance({
                        type: 'message-failed',
                        runId,
                        clientMessageId: request.clientMessageId,
                        category: categoryOf(error),
                    });
                });
        },
        [token, analysisId, advance],
    );

    const startSend = useCallback(
        (conversationId: string, runId: number, request: AskAiMessageRequest) => {
            const sending = advance({
                type: 'message-sent',
                runId,
                clientMessageId: request.clientMessageId,
                entry:
                    request.action === 'FOLLOW_UP'
                        ? { sender: 'user', action: 'FOLLOW_UP', followUp: request.followUp }
                        : { sender: 'user', action: 'ASK', followUp: null },
            });
            if (sending) performSend(conversationId, runId, request);
        },
        [performSend, advance],
    );

    const releaseConversation = useCallback(
        (conversationId: string | undefined, unloading = false) => {
            if (!conversationId) return;
            void closeAskAiConversation(token, analysisId, conversationId, unloading).catch(
                () => undefined,
            );
        },
        [token, analysisId],
    );

    const openConversation = useCallback(
        (scope: ConversationScope, runId: number) => {
            conversationController.current?.abort();
            // Not aborted: the server may have opened the conversation by then, so one that is no longer
            // wanted when it arrives is closed instead, giving its slot back.
            void createAskAiConversation(token, analysisId, locale, {
                kind: scope.kind,
                selector: scope.selector,
            })
                .then((created) => {
                    const wanted =
                        !disposed.current &&
                        advance({
                            type: 'conversation-created',
                            runId,
                            conversationId: created.conversationId,
                            scope: {
                                ...scope,
                                // Common-question labels are localized client-side.
                                label:
                                    scope.kind === 'common' && scope.label
                                        ? scope.label
                                        : created.scope.label,
                            },
                            repliesRemaining: created.repliesRemaining,
                        });
                    if (!wanted) {
                        releaseConversation(created.conversationId);
                        return;
                    }
                    startSend(created.conversationId, runId, {
                        clientMessageId: newIdempotencyKey('ask-ai-message'),
                        action: 'ASK',
                    });
                })
                .catch((error: unknown) => {
                    advance({
                        type: 'conversation-create-failed',
                        runId,
                        category: categoryOf(error),
                    });
                });
        },
        [token, analysisId, locale, startSend, advance, releaseConversation],
    );

    const openScope = useCallback(
        (scope: ConversationScope) => {
            if (!advance({ type: 'select-scope', scope, locale })) return;
            openConversation(scope, current.current.runId);
        },
        [openConversation, locale, advance],
    );

    const sendFollowUp = useCallback(
        (followUp: AskAiFollowUpId) => {
            const { conversation, runId } = current.current;
            if (!conversation?.conversationId) return;
            startSend(conversation.conversationId, runId, {
                clientMessageId: newIdempotencyKey('ask-ai-message'),
                action: 'FOLLOW_UP',
                followUp,
            });
        },
        [startSend],
    );

    const retryLastSend = useCallback(() => {
        const conversation = current.current.conversation;
        if (!conversation) return;
        if (!conversation.conversationId) {
            openScope(conversation.scope);
            return;
        }
        if (!conversation.pendingClientMessageId) return;
        const lastUser = [...conversation.messages]
            .reverse()
            .find((entry): entry is TranscriptUserEntry => entry.sender === 'user');
        if (!lastUser) return;
        // Reuse the id so a lost response cannot spend a second reply — unless the server said the id is bound
        // to another message, in which case only a fresh one can ever be answered.
        const clientMessageId =
            conversation.errorCategory === 'idempotency_conflict'
                ? newIdempotencyKey('ask-ai-message')
                : conversation.pendingClientMessageId;
        const runId = current.current.runId;
        if (!advance({ type: 'message-retry', runId, clientMessageId })) return;
        const request: AskAiMessageRequest =
            lastUser.action === 'ASK'
                ? { clientMessageId, action: 'ASK' }
                : { clientMessageId, action: 'FOLLOW_UP', followUp: lastUser.followUp };
        performSend(conversation.conversationId, runId, request);
    }, [openScope, performSend, advance]);

    /** Best-effort close so navigation never waits on the service. */
    // Unmount cleanup does not run when the tab closes.
    useEffect(() => {
        const releaseOnUnload = (event: PageTransitionEvent) => {
            // A page entering the back-forward cache can still be restored.
            if (event.persisted) return;
            releaseConversation(current.current.conversation?.conversationId, true);
        };
        window.addEventListener('pagehide', releaseOnUnload);
        return () => {
            window.removeEventListener('pagehide', releaseOnUnload);
            releaseConversation(current.current.conversation?.conversationId);
        };
    }, [releaseConversation]);

    const leaveConversation = useCallback(() => {
        conversationController.current?.abort();
        // Close it promptly to release the server's open-conversation slot.
        releaseConversation(current.current.conversation?.conversationId);
        advance({ type: 'return-to-chooser' });
    }, [releaseConversation, advance]);

    const questions = loadedQuestions(state.questions);

    return {
        state,
        questions,
        loadQuestions,
        openScope,
        sendFollowUp,
        retryLastSend,
        leaveConversation,
    };
}

function categoryOf(error: unknown): AskAiErrorCategory {
    return error instanceof AskAiApiError ? error.category : 'failed';
}
