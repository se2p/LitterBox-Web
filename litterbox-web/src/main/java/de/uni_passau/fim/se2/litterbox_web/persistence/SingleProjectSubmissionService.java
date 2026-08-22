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

import java.io.ByteArrayInputStream;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.Arrays;
import java.util.HexFormat;
import java.util.LinkedHashMap;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.function.Function;

import org.springframework.stereotype.Service;

import reactor.core.publisher.Mono;
import tools.jackson.databind.json.JsonMapper;

/** Coordinates the single-project persistence sequence from bytes to a runnable analysis. */
@Service
public class SingleProjectSubmissionService {

    private static final String JSON_SUFFIX = ".json";
    private static final String TEACHER_BATCH_SCOPE = "teacher-batch";
    private static final String STUDIO_SCOPE = "studio";
    private static final String ORIGINAL_ARCHIVE_MANIFEST = "{\"format\":\"original-archive\",\"version\":1}";

    private static final String SINGLE_PROJECT_REQUEST = "single-project";
    private static final String INGESTION_REQUEST = "ingestion";

    private final SourceArtifactStore artifactStore;
    private final StorageWork storageWork;
    private final SourceArtifactRepository sourceArtifacts;
    private final SubmissionRepository submissions;
    private final SubmissionArtifactRepository submissionArtifacts;
    private final AnalysisRepository analyses;
    private final IdempotencyKeyRepository idempotency;
    private final ScratchProjectStatsRepository scratchStats;
    private final JsonMapper mapper = JsonMapper.shared();

    public SingleProjectSubmissionService(
        final SourceArtifactStore artifactStore,
        final StorageWork storageWork,
        final SourceArtifactRepository sourceArtifacts,
        final SubmissionRepository submissions,
        final SubmissionArtifactRepository submissionArtifacts,
        final AnalysisRepository analyses,
        final IdempotencyKeyRepository idempotency,
        final ScratchProjectStatsRepository scratchStats
    ) {
        this.artifactStore = Objects.requireNonNull(artifactStore, "artifactStore");
        this.storageWork = Objects.requireNonNull(storageWork, "storageWork");
        this.sourceArtifacts = Objects.requireNonNull(sourceArtifacts, "sourceArtifacts");
        this.submissions = Objects.requireNonNull(submissions, "submissions");
        this.submissionArtifacts = Objects.requireNonNull(submissionArtifacts, "submissionArtifacts");
        this.analyses = Objects.requireNonNull(analyses, "analyses");
        this.idempotency = Objects.requireNonNull(idempotency, "idempotency");
        this.scratchStats = Objects.requireNonNull(scratchStats, "scratchStats");
    }

    public Mono<CreatedBatchRequest> createTeacherRequest(
        final InputStream outerSource,
        final String outerFilename,
        final String locale,
        final String idempotencyKey
    ) {
        Objects.requireNonNull(outerSource, "outerSource");
        RequestStrings.checkFilename(outerFilename);
        RequestStrings.checkIdempotency(TEACHER_BATCH_SCOPE, idempotencyKey);
        final IngestionRequest request = new IngestionRequest(
            outerFilename, "TEACHER_ZIP", ORIGINAL_ARCHIVE_MANIFEST, "TEACHER_ZIP", locale,
            TEACHER_BATCH_SCOPE, idempotencyKey
        );
        return staged(
            outerSource, "application/zip", outerFilename,
            staged -> ingestion(staged, request)
                .map(ingested -> new CreatedBatchRequest(ingested.submission(), ingested.artifact()))
        );
    }

    /**
     * The submission a request to ingest a whole batch belongs to, whether this request is what created it or the key
     * it carries already stood for one.
     *
     * <p>
     * A studio and a teacher archive differ only in what they are named and what is answered back about them; the order
     * of the work is the same, and so is what has to happen when two requests carrying one key arrive together.
     */
    private Mono<IngestedRequest> ingestion(
        final SourceArtifactStore.StagedSourceArtifact staged,
        final IngestionRequest request
    ) {
        final byte[] sha256 = staged.sha256();
        final byte[] fingerprint = fingerprint(request, sha256);
        // Deferred, because building the fallback reaches the repository that reserves a submission, and a key that
        // already stands for one must not cost a row.
        return boundSubmission(request.idempotencyScope(), request.idempotencyKey(), fingerprint)
            .flatMap(owner -> adoptIngestion(owner, staged, request, sha256))
            .switchIfEmpty(Mono.defer(() -> newIngestion(staged, request, sha256, fingerprint)));
    }

    private Mono<IngestedRequest> newIngestion(
        final SourceArtifactStore.StagedSourceArtifact staged,
        final IngestionRequest request,
        final byte[] sha256,
        final byte[] fingerprint
    ) {
        return submissions
            .create(new SubmissionRepository.CreateSubmission(request.sourceType(), request.locale(), 0))
            .flatMap(
                submission -> claimKey(
                    request.idempotencyScope(), request.idempotencyKey(), fingerprint, submission.id()
                ).flatMap(
                    owner -> owner == submission.id()
                        ? buildIngestion(staged, request, submission)
                        : adoptIngestion(owner, staged, request, sha256)
                )
            );
    }

    /** As {@link #buildSubmission}, and repeatable for the same reasons. */
    private Mono<IngestedRequest> buildIngestion(
        final SourceArtifactStore.StagedSourceArtifact staged,
        final IngestionRequest request,
        final Submission submission
    ) {
        return keep(staged, request.filename(), request.sourceKind(), request.manifestJson())
            .flatMap(
                artifact -> submissionArtifacts.link(submission.id(), artifact.id(), "ORIGINAL")
                    .then(submissions.markRunnable(submission.id()))
                    .thenReturn(new IngestedRequest(submission, artifact))
            );
    }

    /**
     * The batch a key already stands for, finished off if the request that bound the key did not get that far.
     *
     * <p>
     * The same gap {@link #adopt} closes, and closed the same way: a repeat carries the archive the key was bound to,
     * so it can keep it and link it rather than report a batch that nothing will ever unpack. And, as there, only when
     * there is a gap — a submission that was built is answered with what was built, rather than built a second time for
     * the sake of arriving at the same rows through a series of refused writes.
     */
    private Mono<IngestedRequest> adoptIngestion(
        final long submissionId,
        final SourceArtifactStore.StagedSourceArtifact staged,
        final IngestionRequest request,
        final byte[] sha256
    ) {
        return submissions.findById(submissionId)
            .switchIfEmpty(
                Mono.error(new IllegalStateException("Idempotency key names a submission that does not exist"))
            )
            .flatMap(
                submission -> submission.terminal() || submission.built()
                    ? ingested(submission, sha256)
                    : buildIngestion(staged, request, submission)
            );
    }

    /** The archive a submission was built around, which is the artifact holding the bytes the key was bound to. */
    private Mono<IngestedRequest> ingested(final Submission submission, final byte[] sha256) {
        return sourceArtifacts.findBySha256(sha256)
            .map(artifact -> new IngestedRequest(submission, artifact))
            .defaultIfEmpty(new IngestedRequest(submission, null));
    }

    /**
     * The submission an idempotency key already stands for, and nothing at all if it stands for none.
     *
     * <p>
     * A key bound to a request that was not this one is refused rather than answered, here as in
     * {@link IdempotencyKeyRepository#put}. Asking before the request's bytes have been kept is what makes that refusal
     * free: no file has been promoted and no artifact recorded that would afterwards have to be found and taken back.
     * The same look-up spares an identical repeat the work of building a submission it would only have to give up, and
     * the binding itself is what decides the matter when two requests arrive too close together for either to find the
     * other's key.
     */
    private Mono<Long> boundSubmission(final String scope, final String key, final byte[] fingerprint) {
        if (scope == null || key == null) {
            return Mono.empty();
        }
        return idempotency.find(scope, key).flatMap(
            record -> Arrays.equals(record.requestFingerprint(), fingerprint)
                ? Mono.just(record.submissionId())
                : Mono.error(new IdempotencyKeyRepository.IdempotencyConflictException(scope, key))
        );
    }

    /**
     * Reads the request's bytes aside and hands them to the work that decides whether the store is to keep them,
     * discarding them if it never got that far.
     */
    private <T> Mono<T> staged(
        final InputStream source,
        final String mediaType,
        final String originalFilename,
        final Function<SourceArtifactStore.StagedSourceArtifact, Mono<T>> work
    ) {
        return Mono.usingWhen(
            storageWork.submit(() -> artifactStore.stage(source, mediaType, originalFilename)),
            work,
            this::discard
        );
    }

    /**
     * Deletes bytes that were read aside and then not kept, on the cleanup pool so that the thread this began on is
     * released whatever the store is doing.
     *
     * @see StorageWork#submitCleanup
     */
    private Mono<Void> discard(final SourceArtifactStore.StagedSourceArtifact staged) {
        return storageWork.submitCleanup(staged::close);
    }

    /** Makes the staged bytes part of the store and records what they are, now that the request is going ahead. */
    private Mono<SourceArtifact> keep(
        final SourceArtifactStore.StagedSourceArtifact staged,
        final String filename,
        final String sourceKind,
        final String manifestJson
    ) {
        return storageWork.submit(staged::promote)
            .flatMap(stored -> register(stored, filename, sourceKind, manifestJson));
    }

    /**
     * Binds the idempotency key to the submission reserved for it, and answers with the submission the key actually
     * stands for.
     *
     * <p>
     * When two requests carrying one key arrive together they both find it unused, and both reserve a submission before
     * either binds it. Only one binding can succeed, and the loser is left holding one nobody will ever be shown. That
     * happens whether the two requests were the same — in which case the loser is told whose submission the key is — or
     * different, in which case the second is refused; either way the submission it reserved is given up here.
     *
     * @return the id of the submission the key belongs to, which is {@code submissionId} unless this request lost
     */
    private Mono<Long> claimKey(
        final String scope,
        final String key,
        final byte[] fingerprint,
        final long submissionId
    ) {
        if (scope == null || key == null) {
            return Mono.just(submissionId);
        }
        return idempotency.put(scope, key, fingerprint, submissionId)
            .flatMap(
                record -> record.submissionId() == submissionId
                    ? Mono.just(submissionId)
                    : abandon(submissionId).thenReturn(record.submissionId())
            )
            .onErrorResume(
                IdempotencyKeyRepository.IdempotencyConflictException.class,
                refused -> abandon(submissionId).then(Mono.error(refused))
            );
    }

    /**
     * Gives up the submission this request reserved when the key it wanted turned out to belong to another.
     *
     * <p>
     * Nothing else was made under it. Cancelling reaches the submission's analyses and jobs as well, which is what it
     * would have to do had the key been claimed later, but by the time a request can lose there is nothing there for it
     * to reach: an artifact is only promoted and recorded once the key is certainly this submission's. The cancelled
     * row is left behind deliberately — a request that was refused is a thing that happened.
     */
    private Mono<Void> abandon(final long submissionId) {
        return submissions.cancelEverything(submissionId).then();
    }

    public Mono<CreatedStudio> createStudioRequest(
        final String studioId, final String locale, final String idempotencyKey
    ) {
        Objects.requireNonNull(studioId, "studioId");
        RequestStrings.checkIdempotency(STUDIO_SCOPE, idempotencyKey);
        final String filename = "scratch-studio-" + studioId + JSON_SUFFIX;
        final byte[] descriptor = ("{\"studioId\":\"" + studioId + "\"}").getBytes(StandardCharsets.UTF_8);
        final IngestionRequest request = new IngestionRequest(
            filename, "SCRATCH_STUDIO_REQUEST", "{\"format\":\"scratch-studio-request\",\"version\":1}",
            "SCRATCH_STUDIO", locale, STUDIO_SCOPE, idempotencyKey
        );
        return staged(
            new ByteArrayInputStream(descriptor), "application/json", filename,
            staged -> ingestion(staged, request).map(ingested -> new CreatedStudio(ingested.submission()))
        );
    }

    public Mono<ProjectAnalysis> addBatchProject(
        final long submissionId,
        final BatchProject child,
        final String locale,
        final String litterboxArtifactVersion
    ) {
        // A project out of a batch is named by whoever packed the archive, and that name is written to two columns
        // that will refuse it if it is too long — after the child's bytes have already been kept.
        RequestStrings.checkFilename(child.filename());
        final String mediaType = child.filename().toLowerCase(Locale.ROOT).endsWith(JSON_SUFFIX)
            ? "application/json"
            : "application/zip";
        final String sourceKind = child.sourceKind();
        return storageWork.submit(
            () -> artifactStore.put(new ByteArrayInputStream(child.bytes()), mediaType, child.filename())
        ).flatMap(stored -> register(stored, child.filename(), sourceKind, manifest(child)))
            .flatMap(
                artifact -> linkBatchProject(
                    submissionId, child, locale, litterboxArtifactVersion, sourceKind, artifact
                )
            );
    }

    private Mono<ProjectAnalysis> linkBatchProject(
        final long submissionId,
        final BatchProject child,
        final String locale,
        final String litterboxArtifactVersion,
        final String sourceKind,
        final SourceArtifact artifact
    ) {
        return submissionArtifacts.linkAnalysis(
            new SubmissionArtifactRepository.BatchAnalysisLink(
                submissionId, artifact.id(), artifactRole(child), child.filename(), litterboxArtifactVersion,
                locale, artifact.sha256(), inputFormat(child.filename())
            )
        ).flatMap(linked -> completeBatchProject(linked, child, sourceKind, artifact));
    }

    private Mono<ProjectAnalysis> completeBatchProject(
        final SubmissionArtifactRepository.LinkedAnalysis linked,
        final BatchProject child,
        final String sourceKind,
        final SourceArtifact artifact
    ) {
        return analyses.findById(linked.analysisId())
            .switchIfEmpty(Mono.error(new IllegalStateException("Batch analysis does not exist")))
            .flatMap(analysis -> {
                final Mono<Void> stats = linked.created()
                    ? persistScratchStats(analysis.id(), artifact.id(), sourceKind)
                    : Mono.empty();
                return stats.thenReturn(new ProjectAnalysis(analysis, child.failureType(), child.failureMessage()));
            });
    }

    public Mono<Analysis> findStudioProject(final long submissionId, final String projectId) {
        Objects.requireNonNull(projectId, "projectId");
        return analyses.findBySubmissionAndProjectName(submissionId, "scratch-" + projectId + ".sb3")
            .switchIfEmpty(
                analyses.findBySubmissionAndProjectName(submissionId, "scratch-" + projectId + JSON_SUFFIX)
            );
    }

    private Mono<SourceArtifact> register(
        final SourceArtifactStore.StoredSourceArtifact stored,
        final String filename,
        final String sourceKind,
        final String manifestJson
    ) {
        return sourceArtifacts.register(
            new SourceArtifactRepository.SourceArtifactWrite(
                stored.sha256(), "sha256/" + HexFormat.of().formatHex(stored.sha256()), filename,
                stored.mediaType(), stored.byteSize(), sourceKind, manifestJson
            )
        );
    }

    private String manifest(final BatchProject child) {
        final Map<String, Object> manifest = new LinkedHashMap<>();
        manifest.put("format", child.failed() ? "batch-failure" : "batch-project");
        manifest.put("version", 1);
        if (child.failed()) {
            manifest.put("failureType", child.failureType());
            manifest.put("failureMessage", child.failureMessage());
        }
        return mapper.writeValueAsString(manifest);
    }

    private String artifactRole(final BatchProject child) {
        if ("TEACHER_CHILD".equals(child.sourceKind())) {
            return "TEACHER_CHILD";
        }
        return child.failed() ? "SCRATCH_PROJECT_FAILURE" : "SCRATCH_PROJECT";
    }

    private Mono<Void> persistScratchStats(
        final long analysisId,
        final long artifactId,
        final String sourceKind
    ) {
        if (!"SCRATCH_URL".equals(sourceKind)) {
            return Mono.empty();
        }
        return sourceArtifacts.findMetadataById(artifactId)
            .switchIfEmpty(Mono.error(new IllegalStateException("Scratch source metadata does not exist")))
            .flatMap(metadata -> scratchStats.upsertFromManifest(analysisId, metadata.manifestJson()));
    }

    private String extension(final String filename) {
        return filename.toLowerCase(Locale.ROOT).endsWith(".mblock") ? ".mblock" : ".sb3";
    }

    private String inputFormat(final String filename) {
        return filename.toLowerCase(Locale.ROOT).endsWith(JSON_SUFFIX) ? "json" : extension(filename);
    }

    public Mono<CreatedSubmission> create(
        final InputStream source,
        final String sourceType,
        final String locale,
        final String mediaType,
        final String originalFilename,
        final String inputFormat,
        final String litterboxArtifactVersion,
        final String idempotencyScope,
        final String idempotencyKey
    ) {
        Objects.requireNonNull(source, "source");
        RequestStrings.checkFilename(originalFilename);
        RequestStrings.checkIdempotency(idempotencyScope, idempotencyKey);
        final SubmissionRequest request = new SubmissionRequest(
            sourceType, locale, originalFilename, inputFormat, litterboxArtifactVersion,
            idempotencyScope, idempotencyKey
        );
        return staged(source, mediaType, originalFilename, staged -> existingOrCreate(staged, request));
    }

    /**
     * The submission this request belongs to: the one its key already stood for, or a new one that claims the key
     * before anything is kept on its account.
     *
     * <p>
     * The key is asked about first, which refuses a request whose bytes are not the ones the key was bound to without
     * writing anything at all. That look-up cannot settle two such requests arriving together, though: both find the
     * key unused. What settles those is the binding, and the binding is what everything durable waits behind, so a
     * request that loses has a submission to cancel and nothing else.
     */
    private Mono<CreatedSubmission> existingOrCreate(
        final SourceArtifactStore.StagedSourceArtifact staged,
        final SubmissionRequest request
    ) {
        final byte[] sha256 = staged.sha256();
        final byte[] fingerprint = fingerprint(request, sha256);
        // Deferred, because building the fallback reaches the repository that reserves a submission, and a key that
        // already stands for one must not cost a row.
        return boundSubmission(request.idempotencyScope(), request.idempotencyKey(), fingerprint)
            .flatMap(owner -> adopt(owner, staged, request))
            .switchIfEmpty(Mono.defer(() -> newSubmission(staged, request, sha256, fingerprint)));
    }

    private Mono<CreatedSubmission> newSubmission(
        final SourceArtifactStore.StagedSourceArtifact staged,
        final SubmissionRequest request,
        final byte[] sha256,
        final byte[] fingerprint
    ) {
        return submissions
            .create(new SubmissionRepository.CreateSubmission(request.sourceType(), request.locale()))
            .flatMap(
                submission -> claimKey(
                    request.idempotencyScope(), request.idempotencyKey(), fingerprint, submission.id()
                ).flatMap(
                    owner -> owner == submission.id()
                        ? buildSubmission(staged, request, submission)
                        : adopt(owner, staged, request)
                )
            );
    }

    /**
     * What this request is, as a digest the key it carries can be bound to and later compared against.
     *
     * <p>
     * The version of LitterBox is deliberately left out, though it is written on the analysis: it is the version this
     * server is running rather than anything the client asked for, so counting it would turn every key already issued
     * into a conflict at the next deployment.
     *
     * @see RequestFingerprint
     */
    private byte[] fingerprint(final SubmissionRequest request, final byte[] sha256) {
        return RequestFingerprint.of(
            SINGLE_PROJECT_REQUEST, request.sourceType(), request.locale(), request.originalFilename(),
            request.inputFormat(), subject(request.sourceType(), sha256)
        );
    }

    private byte[] fingerprint(final IngestionRequest request, final byte[] sha256) {
        return RequestFingerprint.of(
            INGESTION_REQUEST, request.sourceType(), request.sourceKind(), request.locale(), request.filename(),
            request.manifestJson(), bytes(sha256)
        );
    }

    /**
     * What the request is asking about: the bytes for a request that carries its project, and the name it is fetched
     * under for a request that only points at one.
     *
     * @see RequestFingerprint
     */
    private String subject(final String sourceType, final byte[] sha256) {
        return sourceType != null && sourceType.endsWith("SCRATCH_URL") ? "fetched-project" : bytes(sha256);
    }

    private String bytes(final byte[] sha256) {
        return "bytes:" + HexFormat.of().formatHex(sha256);
    }

    /**
     * Everything the submission is owed now that the key is certainly its own.
     *
     * <p>
     * Every step of it can be asked for twice. The bytes are addressed by their own digest, the artifact is recorded
     * against that digest, the link and the statistics are written only if they are not already there, and a
     * submission's single analysis is guarded by a unique key. That is what lets a repeat run this against a submission
     * somebody else began and get the same submission back rather than a second copy of it.
     */
    private Mono<CreatedSubmission> buildSubmission(
        final SourceArtifactStore.StagedSourceArtifact staged,
        final SubmissionRequest request,
        final Submission submission
    ) {
        return keep(staged, request.originalFilename(), request.sourceType(), manifestFor(request.sourceType()))
            .flatMap(artifact -> buildAnalysis(request, submission, artifact));
    }

    /**
     * Records the analysis of the artifact the submission is made from, of whatever bytes that artifact turned out to
     * hold.
     *
     * <p>
     * The digest written on the analysis is the artifact's own, and not the request's. When a repeat finishes a
     * submission built around an earlier fetch of the same project, the two are not the same digest, and the one worth
     * recording is the one belonging to the file that will actually be read.
     */
    private Mono<CreatedSubmission> buildAnalysis(
        final SubmissionRequest request,
        final Submission submission,
        final SourceArtifact artifact
    ) {
        return submissionArtifacts.link(submission.id(), artifact.id(), "ORIGINAL")
            .then(
                analyses.createAttempt(
                    new AnalysisRepository.AnalysisAttempt(
                        submission.id(), artifact.id(), "NEW", "1", request.litterboxArtifactVersion(),
                        request.locale(), artifact.sha256(), request.inputFormat()
                    )
                )
            )
            .flatMap(
                analysis -> persistScratchStats(analysis.id(), artifact.id(), request.sourceType())
                    .then(submissions.markRunnable(submission.id()))
                    .thenReturn(new CreatedSubmission(submission, analysis))
            );
    }

    /**
     * The submission an identical request already created, finished off if that request did not get that far.
     *
     * <p>
     * The key is bound before the work it stands for is built, so that a request repeated after a failure finds the key
     * rather than starting the work a second time. What it finds may therefore be a submission with nothing under it at
     * all — the request that bound the key died in between. This request is the same request, which is how its key
     * matched, so it finishes the work rather than reporting a submission nothing will ever make an analysis for.
     */
    private Mono<CreatedSubmission> adopt(
        final long submissionId,
        final SourceArtifactStore.StagedSourceArtifact staged,
        final SubmissionRequest request
    ) {
        return submissions.findById(submissionId)
            .switchIfEmpty(
                Mono.error(new IllegalStateException("Idempotency key names a submission that does not exist"))
            )
            .flatMap(
                submission -> submission.terminal()
                    // Cancelled or already finished. Carrying on with it would undo what it came to.
                    ? concluded(submission)
                    : resume(submission, staged, request)
            );
    }

    /**
     * Carries on from wherever the request that bound the key stopped, and no further back than that.
     *
     * <p>
     * The analysis is the last thing the building writes, so a submission that has one has everything: the bytes
     * promoted, the artifact recorded, the link made and the statistics kept. All that can be left is the state, which
     * is set after it and is asked for again here because it costs one statement and is the only thing that would
     * otherwise be missing.
     *
     * <p>
     * Running the whole of {@link #buildSubmission} would answer the same, but at the price of a promotion, a bundle
     * read out of storage and four writes refused one after another, paid by every repeat of a request rather than only
     * the rare one that follows a failure.
     */
    private Mono<CreatedSubmission> resume(
        final Submission submission,
        final SourceArtifactStore.StagedSourceArtifact staged,
        final SubmissionRequest request
    ) {
        return analyses.findCreationBySubmissionId(submission.id())
            .flatMap(
                analysis -> submissions.markRunnable(submission.id())
                    .thenReturn(new CreatedSubmission(submission, analysis))
            )
            .switchIfEmpty(Mono.defer(() -> finishBuilding(submission, staged, request)));
    }

    /**
     * Builds what is missing, around the artifact the submission already holds if it has one.
     *
     * <p>
     * The bytes this request carries are not necessarily the bytes the submission was made from. A project fetched from
     * Scratch is packed with the moment it was fetched, so the same project asked for again is another file with
     * another digest — the same request, which is why its key matched, but not the same artifact. Building around it
     * left the submission linked to two, both under the role that means the one it was made from, and nothing
     * afterwards could say which of them the submission is of.
     *
     * <p>
     * Only when there is no link at all are this request's bytes what the submission gets, which is the case where the
     * first attempt stopped before there was anything to be inconsistent with.
     */
    private Mono<CreatedSubmission> finishBuilding(
        final Submission submission,
        final SourceArtifactStore.StagedSourceArtifact staged,
        final SubmissionRequest request
    ) {
        return submissionArtifacts.findOriginalArtifactId(submission.id())
            .flatMap(sourceArtifacts::findById)
            .switchIfEmpty(
                Mono.defer(
                    () -> keep(
                        staged, request.originalFilename(), request.sourceType(), manifestFor(request.sourceType())
                    )
                )
            )
            .flatMap(artifact -> buildAnalysis(request, submission, artifact));
    }

    private Mono<CreatedSubmission> concluded(final Submission submission) {
        return analyses.findLatestBySubmissionId(submission.id())
            .map(analysis -> new CreatedSubmission(submission, analysis))
            .defaultIfEmpty(new CreatedSubmission(submission, null));
    }

    private String manifestFor(final String sourceType) {
        return sourceType.endsWith("SCRATCH_URL")
            ? "{\"format\":\"scratch-project-bundle\",\"version\":1}"
            : ORIGINAL_ARCHIVE_MANIFEST;
    }

    /** What a single-project request says about itself, apart from the bytes it carries. */
    private record SubmissionRequest(
        String sourceType,
        String locale,
        String originalFilename,
        String inputFormat,
        String litterboxArtifactVersion,
        String idempotencyScope,
        String idempotencyKey
    ) {
    }

    /** What a request to ingest a whole batch says about itself, apart from the bytes that stand for it. */
    private record IngestionRequest(
        String filename,
        String sourceKind,
        String manifestJson,
        String sourceType,
        String locale,
        String idempotencyScope,
        String idempotencyKey
    ) {
    }

    private record IngestedRequest(Submission submission, SourceArtifact artifact) {
    }

    /**
     * The submission a request came to, and the analysis queued under it.
     *
     * <p>
     * The analysis is absent only when the submission has already come to an end — cancelled before anything was built
     * under it. There is nothing to queue for such a submission and nothing that would make one, which is what its
     * state says.
     */
    public record CreatedSubmission(Submission submission, Analysis analysis) {
    }

    public record CreatedStudio(Submission submission) {
    }

    /** As {@link CreatedSubmission}, with a null artifact meaning the same thing a null analysis means there. */
    public record CreatedBatchRequest(Submission submission, SourceArtifact artifact) {
    }

    public record ProjectAnalysis(Analysis analysis, String failureType, String failureMessage) {
    }

    public record BatchProject(
        String filename,
        byte[] bytes,
        String failureType,
        String failureMessage,
        String sourceKind
    ) {

        public BatchProject {
            Objects.requireNonNull(filename, "filename");
            Objects.requireNonNull(bytes, "bytes");
            sourceKind = sourceKind == null
                ? failureType == null ? "BATCH_PROJECT" : "BATCH_FAILURE"
                : sourceKind;
            bytes = bytes.clone();
        }

        public BatchProject(
            final String filename,
            final byte[] bytes,
            final String failureType,
            final String failureMessage
        ) {
            this(filename, bytes, failureType, failureMessage, null);
        }

        public boolean failed() {
            return failureType != null;
        }

        @Override
        public byte[] bytes() {
            return bytes.clone();
        }
    }
}
