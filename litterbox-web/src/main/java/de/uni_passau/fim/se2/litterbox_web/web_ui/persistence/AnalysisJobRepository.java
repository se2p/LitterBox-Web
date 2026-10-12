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

import java.time.Duration;
import java.util.List;
import java.util.Objects;
import java.util.UUID;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Repository;

import de.uni_passau.fim.se2.litterbox_web.web_ui.persistence.entity.AnalysisJobEntity;
import de.uni_passau.fim.se2.litterbox_web.web_ui.persistence.jpa.Analyses;
import de.uni_passau.fim.se2.litterbox_web.web_ui.persistence.jpa.AnalysisJobs;
import de.uni_passau.fim.se2.litterbox_web.web_ui.persistence.jpa.SubmissionEvents;
import de.uni_passau.fim.se2.litterbox_web.web_ui.persistence.jpa.Submissions;
import reactor.core.publisher.Mono;

@Repository
public class AnalysisJobRepository {

    public static final int MAX_ATTEMPTS = 3;

    /** How many abandoned jobs one reap settles. */
    static final int REAP_BATCH_SIZE = 100;

    private final AnalysisJobs jobs;
    private final Analyses analyses;
    private final Submissions submissions;
    private final SubmissionEvents events;
    private final DatabaseWork databaseWork;
    private final ReadCommittedTransactions transactions;
    private final SubmissionProgress progress;

    @Autowired
    @SuppressWarnings("checkstyle:ParameterNumber")
    public AnalysisJobRepository(
        final AnalysisJobs jobs,
        final Analyses analyses,
        final Submissions submissions,
        final SubmissionEvents events,
        final DatabaseWork databaseWork,
        final ReadCommittedTransactions transactions
    ) {
        this.jobs = Objects.requireNonNull(jobs, "jobs");
        this.analyses = Objects.requireNonNull(analyses, "analyses");
        this.submissions = Objects.requireNonNull(submissions, "submissions");
        this.events = Objects.requireNonNull(events, "events");
        this.databaseWork = Objects.requireNonNull(databaseWork, "databaseWork");
        this.transactions = Objects.requireNonNull(transactions, "transactions");
        progress = new SubmissionProgress(submissions);
    }

    public Mono<Void> enqueue(final long submissionId, final long analysisId) {
        return databaseWork.submit(() -> enqueueAnalysis(submissionId, analysisId));
    }

    /**
     * Reading the position and inserting the job are deliberately two statements rather than one locked read-modify-
     * write: two projects landing on the same queue position only means they are equally urgent, which they are.
     */
    private Void enqueueAnalysis(final long submissionId, final long analysisId) {
        final int queuePosition = jobs.nextQueuePosition(submissionId);
        Idempotent.write(() -> jobs.enqueueAnalysis(submissionId, analysisId, queuePosition));
        return null;
    }

    public Mono<Void> enqueueStudio(final long submissionId, final String studioId) {
        return enqueueIngestion(submissionId, "STUDIO_INGEST", studioId);
    }

    public Mono<Void> enqueueTeacher(final long submissionId, final long artifactId) {
        return enqueueIngestion(submissionId, "TEACHER_INGEST", Long.toString(artifactId));
    }

    public Mono<Void> enqueueProjectList(final long submissionId, final long artifactId) {
        return enqueueIngestion(submissionId, "PROJECT_LIST_INGEST", Long.toString(artifactId));
    }

    private Mono<Void> enqueueIngestion(
        final long submissionId,
        final String jobKind,
        final String sourceReference
    ) {
        Objects.requireNonNull(jobKind, "jobKind");
        Objects.requireNonNull(sourceReference, "sourceReference");
        return databaseWork.submit(() -> enqueueIngestionOnce(submissionId, jobKind, sourceReference));
    }

    /**
     * One statement, so there is nothing for a transaction to hold together. Two requests for the same studio are kept
     * from both queueing an ingestion by a unique key rather than by locking the submission row; the second one to
     * arrive finds the job already there.
     */
    private Void enqueueIngestionOnce(
        final long submissionId,
        final String jobKind,
        final String sourceReference
    ) {
        Idempotent.write(() -> jobs.enqueueIngestion(submissionId, jobKind, sourceReference));
        return null;
    }

    /**
     * Claims the next available analysis job for a worker.
     *
     * @param workerId      worker identifier
     * @param leaseDuration lease duration
     * @return claimed job, if one is available
     */
    public Mono<Job> claimNext(final String workerId, final Duration leaseDuration) {
        Objects.requireNonNull(workerId, "workerId");
        Objects.requireNonNull(leaseDuration, "leaseDuration");
        if (leaseDuration.isZero() || leaseDuration.isNegative()) {
            return Mono.error(new IllegalArgumentException("leaseDuration must be positive"));
        }
        return databaseWork.submit(() -> claimNextJob(workerId, leaseDuration));
    }

    /**
     * Takes the next job in a single statement. Choosing the row and stamping the lease onto it together is what makes
     * the lease safe — not the surrounding transaction — so two workers cannot both believe they hold it.
     *
     * <p>
     * The lease token identifies the attempt rather than the worker, because one worker runs several jobs at once and
     * has to be able to say which of them it means.
     */
    private Job claimNextJob(final String workerId, final Duration leaseDuration) {
        final String leaseToken = workerId + ":" + UUID.randomUUID();
        if (jobs.claimNext(leaseToken, leaseDuration.toNanos() / 1_000L, MAX_ATTEMPTS) != 1) {
            return null;
        }
        return jobs.findByLeaseOwner(leaseToken).map(job -> toJob(job, leaseToken)).orElse(null);
    }

    public Mono<Void> finish(final long jobId, final String workerId, final boolean failed) {
        return databaseWork.submit(() -> finishJob(jobId, workerId, failed));
    }

    private Void finishJob(final long jobId, final String workerId, final boolean failed) {
        if (jobs.finish(jobId, workerId, failed ? "FAILED" : "COMPLETED") != 1) {
            throw new LeaseLostException();
        }
        return null;
    }

    /**
     * Renews a worker's lease while it is still valid.
     *
     * @param jobId         job identifier
     * @param workerId      worker identifier
     * @param leaseDuration new lease duration
     * @return whether the lease was renewed
     */
    public Mono<Boolean> renew(final long jobId, final String workerId, final Duration leaseDuration) {
        if (leaseDuration.isZero() || leaseDuration.isNegative()) {
            return Mono.error(new IllegalArgumentException("leaseDuration must be positive"));
        }
        return databaseWork.submit(
            () -> jobs.renew(jobId, workerId, leaseDuration.toNanos() / 1_000L) == 1
        );
    }

    /**
     * Checks whether a worker still owns a running lease.
     *
     * @param jobId    job identifier
     * @param workerId worker identifier
     * @return whether the lease is still owned
     */
    public Mono<Boolean> leaseOwned(final long jobId, final String workerId) {
        Objects.requireNonNull(workerId, "workerId");
        return databaseWork.submit(
            () -> jobs.findHeldLease(jobId, workerId)
                .isPresent()
        );
    }

    public Mono<Boolean> retryAfterError(final long jobId, final String workerId) {
        Objects.requireNonNull(workerId, "workerId");
        return databaseWork.submit(
            () -> transactions.execute(status -> retryAfterErrorTransaction(jobId, workerId))
        );
    }

    private boolean retryAfterErrorTransaction(final long jobId, final String workerId) {
        final Job current = jobs
            .findHeldLease(jobId, workerId)
            .map(job -> toJob(job, workerId))
            .orElse(null);
        if (current == null) {
            return false;
        }
        if (current.cancelRequested()) {
            settleCancelled(current);
            return false;
        }
        if (current.attempts() >= MAX_ATTEMPTS) {
            settleExhausted(current);
            return false;
        }
        // The update repeats the conditions the read checked, so a lease lost in between changes nothing.
        return jobs.releaseForRetry(jobId, workerId) == 1;
    }

    public Mono<Boolean> cancellationRequested(final long jobId) {
        return databaseWork.submit(
            () -> jobs.findById(jobId).map(AnalysisJobEntity::isCancelRequested).orElse(false)
        );
    }

    /**
     * Settles the jobs that claiming will never pick up again: those cancelled while nobody held them, and those whose
     * attempts ran out. Kept out of the claim path, which should only decide what to run next.
     *
     * <p>
     * Handles one batch of {@value #REAP_BATCH_SIZE} per call; the caller comes back often enough for the rest.
     *
     * @return the number of jobs settled
     * @see AnalysisJobs#findAbandoned
     */
    public Mono<Integer> reapAbandonedJobs() {
        return databaseWork.submit(() -> transactions.execute(status -> settleAbandonedJobs()));
    }

    private Integer settleAbandonedJobs() {
        final List<Job> abandoned = jobs.findAbandoned(MAX_ATTEMPTS, REAP_BATCH_SIZE).stream()
            .map(job -> toJob(job, null))
            .toList();
        for (final Job job : abandoned) {
            if (job.cancelRequested()) {
                settleCancelled(job);
            }
            else {
                settleExhausted(job);
            }
        }
        return abandoned.size();
    }

    /**
     * Deletes terminal jobs older than the retention period.
     *
     * @param retention retention period
     * @return number of deleted jobs
     */
    public Mono<Integer> deleteTerminalJobsOlderThan(final Duration retention) {
        Objects.requireNonNull(retention, "retention");
        if (retention.isNegative()) {
            return Mono.error(new IllegalArgumentException("retention must not be negative"));
        }
        return databaseWork.submit(() -> jobs.deleteTerminalOlderThan(retention.toNanos() / 1_000L));
    }

    public record Job(
        long id,
        long submissionId,
        Long analysisId,
        String kind,
        String sourceReference,
        String state,
        boolean cancelRequested,
        int attempts,
        // Identifies the claim rather than the worker, so a worker holding several jobs can say which lease it
        // means when renewing or releasing one.
        String leaseToken
    ) {

        public Job {
            Objects.requireNonNull(kind, "kind");
            Objects.requireNonNull(state, "state");
            if (attempts < 0) {
                throw new IllegalArgumentException("attempts must not be negative");
            }
        }

        public boolean reclaimed() {
            return attempts > 1;
        }
    }

    public static final class LeaseLostException extends IllegalStateException {

        private static final long serialVersionUID = 1L;

        public LeaseLostException() {
            super("Job lease is no longer owned by this worker");
        }
    }

    private Job toJob(final AnalysisJobEntity entity, final String leaseToken) {
        return new Job(
            entity.getId(), entity.getSubmissionId(), entity.getAnalysisId(), entity.getJobKind(),
            entity.getSourceReference(), entity.getState(), entity.isCancelRequested(), entity.getAttempts(),
            leaseToken
        );
    }

    /**
     * Settles a job somebody asked to stop, along with its analysis and its submission.
     *
     * <p>
     * The submission is usually cancelled already, because whatever set {@code cancel_requested} on the job was
     * {@link SubmissionRepository#cancelEverything}, which cancels the submission in the same transaction. The event is
     * only written when this call is the one that changed the state, so a submission reached only from here still
     * records its cancellation exactly once.
     */
    private void settleCancelled(final Job job) {
        jobs.markCancelled(job.id());
        if (job.analysisId() != null) {
            analyses.cancel(job.analysisId());
        }
        if (submissions.cancelIfActive(job.submissionId()) == 1) {
            events.append(job.submissionId(), "CANCELLED", "{\"status\":\"cancelled\"}");
        }
    }

    /**
     * Settles a job whose attempts ran out: the work failed and nothing will pick it up again.
     *
     * <p>
     * A submission already marked cancelled is left as it is — recording a failure against it would replace the fact
     * that somebody stopped the work with a claim that the work went wrong.
     */
    private void settleExhausted(final Job job) {
        final boolean recorded = job.analysisId() == null
            ? progress.recordFailure(job.submissionId(), true)
            : exhaustAnalysis(job);
        jobs.markFailed(job.id());
        if (recorded) {
            events.append(job.submissionId(), "FAILED", "{\"status\":\"failed\",\"reason\":\"recovery\"}");
        }
    }

    private boolean exhaustAnalysis(final Job job) {
        if ("CANCELLED".equals(progress.counts(job.submissionId()).state())) {
            return false;
        }
        if (analyses.exhaust(job.analysisId(), job.submissionId()) != 1) {
            return false;
        }
        progress.recordFailure(job.submissionId(), false);
        return true;
    }
}
