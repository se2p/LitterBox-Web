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

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.concurrent.CyclicBarrier;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.function.Supplier;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.jdbc.core.JdbcTemplate;

import de.uni_passau.fim.se2.litterbox_web.util.TestDatabase;
import de.uni_passau.fim.se2.litterbox_web.web_ui.persistence.jpa.Analyses;
import de.uni_passau.fim.se2.litterbox_web.web_ui.persistence.jpa.AnalysisJobs;
import de.uni_passau.fim.se2.litterbox_web.web_ui.persistence.jpa.AnalysisMetrics;
import de.uni_passau.fim.se2.litterbox_web.web_ui.persistence.jpa.IdempotencyKeys;
import de.uni_passau.fim.se2.litterbox_web.web_ui.persistence.jpa.ScratchProjectStatistics;
import de.uni_passau.fim.se2.litterbox_web.web_ui.persistence.jpa.SourceArtifacts;
import de.uni_passau.fim.se2.litterbox_web.web_ui.persistence.jpa.SubmissionArtifacts;
import de.uni_passau.fim.se2.litterbox_web.web_ui.persistence.jpa.SubmissionEvents;
import de.uni_passau.fim.se2.litterbox_web.web_ui.persistence.jpa.Submissions;
import de.uni_passau.fim.se2.litterbox_web.web_ui.util.ImmediateWork;
import de.uni_passau.fim.se2.litterbox_web.web_ui.util.TestRepositories;

/**
 * What happens when two requests, or twenty, arrive at once.
 *
 * <p>
 * Nothing here can be answered by a mock or by a single thread: each of these is a place where the code used to read
 * something, decide, and then write, and where the lock that made the three safe together has been taken away. What
 * stands in its place is the database refusing the second writer, and only a real database refuses.
 */
class ConcurrentWriteIntegrationTest {

    private static final int WRITERS = 16;

    @TempDir
    private java.nio.file.Path storage;

    /**
     * Two requests for the same studio arriving together used to be kept apart by a lock on the submission. Asking
     * whether an ingestion is queued and then queueing one is two decisions, and without the lock both requests can ask
     * before either answers.
     */
    @Test
    void twoRequestsForOneIngestionQueueOneJob() throws Exception {
        try (
            TestDatabase database = TestDatabase.freshSchema("enqueue_race");
            TestRepositories repositories = new TestRepositories(database.migrated())
        ) {
            final JdbcTemplate jdbc = database.jdbcTemplate();
            final long submissionId = submission(jdbc, "ingest-race-token", 0);
            final List<AnalysisJobRepository> writers = repeat(
                () -> new AnalysisJobRepository(
                    repositories.of(AnalysisJobs.class), repositories.of(Analyses.class),
                    repositories.of(Submissions.class), repositories.of(SubmissionEvents.class),
                    ImmediateWork.database(), repositories.transactions()
                )
            );

            together(writers, writer -> writer.enqueueStudio(submissionId, "451").block());

            assertThat(jobs(jdbc, submissionId)).isEqualTo(1);

            // A studio whose ingestion failed can be asked for again, which is what the unique key has to leave room
            // for and what a plain one over the three columns would have forbidden.
            jdbc.update("UPDATE analysis_job SET state = 'FAILED' WHERE submission_id = ?", submissionId);
            writers.getFirst().enqueueStudio(submissionId, "451").block();
            assertThat(jobs(jdbc, submissionId)).isEqualTo(2);
        }
    }

    /**
     * Two requests carrying one idempotency key both find it unused, and both build a submission before either binds
     * it. Only one binding can succeed, and the request that loses has to be told which submission the key stands for
     * rather than the one it built itself.
     */
    @Test
    void oneIdempotencyKeyAnswersWithOneSubmissionHoweverManyRequestsClaimIt() throws Exception {
        try (
            TestDatabase database = TestDatabase.freshSchema("idempotency_race");
            TestRepositories repositories = new TestRepositories(database.migrated())
        ) {
            final JdbcTemplate jdbc = database.jdbcTemplate();
            final byte[] digest = digest((byte) 0x11);
            final List<Long> submissions = new ArrayList<>();
            for (int index = 0; index < WRITERS; index++) {
                submissions.add(submission(jdbc, "idempotency-race-" + index, 1));
            }
            final List<IdempotencyKeyRepository> writers = repeat(
                () -> new IdempotencyKeyRepository(
                    repositories.of(IdempotencyKeys.class), ImmediateWork.database()
                )
            );

            final List<Long> answered = java.util.Collections.synchronizedList(new ArrayList<>());
            together(
                writers,
                writer -> answered.add(
                    writer.put("single", "one-key", digest, submissions.get(writers.indexOf(writer)))
                        .block()
                        .submissionId()
                )
            );

            assertThat(answered).hasSize(WRITERS).containsOnly(answered.getFirst());
            assertThat(submissions).contains(answered.getFirst());
            assertThat(
                jdbc.queryForObject("SELECT COUNT(*) FROM idempotency_key", Integer.class)
            ).isEqualTo(1);
        }
    }

    /**
     * A key that is already bound is not this request's to take. Saving the row left the decision to Hibernate, which
     * cannot tell a new row from a stored one when the caller supplies the key, looks first, and on finding one writes
     * over it — so a later request took a key that was not its own, along with the digest that is the only record of
     * what the key was bound for.
     */
    @Test
    void aKeyThatIsAlreadyBoundIsNotTakenBySomethingElse() throws Exception {
        try (
            TestDatabase database = TestDatabase.freshSchema("idempotency_binding");
            TestRepositories repositories = new TestRepositories(database.migrated())
        ) {
            final JdbcTemplate jdbc = database.jdbcTemplate();
            final long first = submission(jdbc, "binding-first", 1);
            final long second = submission(jdbc, "binding-second", 1);
            final IdempotencyKeyRepository keys = new IdempotencyKeyRepository(
                repositories.of(IdempotencyKeys.class), ImmediateWork.database()
            );

            assertThat(
                keys.put("single", "one-key", digest((byte) 0xAA), first).block().submissionId()
            ).isEqualTo(first);
            assertThat(
                keys.put("single", "one-key", digest((byte) 0xAA), second).block().submissionId()
            )
                .as(
                    "the same request again is answered with the submission the key stands for"
                )
                .isEqualTo(first);
            assertThatThrownBy(
                () -> keys.put("single", "one-key", digest((byte) 0xBB), second).block()
            )
                .as("a different request under a used key is refused, not obeyed")
                .isInstanceOf(IdempotencyKeyRepository.IdempotencyConflictException.class);

            assertThat(jdbc.queryForObject("SELECT submission_id FROM idempotency_key", Long.class))
                .isEqualTo(first);
        }
    }

    /**
     * Counting a finished project was a read of the row followed by a write that re-asserted what the read saw, given
     * up on after a fixed number of attempts. How many workers meet on one submission is a matter of configuration and
     * of how many instances are running, so no fixed number was the right one.
     */
    @Test
    void everyCompletionIsCountedHoweverManyArriveAtOnce() throws Exception {
        try (
            TestDatabase database = TestDatabase.freshSchema("progress_race");
            TestRepositories repositories = new TestRepositories(database.migrated())
        ) {
            final JdbcTemplate jdbc = database.jdbcTemplate();
            final long submissionId = submission(jdbc, "progress-race-token", WRITERS);
            final long artifactId = artifact(jdbc, "progress-race-artifact", (byte) 0x22);
            final List<Long> analysisIds = new ArrayList<>();
            final List<Long> jobIds = new ArrayList<>();
            for (int index = 0; index < WRITERS; index++) {
                final long analysisId = analysis(jdbc, submissionId, artifactId, "project-" + index);
                analysisIds.add(analysisId);
                jobIds.add(leasedJob(jdbc, submissionId, analysisId, "worker-" + index));
            }
            final List<AnalysisRepository> writers = repeat(
                () -> new AnalysisRepository(
                    repositories.of(Analyses.class), repositories.of(AnalysisMetrics.class),
                    repositories.of(AnalysisJobs.class), repositories.of(Submissions.class),
                    repositories.of(SubmissionEvents.class), ImmediateWork.database(),
                    repositories.transactions()
                )
            );

            together(
                writers,
                writer -> writer.completeIfOwned(
                    analysisIds.get(writers.indexOf(writer)), submissionId, false, "{}", null, null,
                    "{\"status\":\"completed\"}", null, null, null,
                    jobIds.get(writers.indexOf(writer)), "worker-" + writers.indexOf(writer)
                ).block()
            );

            assertThat(counts(jdbc, submissionId)).containsExactly(WRITERS, WRITERS, 0);
            assertThat(state(jdbc, submissionId)).isEqualTo("COMPLETED");
        }
    }

    /**
     * The rule for what a set of counts means is written as a {@code CASE} inside the statement that does the counting,
     * which is the only way it can be applied without first reading what was there. This is the rule stated again, in
     * Java, and asked of the database for every shape a submission can be in.
     */
    @Test
    void theStateAlwaysFollowsFromTheCounts() throws Exception {
        try (
            TestDatabase database = TestDatabase.freshSchema("derived_state");
            TestRepositories repositories = new TestRepositories(database.migrated())
        ) {
            final JdbcTemplate jdbc = database.jdbcTemplate();
            final Submissions submissions = repositories.of(Submissions.class);
            int token = 0;
            for (int expected = 1; expected <= 3; expected++) {
                for (int completed = 0; completed <= expected; completed++) {
                    for (int failed = 0; completed + failed < expected; failed++) {
                        final long id = submission(jdbc, "derived-" + token++, expected);
                        jdbc.update(
                            "UPDATE submission SET completed_count = ?, failed_count = ?, state = 'RUNNING' "
                                + "WHERE id = ?",
                            completed, failed, id
                        );
                        submissions.countOutcome(id, 1, 0);
                        assertThat(state(jdbc, id))
                            .as("%d of %d done, %d failed, one more done", completed, expected, failed)
                            .isEqualTo(expectedState(completed + 1, failed, expected));
                    }
                }
            }
        }
    }

    /** What the counts mean, stated where the statement that applies them can be compared against it. */
    private String expectedState(final int completed, final int failed, final int expected) {
        if (completed + failed < expected) {
            return "RUNNING";
        }
        if (completed > 0 && failed > 0) {
            return "PARTIAL";
        }
        return completed > 0 ? "COMPLETED" : "FAILED";
    }

    /**
     * A metric's key is the analysis and the name, both of which the caller supplies, so {@code save} cannot tell a new
     * row from a stored one and asks the database about each before writing it. A report carries a hundred or so
     * measurements, and they are written straight after the old ones were deleted, so there is nothing to ask about.
     */
    @Test
    void storingMetricsDoesNotReadEachOneBackFirst() throws Exception {
        try (
            TestDatabase database = TestDatabase.freshSchema("metric_batching");
            TestRepositories repositories = new TestRepositories(database.migrated())
        ) {
            final JdbcTemplate jdbc = database.jdbcTemplate();
            final long submissionId = submission(jdbc, "metric-batching-token", 1);
            final long artifactId = artifact(jdbc, "metric-batching-artifact", (byte) 0x33);
            final long analysisId = analysis(jdbc, submissionId, artifactId, "measured.sb3");
            final AnalysisRepository analyses = new AnalysisRepository(
                repositories.of(Analyses.class), repositories.of(AnalysisMetrics.class),
                repositories.of(AnalysisJobs.class), repositories.of(Submissions.class),
                repositories.of(SubmissionEvents.class), ImmediateWork.database(), repositories.transactions()
            );
            final long jobId = leasedJob(jdbc, submissionId, analysisId, "worker");
            final java.util.Map<String, Double> measured = new java.util.LinkedHashMap<>();
            for (int index = 0; index < 120; index++) {
                measured.put("metric_" + index, (double) index);
            }
            final org.hibernate.stat.Statistics statistics = repositories.entityManagerFactory()
                .unwrap(org.hibernate.SessionFactory.class)
                .getStatistics();
            statistics.clear();

            analyses.completeIfOwned(
                analysisId, submissionId, false, "{}", null, null, "{\"status\":\"completed\"}", null, null, measured,
                jobId, "worker"
            ).block();

            assertThat(statistics.getEntityInsertCount()).isEqualTo(121);
            assertThat(statistics.getEntityLoadCount())
                .as("the job whose lease is checked is read; a measurement about to be written is not")
                .isEqualTo(1);
            assertThat(
                jdbc.queryForObject(
                    "SELECT COUNT(*) FROM analysis_metric WHERE analysis_id = ?", Integer.class, analysisId
                )
            ).isEqualTo(120);
        }
    }

    /**
     * These inserts used to be written as {@code INSERT IGNORE}, which the database reads as permission to pass over
     * every integrity error and not only a repeated key. A link to an artifact that was never stored went by as quietly
     * as a link stated twice, and the caller was told in both cases that the link was made.
     */
    @Test
    void linkingToSomethingThatIsNotThereIsReportedRatherThanPassedOver() throws Exception {
        try (
            TestDatabase database = TestDatabase.freshSchema("integrity_visible");
            TestRepositories repositories = new TestRepositories(database.migrated())
        ) {
            final JdbcTemplate jdbc = database.jdbcTemplate();
            final long submissionId = submission(jdbc, "integrity-token", 1);
            final long artifactId = artifact(jdbc, "integrity-artifact", (byte) 0x44);
            final SubmissionArtifactRepository links = new SubmissionArtifactRepository(
                repositories.of(SubmissionArtifacts.class), repositories.of(Analyses.class),
                ImmediateWork.database(), repositories.transactions()
            );

            links.link(submissionId, artifactId, "ORIGINAL").block();
            links.link(submissionId, artifactId, "ORIGINAL").block();

            assertThat(
                jdbc.queryForObject(
                    "SELECT COUNT(*) FROM submission_artifact WHERE submission_id = ?", Integer.class, submissionId
                )
            ).as("the same fact stated twice is still one fact").isEqualTo(1);
            assertThatThrownBy(() -> links.link(submissionId, artifactId + 10_000, "ORIGINAL").block())
                .as("an artifact that was never stored is not the same as one linked twice")
                .isInstanceOf(DataIntegrityViolationException.class)
                .hasMessageContaining("fk_submission_artifact_artifact");
        }
    }

    /**
     * Queueing an analysis has to say where in its submission's order the project belongs. Reading that inside the
     * insert made the statement a bulk one, and MariaDB takes a lock over the whole table's numbering for one of those
     * — which is how sixteen ingestions arriving together once deadlocked on the auto-increment value rather than
     * meeting on a key. The read is a statement of its own now, and this is what says the shape is safe.
     */
    @Test
    void sixteenProjectsQueuedAtOnceEachGetAJob() throws Exception {
        try (
            TestDatabase database = TestDatabase.freshSchema("analysis_enqueue_race");
            TestRepositories repositories = new TestRepositories(database.migrated())
        ) {
            final JdbcTemplate jdbc = database.jdbcTemplate();
            final long submissionId = submission(jdbc, "analysis-enqueue-token", WRITERS);
            final long artifactId = artifact(jdbc, "analysis-enqueue-artifact", (byte) 0x55);
            final List<Long> analysisIds = new ArrayList<>();
            for (int index = 0; index < WRITERS; index++) {
                analysisIds.add(analysis(jdbc, submissionId, artifactId, "queued-" + index));
            }
            final List<AnalysisJobRepository> writers = repeat(() -> jobRepository(repositories));

            together(
                writers,
                writer -> writer.enqueue(submissionId, analysisIds.get(writers.indexOf(writer))).block()
            );

            assertThat(jobs(jdbc, submissionId)).isEqualTo(WRITERS);

            // Two projects read apart can be given the same position, but an analysis still gets only one job.
            writers.getFirst().enqueue(submissionId, analysisIds.getFirst()).block();
            assertThat(jobs(jdbc, submissionId)).isEqualTo(WRITERS);
        }
    }

    /**
     * A reaper settling a job that has run out of attempts reads the submission, finds it running, and then records the
     * failure. A cancellation committing between those two would be overwritten, and a reader who asked for the work to
     * stop would be shown a submission that had failed instead.
     */
    @Test
    void cancellingASubmissionOutlastsAJobThatHasRunOutOfAttempts() throws Exception {
        try (
            TestDatabase database = TestDatabase.freshSchema("cancel_vs_reaper");
            TestRepositories repositories = new TestRepositories(database.migrated())
        ) {
            final JdbcTemplate jdbc = database.jdbcTemplate();
            final long submissionId = submission(jdbc, "cancel-vs-reaper-token", 1);
            final long artifactId = artifact(jdbc, "cancel-vs-reaper-artifact", (byte) 0x66);
            final long analysisId = analysis(jdbc, submissionId, artifactId, "abandoned.sb3");
            queuedJob(jdbc, submissionId, analysisId, AnalysisJobRepository.MAX_ATTEMPTS);
            jdbc.update("UPDATE submission SET state = 'CANCELLED' WHERE id = ?", submissionId);

            assertThat(repositories.of(Submissions.class).countFailure(submissionId, false))
                .as("a cancelled submission is not one of several outcomes still to be decided")
                .isZero();
            jobRepository(repositories).reapAbandonedJobs().block();

            assertThat(state(jdbc, submissionId)).isEqualTo("CANCELLED");
            assertThat(counts(jdbc, submissionId)).containsExactly(1, 0, 0);
        }
    }

    /**
     * Cancelling a submission marks its jobs, which is normally what keeps them out of a worker's way. A job queued
     * after that mark was made — a batch ingestion cancelled while it is still adding projects — carries no mark, so
     * claiming asks the submission as well.
     */
    @Test
    void aJobLeftUnderACancelledSubmissionIsNotClaimed() throws Exception {
        try (
            TestDatabase database = TestDatabase.freshSchema("claim_cancelled");
            TestRepositories repositories = new TestRepositories(database.migrated())
        ) {
            final JdbcTemplate jdbc = database.jdbcTemplate();
            final long submissionId = submission(jdbc, "claim-cancelled-token", 1);
            final long artifactId = artifact(jdbc, "claim-cancelled-artifact", (byte) 0x77);
            final long analysisId = analysis(jdbc, submissionId, artifactId, "unwanted.sb3");
            queuedJob(jdbc, submissionId, analysisId, 0);
            final AnalysisJobRepository jobs = jobRepository(repositories);
            jdbc.update("UPDATE submission SET state = 'CANCELLED' WHERE id = ?", submissionId);

            assertThat(jobs.claimNext("worker", java.time.Duration.ofMinutes(1)).block()).isNull();

            jdbc.update("UPDATE submission SET state = 'RUNNING' WHERE id = ?", submissionId);
            assertThat(jobs.claimNext("worker", java.time.Duration.ofMinutes(1)).block())
                .as("the same job, under a submission nobody has cancelled")
                .isNotNull();
        }
    }

    /**
     * Cancelling was the submission, then its jobs, then its analyses, then the event saying so — four calls, each of
     * which only happened because the one before it had changed something. A failure after the first left the work
     * queued under a submission that already said it was cancelled, and the caller who asked again was told nothing had
     * changed and went away.
     */
    @Test
    void askingAgainToCancelFinishesWhatAnInterruptedCancellationLeftBehind() throws Exception {
        try (
            TestDatabase database = TestDatabase.freshSchema("cancel_resumed");
            TestRepositories repositories = new TestRepositories(database.migrated())
        ) {
            final JdbcTemplate jdbc = database.jdbcTemplate();
            final long submissionId = submission(jdbc, "cancel-resumed-token", 1);
            final long artifactId = artifact(jdbc, "cancel-resumed-artifact", (byte) 0x88);
            final long analysisId = analysis(jdbc, submissionId, artifactId, "stopped.sb3");
            queuedJob(jdbc, submissionId, analysisId, 0);
            jdbc.update("UPDATE submission SET state = 'CANCELLED' WHERE id = ?", submissionId);

            final Boolean changed = submissionRepository(repositories).cancelEverything(submissionId).block();

            assertThat(changed).as("this call is not the one that cancelled it").isFalse();
            assertThat(jobState(jdbc, submissionId)).isEqualTo("CANCELLED");
            assertThat(analysisStatus(jdbc, analysisId)).isEqualTo("CANCELLED");
        }
    }

    /** The ordinary cancellation, and what a reader is told about it exactly once. */
    @Test
    void cancellingSettlesTheSubmissionItsJobsAndItsAnalysesTogether() throws Exception {
        try (
            TestDatabase database = TestDatabase.freshSchema("cancel_together");
            TestRepositories repositories = new TestRepositories(database.migrated())
        ) {
            final JdbcTemplate jdbc = database.jdbcTemplate();
            final long submissionId = submission(jdbc, "cancel-together-token", 1);
            final long artifactId = artifact(jdbc, "cancel-together-artifact", (byte) 0x99);
            final long analysisId = analysis(jdbc, submissionId, artifactId, "stopping.sb3");
            queuedJob(jdbc, submissionId, analysisId, 0);
            final SubmissionRepository submissions = submissionRepository(repositories);

            assertThat(submissions.cancelEverything(submissionId).block()).isTrue();
            assertThat(submissions.cancelEverything(submissionId).block()).isFalse();

            assertThat(state(jdbc, submissionId)).isEqualTo("CANCELLED");
            assertThat(jobState(jdbc, submissionId)).isEqualTo("CANCELLED");
            assertThat(analysisStatus(jdbc, analysisId)).isEqualTo("CANCELLED");
            assertThat(events(jdbc, submissionId)).as("asking twice is not two cancellations").isEqualTo(1);
        }
    }

    /**
     * The whole of a submission, not one repository of it: sixteen identical requests carrying one idempotency key,
     * each of which stores the bytes, registers the artifact, creates a submission and an analysis under it, and only
     * then finds out whether the key is its own.
     *
     * <p>
     * Fifteen of them are wrong about that, and what those fifteen built has to be given up rather than left looking
     * like work in progress — the submission and the analysis under it both, since either alone would leave a reader
     * something that never comes to anything.
     */
    @Test
    void sixteenIdenticalRequestsLeaveOneSubmissionAliveAndNothingHalfBuilt() throws Exception {
        try (
            TestDatabase database = TestDatabase.freshSchema("service_race");
            TestRepositories repositories = new TestRepositories(database.migrated())
        ) {
            final JdbcTemplate jdbc = database.jdbcTemplate();
            final byte[] project = "synthetic project bytes".getBytes(java.nio.charset.StandardCharsets.UTF_8);
            final List<SingleProjectSubmissionService> writers = repeat(() -> service(repositories));
            final List<Long> answered = java.util.Collections.synchronizedList(new ArrayList<>());

            together(writers, writer -> answered.add(submit(writer, project)));

            assertThat(answered).hasSize(WRITERS).containsOnly(answered.getFirst());
            assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM idempotency_key", Integer.class)).isEqualTo(1);
            assertThat(
                jdbc.queryForList(
                    "SELECT id FROM submission WHERE state <> 'CANCELLED'", Long.class
                )
            ).as("one submission is answering for the key; the rest were given up").containsExactly(
                answered.getFirst()
            );
            assertThat(
                jdbc.queryForObject(
                    "SELECT COUNT(*) FROM analysis WHERE status <> 'CANCELLED'", Integer.class
                )
            ).as("an analysis under a submission nobody will see is not left waiting to be run").isEqualTo(1);
        }
    }

    private long submit(final SingleProjectSubmissionService writer, final byte[] project) {
        return writer.create(
            new java.io.ByteArrayInputStream(project), "UPLOAD", "en", "application/zip", "one.sb3", ".sb3",
            "synthetic", "single", "one-key"
        ).block().submission().id();
    }

    private SingleProjectSubmissionService service(final TestRepositories repositories) {
        final DatabaseWork work = ImmediateWork.database();
        return new SingleProjectSubmissionService(
            artifactStore(), ImmediateWork.storage(),
            new SourceArtifactRepository(
                repositories.of(SourceArtifacts.class), work, ImmediateWork.storage(), artifactStore()
            ),
            submissionRepository(repositories),
            new SubmissionArtifactRepository(
                repositories.of(SubmissionArtifacts.class), repositories.of(Analyses.class), work,
                repositories.transactions()
            ),
            new AnalysisRepository(
                repositories.of(Analyses.class), repositories.of(AnalysisMetrics.class),
                repositories.of(AnalysisJobs.class), repositories.of(Submissions.class),
                repositories.of(SubmissionEvents.class), work, repositories.transactions()
            ),
            new IdempotencyKeyRepository(repositories.of(IdempotencyKeys.class), work),
            new ScratchProjectStatsRepository(repositories.of(ScratchProjectStatistics.class), work)
        );
    }

    private SourceArtifactStore artifactStore() {
        try {
            return new LocalContentAddressedSourceArtifactStore(storage);
        }
        catch (java.io.IOException unavailable) {
            throw new IllegalStateException("Synthetic artifact storage is unavailable", unavailable);
        }
    }

    private int jobs(final JdbcTemplate jdbc, final long submissionId) {
        return jdbc.queryForObject(
            "SELECT COUNT(*) FROM analysis_job WHERE submission_id = ?", Integer.class, submissionId
        );
    }

    private List<Integer> counts(final JdbcTemplate jdbc, final long submissionId) {
        return jdbc.queryForObject(
            "SELECT expected_count, completed_count, failed_count FROM submission WHERE id = ?",
            (row, index) -> List.of(row.getInt(1), row.getInt(2), row.getInt(3)),
            submissionId
        );
    }

    private String state(final JdbcTemplate jdbc, final long submissionId) {
        return jdbc.queryForObject("SELECT state FROM submission WHERE id = ?", String.class, submissionId);
    }

    private long submission(final JdbcTemplate jdbc, final String token, final int expected) {
        jdbc.update(
            "INSERT INTO submission (share_token, source_type, locale, state, expected_count) "
                + "VALUES (?, 'SCRATCH_STUDIO', 'en', 'RUNNING', ?)",
            token, expected
        );
        return jdbc.queryForObject("SELECT id FROM submission WHERE share_token = ?", Long.class, token);
    }

    private long artifact(final JdbcTemplate jdbc, final String storageKey, final byte fill) {
        jdbc.update(
            "INSERT INTO source_artifact (sha256, storage_key, byte_size, source_kind, retention_state) "
                + "VALUES (?, ?, 1, 'SCRATCH_URL', 'ACTIVE')",
            digest(fill), storageKey
        );
        return jdbc.queryForObject("SELECT id FROM source_artifact WHERE storage_key = ?", Long.class, storageKey);
    }

    private long analysis(
        final JdbcTemplate jdbc, final long submissionId, final long artifactId, final String projectName
    ) {
        jdbc.update(
            "INSERT INTO analysis (submission_id, source_artifact_id, project_name, provenance, "
                + "report_schema_version, litterbox_artifact_version, locale, status) "
                + "VALUES (?, ?, ?, 'NEW', '1', 'synthetic', 'en', 'QUEUED')",
            submissionId, artifactId, projectName
        );
        return jdbc.queryForObject(
            "SELECT id FROM analysis WHERE submission_id = ? AND project_name = ?", Long.class,
            submissionId, projectName
        );
    }

    /** An analysis is only ever completed by the worker holding its job's lease, so a test recording one needs both. */
    private long leasedJob(
        final JdbcTemplate jdbc, final long submissionId, final long analysisId, final String workerId
    ) {
        jdbc.update(
            "INSERT INTO analysis_job (submission_id, analysis_id, state, lease_owner, lease_until) "
                + "VALUES (?, ?, 'RUNNING', ?, DATE_ADD(CURRENT_TIMESTAMP(6), INTERVAL 1 MINUTE))",
            submissionId, analysisId, workerId
        );
        return jdbc.queryForObject("SELECT id FROM analysis_job WHERE analysis_id = ?", Long.class, analysisId);
    }

    /**
     * The reaper settles a job nobody is holding and whose submission has not been cancelled with it, which is the one
     * way the submission's state changes anywhere but in {@link SubmissionRepository#cancelEverything}. A state changed
     * with nothing recording it is a state a reader following the events never learns about.
     */
    @Test
    void reapingACancelledJobSaysOnceThatItsSubmissionWasCancelled() throws Exception {
        try (
            TestDatabase database = TestDatabase.freshSchema("reap_cancelled_event");
            TestRepositories repositories = new TestRepositories(database.migrated())
        ) {
            final JdbcTemplate jdbc = database.jdbcTemplate();
            final long submissionId = submission(jdbc, "reap-cancelled-token", 1);
            final long artifactId = artifact(jdbc, "reap-cancelled-artifact", (byte) 0x5b);
            final long analysisId = analysis(jdbc, submissionId, artifactId, "abandoned.sb3");
            queuedJob(jdbc, submissionId, analysisId, 0);
            jdbc.update("UPDATE analysis_job SET cancel_requested = TRUE WHERE submission_id = ?", submissionId);
            final AnalysisJobRepository jobs = jobRepository(repositories);

            assertThat(jobs.reapAbandonedJobs().block()).isEqualTo(1);

            assertThat(state(jdbc, submissionId)).isEqualTo("CANCELLED");
            assertThat(jobState(jdbc, submissionId)).isEqualTo("CANCELLED");
            assertThat(analysisStatus(jdbc, analysisId)).isEqualTo("CANCELLED");
            assertThat(cancellationEvents(jdbc, submissionId)).isEqualTo(1);

            // Nothing is left for a second reap to find, so nothing is said a second time.
            assertThat(jobs.reapAbandonedJobs().block()).isEqualTo(0);
            assertThat(cancellationEvents(jdbc, submissionId)).isEqualTo(1);
        }
    }

    /**
     * A request repeated while its submission is being analysed is answered with that submission, and asking for it to
     * be made runnable must not take it back off the worker that has it. Written as every state but the terminal ones,
     * this put a running submission back to runnable, which the reports read as the work having returned to the queue.
     */
    @Test
    void repeatingARequestDoesNotPutARunningSubmissionBackInTheQueue() throws Exception {
        try (
            TestDatabase database = TestDatabase.freshSchema("runnable_running");
            TestRepositories repositories = new TestRepositories(database.migrated())
        ) {
            final JdbcTemplate jdbc = database.jdbcTemplate();
            final long running = submission(jdbc, "runnable-running-token", 1);
            final long stored = submission(jdbc, "runnable-stored-token", 1);
            jdbc.update("UPDATE submission SET state = 'STORED' WHERE id = ?", stored);
            final SubmissionRepository submissions = submissionRepository(repositories);

            submissions.markRunnable(running).block();
            submissions.markRunnable(stored).block();

            assertThat(state(jdbc, running)).as("still with the worker that took it").isEqualTo("RUNNING");
            assertThat(state(jdbc, stored)).as("the one a failed first attempt left behind").isEqualTo("RUNNABLE");
        }
    }

    private int cancellationEvents(final JdbcTemplate jdbc, final long submissionId) {
        return jdbc.queryForObject(
            "SELECT COUNT(*) FROM submission_event WHERE submission_id = ? AND event_type = 'CANCELLED'",
            Integer.class, submissionId
        );
    }

    private String jobState(final JdbcTemplate jdbc, final long submissionId) {
        return jdbc.queryForObject(
            "SELECT state FROM analysis_job WHERE submission_id = ?", String.class, submissionId
        );
    }

    private String analysisStatus(final JdbcTemplate jdbc, final long analysisId) {
        return jdbc.queryForObject("SELECT status FROM analysis WHERE id = ?", String.class, analysisId);
    }

    private int events(final JdbcTemplate jdbc, final long submissionId) {
        return jdbc.queryForObject(
            "SELECT COUNT(*) FROM submission_event WHERE submission_id = ?", Integer.class, submissionId
        );
    }

    private void queuedJob(
        final JdbcTemplate jdbc, final long submissionId, final long analysisId, final int attempts
    ) {
        jdbc.update(
            "INSERT INTO analysis_job (submission_id, analysis_id, job_kind, state, attempts) "
                + "VALUES (?, ?, 'ANALYSIS', 'QUEUED', ?)",
            submissionId, analysisId, attempts
        );
    }

    private AnalysisJobRepository jobRepository(final TestRepositories repositories) {
        return new AnalysisJobRepository(
            repositories.of(AnalysisJobs.class), repositories.of(Analyses.class),
            repositories.of(Submissions.class), repositories.of(SubmissionEvents.class),
            ImmediateWork.database(), repositories.transactions()
        );
    }

    private SubmissionRepository submissionRepository(final TestRepositories repositories) {
        return new SubmissionRepository(
            repositories.of(Submissions.class), repositories.of(SubmissionEvents.class),
            repositories.of(AnalysisJobs.class), repositories.of(Analyses.class), ImmediateWork.database(),
            repositories.transactions()
        );
    }

    private byte[] digest(final byte fill) {
        final byte[] bytes = new byte[32];
        Arrays.fill(bytes, fill);
        return bytes;
    }

    private <T> List<T> repeat(final Supplier<T> writer) {
        final List<T> writers = new ArrayList<>();
        for (int index = 0; index < WRITERS; index++) {
            writers.add(writer.get());
        }
        return writers;
    }

    /**
     * Releases every writer at the same instant. Handing the work to a pool is not enough on its own: the first task
     * can be finished before the last is started, and then nothing has been tested.
     */
    private <T> void together(final List<T> writers, final java.util.function.Consumer<T> work) throws Exception {
        final CyclicBarrier start = new CyclicBarrier(writers.size());
        final ExecutorService pool = Executors.newFixedThreadPool(writers.size());
        try {
            final List<Future<?>> running = new ArrayList<>();
            for (final T writer : writers) {
                running.add(pool.submit(() -> {
                    start.await();
                    work.accept(writer);
                    return null;
                }));
            }
            for (final Future<?> future : running) {
                future.get();
            }
        }
        finally {
            pool.shutdownNow();
        }
    }
}
