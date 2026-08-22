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

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;

import javax.sql.DataSource;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionStatus;

import de.uni_passau.fim.se2.litterbox_web.persistence.entity.AnalysisJobEntity;
import de.uni_passau.fim.se2.litterbox_web.persistence.jpa.Analyses;
import de.uni_passau.fim.se2.litterbox_web.persistence.jpa.AnalysisJobs;
import de.uni_passau.fim.se2.litterbox_web.persistence.jpa.AnalysisMetrics;
import de.uni_passau.fim.se2.litterbox_web.persistence.jpa.SubmissionArtifacts;
import de.uni_passau.fim.se2.litterbox_web.persistence.jpa.SubmissionEvents;
import de.uni_passau.fim.se2.litterbox_web.persistence.jpa.Submissions;
import de.uni_passau.fim.se2.litterbox_web.util.ImmediateWork;
import de.uni_passau.fim.se2.litterbox_web.util.TestDatabase;
import de.uni_passau.fim.se2.litterbox_web.util.TestRepositories;

class AnalysisJobRepositoryTest {

    private static final String SUBMISSION_INSERT = "INSERT INTO submission (share_token, source_type, locale, state) ";

    private AnalysisJobs queue;
    private AnalysisJobRepository jobs;

    @BeforeEach
    void createRepository() {
        queue = mock(AnalysisJobs.class);
        final PlatformTransactionManager transactionManager = mock(PlatformTransactionManager.class);
        when(transactionManager.getTransaction(any())).thenReturn(mock(TransactionStatus.class));
        final ReadCommittedTransactions transactions = new ReadCommittedTransactions(transactionManager);
        jobs = new AnalysisJobRepository(
            queue, mock(Analyses.class), mock(Submissions.class), mock(SubmissionEvents.class),
            ImmediateWork.database(), transactions
        );
    }

    /**
     * The row is chosen and stamped by one statement. Were it chosen by a read and stamped by a later write, two
     * workers could both read the same row before either wrote, and the lock that used to close that gap is what this
     * design does without.
     */
    @Test
    void claimTakesTheJobInASingleStatementAndRecoversExpiredLeases() {
        final AnalysisJobEntity running = new AnalysisJobEntity();
        running.setId(7L);
        running.setSubmissionId(11L);
        running.setAnalysisId(13L);
        running.setJobKind("ANALYSIS");
        running.setState("RUNNING");
        when(queue.claimNext(anyString(), anyLong(), anyInt())).thenReturn(1);
        when(queue.findByLeaseOwner(anyString())).thenReturn(Optional.of(running));

        final AnalysisJobRepository.Job claimed = jobs.claimNext("worker", Duration.ofSeconds(30)).block();

        assertThat(claimed).isNotNull();
        assertThat(claimed.state()).isEqualTo("RUNNING");
        assertThat(claimed.leaseToken()).startsWith("worker:");
    }

    /** A worker runs several jobs at once, so the lease has to name the claim rather than the worker. */
    @Test
    void eachClaimGetsALeaseTokenOfItsOwn() {
        final AnalysisJobEntity running = new AnalysisJobEntity();
        running.setId(7L);
        running.setJobKind("ANALYSIS");
        running.setState("RUNNING");
        when(queue.claimNext(anyString(), anyLong(), anyInt())).thenReturn(1);
        when(queue.findByLeaseOwner(anyString())).thenReturn(Optional.of(running));

        jobs.claimNext("worker", Duration.ofSeconds(30)).block();
        jobs.claimNext("worker", Duration.ofSeconds(30)).block();

        final ArgumentCaptor<String> tokens = ArgumentCaptor.forClass(String.class);
        verify(queue, org.mockito.Mockito.times(2)).claimNext(tokens.capture(), anyLong(), anyInt());
        assertThat(tokens.getAllValues().get(0)).isNotEqualTo(tokens.getAllValues().get(1));
    }

    @Test
    void rejectsRenewalAndFinalizationAfterLeaseOwnershipIsLost() {
        when(queue.renew(anyLong(), anyString(), anyLong())).thenReturn(0);
        when(queue.finish(anyLong(), anyString(), anyString())).thenReturn(0);

        assertThat(jobs.renew(7, "stale-worker", Duration.ofSeconds(30)).block()).isFalse();
        assertThatThrownBy(() -> jobs.finish(7, "stale-worker", false).block())
            .isInstanceOf(IllegalStateException.class)
            .hasMessage("Job lease is no longer owned by this worker");
    }

    @Test
    void enqueuesStudioIngestionWithoutAnAnalysisRow() {
        jobs.enqueueStudio(11, "12345").block();

        verify(queue).enqueueIngestion(11L, "STUDIO_INGEST", "12345");
    }

    @Test
    void enqueuesTeacherIngestionForTheRetainedArchive() {
        jobs.enqueueTeacher(11, 29).block();

        verify(queue).enqueueIngestion(11L, "TEACHER_INGEST", "29");
    }

    @Test
    @SuppressWarnings("checkstyle:MethodLength")
    void mariaDbEnforcesClaimsRecoveryEventsCancellationAndRetention() throws Exception {
        try (
            TestDatabase database = TestDatabase.freshSchema("analysis_job");
            TestRepositories repositories = new TestRepositories(database.migrated())
        ) {
            final DataSource dataSource = database.dataSource();
            final JdbcTemplate template = new JdbcTemplate(dataSource);
            final ReadCommittedTransactions transactionManager = repositories.transactions();
            final DatabaseWork direct = ImmediateWork.database();
            final AnalysisJobRepository first = new AnalysisJobRepository(
                repositories.of(AnalysisJobs.class), repositories.of(Analyses.class),
                repositories.of(Submissions.class), repositories.of(SubmissionEvents.class), direct,
                transactionManager
            );
            final AnalysisJobRepository second = new AnalysisJobRepository(
                repositories.of(AnalysisJobs.class), repositories.of(Analyses.class),
                repositories.of(Submissions.class), repositories.of(SubmissionEvents.class), direct,
                transactionManager
            );
            final AnalysisRepository analyses = new AnalysisRepository(
                repositories.of(Analyses.class), repositories.of(AnalysisMetrics.class),
                repositories.of(AnalysisJobs.class), repositories.of(Submissions.class),
                repositories.of(SubmissionEvents.class), direct, transactionManager
            );
            final SubmissionRepository submissions = new SubmissionRepository(
                repositories.of(Submissions.class), repositories.of(SubmissionEvents.class),
                repositories.of(AnalysisJobs.class), repositories.of(Analyses.class), direct, transactionManager
            );
            final SubmissionArtifactRepository firstArtifacts = new SubmissionArtifactRepository(
                repositories.of(SubmissionArtifacts.class), repositories.of(Analyses.class), direct,
                transactionManager
            );
            final SubmissionArtifactRepository secondArtifacts = new SubmissionArtifactRepository(
                repositories.of(SubmissionArtifacts.class), repositories.of(Analyses.class), direct,
                transactionManager
            );
            final SubmissionEventRepository firstEvents = new SubmissionEventRepository(
                repositories.of(SubmissionEvents.class), direct
            );
            final SubmissionEventRepository secondEvents = new SubmissionEventRepository(
                repositories.of(SubmissionEvents.class), direct
            );

            template.update(
                "INSERT INTO submission (share_token, source_type, locale, state, expected_count) "
                    + "VALUES ('claim-token', 'SCRATCH_STUDIO', 'en', 'RUNNING', 2)"
            );
            final long claimSubmission = template.queryForObject(
                "SELECT id FROM submission WHERE share_token = 'claim-token'", Long.class
            );
            template.update(
                "INSERT INTO analysis_job (submission_id, job_kind, source_reference, state) "
                    + "VALUES (?, 'STUDIO_INGEST', '1', 'QUEUED'), (?, 'TEACHER_INGEST', '2', 'QUEUED')",
                claimSubmission, claimSubmission
            );

            final ExecutorService workers = Executors.newFixedThreadPool(2);
            try {
                final Future<AnalysisJobRepository.Job> firstClaim = workers.submit(
                    () -> first.claimNext("worker-a", Duration.ofSeconds(30)).block()
                );
                final Future<AnalysisJobRepository.Job> secondClaim = workers.submit(
                    () -> second.claimNext("worker-b", Duration.ofSeconds(30)).block()
                );
                final AnalysisJobRepository.Job firstJob = get(firstClaim);
                final AnalysisJobRepository.Job secondJob = get(secondClaim);
                final List<AnalysisJobRepository.Job> claimed = java.util.stream.Stream.of(firstJob, secondJob)
                    .filter(java.util.Objects::nonNull)
                    .toList();

                // Two jobs of one submission are two pieces of work, and there are two workers free. What must not
                // happen is both workers holding the same row; that they hold one each is the point.
                assertThat(claimed).hasSize(2);
                assertThat(claimed).extracting(AnalysisJobRepository.Job::id).doesNotHaveDuplicates();
                assertThat(claimed).extracting(AnalysisJobRepository.Job::leaseToken).doesNotHaveDuplicates();
                assertThat(
                    template.queryForObject(
                        "SELECT COUNT(*) FROM analysis_job WHERE submission_id = ? AND state = 'RUNNING'",
                        Integer.class, claimSubmission
                    )
                ).isEqualTo(2);
                first.finish(firstJob.id(), firstJob.leaseToken(), false).block();
                second.finish(secondJob.id(), secondJob.leaseToken(), false).block();
            }
            finally {
                workers.shutdownNow();
            }

            final long expiredJob = template.queryForObject(
                "SELECT MIN(id) FROM analysis_job WHERE submission_id = ?", Long.class, claimSubmission
            );
            template.update(
                "UPDATE analysis_job SET state = 'RUNNING', lease_owner = 'dead-worker', "
                    + "lease_until = DATE_SUB(CURRENT_TIMESTAMP(6), INTERVAL 1 SECOND), attempts = 1 WHERE id = ?",
                expiredJob
            );
            final AnalysisJobRepository.Job recovered = first.claimNext("new-worker", Duration.ofSeconds(30)).block();
            assertThat(recovered).isNotNull();
            assertThat(recovered.reclaimed()).isTrue();
            assertThat(recovered.leaseToken()).startsWith("new-worker:");
            first.finish(recovered.id(), recovered.leaseToken(), false).block();

            template.update(
                SUBMISSION_INSERT
                    + "VALUES ('poison-token', 'TEACHER_ZIP', 'en', 'RUNNING')"
            );
            final long poisonSubmission = template.queryForObject(
                "SELECT id FROM submission WHERE share_token = 'poison-token'", Long.class
            );
            template.update(
                "INSERT INTO analysis_job (submission_id, job_kind, source_reference, state, lease_owner, "
                    + "lease_until, attempts) VALUES (?, 'TEACHER_INGEST', '9', 'RUNNING', 'dead', "
                    + "DATE_SUB(CURRENT_TIMESTAMP(6), INTERVAL 1 SECOND), 3)",
                poisonSubmission
            );
            // Claiming looks only for work it could run, so a job that has used up its attempts is invisible to it.
            // Saying what became of that job is the reaper's business, not the claimer's.
            assertThat(first.claimNext("worker", Duration.ofSeconds(30)).block()).isNull();
            assertThat(first.reapAbandonedJobs().block()).isEqualTo(1);
            assertThat(
                template.queryForObject(
                    "SELECT state FROM analysis_job WHERE submission_id = ?", String.class, poisonSubmission
                )
            ).isEqualTo("FAILED");
            assertThat(
                template.queryForMap(
                    "SELECT state, expected_count, failed_count FROM submission WHERE id = ?", poisonSubmission
                )
            ).containsEntry("state", "FAILED").containsEntry("expected_count", 1).containsEntry("failed_count", 1);
            assertThat(
                template.queryForObject(
                    "SELECT COUNT(*) FROM submission_event WHERE submission_id = ?", Integer.class, poisonSubmission
                )
            ).isEqualTo(1);

            template.update(
                "INSERT INTO submission (share_token, source_type, locale, state, expected_count) "
                    + "VALUES ('owned-completion-token', 'UPLOAD', 'en', 'RUNNING', 1)"
            );
            final long ownedSubmission = template.queryForObject(
                "SELECT id FROM submission WHERE share_token = 'owned-completion-token'", Long.class
            );
            template.update(
                "INSERT INTO source_artifact (sha256, storage_key, byte_size, source_kind, retention_state) "
                    + "VALUES (UNHEX(REPEAT('01', 32)), 'owned-completion-artifact', 1, 'UPLOAD', 'ACTIVE')"
            );
            final long ownedArtifact = template.queryForObject(
                "SELECT id FROM source_artifact WHERE storage_key = 'owned-completion-artifact'", Long.class
            );
            template.update(
                "INSERT INTO analysis (submission_id, source_artifact_id, provenance, report_schema_version, "
                    + "litterbox_artifact_version, locale, status) VALUES (?, ?, 'UPLOAD', '1', 'synthetic', "
                    + "'en', 'RUNNING')",
                ownedSubmission, ownedArtifact
            );
            final long ownedAnalysis = template.queryForObject(
                "SELECT id FROM analysis WHERE submission_id = ?", Long.class, ownedSubmission
            );
            template.update(
                "INSERT INTO analysis_job (submission_id, analysis_id, state, lease_owner, lease_until, attempts) "
                    + "VALUES (?, ?, 'RUNNING', 'owner', DATE_ADD(CURRENT_TIMESTAMP(6), INTERVAL 1 MINUTE), 1)",
                ownedSubmission, ownedAnalysis
            );
            final long ownedJob = template.queryForObject(
                "SELECT id FROM analysis_job WHERE submission_id = ?", Long.class, ownedSubmission
            );
            assertThat(
                analyses.completeIfOwned(
                    ownedAnalysis, ownedSubmission, false, "{}", null, null, "{\"status\":\"completed\"}",
                    null, null, null, ownedJob, "stale-owner"
                ).block()
            ).isFalse();
            assertThat(
                template.queryForMap(
                    "SELECT state, completed_count, failed_count FROM submission WHERE id = ?", ownedSubmission
                )
            ).containsEntry("state", "RUNNING").containsEntry("completed_count", 0).containsEntry("failed_count", 0);
            assertThat(
                analyses.completeIfOwned(
                    ownedAnalysis, ownedSubmission, false, "{}", null, null, "{\"status\":\"completed\"}",
                    null, null, null, ownedJob, "owner"
                ).block()
            ).isTrue();
            assertThat(
                analyses.completeIfOwned(
                    ownedAnalysis, ownedSubmission, false, "{}", null, null, "{\"status\":\"completed\"}",
                    null, null, null, ownedJob, "owner"
                ).block()
            ).isFalse();
            assertThat(
                template.queryForMap(
                    "SELECT state, completed_count, failed_count FROM submission WHERE id = ?", ownedSubmission
                )
            ).containsEntry("state", "COMPLETED").containsEntry("completed_count", 1).containsEntry("failed_count", 0);
            assertThat(
                template.queryForObject(
                    "SELECT COUNT(*) FROM submission_event WHERE submission_id = ?", Integer.class, ownedSubmission
                )
            ).isEqualTo(1);

            template.update(
                SUBMISSION_INSERT
                    + "VALUES ('owned-ingestion-token', 'TEACHER_ZIP', 'en', 'RUNNING')"
            );
            final long ownedIngestionSubmission = template.queryForObject(
                "SELECT id FROM submission WHERE share_token = 'owned-ingestion-token'", Long.class
            );
            template.update(
                "INSERT INTO analysis_job (submission_id, job_kind, source_reference, state, lease_owner, "
                    + "lease_until, attempts) VALUES (?, 'TEACHER_INGEST', '7', 'RUNNING', 'owner', "
                    + "DATE_ADD(CURRENT_TIMESTAMP(6), INTERVAL 1 MINUTE), 1)",
                ownedIngestionSubmission
            );
            final long ownedIngestionJob = template.queryForObject(
                "SELECT id FROM analysis_job WHERE submission_id = ?", Long.class, ownedIngestionSubmission
            );
            assertThat(
                submissions.failBatchIngestionIfOwned(
                    ownedIngestionSubmission, ownedIngestionJob, "stale-owner"
                ).block().leaseOwned()
            ).isFalse();
            assertThat(
                submissions.failBatchIngestionIfOwned(
                    ownedIngestionSubmission, ownedIngestionJob, "owner"
                ).block()
            ).isEqualTo(new SubmissionRepository.OwnedBatchFailure(true, true));
            assertThat(
                submissions.failBatchIngestionIfOwned(
                    ownedIngestionSubmission, ownedIngestionJob, "owner"
                ).block()
            ).isEqualTo(new SubmissionRepository.OwnedBatchFailure(true, false));
            assertThat(
                template.queryForMap(
                    "SELECT state, expected_count, completed_count, failed_count FROM submission WHERE id = ?",
                    ownedIngestionSubmission
                )
            ).containsEntry("state", "FAILED").containsEntry("expected_count", 1)
                .containsEntry("completed_count", 0).containsEntry("failed_count", 1);
            assertThat(
                template.queryForObject(
                    "SELECT COUNT(*) FROM submission_event WHERE submission_id = ?",
                    Integer.class, ownedIngestionSubmission
                )
            ).isEqualTo(1);

            template.update(
                SUBMISSION_INSERT
                    + "VALUES ('event-token', 'UPLOAD', 'en', 'RUNNING')"
            );
            final long eventSubmission = template.queryForObject(
                "SELECT id FROM submission WHERE share_token = 'event-token'", Long.class
            );
            final ExecutorService eventWorkers = Executors.newFixedThreadPool(6);
            try {
                final List<Future<SubmissionEventRepository.SubmissionEvent>> events = new ArrayList<>();
                for (int index = 0; index < 6; index++) {
                    final int eventNumber = index;
                    events.add(
                        eventWorkers.submit(
                            () -> (eventNumber % 2 == 0 ? firstEvents : secondEvents).append(
                                eventSubmission, "PROGRESS", "{\"n\":" + eventNumber + "}"
                            ).block()
                        )
                    );
                }
                // The numbers come from the database and are shared with every submission, so they run with gaps.
                // What six concurrent appends must not do is give two events the same number, or lose one.
                final List<Long> numbers = events.stream().map(this::get)
                    .map(SubmissionEventRepository.SubmissionEvent::sequenceNo).toList();
                assertThat(numbers).hasSize(6).doesNotHaveDuplicates();
            }
            finally {
                eventWorkers.shutdownNow();
            }
            final List<Long> stored = template.queryForList(
                "SELECT sequence_no FROM submission_event WHERE submission_id = ? ORDER BY sequence_no",
                Long.class, eventSubmission
            );
            assertThat(stored).hasSize(6).isSorted();
            final long appended = firstEvents.append(eventSubmission, "PROGRESS", "{\"n\":0}").block().sequenceNo();
            assertThat(appended).isGreaterThan(stored.getLast());
            // A reader carries the highest number it has seen and asks for what came after it.
            assertThat(firstEvents.findAfter(eventSubmission, stored.get(1)).block())
                .extracting(SubmissionEventRepository.SubmissionEvent::sequenceNo)
                .containsExactly(stored.get(2), stored.get(3), stored.get(4), stored.get(5), appended);

            template.update(
                SUBMISSION_INSERT
                    + "VALUES ('cancel-token', 'UPLOAD', 'en', 'RUNNING')"
            );
            final long cancelSubmission = template.queryForObject(
                "SELECT id FROM submission WHERE share_token = 'cancel-token'", Long.class
            );
            template.update(
                "INSERT INTO analysis_job (submission_id, job_kind, source_reference, state, lease_owner, "
                    + "lease_until) VALUES (?, 'UPLOAD', 'queued', 'QUEUED', NULL, NULL), "
                    + "(?, 'UPLOAD', 'running', 'RUNNING', 'worker', DATE_ADD(CURRENT_TIMESTAMP(6), INTERVAL 1 MINUTE))",
                cancelSubmission, cancelSubmission
            );
            submissions.cancelEverything(cancelSubmission).block();
            assertThat(
                template.queryForList(
                    "SELECT state, cancel_requested FROM analysis_job WHERE submission_id = ? ORDER BY id",
                    cancelSubmission
                )
            ).isNotEmpty();
            assertThat(
                template.queryForObject(
                    "SELECT COUNT(*) FROM analysis_job WHERE submission_id = ? AND state = 'CANCELLED'",
                    Integer.class, cancelSubmission
                )
            ).isEqualTo(1);
            assertThat(
                template.queryForObject(
                    "SELECT cancel_requested FROM analysis_job WHERE submission_id = ? AND source_reference = 'running'",
                    Boolean.class, cancelSubmission
                )
            ).isTrue();

            template.update(
                SUBMISSION_INSERT
                    + "VALUES ('cleanup-token', 'UPLOAD', 'en', 'RUNNING')"
            );
            final long cleanupSubmission = template.queryForObject(
                "SELECT id FROM submission WHERE share_token = 'cleanup-token'", Long.class
            );
            template.update(
                "INSERT INTO analysis_job (submission_id, state, updated_at) VALUES (?, 'FAILED', "
                    + "DATE_SUB(CURRENT_TIMESTAMP(6), INTERVAL 2 HOUR)), (?, 'QUEUED', "
                    + "DATE_SUB(CURRENT_TIMESTAMP(6), INTERVAL 2 HOUR)), (?, 'RUNNING', "
                    + "DATE_SUB(CURRENT_TIMESTAMP(6), INTERVAL 2 HOUR))",
                cleanupSubmission, cleanupSubmission, cleanupSubmission
            );
            assertThat(first.deleteTerminalJobsOlderThan(Duration.ofHours(1)).block()).isEqualTo(1);
            assertThat(
                template.queryForObject(
                    "SELECT COUNT(*) FROM analysis_job WHERE submission_id = ?", Integer.class, cleanupSubmission
                )
            ).isEqualTo(2);

            template.update(
                "INSERT INTO submission (share_token, source_type, locale, state, expected_count) "
                    + "VALUES ('batch-link-token', 'SCRATCH_STUDIO', 'en', 'RUNNING', 1)"
            );
            final long batchSubmission = template.queryForObject(
                "SELECT id FROM submission WHERE share_token = 'batch-link-token'", Long.class
            );
            template.update(
                "INSERT INTO source_artifact (sha256, storage_key, byte_size, source_kind, retention_state) "
                    + "VALUES (UNHEX(REPEAT('0a', 32)), 'batch-link-a', 1, 'SCRATCH_URL', 'ACTIVE'), "
                    + "(UNHEX(REPEAT('0b', 32)), 'batch-link-b', 1, 'SCRATCH_URL', 'ACTIVE')"
            );
            final List<Long> batchArtifactIds = template.queryForList(
                "SELECT id FROM source_artifact WHERE storage_key IN ('batch-link-a', 'batch-link-b') ORDER BY id",
                Long.class
            );
            final byte[] firstDigest = new byte[32];
            final byte[] secondDigest = new byte[32];
            java.util.Arrays.fill(firstDigest, (byte) 0x0a);
            java.util.Arrays.fill(secondDigest, (byte) 0x0b);
            final ExecutorService batchWorkers = Executors.newFixedThreadPool(2);
            try {
                final Future<SubmissionArtifactRepository.LinkedAnalysis> firstLink = batchWorkers.submit(
                    () -> firstArtifacts.linkAnalysis(
                        new SubmissionArtifactRepository.BatchAnalysisLink(
                            batchSubmission, batchArtifactIds.getFirst(), "SCRATCH_PROJECT", "scratch-23.sb3",
                            "synthetic", "en", firstDigest, ".sb3"
                        )
                    ).block()
                );
                final Future<SubmissionArtifactRepository.LinkedAnalysis> secondLink = batchWorkers.submit(
                    () -> secondArtifacts.linkAnalysis(
                        new SubmissionArtifactRepository.BatchAnalysisLink(
                            batchSubmission, batchArtifactIds.getLast(), "SCRATCH_PROJECT", "scratch-23.sb3",
                            "synthetic", "en", secondDigest, ".sb3"
                        )
                    ).block()
                );
                final SubmissionArtifactRepository.LinkedAnalysis firstLinked = get(firstLink);
                final SubmissionArtifactRepository.LinkedAnalysis secondLinked = get(secondLink);
                assertThat(firstLinked.analysisId()).isEqualTo(secondLinked.analysisId());
                assertThat(List.of(firstLinked.created(), secondLinked.created())).containsExactlyInAnyOrder(
                    true, false
                );
            }
            finally {
                batchWorkers.shutdownNow();
            }
            assertThat(
                template.queryForObject(
                    "SELECT COUNT(*) FROM analysis WHERE submission_id = ?", Integer.class, batchSubmission
                )
            ).isEqualTo(1);
            assertThat(
                template.queryForObject(
                    "SELECT COUNT(*) FROM submission_artifact WHERE submission_id = ?", Integer.class,
                    batchSubmission
                )
            ).isEqualTo(1);
        }
    }

    private <T> T get(final Future<T> future) {
        try {
            return future.get();
        }
        catch (Exception error) {
            throw new AssertionError(error);
        }
    }
}
