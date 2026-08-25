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
     * Reading the position and inserting the job are two statements on purpose; the reason is with the queries. Two
     * projects landing on the same number would only mean they are equally urgent, which they are.
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
     * One statement, so there is nothing here for a transaction to hold together. What kept two requests for the same
     * studio from each queueing an ingestion was the submission row lock; now it is a unique key, and the request that
     * arrives second is told the job it wanted is already there.
     */
    private Void enqueueIngestionOnce(
        final long submissionId,
        final String jobKind,
        final String sourceReference
    ) {
        Idempotent.write(() -> jobs.enqueueIngestion(submissionId, jobKind, sourceReference));
        return null;
    }

    public Mono<Job> claimNext(final String workerId, final Duration leaseDuration) {
        Objects.requireNonNull(workerId, "workerId");
        Objects.requireNonNull(leaseDuration, "leaseDuration");
        if (leaseDuration.isZero() || leaseDuration.isNegative()) {
            return Mono.error(new IllegalArgumentException("leaseDuration must be positive"));
        }
        return databaseWork.submit(() -> claimNextJob(workerId, leaseDuration));
    }

    /**
     * Takes the next job in one statement, which is what makes the lease safe rather than the surrounding transaction:
     * the row is chosen and stamped together, so two workers cannot both believe they hold it.
     *
     * <p>
     * The lease token is unique to this attempt, not to the worker, because one worker runs several jobs at once and
     * the row it just took has to be identifiable among them.
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

    public Mono<Boolean> renew(final long jobId, final String workerId, final Duration leaseDuration) {
        if (leaseDuration.isZero() || leaseDuration.isNegative()) {
            return Mono.error(new IllegalArgumentException("leaseDuration must be positive"));
        }
        return databaseWork.submit(
            () -> jobs.renew(jobId, workerId, leaseDuration.toNanos() / 1_000L) == 1
        );
    }

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
        // The write re-asserts what the read saw; a lease lost in between makes it change nothing.
        return jobs.releaseForRetry(jobId, workerId) == 1;
    }

    public Mono<Boolean> cancellationRequested(final long jobId) {
        return databaseWork.submit(
            () -> jobs.findById(jobId).map(AnalysisJobEntity::isCancelRequested).orElse(false)
        );
    }

    /**
     * Settles the jobs claiming will never pick up again: those cancelled while nobody held them, and those whose
     * attempts ran out. They are not work, and deciding what became of them does not belong in the path that decides
     * what to run next.
     *
     * <p>
     * A page at a time, and the caller comes back soon enough for the rest.
     *
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
        // Identifies the claim rather than the worker, so a worker holding several jobs can still say which
        // lease it is renewing or giving up.
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
     * The submission is normally cancelled already — what set {@code cancel_requested} on the job was
     * {@link SubmissionRepository#cancelEverything}, which cancels the submission in the same transaction. The event is
     * written on the strength of this call having been the one to change the state, so a submission reached only from
     * here still says once that it was cancelled, rather than changing state with nothing recording it.
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
     * Settles a job whose attempts ran out: the work failed, and nothing is going to pick it up again.
     *
     * <p>
     * A cancelled submission is left to say so. Counting a failure against it would replace somebody's decision that
     * the work was not wanted with an account of the work having gone wrong.
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
