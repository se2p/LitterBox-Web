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

import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.HexFormat;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.concurrent.CancellationException;
import java.util.function.BiFunction;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import de.uni_passau.fim.se2.litterbox.analytics.Issue;
import de.uni_passau.fim.se2.litterbox.analytics.ProgramBugAnalyzer;
import de.uni_passau.fim.se2.litterbox.ast.model.Program;
import de.uni_passau.fim.se2.litterbox.report.ReportDTO;
import de.uni_passau.fim.se2.litterbox.utils.IssueTranslatorFactory;
import de.uni_passau.fim.se2.litterbox_web.qlc.QlcService;
import de.uni_passau.fim.se2.litterbox_web.qlc.QuestionDTO;
import de.uni_passau.fim.se2.litterbox_web.shared.Scratch3ParserService;
import de.uni_passau.fim.se2.litterbox_web.web_ui.execution.AnalysisWork;
import de.uni_passau.fim.se2.litterbox_web.web_ui.persistence.Analysis;
import de.uni_passau.fim.se2.litterbox_web.web_ui.persistence.AnalysisJobRepository;
import de.uni_passau.fim.se2.litterbox_web.web_ui.persistence.AnalysisRepository;
import de.uni_passau.fim.se2.litterbox_web.web_ui.persistence.AssetRepository;
import de.uni_passau.fim.se2.litterbox_web.web_ui.persistence.SingleProjectSubmissionService;
import de.uni_passau.fim.se2.litterbox_web.web_ui.persistence.SourceArtifact;
import de.uni_passau.fim.se2.litterbox_web.web_ui.persistence.SourceArtifactAccess;
import de.uni_passau.fim.se2.litterbox_web.web_ui.persistence.SourceArtifactMetadata;
import de.uni_passau.fim.se2.litterbox_web.web_ui.persistence.Submission;
import de.uni_passau.fim.se2.litterbox_web.web_ui.persistence.SubmissionEventRepository;
import de.uni_passau.fim.se2.litterbox_web.web_ui.persistence.SubmissionRepository;
import reactor.core.publisher.Flux;
import reactor.core.publisher.Mono;
import tools.jackson.databind.json.JsonMapper;

/**
 * Running a queued job to completion, whatever kind it is: one project, a studio to be ingested, or a class set whose
 * children each become a job of their own.
 *
 * This is the only part of the workflow that is allowed to fail halfway. A job holds a lease it has to keep, a batch
 * can be cancelled while its children are still being taken in, and an analysis can exhaust a limit after it has
 * started — so most of what is here is about leaving the database in a state a reader can be shown.
 */
class AnalysisRunner {

    private static final Logger log = LoggerFactory.getLogger(AnalysisRunner.class);
    private static final String DETECTOR_SET = "all";
    private static final String REPORT_CONFIGURATION = "{\"detectors\":\"all\","
        + "\"reportOptions\":\"include-coupling,include-duplicates,include-similarity,include-subsumption\"}";
    private static final String QUESTION_DETECTOR_SET = "questions";
    private static final String QUESTION_CONFIGURATION = "{\"detectors\":\"questions\","
        + "\"reportOptions\":\"none\","
        + "\"qlc\":\"balanced=false,max=" + SingleProjectSupport.MAX_GENERATED_QUESTIONS
        + ",per-cell=0,seed=0,shuffle=false\"}";
    private static final String QUESTION_UPLOAD = "QUESTION_UPLOAD";
    private static final String QUESTION_SCRATCH_URL = "QUESTION_SCRATCH_URL";
    private static final String FAILED_STATUS_EVENT = "{\"status\":\"failed\"}";
    private static final String NO_ARTIFACT_METADATA = "Source artifact metadata does not exist";

    private final SingleProjectSubmissionService submissions;
    private final SubmissionRepository submissionRepository;
    private final SubmissionEventRepository submissionEvents;
    private final AnalysisRepository analyses;
    private final AnalysisJobRepository jobs;
    private final SourceArtifactAccess sourceArtifacts;
    private final AssetRepository assets;
    private final AnalysisWork analysisWork;
    private final Scratch3ParserService parser;
    private final StructuredReportAssembler reportAssembler = new StructuredReportAssembler();
    private final ScratchProjectClient scratch;
    private final QlcService qlc;
    private final ProjectArchiveInspector archiveInspector;
    private final TeacherBatchArchiveInspector teacherArchives;
    private final String litterboxVersion;
    private final JsonMapper mapper = JsonMapper.shared();
    private final SingleProjectReportMapper reports;

    AnalysisRunner(
        final SingleProjectSubmissionService submissions,
        final SubmissionRepository submissionRepository,
        final SubmissionEventRepository submissionEvents,
        final AnalysisRepository analyses,
        final AnalysisJobRepository jobs,
        final SourceArtifactAccess sourceArtifacts,
        final AssetRepository assets,
        final AnalysisWork analysisWork,
        final Scratch3ParserService parser,
        final ScratchProjectClient scratch,
        final QlcService qlc,
        final ProjectArchiveInspector archiveInspector,
        final TeacherBatchArchiveInspector teacherArchives,
        final SingleProjectReportMapper reports,
        final String litterboxVersion
    ) {
        this.submissions = submissions;
        this.submissionRepository = submissionRepository;
        this.submissionEvents = submissionEvents;
        this.analyses = analyses;
        this.jobs = jobs;
        this.sourceArtifacts = sourceArtifacts;
        this.assets = assets;
        this.analysisWork = analysisWork;
        this.parser = parser;
        this.scratch = scratch;
        this.qlc = qlc;
        this.archiveInspector = archiveInspector;
        this.teacherArchives = teacherArchives;
        this.reports = reports;
        this.litterboxVersion = litterboxVersion;
    }

    /**
     * Runs a job on behalf of the worker whose lease it is.
     *
     * <p>
     * There is no way to run one without a lease. Every write a run makes is conditional on still holding it, and a run
     * that could skip that condition could finish a job another worker had since taken over, on top of whatever that
     * worker wrote.
     */
    Mono<Boolean> runJob(final AnalysisJobRepository.Job job, final String workerId) {
        Objects.requireNonNull(workerId, "workerId");
        if ("STUDIO_INGEST".equals(job.kind())) {
            return runStudioJob(job, workerId);
        }
        if ("TEACHER_INGEST".equals(job.kind())) {
            return runTeacherJob(job, workerId);
        }
        if ("PROJECT_LIST_INGEST".equals(job.kind())) {
            return runProjectListJob(job, workerId);
        }
        if (job.analysisId() == null) {
            return Mono.error(new IllegalStateException("Analysis job has no analysis id"));
        }
        return analyses.findById(job.analysisId())
            .switchIfEmpty(Mono.error(new IllegalStateException("Analysis does not exist")))
            .flatMap(analysis -> runStoredJob(job, workerId, analysis))
            .onErrorResume(error -> recoverJobError(job, workerId, error));
    }

    private Mono<Boolean> runStoredJob(
        final AnalysisJobRepository.Job job,
        final String workerId,
        final Analysis analysis
    ) {
        return terminalResult(analysis).switchIfEmpty(
            sourceArtifacts.findForAnalysis(analysis)
                .switchIfEmpty(Mono.error(new IllegalStateException("Source artifact does not exist")))
                .flatMap(
                    artifact -> sourceArtifacts.findMetadataById(artifact.id())
                        .switchIfEmpty(Mono.error(new IllegalStateException(NO_ARTIFACT_METADATA)))
                        .flatMap(metadata -> runStoredMetadata(job, workerId, analysis, artifact, metadata))
                )
        );
    }

    private Mono<Boolean> runStoredMetadata(
        final AnalysisJobRepository.Job job,
        final String workerId,
        final Analysis analysis,
        final SourceArtifact artifact,
        final SourceArtifactMetadata metadata
    ) {
        final SourceFailure failure = sourceFailure(metadata);
        if (failure != null) {
            return completeStoredFailure(job, workerId, failure);
        }
        return sourceArtifacts.open(artifact.sha256()).flatMap(
            stream -> Mono.using(
                () -> stream,
                owned -> analyzeStored(job, analysis, artifact, owned, workerId),
                SingleProjectSupport::closeQuietly
            )
        );
    }

    private Mono<Boolean> recoverJobError(
        final AnalysisJobRepository.Job job,
        final String workerId,
        final Throwable error
    ) {
        if (error instanceof AnalysisJobRepository.LeaseLostException) {
            return Mono.error(error);
        }
        return jobs.cancellationRequested(job.id()).flatMap(
            cancelled -> cancelled ? Mono.just(false) : completeFailure(job, workerId, error)
        );
    }

    private Mono<Boolean> runStudioJob(final AnalysisJobRepository.Job job, final String workerId) {
        return submissionRepository.findById(job.submissionId())
            .switchIfEmpty(Mono.error(new IllegalStateException("Studio submission does not exist")))
            .flatMap(submission -> runStudioSubmission(job, workerId, submission))
            .onErrorResume(error -> failBatchIngestion(job, workerId, error));
    }

    private Mono<Boolean> runStudioSubmission(
        final AnalysisJobRepository.Job job,
        final String workerId,
        final Submission submission
    ) {
        if (submission.terminal()) {
            return Mono.just(false);
        }
        return ensureLease(job, workerId)
            .then(submissionRepository.markRunning(job.submissionId()))
            .then(submissionEvents.append(job.submissionId(), "RUNNING", "{\"status\":\"fetching-studio\"}"))
            .then(ensureLease(job, workerId))
            .then(scratch.listStudioProjectIds(job.sourceReference(), () -> jobs.cancellationRequested(job.id())))
            .flatMap(projectIds -> ingestStudioProjects(job, workerId, submission, projectIds))
            .then(confirmBatchNotCancelled(job, workerId))
            .thenReturn(false);
    }

    private Mono<Void> ingestStudioProjects(
        final AnalysisJobRepository.Job job,
        final String workerId,
        final Submission submission,
        final List<String> projectIds
    ) {
        if (projectIds.isEmpty()) {
            return Mono.error(new IllegalArgumentException("Scratch project set contains no projects"));
        }
        return ensureLease(job, workerId)
            .then(submissionRepository.prepareBatch(job.submissionId(), projectIds.size()))
            .thenMany(Flux.fromIterable(projectIds))
            .concatMap(projectId -> ingestStudioProject(job, workerId, submission, projectId))
            .then();
    }

    private Mono<Boolean> runProjectListJob(final AnalysisJobRepository.Job job, final String workerId) {
        return runArtifactBatchJob(
            job, workerId, "Project-list", "fetching-projects",
            (submission, artifact) -> readProjectList(artifact)
                .flatMap(projectIds -> ingestStudioProjects(job, workerId, submission, projectIds))
        );
    }

    private Mono<List<String>> readProjectList(final SourceArtifact artifact) {
        return sourceArtifacts.open(artifact.sha256()).flatMap(
            stream -> Mono.using(
                () -> stream,
                owned -> analysisWork.submit(
                    () -> new String(
                        SingleProjectSupport.readLimited(owned, SingleProjectIntake.MAX_PROJECT_LIST_BYTES),
                        StandardCharsets.UTF_8
                    ).lines().toList()
                ),
                SingleProjectSupport::closeQuietly
            )
        );
    }

    /** Runs a batch whose projects come from one stored source artifact named by the job's source reference. */
    private Mono<Boolean> runArtifactBatchJob(
        final AnalysisJobRepository.Job job,
        final String workerId,
        final String kind,
        final String runningStatus,
        final BiFunction<Submission, SourceArtifact, Mono<?>> ingest
    ) {
        return Mono.fromCallable(() -> Long.parseLong(job.sourceReference()))
            .onErrorMap(
                NumberFormatException.class,
                error -> new IllegalStateException(kind + " ingestion job has an invalid artifact id", error)
            )
            .flatMap(
                artifactId -> submissionRepository.findById(job.submissionId())
                    .switchIfEmpty(Mono.error(new IllegalStateException(kind + " submission does not exist")))
                    .flatMap(
                        submission -> runArtifactBatch(
                            job, workerId, kind, runningStatus, artifactId, submission, ingest
                        )
                    )
            )
            .onErrorResume(error -> failBatchIngestion(job, workerId, error));
    }

    @SuppressWarnings("checkstyle:ParameterNumber")
    private Mono<Boolean> runArtifactBatch(
        final AnalysisJobRepository.Job job,
        final String workerId,
        final String kind,
        final String runningStatus,
        final long artifactId,
        final Submission submission,
        final BiFunction<Submission, SourceArtifact, Mono<?>> ingest
    ) {
        if (submission.terminal()) {
            return Mono.just(false);
        }
        return ensureLease(job, workerId)
            .then(submissionRepository.markRunning(job.submissionId()))
            .then(
                submissionEvents.append(job.submissionId(), "RUNNING", "{\"status\":\"" + runningStatus + "\"}")
            )
            .then(ensureLease(job, workerId))
            .then(jobs.cancellationRequested(job.id()))
            .flatMap(cancelled -> findBatchArtifact(kind, artifactId, cancelled))
            .flatMap(artifact -> ingest.apply(submission, artifact))
            .then(confirmBatchNotCancelled(job, workerId))
            .thenReturn(false);
    }

    private Mono<SourceArtifact> findBatchArtifact(final String kind, final long artifactId, final boolean cancelled) {
        if (cancelled) {
            return Mono.error(new CancellationException(kind + " ingestion was cancelled"));
        }
        return sourceArtifacts.findById(artifactId)
            .switchIfEmpty(Mono.error(new IllegalStateException(kind + " source artifact does not exist")));
    }

    private Mono<Void> ingestStudioProject(
        final AnalysisJobRepository.Job job,
        final String workerId,
        final Submission submission,
        final String projectId
    ) {
        return confirmBatchNotCancelled(job, workerId)
            .then(submissions.findStudioProject(job.submissionId(), projectId))
            .flatMap(existing -> jobs.enqueue(job.submissionId(), existing.id()).thenReturn(true))
            .switchIfEmpty(
                downloadStudioProject(job, projectId)
                    .flatMap(download -> storeStudioProject(job, workerId, submission, download))
            )
            .then();
    }

    private Mono<Boolean> storeStudioProject(
        final AnalysisJobRepository.Job job,
        final String workerId,
        final Submission submission,
        final ScratchProjectClient.ProjectDownload download
    ) {
        return confirmBatchNotCancelled(job, workerId)
            .then(
                submissions.addBatchProject(
                    job.submissionId(), batchProject(download), submission.locale(), litterboxVersion
                )
            )
            .flatMap(
                project -> ensureLease(job, workerId)
                    .then(jobs.enqueue(job.submissionId(), project.analysis().id()))
            )
            .thenReturn(true);
    }

    private Mono<ScratchProjectClient.ProjectDownload> downloadStudioProject(
        final AnalysisJobRepository.Job job,
        final String projectId
    ) {
        return jobs.cancellationRequested(job.id()).flatMap(cancelled -> downloadUnlessCancelled(cancelled, projectId));
    }

    private Mono<ScratchProjectClient.ProjectDownload> downloadUnlessCancelled(
        final boolean cancelled,
        final String projectId
    ) {
        if (cancelled) {
            return Mono.error(new CancellationException("Scratch project ingestion was cancelled"));
        }
        return scratch.downloadStudioProjects(List.of(projectId)).single();
    }

    private SingleProjectSubmissionService.BatchProject batchProject(
        final ScratchProjectClient.ProjectDownload download
    ) {
        return download.failureType() == null
            ? new SingleProjectSubmissionService.BatchProject(
                "scratch-" + download.id() + ".sb3", download.archive(), null, null, "SCRATCH_URL"
            )
            : new SingleProjectSubmissionService.BatchProject(
                "scratch-" + download.id() + ".json",
                ("{\"projectId\":\"" + download.id() + "\"}").getBytes(StandardCharsets.UTF_8),
                download.failureType(), download.failureMessage()
            );
    }

    private Mono<Boolean> runTeacherJob(final AnalysisJobRepository.Job job, final String workerId) {
        return runArtifactBatchJob(
            job, workerId, "Teacher", "extracting-batch",
            (submission, artifact) -> inspectTeacherArtifact(artifact)
                .map(this::teacherProjects)
                .flatMap(children -> enqueueTeacherChildren(job, workerId, submission, children))
        );
    }

    private Mono<List<TeacherBatchArchiveInspector.ChildArchive>> inspectTeacherArtifact(
        final SourceArtifact artifact
    ) {
        return sourceArtifacts.open(artifact.sha256()).flatMap(
            stream -> Mono.using(
                () -> stream,
                owned -> analysisWork.submit(() -> teacherArchives.inspect(owned)),
                SingleProjectSupport::closeQuietly
            )
        );
    }

    private List<SingleProjectSubmissionService.BatchProject> teacherProjects(
        final List<TeacherBatchArchiveInspector.ChildArchive> children
    ) {
        return children.stream().map(
            child -> new SingleProjectSubmissionService.BatchProject(
                child.filename(), child.bytes(), child.failureType(), child.failureMessage(), "TEACHER_CHILD"
            )
        ).toList();
    }

    private Mono<Void> enqueueTeacherChildren(
        final AnalysisJobRepository.Job job,
        final String workerId,
        final Submission submission,
        final List<SingleProjectSubmissionService.BatchProject> children
    ) {
        return confirmBatchNotCancelled(job, workerId)
            .then(submissionRepository.prepareBatch(job.submissionId(), children.size()))
            .thenMany(Flux.fromIterable(children))
            .concatMap(child -> enqueueTeacherChild(job, workerId, submission, child))
            .then();
    }

    private Mono<Void> enqueueTeacherChild(
        final AnalysisJobRepository.Job job,
        final String workerId,
        final Submission submission,
        final SingleProjectSubmissionService.BatchProject child
    ) {
        return confirmBatchNotCancelled(job, workerId)
            .then(submissions.addBatchProject(job.submissionId(), child, submission.locale(), litterboxVersion))
            .flatMap(
                project -> ensureLease(job, workerId)
                    .then(jobs.enqueue(job.submissionId(), project.analysis().id()))
            )
            .then();
    }

    private Mono<Void> confirmBatchNotCancelled(
        final AnalysisJobRepository.Job job,
        final String workerId
    ) {
        return ensureLease(job, workerId).then(jobs.cancellationRequested(job.id())).flatMap(
            cancelled -> cancelled
                ? submissionRepository.cancelEverything(job.submissionId())
                    .then(Mono.error(new CancellationException("Batch ingestion was cancelled")))
                : Mono.empty()
        );
    }

    private Mono<Boolean> failBatchIngestion(
        final AnalysisJobRepository.Job job,
        final String workerId,
        final Throwable error
    ) {
        if (error instanceof AnalysisJobRepository.LeaseLostException) {
            return Mono.error(error);
        }
        return jobs.cancellationRequested(job.id()).flatMap(
            cancelled -> cancelled || error instanceof CancellationException
                ? Mono.just(false)
                : recordBatchFailure(job, workerId, error)
        );
    }

    private Mono<Boolean> recordBatchFailure(
        final AnalysisJobRepository.Job job,
        final String workerId,
        final Throwable error
    ) {
        log.warn("{} job {} failed for submission {}", job.kind(), job.id(), job.submissionId(), error);
        return submissionRepository.failBatchIngestionIfOwned(job.submissionId(), job.id(), workerId)
            .flatMap(
                outcome -> outcome.leaseOwned()
                    ? Mono.just(true)
                    : Mono.error(new AnalysisJobRepository.LeaseLostException())
            );
    }

    private Mono<Boolean> analyzeStored(
        final AnalysisJobRepository.Job job,
        final Analysis analysis,
        final SourceArtifact artifact,
        final InputStream stream,
        final String workerId
    ) {
        return submissionRepository.findById(job.submissionId())
            .switchIfEmpty(Mono.error(new IllegalStateException("Submission does not exist")))
            .flatMap(
                submission -> analyzeStored(
                    job, analysis, artifact, stream, workerId, executionFor(submission.sourceType())
                )
            );
    }

    private Mono<Boolean> analyzeStored(
        final AnalysisJobRepository.Job job,
        final Analysis analysis,
        final SourceArtifact artifact,
        final InputStream stream,
        final String workerId,
        final AnalysisExecution execution
    ) {
        return ensureLease(job, workerId)
            .then(submissionRepository.markRunning(job.submissionId()))
            .then(analyses.updateStatus(analysis.id(), "RUNNING", null, null, null))
            .then(
                analyses.setAnalysisConfiguration(
                    analysis.id(), execution.detectorSet(), execution.configuration()
                )
            )
            .then(ensureLease(job, workerId))
            .then(submissionEvents.append(job.submissionId(), "RUNNING", "{\"status\":\"processing\"}"))
            .then(
                analysisWork.submit(
                    () -> execution.questions()
                        ? generateQuestionsBlocking(
                            stream.readAllBytes(), artifact.originalFilename(), analysis.inputFormat(),
                            analysis.locale()
                        )
                        : analyzeBlocking(
                            stream.readAllBytes(), artifact.originalFilename(), analysis.inputFormat(),
                            analysis.locale()
                        )
                )
            )
            .flatMap(
                outcome -> persistAssets(analysis.id(), outcome.assets())
                    .then(
                        jobs.cancellationRequested(job.id()).flatMap(
                            cancelled -> cancelled
                                ? Mono.empty()
                                : completeSuccess(job, analysis.id(), workerId, outcome, execution)
                        )
                    )
            )
            .thenReturn(false);
    }

    private Mono<Void> ensureLease(final AnalysisJobRepository.Job job, final String workerId) {
        return jobs.leaseOwned(job.id(), workerId).flatMap(
            owned -> owned ? Mono.empty() : Mono.error(new AnalysisJobRepository.LeaseLostException())
        );
    }

    private Mono<Boolean> completeFailure(
        final AnalysisJobRepository.Job job,
        final String workerId,
        final Throwable error
    ) {
        log.warn("Analysis job {} failed for analysis {}", job.id(), job.analysisId(), error);
        return analyses.completeIfOwned(
            job.analysisId(), job.submissionId(), true, null, error.getClass().getSimpleName(),
            SingleProjectSupport.safeMessage(error, "Analysis failed"), FAILED_STATUS_EVENT, null, null, null,
            job.id(), workerId
        ).flatMap(
            completed -> completed
                ? Mono.just(true)
                : Mono.error(new AnalysisJobRepository.LeaseLostException())
        );
    }

    private Mono<Boolean> completeStoredFailure(
        final AnalysisJobRepository.Job job,
        final String workerId,
        final SourceFailure failure
    ) {
        return analyses.completeIfOwned(
            job.analysisId(), job.submissionId(), true, null, failure.type(), failure.message(),
            FAILED_STATUS_EVENT, null, null, null, job.id(), workerId
        ).flatMap(
            completed -> completed
                ? Mono.just(true)
                : Mono.error(new AnalysisJobRepository.LeaseLostException())
        );
    }

    private SourceFailure sourceFailure(final SourceArtifactMetadata metadata) {
        if (metadata.manifestJson() == null || metadata.manifestJson().isBlank()) {
            return null;
        }
        final tools.jackson.databind.JsonNode manifest = mapper.readTree(metadata.manifestJson());
        if (!"batch-failure".equals(manifest.path("format").stringValue(null))) {
            return null;
        }
        final String type = boundedManifestText(
            manifest.get("failureType"), "ProjectFetchFailure", 255
        );
        final String message = boundedManifestText(
            manifest.get("failureMessage"), "Project could not be processed", 1000
        );
        return new SourceFailure(type, message);
    }

    private String boundedManifestText(
        final tools.jackson.databind.JsonNode value,
        final String fallback,
        final int maximumLength
    ) {
        if (value == null || !value.isString() || value.stringValue().isBlank()) {
            return fallback;
        }
        return value.stringValue().substring(0, Math.min(value.stringValue().length(), maximumLength));
    }

    private Mono<Void> completeSuccess(
        final AnalysisJobRepository.Job job,
        final long analysisId,
        final String workerId,
        final AnalysisOutcome outcome,
        final AnalysisExecution execution
    ) {
        return analyses.completeIfOwned(
            analysisId, job.submissionId(), false, outcome.reportJson(), null, null,
            "{\"status\":\"completed\"}", execution.detectorSet(), execution.configuration(),
            outcome.report().metrics(), job.id(), workerId
        ).flatMap(
            completed -> completed
                ? Mono.empty()
                : Mono.error(new AnalysisJobRepository.LeaseLostException())
        );
    }

    private Mono<Boolean> terminalResult(final Analysis analysis) {
        return switch (analysis.status()) {
            case "DONE", "CANCELLED" -> Mono.just(false);
            case "FAILED" -> Mono.just(true);
            default -> Mono.empty();
        };
    }

    private AnalysisExecution executionFor(final String sourceType) {
        if (QUESTION_UPLOAD.equals(sourceType) || QUESTION_SCRATCH_URL.equals(sourceType)) {
            return new AnalysisExecution(true, QUESTION_DETECTOR_SET, QUESTION_CONFIGURATION);
        }
        return new AnalysisExecution(false, DETECTOR_SET, REPORT_CONFIGURATION);
    }

    private AnalysisOutcome analyzeBlocking(
        final byte[] bytes,
        final String filename,
        final String inputFormat,
        final String locale
    ) throws IOException {
        final Program program;
        final ProjectArchiveInspector.Inspection inspection = archiveInspector.inspect(bytes);
        final List<ProjectArchiveInspector.ArchiveAsset> archiveAssets = inspection.assets();
        final Map<String, String> thumbnailHashes = inspection.thumbnailHashes();
        final Path temporary = Files.createTempFile(
            "litterbox-single-",
            SingleProjectSupport.extension(SingleProjectSupport.usableFilename(filename, inputFormat))
        );
        try {
            Files.write(temporary, bytes);
            program = parser.parseFromFile(temporary);
        }
        finally {
            Files.deleteIfExists(temporary);
        }
        final Locale analysisLocale = Locale.of(locale);
        final Set<Issue> issues = new ProgramBugAnalyzer(DETECTOR_SET, false).analyze(program);
        final ReportDTO coreReport = reportAssembler.create(
            program, issues, IssueTranslatorFactory.getIssueTranslator(analysisLocale)
        );
        final List<String> assetHashes = archiveAssets.stream()
            .map(asset -> HexFormat.of().formatHex(asset.sha256()))
            .toList();
        final StoredAnalysis storedReport = new StoredAnalysis(
            filename, coreReport.metrics(), coreReport.issues().stream()
                .map(issue -> reports.issue(issue, thumbnailHashes)).toList(),
            reports.relationships(coreReport.issues()), reports.catalogue(analysisLocale, coreReport.issues()),
            List.of(),
            List.of(), assetHashes
        );
        return new AnalysisOutcome(
            storedReport,
            archiveAssets,
            mapper.writeValueAsString(storedReport)
        );
    }

    private AnalysisOutcome generateQuestionsBlocking(
        final byte[] bytes,
        final String filename,
        final String inputFormat,
        final String locale
    ) throws IOException {
        final Program program;
        archiveInspector.inspect(bytes);
        final Path temporary = Files.createTempFile(
            "litterbox-questions-",
            SingleProjectSupport.extension(SingleProjectSupport.usableFilename(filename, inputFormat))
        );
        try {
            Files.write(temporary, bytes);
            program = parser.parseFromFile(temporary);
        }
        finally {
            Files.deleteIfExists(temporary);
        }
        final List<QuestionDTO> generatedQuestions = SingleProjectSupport.generateQuestions(qlc, program, locale);
        final List<SingleProjectDtos.QuizView> questions = generatedQuestions.stream()
            .map(QuizAnswerMarking::quizView)
            .toList();
        final StoredAnalysis storedReport = new StoredAnalysis(
            filename, Map.of(), List.of(), List.of(), List.of(), questions,
            generatedQuestions.stream().map(QuizAnswerMarking::storedQuizQuestion).toList(), List.of()
        );
        return new AnalysisOutcome(storedReport, List.of(), mapper.writeValueAsString(storedReport));
    }

    private Mono<Void> persistAssets(
        final long analysisId,
        final List<ProjectArchiveInspector.ArchiveAsset> archiveAssets
    ) {
        return Flux.fromIterable(archiveAssets).concatMap(
            asset -> assets.save(
                new AssetRepository.AssetWrite(
                    asset.sha256(), asset.scratchMd5(), asset.extension(), asset.mediaType(), asset.content()
                )
            ).flatMap(saved -> assets.linkToAnalysis(analysisId, saved.sha256(), "THUMBNAIL"))
        ).then();
    }

    private record AnalysisExecution(boolean questions, String detectorSet, String configuration) {
    }

    private record SourceFailure(String type, String message) {
    }

    private record AnalysisOutcome(
        StoredAnalysis report,
        List<ProjectArchiveInspector.ArchiveAsset> assets,
        String reportJson
    ) {

        private AnalysisOutcome {
            assets = List.copyOf(assets);
        }
    }
}
