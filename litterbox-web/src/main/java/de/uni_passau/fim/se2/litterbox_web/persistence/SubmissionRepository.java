/*
 * Copyright (C) 2024-2026 LitterBox-Web contributors
 *
 * This file is part of LitterBox-Web.
 * Licenced under the EUPL-1.2 or later.
 *
 * SPDX-FileCopyrightText: 2024-2026 LitterBox-Web contributors
 * SPDX-License-Identifier: EUPL-1.2
 */
package de.uni_passau.fim.se2.litterbox_web.persistence;

import java.util.Objects;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Repository;

import de.uni_passau.fim.se2.litterbox_web.persistence.entity.SubmissionEntity;
import de.uni_passau.fim.se2.litterbox_web.persistence.jpa.Analyses;
import de.uni_passau.fim.se2.litterbox_web.persistence.jpa.AnalysisJobs;
import de.uni_passau.fim.se2.litterbox_web.persistence.jpa.SubmissionEvents;
import de.uni_passau.fim.se2.litterbox_web.persistence.jpa.Submissions;
import reactor.core.publisher.Mono;

@Repository
public class SubmissionRepository {

    private final Submissions submissions;
    private final SubmissionEvents events;
    private final AnalysisJobs jobs;
    private final Analyses analyses;
    private final DatabaseWork databaseWork;
    private final ShareTokenGenerator tokenGenerator;
    private final ReadCommittedTransactions transactions;
    private final SubmissionProgress progress;

    @Autowired
    @SuppressWarnings("checkstyle:ParameterNumber")
    public SubmissionRepository(
        final Submissions submissions,
        final SubmissionEvents events,
        final AnalysisJobs jobs,
        final Analyses analyses,
        final DatabaseWork databaseWork,
        final ReadCommittedTransactions transactions
    ) {
        this.submissions = Objects.requireNonNull(submissions, "submissions");
        this.events = Objects.requireNonNull(events, "events");
        this.jobs = Objects.requireNonNull(jobs, "jobs");
        this.analyses = Objects.requireNonNull(analyses, "analyses");
        this.databaseWork = Objects.requireNonNull(databaseWork, "databaseWork");
        this.tokenGenerator = new ShareTokenGenerator();
        this.transactions = Objects.requireNonNull(transactions, "transactions");
        progress = new SubmissionProgress(submissions);
    }

    public Mono<Submission> create(final CreateSubmission request) {
        Objects.requireNonNull(request, "request");
        return databaseWork.submit(() -> createInDatabase(request));
    }

    private Submission createInDatabase(final CreateSubmission request) {
        final String token = tokenGenerator.nextToken();
        final SubmissionEntity entity = new SubmissionEntity();
        entity.setShareToken(token);
        entity.setSourceType(request.sourceType());
        entity.setLocale(request.locale());
        entity.setState("STORED");
        entity.setRetentionState("ACTIVE");
        entity.setExpectedCount(request.expectedCount());
        entity.setCompletedCount(0);
        entity.setFailedCount(0);
        final SubmissionEntity saved = submissions.saveAndFlush(entity);
        return new Submission(
            saved.getId(), token, request.sourceType(), request.locale(), "STORED", "ACTIVE",
            request.expectedCount(), 0, 0
        );
    }

    public Mono<Submission> findByToken(final String shareToken) {
        Objects.requireNonNull(shareToken, "shareToken");
        return databaseWork.submit(
            () -> submissions.findByShareToken(shareToken).map(SubmissionRepository::toSubmission).orElse(null)
        );
    }

    public Mono<Submission> findById(final long id) {
        return databaseWork.submit(
            () -> submissions.findById(id).map(SubmissionRepository::toSubmission).orElse(null)
        );
    }

    public Mono<Void> markRunnable(final long submissionId) {
        return databaseWork.submit(() -> {
            submissions.markRunnable(submissionId);
            return null;
        });
    }

    public Mono<Void> markRunning(final long submissionId) {
        return databaseWork.submit(() -> {
            submissions.markRunning(submissionId);
            return null;
        });
    }

    /**
     * Says how many projects a submission is now expected to produce.
     *
     * @see Submissions#prepareBatch
     */
    public Mono<Void> prepareBatch(final long submissionId, final int expectedCount) {
        if (expectedCount < 1) {
            return Mono.error(new IllegalArgumentException("expectedCount must be positive"));
        }
        return databaseWork.submit(() -> {
            submissions.prepareBatch(submissionId, expectedCount);
            return null;
        });
    }

    public Mono<OwnedBatchFailure> failBatchIngestionIfOwned(
        final long submissionId,
        final long jobId,
        final String workerId
    ) {
        Objects.requireNonNull(workerId, "workerId");
        return databaseWork.submit(
            () -> transactions.execute(
                status -> failBatchIngestionIfOwnedInTransaction(submissionId, jobId, workerId)
            )
        );
    }

    private OwnedBatchFailure failBatchIngestionIfOwnedInTransaction(
        final long submissionId,
        final long jobId,
        final String workerId
    ) {
        final boolean leaseOwned = jobs
            .findHeldLease(jobId, workerId)
            .filter(job -> job.getSubmissionId() == submissionId && !job.isCancelRequested())
            .isPresent();
        if (!leaseOwned) {
            return new OwnedBatchFailure(false, false);
        }
        final boolean changed = progress.recordFailure(submissionId, true);
        if (changed) {
            events.append(submissionId, "FAILED", "{\"status\":\"failed\"}");
        }
        return new OwnedBatchFailure(true, changed);
    }

    private static Submission toSubmission(final SubmissionEntity entity) {
        return new Submission(
            entity.getId(), entity.getShareToken(), entity.getSourceType(), entity.getLocale(), entity.getState(),
            entity.getRetentionState(), entity.getExpectedCount(), entity.getCompletedCount(),
            entity.getFailedCount()
        );
    }

    /**
     * Cancels a submission and everything under it, and says whether this call is what stopped it.
     *
     * <p>
     * All of it in one transaction: the submission, its jobs, its analyses and the event either all take effect or none
     * do, so a failure part way through cannot leave jobs queued under a submission that already says it was cancelled.
     *
     * <p>
     * The jobs and analyses are cancelled whatever the submission's state already was, so asking again finishes work an
     * earlier attempt did not get to. Only the event depends on the state having changed, and it is written here, in
     * the transaction that changed it.
     *
     * @return whether this call is the one that cancelled the submission
     */
    public Mono<Boolean> cancelEverything(final long submissionId) {
        return databaseWork.submit(() -> transactions.execute(status -> cancelEverythingInTransaction(submissionId)));
    }

    private boolean cancelEverythingInTransaction(final long submissionId) {
        final boolean changed = submissions.cancelIfActive(submissionId) == 1;
        jobs.cancelSubmission(submissionId);
        analyses.cancelSubmission(submissionId);
        if (changed) {
            events.append(submissionId, "CANCELLED", "{\"status\":\"cancelled\"}");
        }
        return changed;
    }

    public record OwnedBatchFailure(boolean leaseOwned, boolean changed) {
    }

    public record CreateSubmission(String sourceType, String locale, int expectedCount) {

        public CreateSubmission {
            Objects.requireNonNull(sourceType, "sourceType");
            Objects.requireNonNull(locale, "locale");
            if (expectedCount < 0) {
                throw new IllegalArgumentException("expectedCount must not be negative");
            }
        }

        public CreateSubmission(final String sourceType, final String locale) {
            this(sourceType, locale, 1);
        }
    }
}
