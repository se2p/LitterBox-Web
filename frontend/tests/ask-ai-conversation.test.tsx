// SPDX-License-Identifier: EUPL-1.2
// SPDX-FileCopyrightText: 2026 LitterBox-Web contributors

import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import i18n from '../src/i18n';
import { Conversation } from '../src/components/ask-ai/Conversation';
import type { AskAiFollowUpId, AskAiQuestions } from '../src/api/ask-ai';
import type { ConversationState, TranscriptAssistantEntry } from '../src/pages/ask-ai-machine';

const baseScope = {
    kind: 'inquiry' as const,
    selector: 'inquiry:v1-a',
    label: 'What happens on click?',
    inquiryKind: 'other',
};

const assistantAnswer = (followUps: AskAiFollowUpId[]): TranscriptAssistantEntry => ({
    sender: 'assistant',
    status: 'answer',
    blocks: [
        { kind: 'text', text: 'The sprite moves ten steps.' },
        { kind: 'scratchblocks', role: 'existing', code: 'move (10) steps' },
    ],
    followUps,
});

const assistantTextAnswer = (followUps: AskAiFollowUpId[]): TranscriptAssistantEntry => ({
    ...assistantAnswer(followUps),
    blocks: [{ kind: 'text', text: 'The sprite moves ten steps.' }],
});

const activeConversation = (overrides: Partial<ConversationState> = {}): ConversationState => ({
    phase: 'active',
    scope: baseScope,
    conversationId: 'conv-1',
    repliesRemaining: 6,
    repliesBudget: 8,
    messages: [
        { sender: 'user', action: 'ASK', followUp: null },
        assistantAnswer(['EXPLAIN_SIMPLY', 'SHOW_RELEVANT_BLOCKS', 'OBSERVE_BEHAVIOUR']),
    ],
    ...overrides,
});

const noop = () => undefined;

const dotRow = (container: HTMLElement): HTMLElement => {
    const row = container.querySelector<HTMLElement>('.ask-ai-reply-dots');
    if (!row) throw new Error('no reply-budget marks rendered');
    return row;
};

describe('the Ask AI conversation view', () => {
    beforeEach(async () => {
        await i18n.changeLanguage('en');
    });

    it('leaves the heading and the way out to the trail above it', () => {
        render(
            <Conversation
                conversation={activeConversation()}
                locale="en"
                onFollowUp={noop}
                onRetry={noop}
                onChangeScope={noop}
            />,
        );
        expect(screen.getAllByText('What happens on click?')).toHaveLength(1);
        expect(screen.queryByRole('button', { name: 'Choose another question' })).toBeNull();
    });

    it('renders text and scratchblocks blocks, and prints nothing of what the answer cites', () => {
        render(
            <Conversation
                conversation={activeConversation()}
                locale="en"
                onFollowUp={noop}
                onRetry={noop}
                onChangeScope={noop}
            />,
        );
        expect(screen.getByText('The sprite moves ten steps.')).toBeInTheDocument();
        expect(screen.getByText('From your project')).toBeInTheDocument();
        expect(screen.queryByText(/^About:/)).toBeNull();
        expect(screen.queryByText('Cat')).toBeNull();
    });

    it('shows the script once, however many times it is answered about', () => {
        const simpler: TranscriptAssistantEntry = {
            sender: 'assistant',
            status: 'answer',
            blocks: [
                { kind: 'text', text: 'It walks a little bit.' },
                { kind: 'scratchblocks', role: 'existing', code: 'move (10) steps' },
            ],
            followUps: [],
        };
        render(
            <Conversation
                conversation={activeConversation({
                    messages: [
                        { sender: 'user', action: 'ASK', followUp: null },
                        assistantAnswer(['EXPLAIN_SIMPLY']),
                        { sender: 'user', action: 'FOLLOW_UP', followUp: 'EXPLAIN_SIMPLY' },
                        simpler,
                    ],
                })}
                locale="en"
                onFollowUp={noop}
                onRetry={noop}
                onChangeScope={noop}
            />,
        );
        expect(screen.getByText('The sprite moves ten steps.')).toBeInTheDocument();
        expect(screen.getByText('It walks a little bit.')).toBeInTheDocument();
        expect(screen.getAllByText('From your project')).toHaveLength(1);
    });

    it('prints how much of the reply budget is left rather than leaving it to the colour of the marks', () => {
        const { container } = render(
            <Conversation
                conversation={activeConversation({ repliesRemaining: 3, repliesBudget: 8 })}
                locale="en"
                onFollowUp={noop}
                onRetry={noop}
                onChangeScope={noop}
            />,
        );
        expect(screen.getByText('3 of 8 replies left')).toBeInTheDocument();
        const row = dotRow(container);
        expect(row.querySelectorAll('.ask-ai-reply-dot')).toHaveLength(8);
        expect(row.querySelectorAll('.ask-ai-reply-dot-left')).toHaveLength(3);
        expect(screen.queryByRole('img')).toBeNull();
        expect(row.closest('[aria-hidden="true"]')).not.toBeNull();
    });

    it('keeps the count in words while the end of a large budget is still out of sight', () => {
        const { container } = render(
            <Conversation
                conversation={activeConversation({ repliesRemaining: 96, repliesBudget: 200 })}
                locale="en"
                onFollowUp={noop}
                onRetry={noop}
                onChangeScope={noop}
            />,
        );
        expect(container.querySelector('.ask-ai-reply-dots')).toBeNull();
        expect(screen.getByText('96 of 200 replies left')).toBeInTheDocument();
    });

    it('starts emptying the row once the end of a large budget is in sight', () => {
        const { container } = render(
            <Conversation
                conversation={activeConversation({ repliesRemaining: 4, repliesBudget: 200 })}
                locale="en"
                onFollowUp={noop}
                onRetry={noop}
                onChangeScope={noop}
            />,
        );
        const row = dotRow(container);
        expect(row.querySelectorAll('.ask-ai-reply-dot')).toHaveLength(10);
        expect(row.querySelectorAll('.ask-ai-reply-dot-left')).toHaveLength(4);
    });

    it('shows at most three follow-ups before offering the rest behind "Show more"', async () => {
        const onFollowUp = vi.fn();
        const user = userEvent.setup();
        render(
            <Conversation
                conversation={activeConversation({
                    messages: [
                        { sender: 'user', action: 'ASK', followUp: null },
                        assistantTextAnswer([
                            'EXPLAIN_SIMPLY',
                            'SHOW_RELEVANT_BLOCKS',
                            'EXPLAIN_CONCEPT',
                            'OBSERVE_BEHAVIOUR',
                        ]),
                    ],
                })}
                locale="en"
                onFollowUp={onFollowUp}
                onRetry={noop}
                onChangeScope={noop}
            />,
        );
        expect(
            screen.getByRole('button', { name: 'Can you explain that more simply?' }),
        ).toBeInTheDocument();
        expect(
            screen.getByRole('button', { name: 'Which blocks are used for this?' }),
        ).toBeInTheDocument();
        expect(
            screen.getByRole('button', { name: 'What should I look out for when testing it?' }),
        ).toBeInTheDocument();
        expect(
            screen.queryByRole('button', { name: 'Why does it work that way?' }),
        ).not.toBeInTheDocument();
        await user.click(screen.getByRole('button', { name: 'Show more' }));
        const concept = screen.getByRole('button', { name: 'Why does it work that way?' });
        await user.click(concept);
        expect(onFollowUp).toHaveBeenCalledWith('EXPLAIN_CONCEPT');
    });

    it('moves focus onto the first follow-up that revealing the rest brought into view', async () => {
        const user = userEvent.setup();
        render(
            <Conversation
                conversation={activeConversation({
                    messages: [
                        { sender: 'user', action: 'ASK', followUp: null },
                        assistantTextAnswer([
                            'EXPLAIN_SIMPLY',
                            'SHOW_RELEVANT_BLOCKS',
                            'EXPLAIN_CONCEPT',
                            'OBSERVE_BEHAVIOUR',
                        ]),
                    ],
                })}
                locale="en"
                onFollowUp={noop}
                onRetry={noop}
                onChangeScope={noop}
            />,
        );
        await user.click(screen.getByRole('button', { name: 'Show more' }));
        expect(screen.getByRole('button', { name: 'Why does it work that way?' })).toHaveFocus();
    });

    it('turns the way of revealing the rest into a toggle that stays where it was pressed', async () => {
        const user = userEvent.setup();
        render(
            <Conversation
                conversation={activeConversation({
                    messages: [
                        { sender: 'user', action: 'ASK', followUp: null },
                        assistantTextAnswer([
                            'EXPLAIN_SIMPLY',
                            'SHOW_RELEVANT_BLOCKS',
                            'EXPLAIN_CONCEPT',
                            'OBSERVE_BEHAVIOUR',
                        ]),
                    ],
                })}
                locale="en"
                onFollowUp={noop}
                onRetry={noop}
                onChangeScope={noop}
            />,
        );
        const more = screen.getByRole('button', { name: 'Show more' });
        expect(more).toHaveAttribute('aria-expanded', 'false');
        await user.click(more);

        const fewer = screen.getByRole('button', { name: 'Show fewer' });
        expect(fewer).toHaveAttribute('aria-expanded', 'true');
        await user.click(fewer);
        expect(
            screen.queryByRole('button', {
                name: 'What to look for when the project runs',
            }),
        ).toBeNull();
        // Keep keyboard focus on the toggle after collapsing.
        expect(screen.getByRole('button', { name: 'Show more' })).toHaveFocus();
    });

    it('says on the page what the row of follow-ups is', () => {
        render(
            <Conversation
                conversation={activeConversation()}
                locale="en"
                onFollowUp={noop}
                onRetry={noop}
                onChangeScope={noop}
            />,
        );
        expect(screen.getByText('Ask more about this')).toBeInTheDocument();
        expect(screen.getByRole('group', { name: 'Ask more about this' })).toBeInTheDocument();
    });

    it('offers the fix wording, not the change wording, for the startup inquiry', () => {
        const startupScope = {
            kind: 'inquiry' as const,
            selector: 'inquiry:v1-startup',
            label: 'Why does nothing happen when I click the green flag?',
            inquiryKind: 'startup',
        };
        render(
            <Conversation
                conversation={activeConversation({
                    scope: startupScope,
                    messages: [
                        { sender: 'user', action: 'ASK', followUp: null },
                        assistantAnswer(['GIVE_HINT']),
                        { sender: 'user', action: 'FOLLOW_UP', followUp: 'GIVE_HINT' },
                        assistantAnswer(['SHOW_THE_FIX']),
                    ],
                })}
                locale="en"
                onFollowUp={noop}
                onRetry={noop}
                onChangeScope={noop}
            />,
        );
        expect(
            screen.getByRole('button', { name: 'Can you show me how to fix it?' }),
        ).toBeInTheDocument();
        expect(
            screen.queryByRole('button', { name: 'Can you show me how to do that?' }),
        ).toBeNull();
    });

    it('announces an answer that arrives by keeping the transcript itself a live region', () => {
        const { rerender } = render(
            <Conversation
                conversation={activeConversation({
                    phase: 'thinking',
                    messages: [{ sender: 'user', action: 'ASK', followUp: null }],
                    pendingClientMessageId: 'pending-1',
                })}
                locale="en"
                onFollowUp={noop}
                onRetry={noop}
                onChangeScope={noop}
            />,
        );
        const log = screen.getByRole('log', { name: 'What you asked, and what came back' });
        expect(log).toHaveAttribute('aria-live', 'polite');
        // Announce only new transcript entries.
        expect(log).toHaveAttribute('aria-relevant', 'additions');
        // Keep the status live region outside the transcript log.
        expect(within(log).queryByRole('status')).toBeNull();
        expect(within(log).queryByText('The AI helper is thinking…')).toBeNull();

        rerender(
            <Conversation
                conversation={activeConversation()}
                locale="en"
                onFollowUp={noop}
                onRetry={noop}
                onChangeScope={noop}
            />,
        );
        expect(
            within(screen.getByRole('log')).getByText('The sprite moves ten steps.'),
        ).toBeInTheDocument();
    });

    it('shows the thinking indicator while the asked question stays visible', () => {
        render(
            <Conversation
                conversation={activeConversation({
                    phase: 'thinking',
                    messages: [{ sender: 'user', action: 'ASK', followUp: null }],
                    pendingClientMessageId: 'pending-1',
                })}
                locale="en"
                onFollowUp={noop}
                onRetry={noop}
                onChangeScope={noop}
            />,
        );
        expect(screen.getAllByText('What happens on click?').length).toBeGreaterThan(0);
        expect(screen.getByRole('status')).toHaveTextContent('The AI helper is thinking…');
    });

    it('offers a one-tap retry on an error, and shows neutral copy without a retry once quota is spent', async () => {
        const onRetry = vi.fn();
        const user = userEvent.setup();
        const { rerender } = render(
            <Conversation
                conversation={activeConversation({
                    phase: 'error',
                    errorCategory: 'provider_unavailable',
                    pendingClientMessageId: 'pending-1',
                    messages: [{ sender: 'user', action: 'ASK', followUp: null }],
                })}
                locale="en"
                onFollowUp={noop}
                onRetry={onRetry}
                onChangeScope={noop}
            />,
        );
        expect(screen.getByText('The AI helper is unavailable right now.')).toBeInTheDocument();
        await user.click(screen.getByRole('button', { name: 'Retry' }));
        expect(onRetry).toHaveBeenCalledTimes(1);
        expect(screen.getAllByText('What happens on click?').length).toBeGreaterThan(0);

        rerender(
            <Conversation
                conversation={activeConversation({
                    phase: 'quota-exhausted',
                    messages: [{ sender: 'user', action: 'ASK', followUp: null }],
                })}
                locale="en"
                onFollowUp={noop}
                onRetry={onRetry}
                onChangeScope={noop}
            />,
        );
        expect(
            screen.getByText(/This conversation has used up the replies it had/),
        ).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'Retry' })).not.toBeInTheDocument();
        expect(screen.getAllByText('What happens on click?').length).toBeGreaterThan(0);
    });

    it('does not call the replies spent when it is the attempts that are', () => {
        render(
            <Conversation
                conversation={activeConversation({
                    phase: 'quota-exhausted',
                    errorCategory: 'attempts_exhausted',
                    repliesRemaining: 8,
                    repliesBudget: 8,
                    messages: [{ sender: 'user', action: 'ASK', followUp: null }],
                })}
                locale="en"
                onFollowUp={noop}
                onRetry={noop}
                onChangeScope={noop}
            />,
        );
        expect(screen.getByText(/Too many tries at an answer went wrong/)).toBeInTheDocument();
        expect(screen.queryByText(/used up the replies/)).toBeNull();
        expect(screen.queryByRole('button', { name: 'Retry' })).not.toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Choose another question' })).toBeInTheDocument();
    });

    it.each(['invalid_model_response', 'malformed_response'] as const)(
        'offers another question instead of resending what is answered the same way again (%s)',
        async (errorCategory) => {
            const onRetry = vi.fn();
            const onChangeScope = vi.fn();
            const user = userEvent.setup();
            render(
                <Conversation
                    conversation={activeConversation({
                        phase: 'error',
                        errorCategory,
                        pendingClientMessageId: 'pending-1',
                    })}
                    locale="en"
                    onFollowUp={noop}
                    onRetry={onRetry}
                    onChangeScope={onChangeScope}
                />,
            );

            expect(screen.queryByRole('button', { name: 'Retry' })).not.toBeInTheDocument();
            await user.click(screen.getByRole('button', { name: 'Choose another question' }));
            expect(onChangeScope).toHaveBeenCalledTimes(1);
            expect(onRetry).not.toHaveBeenCalled();
        },
    );

    it('tells the two limits apart and offers a way on from either', async () => {
        const user = userEvent.setup();
        const onChangeScope = vi.fn();
        const { rerender } = render(
            <Conversation
                conversation={activeConversation({ phase: 'quota-exhausted' })}
                locale="en"
                onFollowUp={noop}
                onRetry={noop}
                onChangeScope={onChangeScope}
            />,
        );
        expect(screen.getByText(/Picking another question starts a new one/)).toBeInTheDocument();
        await user.click(
            within(screen.getByRole('status')).getByRole('button', {
                name: 'Choose another question',
            }),
        );
        expect(onChangeScope).toHaveBeenCalledTimes(1);

        rerender(
            <Conversation
                conversation={activeConversation({ phase: 'conversation-limit' })}
                locale="en"
                onFollowUp={noop}
                onRetry={noop}
                onChangeScope={onChangeScope}
            />,
        );
        expect(
            screen.getByText(/Too many conversations about this project are open/),
        ).toBeInTheDocument();
        expect(screen.queryByText(/used up the replies/)).toBeNull();
    });

    it('explains when the final successful reply exhausted the conversation', () => {
        render(
            <Conversation
                conversation={activeConversation({ repliesRemaining: 0, repliesBudget: 8 })}
                locale="en"
                onFollowUp={noop}
                onRetry={noop}
                onChangeScope={noop}
            />,
        );

        expect(
            screen.getByText(/This conversation has used up the replies it had/),
        ).toBeInTheDocument();
        expect(
            within(screen.getByRole('status')).getByRole('button', {
                name: 'Choose another question',
            }),
        ).toBeInTheDocument();
        expect(
            screen.queryByRole('button', { name: 'Can you explain that more simply?' }),
        ).toBeNull();
    });

    it('rejects unsafe finding thumbnails', () => {
        const questions: AskAiQuestions = {
            schemaVersion: 1,
            inquiries: [],
            truncated: false,
            previewsTruncated: false,
            findings: [
                {
                    selector: 'finding:v1-empty-loop',
                    label: 'In sprite Cat: this loop is empty.',
                    family: 'bug',
                    target: 'target-cat',
                    finder: 'EmptyLoopFinder',
                    scratchblocks: '',
                },
            ],
            targets: [
                {
                    key: 'target-cat',
                    kind: 'sprite',
                    label: 'Cat',
                    parent: '',
                    scratchblocks: '',
                    thumbnail: 'data:image/svg+xml;base64,mock-svg',
                    intents: [],
                },
            ],
        };

        const { container } = render(
            <Conversation
                conversation={activeConversation({
                    scope: {
                        kind: 'finding',
                        selector: 'finding:v1-empty-loop',
                        label: 'In sprite Cat: this loop is empty.',
                    },
                })}
                questions={questions}
                locale="en"
                onFollowUp={noop}
                onRetry={noop}
                onChangeScope={noop}
            />,
        );
        expect(container.querySelector('img')).toBeNull();
        expect(screen.getByText('Cat')).toBeInTheDocument();
    });

    it('moves focus from a follow-up button to progress and then the answer', async () => {
        const user = userEvent.setup();
        const { rerender } = render(
            <Conversation
                conversation={activeConversation()}
                locale="en"
                onFollowUp={noop}
                onRetry={noop}
                onChangeScope={noop}
            />,
        );
        await user.click(screen.getByRole('button', { name: 'Can you explain that more simply?' }));

        const thinking = activeConversation({
            phase: 'thinking',
            pendingClientMessageId: 'pending-1',
            messages: [
                { sender: 'user', action: 'ASK', followUp: null },
                assistantAnswer(['EXPLAIN_SIMPLY']),
                { sender: 'user', action: 'FOLLOW_UP', followUp: 'EXPLAIN_SIMPLY' },
            ],
        });
        rerender(
            <Conversation
                conversation={thinking}
                locale="en"
                onFollowUp={noop}
                onRetry={noop}
                onChangeScope={noop}
            />,
        );
        expect(screen.getByRole('status')).toHaveFocus();

        rerender(
            <Conversation
                conversation={activeConversation({
                    messages: [
                        ...thinking.messages,
                        {
                            sender: 'assistant',
                            status: 'answer',
                            blocks: [{ kind: 'text', text: 'It walks a little bit.' }],
                            followUps: [],
                        },
                    ],
                })}
                locale="en"
                onFollowUp={noop}
                onRetry={noop}
                onChangeScope={noop}
            />,
        );
        expect(document.activeElement).toHaveTextContent('It walks a little bit.');
    });

    it('renders the finding context card with sprite thumbnail, family badge, and scratchblocks preview', () => {
        const findingScope = {
            kind: 'finding' as const,
            selector: 'finding:v1-empty-loop',
            label: 'In sprite Cat: this loop is empty.',
        };
        const mockQuestions: AskAiQuestions = {
            schemaVersion: 1,
            inquiries: [],
            truncated: false,
            previewsTruncated: false,
            findings: [
                {
                    selector: 'finding:v1-empty-loop',
                    label: 'In sprite Cat: this loop is empty.',
                    family: 'bug',
                    target: 'target-script-1',
                    finder: 'EmptyLoopFinder',
                    scratchblocks: 'when green flag clicked\nrepeat (10) :: #ff0000\nend',
                },
            ],
            targets: [
                {
                    key: 'target-cat',
                    kind: 'sprite',
                    label: 'Cat',
                    parent: '',
                    scratchblocks: '',
                    thumbnail: 'data:image/svg+xml;base64,mock-svg',
                    intents: [],
                },
                {
                    key: 'target-script-1',
                    kind: 'script',
                    label: 'when green flag clicked',
                    parent: 'target-cat',
                    scratchblocks: 'when gf clicked\nrepeat (10) {\n}',
                    thumbnail: null,
                    intents: [],
                },
            ],
        };

        render(
            <Conversation
                conversation={activeConversation({ scope: findingScope })}
                questions={mockQuestions}
                locale="en"
                onFollowUp={noop}
                onRetry={noop}
                onChangeScope={noop}
            />,
        );

        expect(
            screen.getByRole('region', { name: 'What LitterBox noticed, and the code' }),
        ).toBeInTheDocument();
        expect(screen.getByText('Bugs')).toBeInTheDocument();
        expect(screen.getByText('Cat')).toBeInTheDocument();
        expect(screen.getByText(/repeat \(10\)/)).toBeInTheDocument();
        expect(screen.getByText(/#ff0000/)).toBeInTheDocument();
        expect(screen.queryByText(/when gf clicked/)).toBeNull();
        expect(screen.getByText('What did LitterBox notice here?')).toBeInTheDocument();
    });

    it('falls back to the plain script for a finding with no block to mark', () => {
        const findingScope = {
            kind: 'finding' as const,
            selector: 'finding:v1-naming',
            label: 'In sprite Cat: this sprite still has its default name.',
        };
        const questions: AskAiQuestions = {
            schemaVersion: 1,
            inquiries: [],
            truncated: false,
            previewsTruncated: false,
            findings: [
                {
                    selector: 'finding:v1-naming',
                    label: 'In sprite Cat: this sprite still has its default name.',
                    family: 'smell',
                    target: 'target-script-1',
                    finder: 'SpriteNaming',
                    scratchblocks: '',
                },
            ],
            targets: [
                {
                    key: 'target-script-1',
                    kind: 'script',
                    label: 'when green flag clicked',
                    parent: '',
                    scratchblocks: 'when gf clicked\nmove (10) steps',
                    thumbnail: null,
                    intents: [],
                },
            ],
        };

        render(
            <Conversation
                conversation={activeConversation({ scope: findingScope })}
                questions={questions}
                locale="en"
                onFollowUp={noop}
                onRetry={noop}
                onChangeScope={noop}
            />,
        );

        expect(screen.getAllByText(/move \(10\) steps/).length).toBeGreaterThan(0);
    });
});
