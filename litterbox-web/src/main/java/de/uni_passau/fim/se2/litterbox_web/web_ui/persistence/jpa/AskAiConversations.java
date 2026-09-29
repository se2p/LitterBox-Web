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

import de.uni_passau.fim.se2.litterbox_web.web_ui.persistence.entity.AskAiConversationEntity;

public interface AskAiConversations extends JpaRepository<AskAiConversationEntity, Long> {

    Optional<AskAiConversationEntity> findByPublicIdAndSubmissionIdAndAnalysisId(
        String publicId, long submissionId, long analysisId
    );

    /**
     * Releases slots for closed or no-longer-visible conversations before new admission.
     *
     * @param analysisId analysis whose slots are released
     * @param now        current time
     * @return number of rows updated
     */
    @Modifying(clearAutomatically = true)
    @Transactional
    @Query(
        value = "UPDATE ask_ai_conversation SET active_slot = NULL "
            + "WHERE analysis_id = :analysisId AND active_slot IS NOT NULL "
            + "AND (state <> 'OPEN' OR user_visible_until <= :now)",
        nativeQuery = true
    )
    int releaseLapsedSlots(@Param("analysisId") long analysisId, @Param("now") Instant now);

    boolean existsByAnalysisIdAndActiveSlot(long analysisId, Integer activeSlot);

    /**
     * Lists the slots the analysis's conversations hold now.
     *
     * @param analysisId analysis whose slots are listed
     * @return the occupied slots, in no particular order
     */
    @Query(
        "SELECT c.activeSlot FROM AskAiConversationEntity c "
            + "WHERE c.analysisId = :analysisId AND c.activeSlot IS NOT NULL"
    )
    List<Integer> findActiveSlots(@Param("analysisId") long analysisId);

    /**
     * Claims one reply, one attempt and the next two ordinals in a single conditional update, so concurrent turns on
     * the same conversation are serialized by the row write rather than by a lock held across the read. A failed turn
     * gives its reply back but not its attempt, so the attempt budget is what keeps a run of failures from going on for
     * ever.
     *
     * @param id       conversation identifier
     * @param replies  maximum replies
     * @param attempts maximum attempts
     * @return number of rows updated
     */
    @Modifying(clearAutomatically = true)
    @Transactional
    @Query(
        value = "UPDATE ask_ai_conversation SET reply_count = reply_count + 1, attempt_count = attempt_count + 1, "
            + "next_ordinal = next_ordinal + 2 WHERE id = :id AND state = 'OPEN' "
            + "AND reply_count < :replies AND attempt_count < :attempts",
        nativeQuery = true
    )
    int claimReply(@Param("id") long id, @Param("replies") int replies, @Param("attempts") int attempts);

    @Modifying(clearAutomatically = true)
    @Transactional
    @Query(
        value = "UPDATE ask_ai_conversation SET reply_count = reply_count - 1 WHERE id = :id AND reply_count > 0",
        nativeQuery = true
    )
    int releaseReply(@Param("id") long id);

    /**
     * Gives back a turn that never reached the model: its reply and, unlike a failed turn, its attempt.
     *
     * @param id conversation identifier
     * @return number of rows updated
     */
    @Modifying(clearAutomatically = true)
    @Transactional
    @Query(
        value = "UPDATE ask_ai_conversation SET reply_count = reply_count - 1, attempt_count = attempt_count - 1 "
            + "WHERE id = :id AND reply_count > 0 AND attempt_count > 0",
        nativeQuery = true
    )
    int releaseTurn(@Param("id") long id);

    @Modifying(clearAutomatically = true)
    @Transactional
    @Query(
        value = "UPDATE ask_ai_conversation SET state = 'CLOSED', closed_at = CURRENT_TIMESTAMP(6), "
            + "active_slot = NULL WHERE id = :id AND state <> 'CLOSED'",
        nativeQuery = true
    )
    int close(@Param("id") long id);

    @Modifying(clearAutomatically = true)
    @Transactional
    @Query(
        value = "UPDATE ask_ai_conversation SET state = 'CLOSED', closed_at = CURRENT_TIMESTAMP(6), "
            + "active_slot = NULL WHERE state = 'OPEN' AND user_visible_until <= :now LIMIT :batch",
        nativeQuery = true
    )
    int closeExpired(@Param("now") Instant now, @Param("batch") int batch);

    @Query(
        value = "SELECT id FROM ask_ai_conversation WHERE analysis_retain_until <= :now "
            + "ORDER BY analysis_retain_until LIMIT :batch",
        nativeQuery = true
    )
    List<Long> idsPastRetention(@Param("now") Instant now, @Param("batch") int batch);

    /**
     * Deletes conversations after transcript deletion to satisfy the foreign key.
     *
     * @param ids conversation identifiers
     * @return number of rows deleted
     */
    @Modifying(clearAutomatically = true)
    @Transactional
    @Query(
        value = "DELETE FROM ask_ai_conversation WHERE id IN (:ids)",
        nativeQuery = true
    )
    int deleteConversations(@Param("ids") List<Long> ids);
}
