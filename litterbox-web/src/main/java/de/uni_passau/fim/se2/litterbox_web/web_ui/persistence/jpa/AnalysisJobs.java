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
 * Most of what happens to a job is a decision the database makes in one statement — take this, finish this if it is
 * still mine, count this one out — because two workers can reach for the same row at once and a decision split across a
 * read and a later write is one they could both make.
 */
public interface AnalysisJobs extends JpaRepository<AnalysisJobEntity, Long> {

    Optional<AnalysisJobEntity> findByLeaseOwner(String leaseOwner);

    @Query(
        value = "SELECT COALESCE(MAX(queue_position), 0) + 1 FROM analysis_job WHERE submission_id = :submissionId",
        nativeQuery = true
    )
    int nextQueuePosition(@Param("submissionId") long submissionId);

    /**
     * {@code queuePosition} must come from {@link #nextQueuePosition}. A job for an analysis that already has one is
     * refused by {@code uq_analysis_job_analysis}, not silently skipped — {@code INSERT IGNORE} would also swallow a
     * missing analysis, and a caller needs to know which happened.
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
     * Deliberately not ask-then-insert: reading this table before inserting into it makes the statement a bulk insert,
     * and MariaDB takes a table-wide numbering lock for those, so concurrent requests could deadlock on the numbering
     * instead of being refused safely by {@code uq_analysis_job_active_ingestion}.
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
     * Chooses the row and stamps it in the same statement so two workers cannot both believe they hold it. The
     * submission's own state is checked too, since a job can be queued after {@code cancel_requested} is set (a batch
     * ingestion cancelled midway is still adding projects).
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
     * Uses the database's clock rather than the caller's, so a slow worker cannot be refused its own completed work.
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
     * Bounded, because settling one writes to its analysis and submission too, and an unbounded backlog would make one
     * transaction of arbitrary size; the caller comes back for the next page.
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
