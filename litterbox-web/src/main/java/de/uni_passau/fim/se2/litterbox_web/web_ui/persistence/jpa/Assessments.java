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

import org.springframework.data.domain.Limit;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.transaction.annotation.Transactional;

import de.uni_passau.fim.se2.litterbox_web.web_ui.persistence.entity.AssessmentEntity;

public interface Assessments extends JpaRepository<AssessmentEntity, Long> {

    Optional<AssessmentEntity> findByPublicToken(String publicToken);

    @Modifying
    @Transactional
    @Query(
        value = "DELETE FROM assessment WHERE id = :id",
        nativeQuery = true
    )
    int deleteAssessmentById(@Param("id") long id);

    @Modifying
    @Transactional
    @Query(
        value = "DELETE FROM assessment WHERE id = :id AND expires_at < :now",
        nativeQuery = true
    )
    int deleteExpiredAssessmentById(@Param("id") long id, @Param("now") Instant now);

    /**
     * Atomically claims one attempt while enforcing state, expiry, and quota.
     *
     * @param id          the assessment to claim an attempt on
     * @param maxAttempts the most attempts the assessment may hand out
     * @param now         the moment the assessment must not yet have expired by
     * @return {@code 1} if an attempt was claimed, {@code 0} if the assessment is missing, closed, expired or full
     */
    @Modifying(clearAutomatically = true)
    @Transactional
    @Query(
        value = "UPDATE assessment SET attempts = attempts + 1 WHERE id = :id AND status = 'OPEN' "
            + "AND expires_at > :now AND attempts < :maxAttempts",
        nativeQuery = true
    )
    int claimAttempt(@Param("id") long id, @Param("maxAttempts") int maxAttempts, @Param("now") Instant now);

    /**
     * Updates supplied fields and optionally recounts attempts atomically.
     *
     * @param id        the assessment to update
     * @param status    the new status, or {@code null} to keep the current one
     * @param expiresAt the new expiry, or {@code null} to keep the current one
     * @param recount   whether to reset the attempt count to the number of attempts that still exist
     * @return {@code 1} if the assessment was updated, {@code 0} if it does not exist
     */
    @Modifying(clearAutomatically = true)
    @Transactional
    @Query(
        value = "UPDATE assessment SET status = COALESCE(:status, status), "
            + "expires_at = COALESCE(:expiresAt, expires_at), "
            + "attempts = CASE WHEN :recount THEN "
            + "(SELECT COUNT(*) FROM assessment_attempt WHERE assessment_attempt.assessment_id = assessment.id) "
            + "ELSE attempts END WHERE id = :id",
        nativeQuery = true
    )
    int updateLifecycleById(
        @Param("id") long id,
        @Param("status") String status,
        @Param("expiresAt") Instant expiresAt,
        @Param("recount") boolean recount
    );

    @Query(
        "SELECT assessment.id FROM AssessmentEntity assessment "
            + "WHERE assessment.expiresAt < :now ORDER BY assessment.expiresAt ASC"
    )
    List<Long> findExpiredIds(@Param("now") Instant now, Limit limit);
}
