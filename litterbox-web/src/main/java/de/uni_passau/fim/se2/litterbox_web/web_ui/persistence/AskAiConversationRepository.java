/*
 * Copyright (C) 2024-2026 LitterBox-Web contributors
 *
 * This file is part of LitterBox-Web.
 * Licenced under the EUPL-1.2 or later.
 *
 * SPDX-FileCopyrightText: 2024-2026 LitterBox-Web contributors
 * SPDX-License-Identifier: EUPL-1.2
 */
package de.uni_passau.fim.se2.litterbox_web.web_ui.persistence;

import java.time.Instant;
import java.util.List;
import java.util.Objects;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Repository;

import de.uni_passau.fim.se2.litterbox_web.web_ui.persistence.entity.AskAiConversationEntity;
import de.uni_passau.fim.se2.litterbox_web.web_ui.persistence.entity.AskAiMessageEntity;
import de.uni_passau.fim.se2.litterbox_web.web_ui.persistence.jpa.AskAiConversations;
import de.uni_passau.fim.se2.litterbox_web.web_ui.persistence.jpa.AskAiMessages;
import reactor.core.publisher.Mono;

/** Persists conversations and turns; database constraints arbitrate concurrent admission and replies. */
@Repository
public class AskAiConversationRepository {

    private final AskAiConversations conversations;
    private final AskAiMessages messages;
    private final DatabaseWork databaseWork;
    private final ReadCommittedTransactions transactions;
    private final ShareTokenGenerator tokenGenerator;

    @Autowired
    public AskAiConversationRepository(
        final AskAiConversations conversations,
        final AskAiMessages messages,
        final DatabaseWork databaseWork,
        final ReadCommittedTransactions transactions
    ) {
        this.conversations = Objects.requireNonNull(conversations, "conversations");
        this.messages = Objects.requireNonNull(messages, "messages");
        this.databaseWork = Objects.requireNonNull(databaseWork, "databaseWork");
        this.transactions = Objects.requireNonNull(transactions, "transactions");
        this.tokenGenerator = new ShareTokenGenerator();
    }

    /**
     * Uses the unique active-slot constraint to admit a conversation; empty means all slots are taken.
     *
     * @param request   conversation to create
     * @param maxActive maximum active slots for the analysis
     * @param now       current time used to release expired slots
     * @return the created conversation, or empty when all slots are occupied
     */
    public Mono<AskAiConversation> createWithinCap(
        final NewConversation request, final int maxActive, final Instant now
    ) {
        Objects.requireNonNull(request, "request");
        Objects.requireNonNull(now, "now");
        return databaseWork.submit(() -> claimSlot(request, maxActive, now));
    }

    private AskAiConversation claimSlot(final NewConversation request, final int maxActive, final Instant now) {
        conversations.releaseLapsedSlots(request.analysisId(), now);
        for (int slot = 0; slot < maxActive; slot++) {
            final AskAiConversation opened = createInSlot(request, slot);
            if (opened != null) {
                return opened;
            }
        }
        return null;
    }

    /** Returns null for a slot collision and rethrows unrelated integrity errors. */
    private AskAiConversation createInSlot(final NewConversation request, final int slot) {
        try {
            return toConversation(
                conversations.saveAndFlush(
                    AskAiConversationEntity.opened(
                        tokenGenerator.nextToken(), slot, request.submissionId(), request.analysisId(),
                        request.locale(), request.scopeKind(), request.scopeSelector(), request.scopeLabel(),
                        request.userVisibleUntil(), request.analysisRetainUntil()
                    )
                )
            );
        }
        catch (DataIntegrityViolationException violation) {
            if (conversations.existsByAnalysisIdAndActiveSlot(request.analysisId(), slot)) {
                return null;
            }
            throw violation;
        }
    }

    /**
     * Reserves the reply and unique client id before provider work begins.
     *
     * @param conversationId conversation to reserve a turn in
     * @param budget         reply and attempt limits
     * @param turn           new client turn to reserve
     * @return the started turn or the reason it cannot be started
     */
    public Mono<TurnStart> beginTurn(final long conversationId, final TurnBudget budget, final NewTurn turn) {
        Objects.requireNonNull(budget, "budget");
        Objects.requireNonNull(turn, "turn");
        Objects.requireNonNull(turn.clientMessageId(), "clientMessageId");
        return databaseWork.submit(() -> beginOrRefuse(conversationId, budget, turn));
    }

    private TurnStart beginOrRefuse(final long conversationId, final TurnBudget budget, final NewTurn turn) {
        try {
            return transactions.execute(status -> beginInTransaction(conversationId, budget, turn));
        }
        catch (DataIntegrityViolationException collision) {
            if (messages.findByConversationIdAndClientMessageId(conversationId, turn.clientMessageId()).isPresent()) {
                return new TurnStart.AlreadyBegun();
            }
            throw collision;
        }
    }

    private TurnStart beginInTransaction(final long conversationId, final TurnBudget budget, final NewTurn turn) {
        if (conversations.claimReply(conversationId, budget.replies(), budget.attempts()) == 0) {
            // The last reply may have gone to this very send's twin a moment ago: then this is a resend to replay,
            // not a conversation to refuse.
            if (messages.findByConversationIdAndClientMessageId(conversationId, turn.clientMessageId()).isPresent()) {
                return new TurnStart.AlreadyBegun();
            }
            // A conversation given every reply it was promised is out of replies, whatever else it is out of.
            return conversations.findById(conversationId)
                .filter(refused -> refused.getReplyCount() < budget.replies())
                .filter(refused -> refused.getAttemptCount() >= budget.attempts())
                .<TurnStart>map(refused -> new TurnStart.NoAttemptLeft())
                .orElseGet(TurnStart.NoReplyLeft::new);
        }
        final AskAiConversationEntity conversation = conversations.findById(conversationId).orElseThrow();
        final int ordinal = conversation.getNextOrdinal() - 2;
        final AskAiMessageEntity user = messages.saveAndFlush(
            AskAiMessageEntity.pendingUser(
                conversationId, ordinal, turn.action(), turn.followUp(), turn.clientMessageId()
            )
        );
        final AskAiMessageEntity assistant = messages.saveAndFlush(
            AskAiMessageEntity.pendingAssistant(conversationId, ordinal + 1, turn.action(), turn.followUp())
        );
        return new TurnStart.Begun(
            new StartedTurn(conversationId, user.getId(), assistant.getId(), ordinal, conversation.getReplyCount())
        );
    }

    /**
     * Stores the answer only while the assistant row is pending.
     *
     * @param turn         started turn being settled
     * @param status       provider response status
     * @param responseJson serialized response body
     * @param latencyMs    provider latency in milliseconds
     * @return whether the pending assistant row was settled
     */
    public Mono<Boolean> settleAnswered(
        final StartedTurn turn, final String status, final String responseJson, final Integer latencyMs
    ) {
        Objects.requireNonNull(turn, "turn");
        return databaseWork.submit(
            () -> transactions.execute(tx -> answerInTransaction(turn, status, responseJson, latencyMs))
        );
    }

    private boolean answerInTransaction(
        final StartedTurn turn, final String status, final String responseJson, final Integer latencyMs
    ) {
        if (messages.settleAsAnswered(turn.assistantMessageId(), status, responseJson, latencyMs) == 0) {
            return false;
        }
        messages.settleUserRowAsAnswered(turn.userMessageId());
        return true;
    }

    /**
     * Settles a turn that produced nothing to show, giving its reply back to the conversation.
     *
     * <p>
     * A reply is spent on an answer, never on the attempt at one: whatever went wrong between reserving the turn and
     * showing an answer — the provider, the reply's shape, a cancellation — was not the learner's doing, and charging
     * them for it would leave a conversation with fewer answers than it was promised.
     *
     * @param turn      started turn being settled
     * @param outcome   failure outcome recorded for the turn
     * @param latencyMs provider latency in milliseconds
     * @return whether the pending assistant row was settled
     */
    public Mono<Boolean> settleFailed(final StartedTurn turn, final String outcome, final Integer latencyMs) {
        Objects.requireNonNull(turn, "turn");
        Objects.requireNonNull(outcome, "outcome");
        return databaseWork.submit(() -> transactions.execute(status -> failInTransaction(turn, outcome, latencyMs)));
    }

    private boolean failInTransaction(final StartedTurn turn, final String outcome, final Integer latencyMs) {
        if (messages.settleAsFailed(turn.assistantMessageId(), outcome, latencyMs) == 0) {
            return false;
        }
        messages.unbindFailedUserRow(turn.userMessageId(), outcome);
        conversations.releaseReply(turn.conversationId());
        return true;
    }

    /**
     * Deletes an unsubmitted pending turn and refunds its reply and its attempt: a turn the service turned away before
     * it reached the model — for want of capacity — was nobody's attempt at an answer.
     *
     * @param turn started turn to discard
     * @return whether the pending assistant row was deleted
     */
    public Mono<Boolean> discardTurn(final StartedTurn turn) {
        Objects.requireNonNull(turn, "turn");
        return databaseWork.submit(() -> transactions.execute(status -> discardInTransaction(turn)));
    }

    private boolean discardInTransaction(final StartedTurn turn) {
        if (messages.deleteWhilePending(turn.assistantMessageId()) == 0) {
            return false;
        }
        messages.deleteWhilePending(turn.userMessageId());
        conversations.releaseTurn(turn.conversationId());
        return true;
    }

    /**
     * Recovers interrupted turns that remain pending past the provider timeout.
     *
     * @param cutoff oldest allowed pending timestamp
     * @param batch  maximum turns to inspect
     * @return number of turns reclaimed
     */
    public Mono<Integer> reclaimStalePendingTurns(final Instant cutoff, final int batch) {
        Objects.requireNonNull(cutoff, "cutoff");
        return databaseWork.submit(() -> reclaimAll(messages.stalePendingAssistantIds(cutoff, batch)));
    }

    private int reclaimAll(final List<Long> assistantIds) {
        int reclaimed = 0;
        for (final Long assistantId : assistantIds) {
            if (reclaimOne(assistantId)) {
                reclaimed++;
            }
        }
        return reclaimed;
    }

    /** Uses one transaction per turn to keep lock duration bounded. */
    private boolean reclaimOne(final long assistantId) {
        final AskAiMessageEntity assistant = messages.findById(assistantId).orElse(null);
        if (assistant == null) {
            return false;
        }
        final long conversationId = assistant.getConversationId();
        final Long userId = messages.userRowId(conversationId, assistant.getOrdinal() - 1).orElse(null);
        if (userId == null) {
            return false;
        }
        final StartedTurn turn = new StartedTurn(conversationId, userId, assistantId, assistant.getOrdinal() - 1, 0);
        return Boolean.TRUE.equals(
            transactions.execute(
                status -> failInTransaction(turn, "abandoned", assistant.getLatencyMs())
            )
        );
    }

    public Mono<AskAiConversation> findVisible(
        final long submissionId, final long analysisId, final String publicId, final Instant now
    ) {
        Objects.requireNonNull(now, "now");
        return find(submissionId, analysisId, publicId)
            .filter(conversation -> conversation.open() && conversation.userVisibleUntil().isAfter(now));
    }

    /**
     * Finds a conversation by its owner and public identifier.
     *
     * @param submissionId owning submission
     * @param analysisId   owning analysis
     * @param publicId     public conversation identifier
     * @return the conversation, or empty when it is not found
     */
    public Mono<AskAiConversation> find(final long submissionId, final long analysisId, final String publicId) {
        Objects.requireNonNull(publicId, "publicId");
        return databaseWork.submit(
            () -> conversations.findByPublicIdAndSubmissionIdAndAnalysisId(publicId, submissionId, analysisId)
                .map(AskAiConversationRepository::toConversation)
                .orElse(null)
        );
    }

    /**
     * Closes a conversation and releases its active slot.
     *
     * @param conversationId conversation to close
     * @return completion after the update
     */
    public Mono<Void> close(final long conversationId) {
        return databaseWork.submit(
            () -> {
                conversations.close(conversationId);
                return null;
            }
        );
    }

    /**
     * Finds the user message recorded for an idempotency key.
     *
     * @param conversationId  conversation containing the message
     * @param clientMessageId client-generated idempotency key
     * @return the matching message, or empty when absent
     */
    public Mono<AskAiMessage> findByClientMessageId(final long conversationId, final String clientMessageId) {
        Objects.requireNonNull(clientMessageId, "clientMessageId");
        return databaseWork.submit(
            () -> messages.findByConversationIdAndClientMessageId(conversationId, clientMessageId)
                .map(AskAiConversationRepository::toMessage).orElse(null)
        );
    }

    /**
     * Finds the latest validated assistant answer.
     *
     * @param conversationId conversation containing the answer
     * @return the latest answer, or empty when none is validated
     */
    public Mono<AskAiMessage> findLatestAnswer(final long conversationId) {
        return databaseWork.submit(
            () -> messages
                .findFirstByConversationIdAndSenderAndOutcomeOrderByOrdinalDesc(
                    conversationId, "assistant", "validated"
                )
                .map(AskAiConversationRepository::toMessage).orElse(null)
        );
    }

    public Mono<AskAiMessage> findPairedAssistant(final long conversationId, final int userOrdinal) {
        return databaseWork.submit(
            () -> messages.findByConversationIdAndOrdinal(conversationId, userOrdinal + 1)
                .map(AskAiConversationRepository::toMessage).orElse(null)
        );
    }

    private static AskAiConversation toConversation(final AskAiConversationEntity entity) {
        return new AskAiConversation(
            entity.getId(), entity.getPublicId(), entity.getSubmissionId(), entity.getAnalysisId(),
            entity.getLocale(), entity.getScopeKind(), entity.getScopeSelector(), entity.getScopeLabel(),
            entity.getReplyCount(), entity.getUserVisibleUntil(), entity.getAnalysisRetainUntil(), entity.getState()
        );
    }

    private static AskAiMessage toMessage(final AskAiMessageEntity entity) {
        return new AskAiMessage(
            entity.getId(), entity.getConversationId(), entity.getOrdinal(), entity.getSender(), entity.getAction(),
            entity.getFollowUp(), entity.getStatus(), entity.getResponseJson(), entity.getOutcome(),
            entity.getLatencyMs(), entity.getClientMessageId()
        );
    }

    public record NewConversation(
        long submissionId, long analysisId, String locale, String scopeKind, String scopeSelector,
        String scopeLabel, Instant userVisibleUntil, Instant analysisRetainUntil
    ) {

        public NewConversation {
            Objects.requireNonNull(locale, "locale");
            Objects.requireNonNull(scopeKind, "scopeKind");
            Objects.requireNonNull(scopeSelector, "scopeSelector");
            Objects.requireNonNull(scopeLabel, "scopeLabel");
            Objects.requireNonNull(userVisibleUntil, "userVisibleUntil");
            Objects.requireNonNull(analysisRetainUntil, "analysisRetainUntil");
        }
    }

    /**
     * What a conversation may still be given: answers, and attempts at them.
     *
     * @param replies  How many answers the conversation may hold in all.
     * @param attempts How many turns it may put to the model in all, answered or not. A failed turn gives its reply
     *                 back but not its attempt, so this is what bounds a run of failures, and the rows they leave
     *                 behind.
     */
    public record TurnBudget(int replies, int attempts) {

        public TurnBudget {
            if (replies < 1 || attempts < replies) {
                throw new IllegalArgumentException("a turn budget allows at least one reply and as many attempts");
            }
        }
    }

    public record NewTurn(String action, String followUp, String clientMessageId) {

        public NewTurn {
            Objects.requireNonNull(action, "action");
        }
    }

    public record StartedTurn(
        long conversationId, long userMessageId, long assistantMessageId, int ordinal, int repliesUsed
    ) {

        public int assistantOrdinal() {
            return ordinal + 1;
        }
    }

    public sealed interface TurnStart {

        record Begun(StartedTurn turn) implements TurnStart {
        }

        record NoReplyLeft() implements TurnStart {
        }

        /** Replies are left, but the conversation has started as many turns as it is allowed. */
        record NoAttemptLeft() implements TurnStart {
        }

        /** The caller should replay or wait on the existing send. */
        record AlreadyBegun() implements TurnStart {
        }
    }

    /**
     * Closes conversations past their user-visible deadline.
     *
     * @param now   current time
     * @param batch maximum conversations to close
     * @return number of conversations closed
     */
    public Mono<Integer> closeExpired(final Instant now, final int batch) {
        Objects.requireNonNull(now, "now");
        return databaseWork.submit(() -> conversations.closeExpired(now, batch));
    }

    /**
     * Deletes expired conversations and their transcripts.
     *
     * @param now   current time
     * @param batch maximum conversations to delete
     * @return number of conversations deleted
     */
    public Mono<Integer> deletePastRetention(final Instant now, final int batch) {
        Objects.requireNonNull(now, "now");
        return databaseWork.submit(() -> transactions.execute(status -> deleteRetiredInTransaction(now, batch)));
    }

    private Integer deleteRetiredInTransaction(final Instant now, final int batch) {
        final List<Long> retired = conversations.idsPastRetention(now, batch);
        if (retired.isEmpty()) {
            return 0;
        }
        messages.deleteByConversationIds(retired);
        return conversations.deleteConversations(retired);
    }

}
