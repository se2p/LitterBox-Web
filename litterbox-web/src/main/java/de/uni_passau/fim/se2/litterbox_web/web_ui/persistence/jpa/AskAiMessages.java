/*
 * Copyright (C) 2024-2026 LitterBox-Web contributors
 *
 * This file is part of LitterBox-Web.
 * Licenced under the EUPL-1.2 or later.
 *
 * SPDX-FileCopyrightText: 2024-2026 LitterBox-Web contributors
 * SPDX-License-Identifier: EUPL-1.2
 */
package de.uni_passau.fim.se2.litterbox_web.web_ui.persistence.jpa;

import java.time.Instant;
import java.util.List;
import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.transaction.annotation.Transactional;

import de.uni_passau.fim.se2.litterbox_web.web_ui.persistence.entity.AskAiMessageEntity;

public interface AskAiMessages extends JpaRepository<AskAiMessageEntity, Long> {

    Optional<AskAiMessageEntity> findByConversationIdAndClientMessageId(long conversationId, String clientMessageId);

    Optional<AskAiMessageEntity> findByConversationIdAndOrdinal(long conversationId, int ordinal);

    Optional<AskAiMessageEntity> findFirstByConversationIdAndSenderAndOutcomeOrderByOrdinalDesc(
        long conversationId, String sender, String outcome
    );

    /**
     * Settles an assistant row only while it is pending; this arbitrates cancellation against answer settlement.
     *
     * @param id           assistant message identifier
     * @param status       provider response status
     * @param responseJson serialized response body
     * @param latencyMs    provider latency in milliseconds
     * @return number of rows updated
     */
    @Modifying(clearAutomatically = true)
    @Transactional
    @Query(
        value = "UPDATE ask_ai_message SET status = :status, response_json = :responseJson, "
            + "outcome = 'validated', latency_ms = :latencyMs WHERE id = :id AND outcome = 'pending'",
        nativeQuery = true
    )
    int settleAsAnswered(
        @Param("id") long id, @Param("status") String status, @Param("responseJson") String responseJson,
        @Param("latencyMs") Integer latencyMs
    );

    /**
     * Marks the paired user row validated after an answer is stored.
     *
     * @param id user message identifier
     * @return number of rows updated
     */
    @Modifying(clearAutomatically = true)
    @Transactional
    @Query(
        value = "UPDATE ask_ai_message SET outcome = 'validated' WHERE id = :id AND sender = 'user' "
            + "AND outcome = 'pending'",
        nativeQuery = true
    )
    int settleUserRowAsAnswered(@Param("id") long id);

    @Modifying(clearAutomatically = true)
    @Transactional
    @Query(
        value = "UPDATE ask_ai_message SET status = 'failed', outcome = :outcome, latency_ms = :latencyMs "
            + "WHERE id = :id AND outcome = 'pending'",
        nativeQuery = true
    )
    int settleAsFailed(@Param("id") long id, @Param("outcome") String outcome, @Param("latencyMs") Integer latencyMs);

    /**
     * Releases the failed turn's id, guarded by sender to protect its assistant row.
     *
     * @param id      user message identifier
     * @param outcome failure outcome
     * @return number of rows updated
     */
    @Modifying(clearAutomatically = true)
    @Transactional
    @Query(
        value = "UPDATE ask_ai_message SET outcome = :outcome, client_message_id = NULL "
            + "WHERE id = :id AND sender = 'user'",
        nativeQuery = true
    )
    int unbindFailedUserRow(@Param("id") long id, @Param("outcome") String outcome);

    @Modifying(clearAutomatically = true)
    @Transactional
    @Query(
        value = "DELETE FROM ask_ai_message WHERE id = :id AND outcome = 'pending'",
        nativeQuery = true
    )
    int deleteWhilePending(@Param("id") long id);

    /**
     * Finds stale pending assistant rows for reply recovery.
     *
     * @param cutoff oldest allowed pending timestamp
     * @param batch  maximum rows to return
     * @return stale assistant message identifiers
     */
    @Query(
        value = "SELECT id FROM ask_ai_message WHERE outcome = 'pending' AND sender = 'assistant' "
            + "AND created_at <= :cutoff ORDER BY created_at LIMIT :batch",
        nativeQuery = true
    )
    List<Long> stalePendingAssistantIds(@Param("cutoff") Instant cutoff, @Param("batch") int batch);

    @Query(
        value = "SELECT id FROM ask_ai_message WHERE conversation_id = :conversationId AND ordinal = :ordinal "
            + "AND sender = 'user'",
        nativeQuery = true
    )
    Optional<Long> userRowId(@Param("conversationId") long conversationId, @Param("ordinal") int ordinal);

    /**
     * Deletes transcripts before their conversations to satisfy the foreign key.
     *
     * @param conversationIds conversation identifiers
     * @return number of rows deleted
     */
    @Modifying(clearAutomatically = true)
    @Transactional
    @Query(
        value = "DELETE FROM ask_ai_message WHERE conversation_id IN (:conversationIds)",
        nativeQuery = true
    )
    int deleteByConversationIds(@Param("conversationIds") List<Long> conversationIds);
}
