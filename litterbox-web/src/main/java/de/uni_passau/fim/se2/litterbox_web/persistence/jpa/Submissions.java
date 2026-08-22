/*
 * Copyright (C) 2024-2026 LitterBox-Web contributors
 *
 * This file is part of LitterBox-Web.
 * Licenced under the EUPL-1.2 or later.
 *
 * SPDX-FileCopyrightText: 2024-2026 LitterBox-Web contributors
 * SPDX-License-Identifier: EUPL-1.2
 */
package de.uni_passau.fim.se2.litterbox_web.persistence.jpa;

import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.transaction.annotation.Transactional;

import de.uni_passau.fim.se2.litterbox_web.persistence.entity.SubmissionEntity;

public interface Submissions extends JpaRepository<SubmissionEntity, Long> {

    Optional<SubmissionEntity> findByShareToken(String shareToken);

    /**
     * Reads the counts past Hibernate's cache.
     *
     * <p>
     * The counts are written by statements that do not go through the persistence context, so an entity loaded earlier
     * in the same session can still hold the numbers as they were. A writer deciding what to write next has to see what
     * is actually there, and this asks the database rather than the session.
     */
    @Query(
        value = "SELECT state AS state, expected_count AS expected, completed_count AS completed, "
            + "failed_count AS failed FROM submission WHERE id = :submissionId",
        nativeQuery = true
    )
    Optional<CountsRow> readCounts(@Param("submissionId") long submissionId);

    /** The four numbers a submission's progress is decided from. */
    interface CountsRow {

        String getState();

        int getExpected();

        int getCompleted();

        int getFailed();
    }

    /**
     * Counts one finished project against its submission and says what the submission has come to.
     *
     * <p>
     * Adding to a column is something the database will do without being told what was there, so no reader has to be
     * right about it and nothing has to be retried, however many writers meet on one submission.
     *
     * <p>
     * The state is assigned before the counters on purpose. MariaDB evaluates the assignments in the order written, so
     * writing it first is what lets it refer to the counts as they were and add the same amounts itself; written after
     * them it would be reading its own results. Stating the additions twice is the price of the statement being right
     * under the plainer reading of it as well, where every assignment sees the old row.
     *
     * @return 1 if this call counted it, 0 if the submission was already cancelled or already complete
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
     * Records a failure that stands for the submission as a whole, such as an ingestion that never got as far as saying
     * how many projects there were.
     *
     * <p>
     * A submission nothing was ever expected of is the awkward case: the one thing that happened is the whole of it, so
     * it comes to expect one project and to have failed it. That is why {@code expected_count} is assigned last — the
     * two assignments above it ask what was expected before, and this one is what changes the answer.
     *
     * <p>
     * A cancelled submission is left alone whatever the caller asks for. Its state is not one of several outcomes this
     * could be recording instead; it is somebody having said the work is not wanted, and a reaper that read the state,
     * found it running, and arrived here after the cancellation committed would otherwise put it back to failed.
     *
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

    @Modifying(clearAutomatically = true)
    @Transactional
    @Query(
        value = "UPDATE submission SET state = 'CANCELLED', updated_at = CURRENT_TIMESTAMP(6) "
            + "WHERE id = :submissionId AND state NOT IN ('COMPLETED', 'PARTIAL', 'FAILED', 'CANCELLED')",
        nativeQuery = true
    )
    int cancelIfActive(@Param("submissionId") long submissionId);

    /**
     * Says a submission is ready for a worker to pick up, which is only ever true of one that has just been stored.
     *
     * <p>
     * Asked of a submission a request is repeating, where what it means is: if the first attempt bound the key and then
     * failed before queueing anything, put this back where a job can be queued for it. That is a submission still
     * sitting at {@code STORED}, and naming that state is the whole condition — anything wider would also catch a
     * submission a worker is already running and put it back to runnable, which the reports read as the work having
     * returned to the queue.
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
     * Neither thing this refuses to do — overwrite a cancelled submission, or promise fewer projects than have already
     * been accounted for — needs to be read first; the row can be asked about while it is written.
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
