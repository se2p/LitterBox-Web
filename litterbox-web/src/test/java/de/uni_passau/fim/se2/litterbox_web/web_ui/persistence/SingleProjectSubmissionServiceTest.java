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
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.util.HexFormat;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import de.uni_passau.fim.se2.litterbox_web.web_ui.util.ImmediateWork;
import reactor.core.publisher.Mono;

class SingleProjectSubmissionServiceTest {

    private SourceArtifactStore store;
    private SourceArtifactRepository sourceArtifacts;
    private SubmissionRepository submissions;
    private SubmissionArtifactRepository submissionArtifacts;
    private AnalysisRepository analyses;
    private IdempotencyKeyRepository idempotency;
    private ScratchProjectStatsRepository scratchStats;
    private SingleProjectSubmissionService service;

    @BeforeEach
    void buildService() {
        store = mock(SourceArtifactStore.class);
        sourceArtifacts = mock(SourceArtifactRepository.class);
        submissions = mock(SubmissionRepository.class);
        submissionArtifacts = mock(SubmissionArtifactRepository.class);
        analyses = mock(AnalysisRepository.class);
        idempotency = mock(IdempotencyKeyRepository.class);
        scratchStats = mock(ScratchProjectStatsRepository.class);
        service = new SingleProjectSubmissionService(
            store, ImmediateWork.storage(), sourceArtifacts, submissions, submissionArtifacts,
            analyses, idempotency, scratchStats
        );
    }

    @Test
    void doesNotCreateRunnableStateWhenSourceStorageFails() throws IOException {
        when(store.stage(any(), anyString(), anyString())).thenThrow(new IOException("synthetic storage failure"));

        assertThatThrownBy(
            () -> service.create(
                new ByteArrayInputStream(new byte[] { 1 }), "UPLOAD", "en", "application/zip",
                "synthetic.sb3", ".sb3", "1.13-SNAPSHOT", null, null
            ).block()
        ).hasRootCauseInstanceOf(IOException.class);
        verifyNoInteractions(sourceArtifacts, submissions, submissionArtifacts, analyses, idempotency);
    }

    @Test
    void retainsInvalidChildButLeavesItsTerminalFailureToALeaseOwnedAnalysisJob() throws Exception {
        final byte[] exact = "synthetic invalid child".getBytes(java.nio.charset.StandardCharsets.UTF_8);
        final byte[] sha256 = java.security.MessageDigest.getInstance("SHA-256").digest(exact);
        final SourceArtifact artifact = new SourceArtifact(7, sha256, exact.length, "application/zip", "broken.sb3");
        final Analysis analysis = new Analysis(9, 11, 7, "NEW", "1", "synthetic", "en", "QUEUED", ".sb3");
        when(store.put(any(), anyString(), anyString())).thenReturn(
            new SourceArtifactStore.StoredSourceArtifact(sha256, exact.length, "application/zip", "broken.sb3")
        );
        when(sourceArtifacts.register(any())).thenReturn(Mono.just(artifact));
        when(submissionArtifacts.linkAnalysis(any())).thenReturn(
            Mono.just(new SubmissionArtifactRepository.LinkedAnalysis(9, true))
        );
        when(analyses.findById(9)).thenReturn(Mono.just(analysis));

        final SingleProjectSubmissionService.ProjectAnalysis created = service.addBatchProject(
            11,
            new SingleProjectSubmissionService.BatchProject(
                "broken.sb3", exact, "MalformedArchive", "Synthetic malformed archive", "TEACHER_CHILD"
            ),
            "en", "synthetic"
        ).block();

        assertThat(created).isNotNull();
        assertThat(created.analysis().id()).isEqualTo(9);
        assertThat(created.failureType()).isEqualTo("MalformedArchive");
        verify(analyses, never()).completeIfOwned(
            org.mockito.ArgumentMatchers.anyLong(), org.mockito.ArgumentMatchers.anyLong(),
            org.mockito.ArgumentMatchers.anyBoolean(), org.mockito.ArgumentMatchers.any(),
            org.mockito.ArgumentMatchers.any(), org.mockito.ArgumentMatchers.any(), org.mockito.ArgumentMatchers.any(),
            org.mockito.ArgumentMatchers.any(), org.mockito.ArgumentMatchers.any(), org.mockito.ArgumentMatchers.any(),
            org.mockito.ArgumentMatchers.anyLong(), org.mockito.ArgumentMatchers.anyString()
        );
    }

    /**
     * Two identical requests can both find the key unused and both build a submission before either binds it. The one
     * that loses is holding a submission the key does not point at, and reporting that one back would leave the caller
     * following work that nothing will ever be told to do.
     */
    @Test
    void reportsTheSubmissionTheKeyBelongsToWhenAnotherRequestBoundItFirst() throws Exception {
        final byte[] exact = "synthetic duplicate request".getBytes(java.nio.charset.StandardCharsets.UTF_8);
        final byte[] sha256 = java.security.MessageDigest.getInstance("SHA-256").digest(exact);
        final SourceArtifact artifact = new SourceArtifact(7, sha256, exact.length, "application/zip", "dupe.sb3");
        final Submission ours = new Submission(21, "ours", "UPLOAD", "en", "STORED", "ACTIVE", 1, 0, 0);
        final Submission winner = new Submission(20, "theirs", "UPLOAD", "en", "RUNNABLE", "ACTIVE", 1, 0, 0);
        final Analysis winning = new Analysis(31, 20, 7, "NEW", "1", "synthetic", "en", "QUEUED", ".sb3");
        when(store.stage(any(), anyString(), anyString())).thenReturn(
            staged(sha256, exact.length, "dupe.sb3")
        );
        when(sourceArtifacts.register(any())).thenReturn(Mono.just(artifact));
        when(idempotency.find(anyString(), anyString())).thenReturn(Mono.empty());
        when(submissions.create(any())).thenReturn(Mono.just(ours));
        when(submissionArtifacts.link(anyLong(), anyLong(), anyString(), any())).thenReturn(Mono.empty());
        // The winner is still building, so the loser runs the same repeatable steps against the winner's
        // submission; the unique key on its single analysis answers both with the one analysis.
        when(analyses.createAttempt(any())).thenReturn(Mono.just(winning));
        // Somebody else's request bound the key to submission 20 while this one was reserving submission 21.
        when(idempotency.put(anyString(), anyString(), any(), anyLong())).thenReturn(
            Mono.just(
                new IdempotencyKeyRepository.IdempotencyRecord(
                    "single", "shared-key", uploadFingerprint("dupe.sb3", sha256), 20
                )
            )
        );
        when(submissions.cancelEverything(21)).thenReturn(Mono.just(true));
        when(submissions.markRunnable(20)).thenReturn(Mono.empty());
        when(submissions.findById(20)).thenReturn(Mono.just(winner));
        // The winner has not written its analysis yet, so the loser has the work to do.
        when(analyses.findCreationBySubmissionId(20)).thenReturn(Mono.empty());
        // Nor has it linked an artifact, so the bytes this request carries are the ones the submission gets.
        when(submissionArtifacts.findOriginalArtifactId(20)).thenReturn(Mono.empty());

        final SingleProjectSubmissionService.CreatedSubmission created = service.create(
            new ByteArrayInputStream(exact), "UPLOAD", "en", "application/zip", "dupe.sb3", ".sb3",
            "1.13-SNAPSHOT", "single", "shared-key"
        ).block();

        assertThat(created).isNotNull();
        assertThat(created.submission().id()).isEqualTo(20);
        assertThat(created.analysis().id()).isEqualTo(31);
        verify(submissions).cancelEverything(21);
        verify(submissions, never()).markRunnable(21);
    }

    /**
     * Two different payloads can carry one key and arrive together, both finding it unused. Only the binding settles
     * which is which, so nothing durable may be made on either's account until it has been settled: the loser is
     * refused, and a promoted file and the artifact row naming it would be left with nothing referring to them and no
     * safe way to remove them, the bytes being shared with anybody else who uploads the same project.
     */
    @Test
    void keepsNothingWhenTheKeyIsBoundToADifferentRequestWhileThisOneIsInFlight() throws Exception {
        final byte[] exact = "synthetic conflicting request".getBytes(java.nio.charset.StandardCharsets.UTF_8);
        final byte[] sha256 = java.security.MessageDigest.getInstance("SHA-256").digest(exact);
        final Submission ours = new Submission(21, "ours", "UPLOAD", "en", "STORED", "ACTIVE", 1, 0, 0);
        final StagedBytes staged = staged(sha256, exact.length, "dupe.sb3");
        when(store.stage(any(), anyString(), anyString())).thenReturn(staged);
        when(idempotency.find(anyString(), anyString())).thenReturn(Mono.empty());
        when(submissions.create(any())).thenReturn(Mono.just(ours));
        when(idempotency.put(anyString(), anyString(), any(), anyLong())).thenReturn(
            Mono.error(new IdempotencyKeyRepository.IdempotencyConflictException("single", "shared-key"))
        );
        when(submissions.cancelEverything(21)).thenReturn(Mono.just(true));

        assertThatThrownBy(
            () -> service.create(
                new ByteArrayInputStream(exact), "UPLOAD", "en", "application/zip", "dupe.sb3", ".sb3",
                "1.13-SNAPSHOT", "single", "shared-key"
            ).block()
        ).isInstanceOf(IdempotencyKeyRepository.IdempotencyConflictException.class);
        verify(submissions).cancelEverything(21);
        verify(submissions, never()).markRunnable(21);
        assertThat(staged.promoted).as("nothing this request carried was kept").isFalse();
        assertThat(staged.closed).isTrue();
        verifyNoInteractions(sourceArtifacts, submissionArtifacts, analyses);
    }

    /**
     * A key already standing for another request refuses this one. Nothing this request carried may survive that: an
     * artifact promoted into the store and recorded against nothing is a file and a row that no submission will ever
     * refer to and nothing will ever collect.
     */
    @Test
    void keepsNothingWhenTheKeyAlreadyStandsForADifferentRequest() throws Exception {
        final byte[] exact = "synthetic refused request".getBytes(java.nio.charset.StandardCharsets.UTF_8);
        final byte[] sha256 = java.security.MessageDigest.getInstance("SHA-256").digest(exact);
        final byte[] other = java.security.MessageDigest.getInstance("SHA-256").digest(new byte[] { 9 });
        final StagedBytes staged = staged(sha256, exact.length, "refused.sb3");
        when(store.stage(any(), anyString(), anyString())).thenReturn(staged);
        when(idempotency.find("single", "shared-key")).thenReturn(
            Mono.just(
                new IdempotencyKeyRepository.IdempotencyRecord(
                    "single", "shared-key", uploadFingerprint("something-else.sb3", other), 20
                )
            )
        );

        assertThatThrownBy(
            () -> service.create(
                new ByteArrayInputStream(exact), "UPLOAD", "en", "application/zip", "refused.sb3", ".sb3",
                "1.13-SNAPSHOT", "single", "shared-key"
            ).block()
        ).isInstanceOf(IdempotencyKeyRepository.IdempotencyConflictException.class);
        assertThat(staged.promoted).isFalse();
        assertThat(staged.closed).isTrue();
        verifyNoInteractions(sourceArtifacts, submissions, submissionArtifacts, analyses);
    }

    /**
     * A key the column will not hold is refused before the request's bytes are read, rather than by the insert that
     * comes after a submission, an analysis and an artifact have all been made for it.
     */
    @Test
    void refusesAnIdempotencyKeyLongerThanTheColumnBeforeReadingAnything() throws Exception {

        assertThatThrownBy(
            () -> service.create(
                new ByteArrayInputStream(new byte[] { 1 }), "UPLOAD", "en", "application/zip", "long.sb3", ".sb3",
                "1.13-SNAPSHOT", "single", "k".repeat(256)
            )
        ).isInstanceOf(IllegalArgumentException.class).hasMessageContaining("255");
        verifyNoInteractions(store, sourceArtifacts, submissions, submissionArtifacts, analyses, idempotency);
    }

    @Test
    void refusesAFilenameLongerThanTheColumnBeforeReadingAnything() {

        assertThatThrownBy(
            () -> service.create(
                new ByteArrayInputStream(new byte[] { 1 }), "UPLOAD", "en", "application/zip",
                "n".repeat(253) + ".sb3", ".sb3", "1.13-SNAPSHOT", null, null
            )
        ).isInstanceOf(IllegalArgumentException.class).hasMessageContaining("255");
        verifyNoInteractions(store, sourceArtifacts, submissions, submissionArtifacts, analyses, idempotency);
    }

    /**
     * The key is bound before the work it stands for is built, so a request that dies in between leaves a submission
     * with nothing under it. Reporting that back as though it were running stranded it for good: no analysis, no job,
     * and every retry saying the same thing. A retry carries the same bytes and finishes the work instead.
     */
    @Test
    void finishesASubmissionWhoseFirstAttemptBoundTheKeyAndThenDied() throws Exception {
        final byte[] exact = "synthetic stranded request".getBytes(java.nio.charset.StandardCharsets.UTF_8);
        final byte[] sha256 = java.security.MessageDigest.getInstance("SHA-256").digest(exact);
        final SourceArtifact artifact = new SourceArtifact(7, sha256, exact.length, "application/zip", "dupe.sb3");
        // Bound to the key, but nothing was ever built under it.
        final Submission stranded = new Submission(20, "theirs", "UPLOAD", "en", "STORED", "ACTIVE", 1, 0, 0);
        final StagedBytes staged = staged(sha256, exact.length, "dupe.sb3");
        when(store.stage(any(), anyString(), anyString())).thenReturn(staged);
        when(idempotency.find("single", "shared-key")).thenReturn(
            Mono.just(
                new IdempotencyKeyRepository.IdempotencyRecord(
                    "single", "shared-key", uploadFingerprint("dupe.sb3", sha256), 20
                )
            )
        );
        when(submissions.findById(20)).thenReturn(Mono.just(stranded));
        when(analyses.findCreationBySubmissionId(20)).thenReturn(Mono.empty());
        // Nor has it linked an artifact, so the bytes this request carries are the ones the submission gets.
        when(submissionArtifacts.findOriginalArtifactId(20)).thenReturn(Mono.empty());
        when(sourceArtifacts.register(any())).thenReturn(Mono.just(artifact));
        when(submissionArtifacts.link(anyLong(), anyLong(), anyString(), any())).thenReturn(Mono.empty());
        when(analyses.createAttempt(any())).thenReturn(
            Mono.just(new Analysis(31, 20, 7, "NEW", "1", "synthetic", "en", "QUEUED", ".sb3"))
        );
        when(submissions.markRunnable(20)).thenReturn(Mono.empty());

        final SingleProjectSubmissionService.CreatedSubmission created = service.create(
            new ByteArrayInputStream(exact), "UPLOAD", "en", "application/zip", "dupe.sb3", ".sb3",
            "1.13-SNAPSHOT", "single", "shared-key"
        ).block();

        assertThat(created).isNotNull();
        assertThat(created.submission().id()).isEqualTo(20);
        assertThat(created.analysis()).as("the retry finished what the first attempt left").isNotNull();
        assertThat(created.analysis().id()).isEqualTo(31);
        assertThat(staged.promoted).as("the bytes the key was bound to are kept").isTrue();
        verify(analyses).createAttempt(any());
        verify(submissions).markRunnable(20);
        // The retry follows the key rather than starting a second submission under it.
        verify(submissions, never()).create(any());
    }

    /**
     * A submission cancelled before anything was built under it is not resumed. Finishing it would undo the
     * cancellation, so the retry is answered with the submission as it stands and nothing is queued.
     */
    @Test
    void doesNotResumeASubmissionThatWasCancelledBeforeAnythingWasBuilt() throws Exception {
        final byte[] exact = "synthetic cancelled request".getBytes(java.nio.charset.StandardCharsets.UTF_8);
        final byte[] sha256 = java.security.MessageDigest.getInstance("SHA-256").digest(exact);
        final Submission cancelled = new Submission(20, "theirs", "UPLOAD", "en", "CANCELLED", "ACTIVE", 1, 0, 0);
        final StagedBytes staged = staged(sha256, exact.length, "dupe.sb3");
        when(store.stage(any(), anyString(), anyString())).thenReturn(staged);
        when(idempotency.find("single", "shared-key")).thenReturn(
            Mono.just(
                new IdempotencyKeyRepository.IdempotencyRecord(
                    "single", "shared-key", uploadFingerprint("dupe.sb3", sha256), 20
                )
            )
        );
        when(submissions.findById(20)).thenReturn(Mono.just(cancelled));
        when(analyses.findLatestBySubmissionId(20)).thenReturn(Mono.empty());

        final SingleProjectSubmissionService.CreatedSubmission created = service.create(
            new ByteArrayInputStream(exact), "UPLOAD", "en", "application/zip", "dupe.sb3", ".sb3",
            "1.13-SNAPSHOT", "single", "shared-key"
        ).block();

        assertThat(created).isNotNull();
        assertThat(created.submission().state()).isEqualTo("CANCELLED");
        assertThat(created.analysis()).isNull();
        assertThat(staged.promoted).as("a cancelled submission is not given anything further").isFalse();
        verify(submissions, never()).markRunnable(anyLong());
        verifyNoInteractions(sourceArtifacts, submissionArtifacts);
    }

    /**
     * A Scratch project is packed with the moment it was fetched written into it, so asking for the same project twice
     * produces two different files. Comparing bytes made every repeat of a fetch look like a different request under a
     * used key and refused it — which is the one thing the key exists to prevent.
     */
    @Test
    void repeatingAFetchOfTheSameScratchProjectIsTheSameRequestThoughTheBytesDiffer() throws Exception {
        final byte[] fetchedAgain = "synthetic bundle fetched at 12:01"
            .getBytes(java.nio.charset.StandardCharsets.UTF_8);
        final byte[] sha256 = java.security.MessageDigest.getInstance("SHA-256").digest(fetchedAgain);
        final Submission running = new Submission(20, "theirs", "SCRATCH_URL", "en", "RUNNING", "ACTIVE", 1, 0, 0);
        final Analysis analysis = new Analysis(31, 20, 7, "NEW", "1", "synthetic", "en", "QUEUED", ".sb3");
        final StagedBytes staged = staged(sha256, fetchedAgain.length, "scratch-451.sb3");
        when(store.stage(any(), anyString(), anyString())).thenReturn(staged);
        // Bound by the first fetch, whose bytes were not these.
        when(idempotency.find("single", "shared-key")).thenReturn(
            Mono.just(
                new IdempotencyKeyRepository.IdempotencyRecord(
                    "single", "shared-key", fetchedFingerprint("scratch-451.sb3"), 20
                )
            )
        );
        when(submissions.findById(20)).thenReturn(Mono.just(running));
        when(analyses.findCreationBySubmissionId(20)).thenReturn(Mono.just(analysis));
        when(submissions.markRunnable(20)).thenReturn(Mono.empty());

        final SingleProjectSubmissionService.CreatedSubmission created = service.create(
            new ByteArrayInputStream(fetchedAgain), "SCRATCH_URL", "en", "application/zip", "scratch-451.sb3",
            ".sb3", "1.13-SNAPSHOT", "single", "shared-key"
        ).block();

        assertThat(created).isNotNull();
        assertThat(created.submission().id()).isEqualTo(20);
        assertThat(created.analysis().id()).isEqualTo(31);
        assertThat(staged.promoted).as("the second fetch's bytes are not a second project").isFalse();
        verify(submissions, never()).create(any());
    }

    /**
     * The first fetch got as far as keeping its bundle and saying the submission is of it, and stopped there. The
     * repeat carries another fetch of the same project, which is another file; building the submission around that left
     * it holding two, both under the role that means the one it was made from, and nothing afterwards could say which
     * of the two the submission was of.
     */
    @Test
    void finishesAStrandedFetchAroundTheBundleTheSubmissionAlreadyHolds() throws Exception {
        final byte[] fetchedAgain = "synthetic bundle fetched at 12:01"
            .getBytes(java.nio.charset.StandardCharsets.UTF_8);
        final byte[] sha256 = java.security.MessageDigest.getInstance("SHA-256").digest(fetchedAgain);
        final byte[] fetchedBefore = java.security.MessageDigest.getInstance("SHA-256")
            .digest("synthetic bundle fetched at 12:00".getBytes(java.nio.charset.StandardCharsets.UTF_8));
        final Submission stored = new Submission(20, "theirs", "SCRATCH_URL", "en", "STORED", "ACTIVE", 1, 0, 0);
        final Analysis analysis = new Analysis(31, 20, 7, "NEW", "1", "synthetic", "en", "QUEUED", ".sb3");
        final SourceArtifact first = new SourceArtifact(7, fetchedBefore, 33, "application/zip", "scratch-451.sb3");
        final StagedBytes staged = staged(sha256, fetchedAgain.length, "scratch-451.sb3");
        when(store.stage(any(), anyString(), anyString())).thenReturn(staged);
        when(idempotency.find("single", "shared-key")).thenReturn(
            Mono.just(
                new IdempotencyKeyRepository.IdempotencyRecord(
                    "single", "shared-key", fetchedFingerprint("scratch-451.sb3"), 20
                )
            )
        );
        when(submissions.findById(20)).thenReturn(Mono.just(stored));
        // The first attempt kept its bundle and linked it, and got no further.
        when(analyses.findCreationBySubmissionId(20)).thenReturn(Mono.empty());
        when(submissionArtifacts.findOriginalArtifactId(20)).thenReturn(Mono.just(7L));
        when(sourceArtifacts.findById(7)).thenReturn(Mono.just(first));
        when(submissionArtifacts.link(anyLong(), anyLong(), anyString(), any())).thenReturn(Mono.empty());
        when(analyses.createAttempt(any())).thenReturn(Mono.just(analysis));
        when(scratchStats.upsertFromManifest(anyLong(), any())).thenReturn(Mono.empty());
        when(sourceArtifacts.findMetadataById(7)).thenReturn(
            Mono.just(new SourceArtifactMetadata(7, "SCRATCH_URL", "{}"))
        );
        when(submissions.markRunnable(20)).thenReturn(Mono.empty());

        final SingleProjectSubmissionService.CreatedSubmission created = service.create(
            new ByteArrayInputStream(fetchedAgain), "SCRATCH_URL", "en", "application/zip", "scratch-451.sb3",
            ".sb3", "1.13-SNAPSHOT", "single", "shared-key"
        ).block();

        assertThat(created).isNotNull();
        assertThat(created.analysis().id()).isEqualTo(31);
        assertThat(staged.promoted).as("the repeat's own bytes are not made a second original").isFalse();
        verify(sourceArtifacts, never()).register(any());
        // And what is recorded as analysed is the digest of the file that will be read, not the one this request read
        // aside and threw away.
        final org.mockito.ArgumentCaptor<AnalysisRepository.AnalysisAttempt> attempt = org.mockito.ArgumentCaptor
            .forClass(AnalysisRepository.AnalysisAttempt.class);
        verify(analyses).createAttempt(attempt.capture());
        assertThat(attempt.getValue().inputSha256()).isEqualTo(fetchedBefore);
        assertThat(attempt.getValue().sourceArtifactId()).isEqualTo(7);
    }

    /**
     * The version of LitterBox is the server's, not the client's. Counting it as part of what the request was meant a
     * deployment turned every key already issued into a conflict — including for the retry that arrives at a submission
     * the first attempt left unbuilt, which is the request recovery exists to serve.
     */
    @Test
    void doesNotMakeADeploymentOfANewLitterBoxIntoADifferentRequest() throws Exception {
        final byte[] exact = "synthetic redeployed request".getBytes(java.nio.charset.StandardCharsets.UTF_8);
        final byte[] sha256 = java.security.MessageDigest.getInstance("SHA-256").digest(exact);
        final Submission running = new Submission(20, "theirs", "UPLOAD", "en", "RUNNING", "ACTIVE", 1, 0, 0);
        // Made before the upgrade, and answered with the version it was actually run under.
        final Analysis analysis = new Analysis(31, 20, 7, "NEW", "1", "1.12", "en", "QUEUED", ".sb3");
        final StagedBytes staged = staged(sha256, exact.length, "again.sb3");
        when(store.stage(any(), anyString(), anyString())).thenReturn(staged);
        when(idempotency.find("single", "shared-key")).thenReturn(
            Mono.just(
                new IdempotencyKeyRepository.IdempotencyRecord(
                    "single", "shared-key", uploadFingerprint("again.sb3", sha256), 20
                )
            )
        );
        when(submissions.findById(20)).thenReturn(Mono.just(running));
        when(analyses.findCreationBySubmissionId(20)).thenReturn(Mono.just(analysis));
        when(submissions.markRunnable(20)).thenReturn(Mono.empty());

        // The very same request, arriving at a server that has since been upgraded.
        final SingleProjectSubmissionService.CreatedSubmission created = service.create(
            new ByteArrayInputStream(exact), "UPLOAD", "en", "application/zip", "again.sb3", ".sb3",
            "1.13-SNAPSHOT", "single", "shared-key"
        ).block();

        assertThat(created).isNotNull();
        assertThat(created.submission().id()).isEqualTo(20);
        assertThat(created.analysis().litterboxArtifactVersion()).isEqualTo("1.12");
        verify(submissions, never()).create(any());
    }

    /**
     * The same bytes described differently is a different request. Answering it with the first request's submission
     * handed back a report in a language nobody asked for; worse, where the first request stopped part way, the repeat
     * would go on to finish it to its own description while the submission itself recorded the first's.
     */
    @Test
    void refusesTheSameBytesUnderAUsedKeyWhenTheRequestDescribesThemDifferently() throws Exception {
        final byte[] exact = "synthetic relabelled request".getBytes(java.nio.charset.StandardCharsets.UTF_8);
        final byte[] sha256 = java.security.MessageDigest.getInstance("SHA-256").digest(exact);
        final StagedBytes staged = staged(sha256, exact.length, "same.sb3");
        when(store.stage(any(), anyString(), anyString())).thenReturn(staged);
        // The key was bound to these very bytes, asked about in German.
        when(idempotency.find("single", "shared-key")).thenReturn(
            Mono.just(
                new IdempotencyKeyRepository.IdempotencyRecord(
                    "single", "shared-key",
                    RequestFingerprint.of(
                        "single-project", "UPLOAD", "de", "same.sb3", ".sb3",
                        "bytes:" + HexFormat.of().formatHex(sha256)
                    ),
                    20
                )
            )
        );

        assertThatThrownBy(
            () -> service.create(
                new ByteArrayInputStream(exact), "UPLOAD", "en", "application/zip", "same.sb3", ".sb3",
                "1.13-SNAPSHOT", "single", "shared-key"
            ).block()
        ).isInstanceOf(IdempotencyKeyRepository.IdempotencyConflictException.class);
        assertThat(staged.promoted).isFalse();
        verifyNoInteractions(sourceArtifacts, submissions, submissionArtifacts, analyses);
    }

    /**
     * A repeat of a request whose submission was built has nothing left to build. Running the whole of the construction
     * again reached the same rows, every step of it refused by a key the database already held, but it promoted a file
     * and asked four times over to be told what one read already said.
     */
    @Test
    void repeatingARequestThatWasCarriedOutDoesNotBuildItAgain() throws Exception {
        final byte[] exact = "synthetic repeated request".getBytes(java.nio.charset.StandardCharsets.UTF_8);
        final byte[] sha256 = java.security.MessageDigest.getInstance("SHA-256").digest(exact);
        final Submission running = new Submission(20, "theirs", "UPLOAD", "en", "RUNNING", "ACTIVE", 1, 0, 0);
        final Analysis analysis = new Analysis(31, 20, 7, "NEW", "1", "synthetic", "en", "QUEUED", ".sb3");
        final StagedBytes staged = staged(sha256, exact.length, "again.sb3");
        when(store.stage(any(), anyString(), anyString())).thenReturn(staged);
        when(idempotency.find("single", "shared-key")).thenReturn(
            Mono.just(
                new IdempotencyKeyRepository.IdempotencyRecord(
                    "single", "shared-key", uploadFingerprint("again.sb3", sha256), 20
                )
            )
        );
        when(submissions.findById(20)).thenReturn(Mono.just(running));
        when(analyses.findCreationBySubmissionId(20)).thenReturn(Mono.just(analysis));
        when(submissions.markRunnable(20)).thenReturn(Mono.empty());

        final SingleProjectSubmissionService.CreatedSubmission created = service.create(
            new ByteArrayInputStream(exact), "UPLOAD", "en", "application/zip", "again.sb3", ".sb3",
            "1.13-SNAPSHOT", "single", "shared-key"
        ).block();

        assertThat(created).isNotNull();
        assertThat(created.analysis().id()).isEqualTo(31);
        assertThat(staged.promoted).as("the bytes are already in the store under their own digest").isFalse();
        assertThat(staged.closed).isTrue();
        verify(analyses, never()).createAttempt(any());
        verifyNoInteractions(sourceArtifacts, submissionArtifacts, scratchStats);
    }

    private static StagedBytes staged(final byte[] sha256, final long byteSize, final String filename) {
        return new StagedBytes(sha256, byteSize, filename);
    }

    /**
     * What the service will have made of an uploaded project, stated here so that a stubbed key can be bound to it.
     *
     * <p>
     * The composition is written out because a mocked repository cannot be asked what the service computed. That it is
     * written out twice is the point of the exercise: this says what a request is, and the service has to agree.
     */
    private static byte[] uploadFingerprint(final String filename, final byte[] sha256) {
        return RequestFingerprint.of(
            "single-project", "UPLOAD", "en", filename, ".sb3", "bytes:" + HexFormat.of().formatHex(sha256)
        );
    }

    /** The same, for a project fetched from Scratch, which is named for the project rather than for its bytes. */
    private static byte[] fetchedFingerprint(final String filename) {
        return RequestFingerprint.of(
            "single-project", "SCRATCH_URL", "en", filename, ".sb3", "fetched-project"
        );
    }

    /** Bytes read aside by the store, remembering whether they were ever asked to be kept. */
    private static final class StagedBytes implements SourceArtifactStore.StagedSourceArtifact {

        private final byte[] sha256;
        private final long byteSize;
        private final String filename;
        private boolean promoted;
        private boolean closed;

        private StagedBytes(final byte[] sha256, final long byteSize, final String filename) {
            this.sha256 = sha256;
            this.byteSize = byteSize;
            this.filename = filename;
        }

        @Override
        public byte[] sha256() {
            return sha256.clone();
        }

        @Override
        public SourceArtifactStore.StoredSourceArtifact promote() {
            promoted = true;
            return new SourceArtifactStore.StoredSourceArtifact(sha256, byteSize, "application/zip", filename);
        }

        @Override
        public void close() {
            closed = true;
        }
    }
}
