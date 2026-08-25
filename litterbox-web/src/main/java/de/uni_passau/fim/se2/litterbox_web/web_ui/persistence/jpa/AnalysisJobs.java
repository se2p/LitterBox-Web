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

import java.util.List;
import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.transaction.annotation.Transactional;

import de.uni_passau.fim.se2.litterbox_web.web_ui.persistence.entity.AnalysisJobEntity;

/**
 * The queue.
 *
 * <p>
 * Most of what happens to a job is a decision the database makes in one statement — take this, finish this if it is
 * still mine, count this one out — because two workers reach for the same rows at the same time and a decision split
 * across a read and a later write is one they can both make. Those stay written as statements. Reading a job, and the
 * bookkeeping that follows work nobody is racing for, is ordinary mapping.
 */
public interface AnalysisJobs extends JpaRepository<AnalysisJobEntity, Long> {

    Optional<AnalysisJobEntity> findByLeaseOwner(String leaseOwner);

    /** Where in its submission's order the next project belongs. See {@link #enqueueAnalysis}. */
    @Query(
        value = "SELECT COALESCE(MAX(queue_position), 0) + 1 FROM analysis_job WHERE submission_id = :submissionId",
        nativeQuery = true
    )
    int nextQueuePosition(@Param("submissionId") long submissionId);

    /**
     * A job for an analysis that already has one is refused by {@code uq_analysis_job_analysis} rather than passed over
     * silently. {@code INSERT IGNORE} would have covered that, but it covers a missing analysis just as quietly, and a
     * caller told nothing happened deserves to know which of the two it was.
     *
     * <p>
     * The position is read by the statement above rather than by this one, for the reason given on
     * {@link #enqueueIngestion}. Two projects read apart can arrive at the same position, and two projects at the same
     * position only means they are equally urgent, which they are.
     */
    @Modifying(clearAutomatically = true)
    @Transactional
    @Query(
        value = "INSERT INTO analysis_job (submission_id, analysis_id, job_kind, state, queue_position) "
            + "VALUES (:submissionId, :analysisId, 'ANALYSIS', 'QUEUED', :queuePosition)",
        nativeQuery = true
    )
    void enqueueAnalysis(
        @Param("submissionId") long submissionId,
        @Param("analysisId") long analysisId,
        @Param("queuePosition") int queuePosition
    );

    /**
     * Queues an ingestion, which {@code uq_analysis_job_active_ingestion} refuses if one for the same source is already
     * waiting or running.
     *
     * <p>
     * This used to ask whether such a job existed and insert only if it did not, which is the shape most of this
     * interface is written in. It cannot be that here. Reading the table it is inserting into makes the statement a
     * bulk insert, and MariaDB takes a lock over the whole table's numbering for one of those; sixteen requests
     * arriving together then deadlock on the numbering rather than meeting on the key, and report it as a failure to
     * read the auto-increment value. Letting the second insert simply be refused costs a wasted number and an exception
     * on a path that is only reached when a request is repeated.
     */
    @Modifying(clearAutomatically = true)
    @Transactional
    @Query(
        value = "INSERT INTO analysis_job (submission_id, job_kind, source_reference, state) "
            + "VALUES (:submissionId, :jobKind, :sourceReference, 'QUEUED')",
        nativeQuery = true
    )
    void enqueueIngestion(
        @Param("submissionId") long submissionId,
        @Param("jobKind") String jobKind,
        @Param("sourceReference") String sourceReference
    );

    /**
     * Chooses the row and stamps it together, ordered so that the nth project of every submission is taken before the
     * (n+1)th of any.
     *
     * <p>
     * Cancelling a submission marks its jobs, so {@code cancel_requested} is what normally keeps them out of this. The
     * submission is asked as well because a job can be queued after that mark was made — a batch ingestion cancelled
     * midway is still adding projects — and running one costs an analysis nobody is waiting for.
     */
    @Modifying(clearAutomatically = true)
    @Transactional
    @Query(
        value = "UPDATE analysis_job SET state = 'RUNNING', lease_owner = :leaseToken, "
            + "lease_until = DATE_ADD(CURRENT_TIMESTAMP(6), INTERVAL :leaseMicros MICROSECOND), "
            + "attempts = attempts + 1, updated_at = CURRENT_TIMESTAMP(6) "
            + "WHERE cancel_requested = FALSE AND attempts < :maxAttempts "
            + "AND (state = 'QUEUED' OR (state = 'RUNNING' AND lease_until < CURRENT_TIMESTAMP(6))) "
            + "AND (SELECT s.state FROM submission s WHERE s.id = analysis_job.submission_id) <> 'CANCELLED' "
            + "ORDER BY queue_position, id LIMIT 1",
        nativeQuery = true
    )
    int claimNext(
        @Param("leaseToken") String leaseToken,
        @Param("leaseMicros") long leaseMicros,
        @Param("maxAttempts") int maxAttempts
    );

    @Modifying(clearAutomatically = true)
    @Transactional
    @Query(
        value = "UPDATE analysis_job SET state = CASE WHEN cancel_requested THEN 'CANCELLED' ELSE :outcome END, "
            + "lease_owner = NULL, lease_until = NULL, updated_at = CURRENT_TIMESTAMP(6) "
            + "WHERE id = :jobId AND state = 'RUNNING' AND lease_owner = :leaseToken "
            + "AND lease_until >= CURRENT_TIMESTAMP(6)",
        nativeQuery = true
    )
    int finish(
        @Param("jobId") long jobId, @Param("leaseToken") String leaseToken, @Param("outcome") String outcome
    );

    @Modifying(clearAutomatically = true)
    @Transactional
    @Query(
        value = "UPDATE analysis_job SET lease_until = DATE_ADD(CURRENT_TIMESTAMP(6), INTERVAL :leaseMicros "
            + "MICROSECOND), updated_at = CURRENT_TIMESTAMP(6) WHERE id = :jobId AND state = 'RUNNING' "
            + "AND lease_owner = :leaseToken AND lease_until >= CURRENT_TIMESTAMP(6)",
        nativeQuery = true
    )
    int renew(
        @Param("jobId") long jobId, @Param("leaseToken") String leaseToken, @Param("leaseMicros") long leaseMicros
    );

    /**
     * Whether this lease is still held, decided by the database's clock.
     *
     * <p>
     * Asking in Java would mean comparing a time this process read against one the database wrote, and the two agree
     * only as far as their clocks do. A worker whose lease looks expired is refused its own completed work.
     */
    @Query(
        value = "SELECT * FROM analysis_job WHERE id = :jobId AND state = 'RUNNING' "
            + "AND lease_owner = :leaseToken AND lease_until >= CURRENT_TIMESTAMP(6)",
        nativeQuery = true
    )
    Optional<AnalysisJobEntity> findHeldLease(@Param("jobId") long jobId, @Param("leaseToken") String leaseToken);

    @Modifying(clearAutomatically = true)
    @Transactional
    @Query(
        value = "UPDATE analysis_job SET state = 'QUEUED', lease_owner = NULL, lease_until = NULL, "
            + "updated_at = CURRENT_TIMESTAMP(6) WHERE id = :jobId AND state = 'RUNNING' "
            + "AND lease_owner = :leaseToken",
        nativeQuery = true
    )
    int releaseForRetry(@Param("jobId") long jobId, @Param("leaseToken") String leaseToken);

    @Modifying(clearAutomatically = true)
    @Transactional
    @Query(
        value = "UPDATE analysis_job SET cancel_requested = TRUE, "
            + "state = CASE WHEN state = 'QUEUED' THEN 'CANCELLED' ELSE state END, "
            + "updated_at = CURRENT_TIMESTAMP(6) WHERE submission_id = :submissionId "
            + "AND state IN ('QUEUED', 'RUNNING')",
        nativeQuery = true
    )
    void cancelSubmission(@Param("submissionId") long submissionId);

    @Modifying(clearAutomatically = true)
    @Transactional
    @Query(
        value = "UPDATE analysis_job SET state = 'CANCELLED', lease_owner = NULL, lease_until = NULL, "
            + "updated_at = CURRENT_TIMESTAMP(6) WHERE id = :jobId AND state IN ('QUEUED', 'RUNNING')",
        nativeQuery = true
    )
    void markCancelled(@Param("jobId") long jobId);

    @Modifying(clearAutomatically = true)
    @Transactional
    @Query(
        value = "UPDATE analysis_job SET state = 'FAILED', lease_owner = NULL, lease_until = NULL, "
            + "updated_at = CURRENT_TIMESTAMP(6) WHERE id = :jobId AND state IN ('QUEUED', 'RUNNING')",
        nativeQuery = true
    )
    void markFailed(@Param("jobId") long jobId);

    /**
     * Jobs claiming will never pick up again: cancelled while unheld, or out of attempts.
     *
     * <p>
     * Bounded, because settling one of these writes to its analysis and its submission as well, and a backlog that
     * built up while nobody was reaping would otherwise be one transaction however long it had grown. The caller comes
     * back for the next page.
     */
    @Query(
        value = "SELECT * FROM analysis_job WHERE state IN ('QUEUED', 'RUNNING') "
            + "AND (lease_until IS NULL OR lease_until < CURRENT_TIMESTAMP(6)) "
            + "AND (cancel_requested = TRUE OR attempts >= :maxAttempts) ORDER BY id LIMIT :limit",
        nativeQuery = true
    )
    List<AnalysisJobEntity> findAbandoned(@Param("maxAttempts") int maxAttempts, @Param("limit") int limit);

    @Modifying(clearAutomatically = true)
    @Transactional
    @Query(
        value = "DELETE FROM analysis_job WHERE state IN ('COMPLETED', 'FAILED', 'CANCELLED') "
            + "AND updated_at < DATE_SUB(CURRENT_TIMESTAMP(6), INTERVAL :retentionMicros MICROSECOND)",
        nativeQuery = true
    )
    int deleteTerminalOlderThan(@Param("retentionMicros") long retentionMicros);
}
