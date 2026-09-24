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
import java.time.Duration;
import java.util.HexFormat;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.atomic.AtomicLong;
import java.util.function.Function;

import org.springframework.http.HttpStatus;
import org.springframework.http.codec.ServerSentEvent;
import org.springframework.web.server.ResponseStatusException;

import de.uni_passau.fim.se2.litterbox.analytics.Issue;
import de.uni_passau.fim.se2.litterbox.analytics.ProgramBugAnalyzer;
import de.uni_passau.fim.se2.litterbox.ast.model.Program;
import de.uni_passau.fim.se2.litterbox.report.HTMLReportGenerator;
import de.uni_passau.fim.se2.litterbox.report.ProjectAnalysisResult;
import de.uni_passau.fim.se2.litterbox.utils.IssueTranslatorFactory;
import de.uni_passau.fim.se2.litterbox_web.shared.Scratch3ParserService;
import de.uni_passau.fim.se2.litterbox_web.web_ui.execution.AnalysisWork;
import de.uni_passau.fim.se2.litterbox_web.web_ui.persistence.Analysis;
import de.uni_passau.fim.se2.litterbox_web.web_ui.persistence.AnalysisRepository;
import de.uni_passau.fim.se2.litterbox_web.web_ui.persistence.AssetRepository;
import de.uni_passau.fim.se2.litterbox_web.web_ui.persistence.SourceArtifactAccess;
import de.uni_passau.fim.se2.litterbox_web.web_ui.persistence.SubmissionEventRepository;
import de.uni_passau.fim.se2.litterbox_web.web_ui.persistence.SubmissionRepository;
import reactor.core.publisher.Flux;
import reactor.core.publisher.Mono;

/**
 * Reading a result back: the analysis itself, an asset out of the project, the live progress of one still running, and
 * the downloadable report.
 *
 * Nothing here starts work or changes anything. Everything it hands out is something that already happened, which is
 * what separates it from the parts of the workflow that take a project in and run it.
 */
class SingleProjectReader {

    private static final int MAX_REPORT_BYTES = 10 * 1024 * 1024;
    private static final String DETECTOR_SET = "all";

    private final SubmissionRepository submissionRepository;
    private final SubmissionEventRepository submissionEvents;
    private final AnalysisRepository analyses;
    private final SourceArtifactAccess sourceArtifacts;
    private final AssetRepository assets;
    private final AnalysisWork analysisWork;
    private final Scratch3ParserService parser;
    private final ProjectArchiveInspector archiveInspector;
    private final SingleProjectReportMapper reports;

    SingleProjectReader(
        final SubmissionRepository submissionRepository,
        final SubmissionEventRepository submissionEvents,
        final AnalysisRepository analyses,
        final SourceArtifactAccess sourceArtifacts,
        final AssetRepository assets,
        final AnalysisWork analysisWork,
        final Scratch3ParserService parser,
        final ProjectArchiveInspector archiveInspector,
        final SingleProjectReportMapper reports
    ) {
        this.submissionRepository = submissionRepository;
        this.submissionEvents = submissionEvents;
        this.analyses = analyses;
        this.sourceArtifacts = sourceArtifacts;
        this.assets = assets;
        this.analysisWork = analysisWork;
        this.parser = parser;
        this.archiveInspector = archiveInspector;
        this.reports = reports;
    }

    Mono<SingleProjectDtos.SubmissionView> find(final String token) {
        return submissionRepository.findByToken(token)
            .switchIfEmpty(Mono.error(new ResponseStatusException(HttpStatus.NOT_FOUND, "Submission not found")))
            .flatMap(
                submission -> analyses.findBySubmissionId(submission.id()).flatMap(
                    list -> submittedNames(list).map(names -> reports.view(submission, list, names))
                )
            );
    }

    /**
     * Each analysis's project under the name its submission gave it. A report stored before those names were kept
     * carries the name of whoever first uploaded the same bytes, so that name is not used for display.
     */
    private Mono<Map<Long, String>> submittedNames(final List<Analysis> list) {
        return Flux.fromIterable(list)
            .concatMap(analysis -> sourceArtifacts.submittedName(analysis).map(name -> Map.entry(analysis.id(), name)))
            .collectMap(Map.Entry::getKey, Map.Entry::getValue);
    }

    Mono<SingleProjectDtos.AssetContent> asset(final String token, final String sha256) {
        final byte[] digest;
        try {
            if (sha256 == null || sha256.length() != 64) {
                throw new IllegalArgumentException("Invalid asset identifier");
            }
            digest = HexFormat.of().parseHex(sha256);
        }
        catch (IllegalArgumentException error) {
            return Mono.error(new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid asset identifier"));
        }
        return assets.findForSubmission(token, digest)
            .map(asset -> new SingleProjectDtos.AssetContent(asset.mediaType(), asset.byteSize(), asset.content()))
            .switchIfEmpty(Mono.error(new ResponseStatusException(HttpStatus.NOT_FOUND, "Asset not found")));
    }

    Flux<ServerSentEvent<String>> events(final String token, final long lastSequence) {
        return submissionRepository.findByToken(token)
            .switchIfEmpty(Mono.error(new ResponseStatusException(HttpStatus.NOT_FOUND, "Submission not found")))
            .flatMapMany(submission -> eventsForSubmission(submission, lastSequence));
    }

    private Flux<ServerSentEvent<String>> eventsForSubmission(
        final de.uni_passau.fim.se2.litterbox_web.web_ui.persistence.Submission submission,
        final long lastSequence
    ) {
        final AtomicLong cursor = new AtomicLong(lastSequence);
        final Flux<ServerSentEvent<String>> persisted = Flux.interval(
            Duration.ZERO, Duration.ofSeconds(1)
        ).concatMap(ignored -> submissionEvents.findAfter(submission.id(), cursor.get()))
            .flatMapIterable(events -> events)
            .map(event -> {
                cursor.accumulateAndGet(event.sequenceNo(), Math::max);
                return ServerSentEvent.<String>builder()
                    .id(Long.toString(event.sequenceNo()))
                    .event(event.eventType().toLowerCase(Locale.ROOT))
                    .data(event.payloadJson())
                    .build();
            });
        final Flux<ServerSentEvent<String>> heartbeat = Flux.interval(Duration.ofSeconds(15))
            .map(ignored -> ServerSentEvent.<String>builder().comment("heartbeat").build());
        return Flux.merge(persisted, heartbeat);
    }

    Mono<ReportDownload> report(final String token) {
        return report(token, this::latestAnalysis);
    }

    /**
     * The report for one analysis of a submission. A class set holds many, and the submission's last one is not the
     * project the reader was looking at. The token still decides what may be read: an analysis that belongs to another
     * submission is not found here, whatever its id.
     */
    Mono<ReportDownload> report(final String token, final long analysisId) {
        return report(token, submission -> analysisOf(submission, analysisId));
    }

    private Mono<ReportDownload> report(
        final String token,
        final Function<de.uni_passau.fim.se2.litterbox_web.web_ui.persistence.Submission, Mono<Analysis>> chooseAnalysis
    ) {
        return submissionRepository.findByToken(token)
            .switchIfEmpty(Mono.error(new ResponseStatusException(HttpStatus.NOT_FOUND, "Submission not found")))
            .flatMap(chooseAnalysis)
            .flatMap(this::reportForAnalysis)
            .onErrorMap(
                ReportLimitExceededException.class,
                error -> new ResponseStatusException(HttpStatus.PAYLOAD_TOO_LARGE, "Report is too large", error)
            );
    }

    private Mono<Analysis> analysisOf(
        final de.uni_passau.fim.se2.litterbox_web.web_ui.persistence.Submission submission,
        final long analysisId
    ) {
        return analyses.findBySubmissionId(submission.id()).map(
            analysesForSubmission -> analysesForSubmission.stream()
                .filter(candidate -> candidate.id() == analysisId)
                .findFirst()
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Analysis not found"))
        );
    }

    private Mono<Analysis> latestAnalysis(
        final de.uni_passau.fim.se2.litterbox_web.web_ui.persistence.Submission submission
    ) {
        return analyses.findBySubmissionId(submission.id()).map(analysesForSubmission -> {
            if (analysesForSubmission.isEmpty()) {
                throw new ResponseStatusException(HttpStatus.CONFLICT, "Submission analysis is not available yet");
            }
            return analysesForSubmission.getLast();
        });
    }

    private Mono<ReportDownload> reportFromArtifact(
        final de.uni_passau.fim.se2.litterbox_web.web_ui.persistence.SourceArtifact artifact,
        final Analysis analysis
    ) {
        return sourceArtifacts.open(artifact.sha256()).flatMap(
            stream -> Mono.using(
                () -> stream,
                owned -> analysisWork.submit(
                    () -> generateReport(
                        SingleProjectSupport.readLimited(owned, SingleProjectSupport.MAX_PROJECT_BYTES),
                        artifact.originalFilename(), analysis
                    )
                ),
                SingleProjectSupport::closeQuietly
            )
        );
    }

    private Mono<ReportDownload> reportForAnalysis(final Analysis analysis) {
        if (!"DONE".equals(analysis.status()) && !"COMPLETED".equals(analysis.status())) {
            return Mono.error(
                new ResponseStatusException(HttpStatus.CONFLICT, "Submission analysis is not available yet")
            );
        }
        return sourceArtifacts.findForAnalysis(analysis)
            .switchIfEmpty(
                Mono.error(new ResponseStatusException(HttpStatus.NOT_FOUND, "Source artifact not found"))
            )
            .flatMap(artifact -> reportFromArtifact(artifact, analysis));
    }

    private ReportDownload generateReport(
        final byte[] bytes,
        final String filename,
        final Analysis analysis
    ) throws IOException {
        final Program program = SingleProjectSupport
            .parseStoredProgram(parser, archiveInspector, bytes, filename, analysis.inputFormat());
        final Set<Issue> issues = new ProgramBugAnalyzer(DETECTOR_SET, false).analyze(program);
        final BoundedReportOutput output = new BoundedReportOutput(MAX_REPORT_BYTES);
        final HTMLReportGenerator generator = new HTMLReportGenerator(
            IssueTranslatorFactory.getIssueTranslator(Locale.of(analysis.locale())), output
        );
        generator.generateReport(List.of(new ProjectAnalysisResult(safeReportProjectName(filename), program, issues)));
        if (output.exceeded()) {
            throw new ReportLimitExceededException();
        }
        return new ReportDownload("litterbox-report-" + analysis.id() + ".html", output.toByteArray());
    }

    private String safeReportProjectName(final String filename) {
        final String candidate = filename == null ? "project" : filename.replaceAll("[^\\p{L}\\p{N}._-]", "_");
        final String nonEmpty = candidate.isBlank() ? "project" : candidate;
        return nonEmpty.substring(0, Math.min(nonEmpty.length(), 128));
    }

    /** Raised where a generated report would be larger than this service is willing to hold in memory. */
    private static final class ReportLimitExceededException extends IOException {
    }
}
