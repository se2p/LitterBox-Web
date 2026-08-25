/*
 * Copyright (C) 2024-2026 LitterBox-Web contributors
 *
 * This file is part of LitterBox-Web.
 * Licenced under the EUPL-1.2 or later.
 *
 * SPDX-FileCopyrightText: 2024-2026 LitterBox-Web contributors
 * SPDX-License-Identifier: EUPL-1.2
 */
package de.uni_passau.fim.se2.litterbox_web.web_ui.single_project;

import java.io.ByteArrayInputStream;
import java.net.URI;
import java.util.List;
import java.util.function.Supplier;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

import de.uni_passau.fim.se2.litterbox_web.web_ui.execution.AnalysisWork;
import de.uni_passau.fim.se2.litterbox_web.web_ui.persistence.Analysis;
import de.uni_passau.fim.se2.litterbox_web.web_ui.persistence.AnalysisJobRepository;
import de.uni_passau.fim.se2.litterbox_web.web_ui.persistence.AnalysisRepository;
import de.uni_passau.fim.se2.litterbox_web.web_ui.persistence.SingleProjectSubmissionService;
import de.uni_passau.fim.se2.litterbox_web.web_ui.persistence.SourceArtifact;
import de.uni_passau.fim.se2.litterbox_web.web_ui.persistence.SourceArtifactAccess;
import de.uni_passau.fim.se2.litterbox_web.web_ui.persistence.Submission;
import de.uni_passau.fim.se2.litterbox_web.web_ui.persistence.SubmissionRepository;
import reactor.core.publisher.Mono;

/**
 * Every way a project gets here: uploaded, fetched from a Scratch link, carried over from an analysis this service
 * already holds, or arriving as a class set or a studio.
 *
 * All of them end the same way — the bytes are retained, an analysis row is created, and a job is queued — which is the
 * one thing this collaborator is for. What happens to that job afterwards belongs elsewhere.
 */
class SingleProjectIntake {

    private static final String QUESTION_UPLOAD = "QUESTION_UPLOAD";
    private static final String QUESTION_SCRATCH_URL = "QUESTION_SCRATCH_URL";
    private static final Pattern SCRATCH_URL = Pattern.compile(
        "/projects/([1-9][0-9]{0,17})/?", Pattern.CASE_INSENSITIVE
    );

    private final SingleProjectSubmissionService submissions;
    private final SubmissionRepository submissionRepository;
    private final AnalysisRepository analyses;
    private final AnalysisJobRepository jobs;
    private final SourceArtifactAccess sourceArtifacts;
    private final ScratchProjectClient scratch;
    private final AnalysisWork analysisWork;
    private final SingleProjectReportMapper reports;
    private final String litterboxVersion;

    SingleProjectIntake(
        final SingleProjectSubmissionService submissions,
        final SubmissionRepository submissionRepository,
        final AnalysisRepository analyses,
        final AnalysisJobRepository jobs,
        final SourceArtifactAccess sourceArtifacts,
        final ScratchProjectClient scratch,
        final AnalysisWork analysisWork,
        final SingleProjectReportMapper reports,
        final String litterboxVersion
    ) {
        this.submissions = submissions;
        this.submissionRepository = submissionRepository;
        this.analyses = analyses;
        this.jobs = jobs;
        this.sourceArtifacts = sourceArtifacts;
        this.scratch = scratch;
        this.analysisWork = analysisWork;
        this.reports = reports;
        this.litterboxVersion = litterboxVersion;
    }

    Mono<SingleProjectDtos.CreatedSubmission> submitUpload(
        final byte[] bytes,
        final String filename,
        final String locale,
        final String idempotencyKey
    ) {
        return createAndAnalyze(bytes, filename, "UPLOAD", locale, idempotencyKey, "single-project");
    }

    Mono<SingleProjectDtos.CreatedSubmission> submitScratchUrl(
        final String projectUrl,
        final String locale,
        final String idempotencyKey
    ) {
        final String projectId = scratchProjectId(projectUrl);
        if (projectId == null) {
            return Mono.error(new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid Scratch project URL"));
        }
        return scratch.download(projectId)
            .flatMap(
                bytes -> createAndAnalyze(
                    bytes, "scratch-" + projectId + ".sb3", "SCRATCH_URL", locale, idempotencyKey, "single-project"
                )
            );
    }

    Mono<SingleProjectDtos.CreatedSubmission> submitQuestionUpload(
        final byte[] bytes,
        final String filename,
        final String locale,
        final String idempotencyKey
    ) {
        return createAndAnalyze(bytes, filename, QUESTION_UPLOAD, locale, idempotencyKey, "question-generation");
    }

    Mono<SingleProjectDtos.CreatedSubmission> submitQuestionScratchUrl(
        final String projectUrl,
        final String locale,
        final String idempotencyKey
    ) {
        final String projectId = scratchProjectId(projectUrl);
        if (projectId == null) {
            return Mono.error(new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid Scratch project URL"));
        }
        return scratch.download(projectId)
            .flatMap(
                bytes -> createAndAnalyze(
                    bytes, "scratch-" + projectId + ".sb3", QUESTION_SCRATCH_URL, locale, idempotencyKey,
                    "question-generation"
                )
            );
    }

    /**
     * Runs the project behind an existing submission through another kind of analysis. The project is already retained
     * here, so asking questions about a project that has just been checked costs a reference to it rather than a second
     * upload of the same bytes.
     */
    Mono<SingleProjectDtos.CreatedSubmission> reuse(
        final String token,
        final String analysis,
        final String locale,
        final String idempotencyKey
    ) {
        final boolean questions = "questions".equals(analysis);
        if (!questions && !"issues".equals(analysis)) {
            return Mono.error(new ResponseStatusException(HttpStatus.BAD_REQUEST, "Unknown analysis kind"));
        }
        return submissionRepository.findByToken(token)
            .switchIfEmpty(Mono.error(new ResponseStatusException(HttpStatus.NOT_FOUND, "Submission not found")))
            .flatMap(submission -> analyses.findBySubmissionId(submission.id()))
            .flatMap(this::reusableSource)
            .flatMap(
                source -> createAndAnalyze(
                    source.bytes(), source.filename(), questions ? QUESTION_UPLOAD : "UPLOAD", locale,
                    idempotencyKey, questions ? "question-generation" : "single-project"
                )
            );
    }

    private Mono<ReusedSource> reusableSource(final List<Analysis> analysisList) {
        // A batch holds many projects and no single one to carry forward, so only a lone project can be reused.
        final List<Analysis> withSource = analysisList.stream().filter(item -> item.sourceArtifactId() > 0).toList();
        if (withSource.size() != 1) {
            return Mono.error(new ResponseStatusException(HttpStatus.CONFLICT, "No single retained project"));
        }
        final Analysis analysis = withSource.getFirst();
        return sourceArtifacts.findById(analysis.sourceArtifactId())
            .switchIfEmpty(Mono.error(new ResponseStatusException(HttpStatus.GONE, "Project is no longer retained")))
            .flatMap(artifact -> reuseArtifact(artifact, analysis));
    }

    private Mono<ReusedSource> reuseArtifact(final SourceArtifact artifact, final Analysis analysis) {
        if (artifact.byteSize() < 1 || artifact.byteSize() > SingleProjectSupport.MAX_PROJECT_BYTES) {
            return Mono.error(new ResponseStatusException(HttpStatus.CONFLICT, "Project cannot be reused"));
        }
        return sourceArtifacts.open(artifact.sha256())
            .switchIfEmpty(
                Mono.error(new ResponseStatusException(HttpStatus.GONE, "Project is no longer retained"))
            )
            .flatMap(
                stream -> Mono.using(
                    () -> stream,
                    owned -> analysisWork.submit(
                        () -> new ReusedSource(owned.readAllBytes(), reusedFilename(artifact, analysis))
                    ),
                    SingleProjectSupport::closeQuietly
                )
            );
    }

    private static String reusedFilename(final SourceArtifact artifact, final Analysis analysis) {
        final String stored = artifact.originalFilename();
        if (stored != null && !stored.isBlank()) {
            return stored;
        }
        final String format = analysis.inputFormat();
        return "project" + (format != null && format.startsWith(".") ? format : ".sb3");
    }

    private record ReusedSource(byte[] bytes, String filename) {
    }

    Mono<SingleProjectDtos.CreatedSubmission> submitTeacherZip(
        final byte[] bytes,
        final String filename,
        final String locale,
        final String idempotencyKey
    ) {
        if (bytes == null || bytes.length == 0) {
            return Mono.error(new ResponseStatusException(HttpStatus.BAD_REQUEST, "Teacher archive is empty"));
        }
        if (bytes.length > TeacherBatchArchiveInspector.MAX_COMPRESSED_BYTES) {
            return Mono.error(
                new ResponseStatusException(HttpStatus.PAYLOAD_TOO_LARGE, "Teacher archive is too large")
            );
        }
        return submissions.createTeacherRequest(
            new ByteArrayInputStream(bytes), filename, locale, idempotencyKey
        )
            .flatMap(
                created -> queue(
                    created.submission(),
                    created.artifact() == null
                        ? null
                        : () -> jobs.enqueueTeacher(created.submission().id(), created.artifact().id())
                ).thenReturn(reports.toCreated(created.submission()))
            );
    }

    Mono<SingleProjectDtos.CreatedSubmission> submitStudio(
        final String studioId,
        final String locale,
        final String idempotencyKey
    ) {
        if (studioId == null || !studioId.matches("[1-9][0-9]{0,17}")) {
            return Mono.error(new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid Scratch studio id"));
        }
        return submissions.createStudioRequest(studioId, locale, idempotencyKey)
            .flatMap(
                created -> queue(
                    created.submission(), () -> jobs.enqueueStudio(created.submission().id(), studioId)
                ).thenReturn(reports.toCreated(created.submission()))
            );
    }

    private Mono<SingleProjectDtos.CreatedSubmission> createAndAnalyze(
        final byte[] bytes,
        final String filename,
        final String sourceType,
        final String locale,
        final String idempotencyKey,
        final String idempotencyScope
    ) {
        return submissions.create(
            new ByteArrayInputStream(bytes), sourceType, locale, "application/zip", filename,
            SingleProjectSupport.extension(filename), litterboxVersion, idempotencyScope, idempotencyKey
        ).flatMap(
            created -> queue(
                created.submission(),
                created.analysis() == null
                    ? null
                    : () -> jobs.enqueue(created.submission().id(), created.analysis().id())
            ).thenReturn(reports.toCreated(created))
        );
    }

    /**
     * Queues the job a submission needs, unless it has already come to something or there is not yet anything to queue.
     *
     * <p>
     * Queueing is refused by a unique key when the job is already there, so asking every time costs a repeat nothing
     * and is the only thing that puts back a job a failed first attempt never queued. A null {@code enqueue} means
     * there is nothing to queue yet: the request that owns the idempotency key is still building, and it is the one
     * that queues.
     */
    private Mono<Void> queue(final Submission submission, final Supplier<Mono<Void>> enqueue) {
        if (submission.terminal() || enqueue == null) {
            return Mono.empty();
        }
        return enqueue.get();
    }

    static String scratchProjectId(final String projectUrl) {
        if (projectUrl == null) {
            return null;
        }
        final URI uri;
        try {
            uri = URI.create(projectUrl);
        }
        catch (IllegalArgumentException error) {
            return null;
        }
        if (!validScratchUri(uri)) {
            return null;
        }
        final Matcher matcher = SCRATCH_URL.matcher(uri.getPath());
        return matcher.matches() ? matcher.group(1) : null;
    }

    private static boolean validScratchUri(final URI uri) {
        if (!"https".equalsIgnoreCase(uri.getScheme())) {
            return false;
        }
        if (!validScratchHost(uri.getHost())) {
            return false;
        }
        if (uri.getPort() != -1 && uri.getPort() != 443) {
            return false;
        }
        return uri.getUserInfo() == null && uri.getQuery() == null && uri.getFragment() == null;
    }

    private static boolean validScratchHost(final String host) {
        return "scratch.mit.edu".equalsIgnoreCase(host) || "www.scratch.mit.edu".equalsIgnoreCase(host);
    }
}
