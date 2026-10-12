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

import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.transaction.annotation.Transactional;

import de.uni_passau.fim.se2.litterbox_web.web_ui.persistence.entity.SubmissionEntity;

public interface Submissions extends JpaRepository<SubmissionEntity, Long> {

    Optional<SubmissionEntity> findByShareToken(String shareToken);

    /**
     * Reads past Hibernate's cache: the counts are written by statements that bypass the persistence context, so an
     * entity loaded earlier in the same session can hold stale numbers.
     *
     * @param submissionId submission identifier
     * @return current counters
     */
    @Query(
        value = "SELECT state AS state, expected_count AS expected, completed_count AS completed, "
            + "failed_count AS failed FROM submission WHERE id = :submissionId",
        nativeQuery = true
    )
    Optional<CountsRow> readCounts(@Param("submissionId") long submissionId);

    interface CountsRow {

        String getState();

        int getExpected();

        int getCompleted();

        int getFailed();
    }

    /**
     * The state is assigned before the counters on purpose: MariaDB evaluates assignments in the order written, so this
     * one reads the old counts to compute the state before the counters below add the same deltas.
     *
     * @return 1 if this call counted it, 0 if the submission was already cancelled or already complete
     * @param submissionId   submission identifier
     * @param completedDelta completed count delta
     * @param failedDelta    failed count delta
     */
    @Modifying(clearAutomatically = true)
    @Transactional
    @Query(
        value = "UPDATE submission SET state = CASE "
            + "WHEN completed_count + :completedDelta + failed_count + :failedDelta < expected_count THEN 'RUNNING' "
            + "WHEN completed_count + :completedDelta > 0 AND failed_count + :failedDelta > 0 THEN 'PARTIAL' "
            + "WHEN completed_count + :completedDelta > 0 THEN 'COMPLETED' ELSE 'FAILED' END, "
            + "completed_count = completed_count + :completedDelta, "
            + "failed_count = failed_count + :failedDelta, updated_at = CURRENT_TIMESTAMP(6) "
            + "WHERE id = :submissionId AND state <> 'CANCELLED' "
            + "AND completed_count + failed_count < expected_count",
        nativeQuery = true
    )
    int countOutcome(
        @Param("submissionId") long submissionId,
        @Param("completedDelta") int completedDelta,
        @Param("failedDelta") int failedDelta
    );

    /**
     * {@code expected_count} is assigned last because the assignments above it still need to read its old value. A
     * cancelled submission is left alone whatever the caller asks for, so a reaper arriving after a cancellation has
     * already committed cannot put it back to failed.
     *
     * @param submissionId     submission identifier
     * @param onlyWhileRunning whether a submission that has already come to something should be left alone
     * @return 1 if this call recorded it, 0 if it was already accounted for
     */
    @Modifying(clearAutomatically = true)
    @Transactional
    @Query(
        value = "UPDATE submission SET state = CASE "
            + "WHEN expected_count = 0 THEN 'FAILED' "
            + "WHEN completed_count + failed_count + 1 < expected_count THEN 'RUNNING' "
            + "WHEN completed_count > 0 THEN 'PARTIAL' ELSE 'FAILED' END, "
            + "completed_count = CASE WHEN expected_count = 0 THEN 0 ELSE completed_count END, "
            + "failed_count = CASE WHEN expected_count = 0 THEN 1 ELSE failed_count + 1 END, "
            + "expected_count = CASE WHEN expected_count = 0 THEN 1 ELSE expected_count END, "
            + "updated_at = CURRENT_TIMESTAMP(6) "
            + "WHERE id = :submissionId AND state <> 'CANCELLED' "
            + "AND (:onlyWhileRunning = FALSE OR state NOT IN ('COMPLETED', 'PARTIAL', 'FAILED')) "
            + "AND (expected_count = 0 OR completed_count + failed_count < expected_count)",
        nativeQuery = true
    )
    int countFailure(
        @Param("submissionId") long submissionId, @Param("onlyWhileRunning") boolean onlyWhileRunning
    );

    /**
     * Marks an active submission as cancelled.
     *
     * @param submissionId submission identifier
     * @return number of updated rows
     */
    @Modifying(clearAutomatically = true)
    @Transactional
    @Query(
        value = "UPDATE submission SET state = 'CANCELLED', updated_at = CURRENT_TIMESTAMP(6) "
            + "WHERE id = :submissionId AND state NOT IN ('COMPLETED', 'PARTIAL', 'FAILED', 'CANCELLED')",
        nativeQuery = true
    )
    int cancelIfActive(@Param("submissionId") long submissionId);

    /**
     * Only a submission still at {@code STORED} qualifies — anything wider would also catch one a worker is already
     * running and put it back to runnable.
     *
     * @param submissionId submission identifier
     */
    @Modifying(clearAutomatically = true)
    @Transactional
    @Query(
        value = "UPDATE submission SET state = 'RUNNABLE', updated_at = CURRENT_TIMESTAMP(6) "
            + "WHERE id = :submissionId AND state = 'STORED'",
        nativeQuery = true
    )
    void markRunnable(@Param("submissionId") long submissionId);

    @Modifying(clearAutomatically = true)
    @Transactional
    @Query(
        value = "UPDATE submission SET state = 'RUNNING', updated_at = CURRENT_TIMESTAMP(6) "
            + "WHERE id = :submissionId AND state IN ('STORED', 'RUNNABLE')",
        nativeQuery = true
    )
    void markRunning(@Param("submissionId") long submissionId);

    /**
     * Neither thing this refuses to do — overwriting a cancelled submission, or promising fewer projects than have
     * already been accounted for — needs to be read first.
     *
     * @param submissionId  submission identifier
     * @param expectedCount expected project count
     */
    @Modifying(clearAutomatically = true)
    @Transactional
    @Query(
        value = "UPDATE submission SET expected_count = :expectedCount, state = 'RUNNING', "
            + "updated_at = CURRENT_TIMESTAMP(6) WHERE id = :submissionId AND state <> 'CANCELLED' "
            + "AND completed_count + failed_count <= :expectedCount",
        nativeQuery = true
    )
    void prepareBatch(@Param("submissionId") long submissionId, @Param("expectedCount") int expectedCount);
}
