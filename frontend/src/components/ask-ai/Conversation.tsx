// SPDX-License-Identifier: EUPL-1.2
// SPDX-FileCopyrightText: 2026 LitterBox-Web contributors

import { useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { useTranslation } from 'react-i18next';
import type {
    AskAiBlock,
    AskAiErrorCategory,
    AskAiFinding,
    AskAiFollowUpId,
    AskAiMessageStatus,
    AskAiQuestions,
    AskAiTarget,
} from '../../api/ask-ai';
import type { TranslationKey } from '../../i18n/locales';
import type { ConversationState, TranscriptEntry } from '../../pages/ask-ai-machine';
import {
    aboutAFault as isAboutAFault,
    offeredFollowUps,
    outOfReplies,
    shownBlocks,
} from '../../pages/ask-ai-machine';
import { Alert } from '../Alert';
import { FamilyIcon } from '../single-project/FamilyIcon';
import { FAMILY_LABEL_KEYS } from '../single-project/issue-family';
import { RichHint } from '../single-project/RichHint';
import { ScratchblocksPreview } from '../single-project/ScratchblocksPreview';
import { spriteDisplayName } from '../single-project/sprite-name';
import { Thumbnail } from '../single-project/Thumbnail';
import { actorOf } from './finding-link';
import { MessageBlocks } from './MessageBlocks';
import { RepliesRemainingDots } from './RepliesRemainingDots';

const FOLLOW_UP_LABEL_KEYS: Record<AskAiFollowUpId, TranslationKey> = {
    EXPLAIN_SIMPLY: 'askAiFollowUpExplainSimply',
    SHOW_RELEVANT_BLOCKS: 'askAiFollowUpShowRelevantBlocks',
    GIVE_HINT: 'askAiFollowUpGiveHint',
    OBSERVE_BEHAVIOUR: 'askAiFollowUpObserveBehaviour',
    EXPLAIN_CONCEPT: 'askAiFollowUpExplainConcept',
    SHOW_THE_FIX: 'askAiFollowUpShowTheFix',
};

const followUpLabelKey = (followUp: AskAiFollowUpId, aboutAFault: boolean): TranslationKey =>
    followUp === 'SHOW_THE_FIX' && !aboutAFault
        ? 'askAiFollowUpShowTheChange'
        : FOLLOW_UP_LABEL_KEYS[followUp];

const STATUS_MESSAGE_KEYS: Partial<Record<AskAiMessageStatus, TranslationKey>> = {
    out_of_scope: 'askAiStatusOutOfScope',
    unsafe: 'askAiStatusUnsafe',
    cannot_answer: 'askAiStatusCannotAnswer',
};

const ERROR_MESSAGE_KEYS: Record<AskAiErrorCategory, TranslationKey> = {
    network_denied: 'askAiErrorNetworkDenied',
    context_not_found: 'askAiErrorContextNotFound',
    quota_exhausted: 'askAiQuotaExhausted',
    attempts_exhausted: 'askAiAttemptsExhausted',
    capacity_exhausted: 'askAiErrorCapacityExhausted',
    provider_unavailable: 'askAiErrorProviderUnavailable',
    timeout: 'askAiErrorTimeout',
    invalid_model_response: 'askAiErrorInvalidModelResponse',
    idempotency_conflict: 'askAiErrorIdempotencyConflict',
    turn_in_progress: 'askAiErrorTurnInProgress',
    unavailable: 'askAiErrorUnavailable',
    malformed_response: 'askAiErrorUnavailable',
    failed: 'askAiErrorFailed',
    canceled: 'askAiErrorFailed',
};

/**
 * The failures a resend cannot mend: the model's answer was refused, or the server's could not be read, and sent
 * again the same message is answered the same way. Another question is the way on.
 */
const TERMINAL_CATEGORIES: ReadonlySet<AskAiErrorCategory | undefined> = new Set([
    'invalid_model_response',
    'malformed_response',
]);

/** Why the conversation can be given no more: it has spent its replies, or too many tries at one went wrong. */
const spentMessageKey = (conversation: ConversationState): TranslationKey => {
    if (conversation.phase === 'conversation-limit') return 'askAiConversationLimitReached';
    return conversation.errorCategory === 'attempts_exhausted'
        ? 'askAiAttemptsExhausted'
        : 'askAiQuotaExhausted';
};

const FOLLOW_UPS_VISIBLE = 3;

const FOLLOW_UPS_LEAD_ID = 'ask-ai-follow-ups-lead';

function FollowUpButtons({
    followUps,
    aboutAFault,
    onSelect,
}: {
    followUps: AskAiFollowUpId[];
    aboutAFault: boolean;
    onSelect: (followUp: AskAiFollowUpId) => void;
}) {
    const { t } = useTranslation();
    const [expanded, setExpanded] = useState(false);
    const firstRevealedRef = useRef<HTMLButtonElement>(null);
    const toggleRef = useRef<HTMLButtonElement>(null);
    const toggled = useRef(false);
    useEffect(() => {
        if (!toggled.current) return;
        // Return focus to the newly revealed controls or the toggle.
        (expanded ? firstRevealedRef : toggleRef).current?.focus();
    }, [expanded]);
    const visible = expanded ? followUps : followUps.slice(0, FOLLOW_UPS_VISIBLE);
    const expandable = followUps.length > FOLLOW_UPS_VISIBLE;
    return (
        <div className="ask-ai-follow-ups">
            <p className="ask-ai-follow-ups-lead" id={FOLLOW_UPS_LEAD_ID}>
                {t('askAiFollowUpsLabel')}
            </p>
            <div
                className="ask-ai-follow-up-buttons"
                role="group"
                aria-labelledby={FOLLOW_UPS_LEAD_ID}
            >
                {visible.map((followUp, index) => (
                    <button
                        key={followUp}
                        type="button"
                        className="ask-ai-follow-up-button"
                        ref={index === FOLLOW_UPS_VISIBLE ? firstRevealedRef : undefined}
                        onClick={() => onSelect(followUp)}
                    >
                        {t(followUpLabelKey(followUp, aboutAFault))}
                    </button>
                ))}
                {expandable && (
                    <button
                        type="button"
                        className="ask-ai-follow-ups-more"
                        ref={toggleRef}
                        aria-expanded={expanded}
                        onClick={() => {
                            toggled.current = true;
                            setExpanded((wasExpanded) => !wasExpanded);
                        }}
                    >
                        {t(expanded ? 'askAiFewerFollowUps' : 'askAiMoreFollowUps')}
                    </button>
                )}
            </div>
        </div>
    );
}

function FindingContextCard({
    finding,
    target,
    actor,
    scopeLabel,
    locale,
}: {
    finding?: AskAiFinding;
    target?: AskAiTarget;
    actor?: AskAiTarget;
    scopeLabel: string;
    locale: string;
}) {
    const { t } = useTranslation();
    const family = finding?.family;
    const spriteName = actor?.label;
    const spriteThumbnail = actor?.thumbnail;
    const scriptCode = finding?.scratchblocks || target?.scratchblocks;

    return (
        <section className="ask-ai-finding-context card" aria-label={t('askAiFindingContextLabel')}>
            <div className="ask-ai-finding-context-header">
                {family && (
                    <span className={`issue-type issue-type-${family}`}>
                        <FamilyIcon family={family} />
                        {t(FAMILY_LABEL_KEYS[family])}
                    </span>
                )}
                {spriteName && (
                    <span className="ask-ai-finding-sprite">
                        {spriteThumbnail && (
                            <span aria-hidden="true">
                                <Thumbnail
                                    sprite={spriteName}
                                    thumbnailRef={spriteThumbnail}
                                    label={spriteDisplayName(spriteName, t('stageName'))}
                                    fallbackLabel={t('fallbackPreview')}
                                />
                            </span>
                        )}
                        <span className="ask-ai-finding-sprite-name">
                            {spriteDisplayName(spriteName, t('stageName'))}
                        </span>
                    </span>
                )}
            </div>
            <div className="ask-ai-finding-context-hint">
                <RichHint
                    value={scopeLabel}
                    locale={locale}
                    scratchblocksLabel={t('scratchblocks')}
                    textAlternativeLabel={t('textAlternative')}
                />
            </div>
            {scriptCode && scriptCode.trim().length > 0 && (
                <div className="ask-ai-finding-context-code">
                    <ScratchblocksPreview
                        source={scriptCode}
                        locale={locale}
                        label={t('scratchblocks')}
                        textAlternativeLabel={t('textAlternative')}
                        showLabel={false}
                    />
                </div>
            )}
        </section>
    );
}

function TranscriptRow({
    entry,
    blocks,
    scopeLabel,
    isFinding,
    aboutAFault,
    locale,
    focusRef,
}: {
    entry: TranscriptEntry;
    blocks: AskAiBlock[];
    scopeLabel: string;
    isFinding?: boolean;
    aboutAFault?: boolean;
    locale: string;
    focusRef?: RefObject<HTMLDivElement | null>;
}) {
    const { t } = useTranslation();
    if (entry.sender === 'user') {
        return (
            <div
                className="ask-ai-transcript-row ask-ai-transcript-user"
                ref={focusRef}
                tabIndex={focusRef ? -1 : undefined}
            >
                <p className="ask-ai-transcript-question">
                    {entry.action === 'ASK' ? (
                        isFinding ? (
                            t('askAiFindingQuestion')
                        ) : (
                            <RichHint
                                value={scopeLabel}
                                locale={locale}
                                scratchblocksLabel={t('scratchblocks')}
                                textAlternativeLabel={t('textAlternative')}
                            />
                        )
                    ) : (
                        t(followUpLabelKey(entry.followUp, aboutAFault === true))
                    )}
                </p>
            </div>
        );
    }
    const statusKey = STATUS_MESSAGE_KEYS[entry.status];
    return (
        <div
            className="ask-ai-transcript-row ask-ai-transcript-assistant"
            ref={focusRef}
            tabIndex={focusRef ? -1 : undefined}
        >
            {statusKey ? (
                <p className="ask-ai-transcript-status">{t(statusKey)}</p>
            ) : (
                <MessageBlocks blocks={blocks} locale={locale} />
            )}
        </div>
    );
}

export function Conversation({
    conversation,
    questions,
    locale,
    onFollowUp,
    onRetry,
    onChangeScope,
}: {
    conversation: ConversationState;
    questions?: AskAiQuestions;
    locale: string;
    onFollowUp: (followUp: AskAiFollowUpId) => void;
    onRetry: () => void;
    onChangeScope: () => void;
}) {
    const { t } = useTranslation();
    const followUps = offeredFollowUps(conversation);
    const spent = outOfReplies(conversation);
    const canRetry = !TERMINAL_CATEGORIES.has(conversation.errorCategory);
    const thinkingRef = useRef<HTMLParagraphElement>(null);
    const lastRowRef = useRef<HTMLDivElement>(null);
    const errorActionRef = useRef<HTMLButtonElement>(null);
    const shouldMoveFocus = useRef(false);

    const handOverFocus = () => {
        shouldMoveFocus.current = true;
    };

    useEffect(() => {
        if (!shouldMoveFocus.current) return;
        if (conversation.phase === 'thinking') {
            thinkingRef.current?.focus();
            return;
        }
        shouldMoveFocus.current = false;
        (conversation.phase === 'error' ? errorActionRef.current : lastRowRef.current)?.focus();
    }, [conversation.phase, conversation.messages.length]);

    const isFinding = conversation.scope.kind === 'finding';
    const aboutAFault = isAboutAFault(conversation.scope);
    const { finding, target, actor } = useMemo(() => {
        const found =
            isFinding && questions
                ? questions.findings.find((f) => f.selector === conversation.scope.selector)
                : undefined;
        return {
            finding: found,
            target: found ? questions?.targets.find((t) => t.key === found.target) : undefined,
            actor: found && questions ? actorOf(questions, found) : undefined,
        };
    }, [isFinding, questions, conversation.scope.selector]);

    return (
        <div className="ask-ai-conversation">
            {conversation.repliesBudget !== undefined &&
                conversation.repliesRemaining !== undefined && (
                    <RepliesRemainingDots
                        remaining={conversation.repliesRemaining}
                        budget={conversation.repliesBudget}
                        label={t('askAiRepliesLeftOfBudget', {
                            remaining: conversation.repliesRemaining,
                            budget: conversation.repliesBudget,
                        })}
                    />
                )}

            {/* The conversation language is fixed at creation, even if the page language changes. */}
            {conversation.askedIn !== undefined && conversation.askedIn !== locale && (
                <p className="ask-ai-language-note" role="status">
                    {t('askAiConversationLanguageFixed')}
                </p>
            )}

            {isFinding && (
                <FindingContextCard
                    finding={finding}
                    target={target}
                    actor={actor}
                    scopeLabel={conversation.scope.label}
                    locale={locale}
                />
            )}

            <div className="ask-ai-transcript">
                {conversation.messages.length === 0 && conversation.phase === 'creating' && (
                    <p role="status" className="ask-ai-thinking">
                        {t('askAiOpeningConversation')}
                    </p>
                )}
                {/* Keep the transcript log separate from the status live regions to avoid duplicate announcements. */}
                <div
                    className="ask-ai-transcript-rows"
                    role="log"
                    aria-live="polite"
                    aria-relevant="additions"
                    aria-label={t('askAiTranscriptLabel')}
                >
                    {conversation.messages.map((entry, index) => (
                        <TranscriptRow
                            key={index}
                            entry={entry}
                            blocks={shownBlocks(conversation.messages, index)}
                            scopeLabel={conversation.scope.label}
                            isFinding={isFinding}
                            aboutAFault={aboutAFault}
                            locale={locale}
                            focusRef={
                                index === conversation.messages.length - 1 ? lastRowRef : undefined
                            }
                        />
                    ))}
                </div>
                {conversation.phase === 'thinking' && (
                    <p role="status" className="ask-ai-thinking" ref={thinkingRef} tabIndex={-1}>
                        <span className="ask-ai-thinking-indicator" aria-hidden="true" />
                        {t('askAiThinking')}
                    </p>
                )}
            </div>

            {conversation.phase === 'error' && conversation.errorCategory && (
                <Alert tone="error">
                    <p>{t(ERROR_MESSAGE_KEYS[conversation.errorCategory])}</p>
                    <button
                        type="button"
                        ref={errorActionRef}
                        onClick={() => {
                            if (!canRetry) {
                                onChangeScope();
                            } else {
                                handOverFocus();
                                onRetry();
                            }
                        }}
                    >
                        {t(canRetry ? 'retry' : 'askAiChooseAnotherQuestion')}
                    </button>
                </Alert>
            )}

            {(spent || conversation.phase === 'conversation-limit') && (
                <Alert tone="info" role="status">
                    <p>{t(spentMessageKey(conversation))}</p>
                    <button type="button" onClick={onChangeScope}>
                        {t('askAiChooseAnotherQuestion')}
                    </button>
                </Alert>
            )}

            {followUps.length > 0 && (
                <FollowUpButtons
                    followUps={followUps}
                    aboutAFault={aboutAFault}
                    onSelect={(followUp) => {
                        handOverFocus();
                        onFollowUp(followUp);
                    }}
                />
            )}
        </div>
    );
}
