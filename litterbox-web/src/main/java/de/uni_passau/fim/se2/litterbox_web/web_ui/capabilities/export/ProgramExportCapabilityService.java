/*
 * Copyright (C) 2024-2026 LitterBox-Web contributors
 *
 * This file is part of LitterBox-Web.
 * Licenced under the EUPL-1.2 or later.
 *
 * SPDX-FileCopyrightText: 2024-2026 LitterBox-Web contributors
 * SPDX-License-Identifier: EUPL-1.2
 */
package de.uni_passau.fim.se2.litterbox_web.web_ui.capabilities.export;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Duration;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Objects;
import java.util.Set;
import java.util.concurrent.RejectedExecutionException;
import java.util.concurrent.TimeoutException;
import java.util.concurrent.atomic.AtomicReference;

import org.springframework.stereotype.Service;

import de.uni_passau.fim.se2.litterbox.ast.model.ActorDefinition;
import de.uni_passau.fim.se2.litterbox.ast.model.Program;
import de.uni_passau.fim.se2.litterbox.ast.model.ScriptEntity;
import de.uni_passau.fim.se2.litterbox.ast.util.AstNodeUtil;
import de.uni_passau.fim.se2.litterbox.export.ExportService;
import de.uni_passau.fim.se2.litterbox.export.scratchblocks.ScratchBlocksVisitor;
import de.uni_passau.fim.se2.litterbox_web.shared.Scratch3ParserService;
import de.uni_passau.fim.se2.litterbox_web.web_ui.capabilities.AdvancedCapabilitiesConfiguration;
import de.uni_passau.fim.se2.litterbox_web.web_ui.capabilities.AdvancedCapabilityDtos;
import de.uni_passau.fim.se2.litterbox_web.web_ui.capabilities.AstNodes;
import de.uni_passau.fim.se2.litterbox_web.web_ui.capabilities.CapabilityContent;
import de.uni_passau.fim.se2.litterbox_web.web_ui.capabilities.CapabilityException;
import de.uni_passau.fim.se2.litterbox_web.web_ui.capabilities.ProgramExportCapability;
import de.uni_passau.fim.se2.litterbox_web.web_ui.execution.AnalysisCapacityExceededException;
import de.uni_passau.fim.se2.litterbox_web.web_ui.execution.AnalysisWork;
import de.uni_passau.fim.se2.litterbox_web.web_ui.persistence.Analysis;
import de.uni_passau.fim.se2.litterbox_web.web_ui.persistence.AnalysisRepository;
import de.uni_passau.fim.se2.litterbox_web.web_ui.persistence.DatabaseCapacityExceededException;
import de.uni_passau.fim.se2.litterbox_web.web_ui.persistence.SourceArtifact;
import de.uni_passau.fim.se2.litterbox_web.web_ui.persistence.SourceArtifactAccess;
import de.uni_passau.fim.se2.litterbox_web.web_ui.persistence.SourceArtifactMetadata;
import de.uni_passau.fim.se2.litterbox_web.web_ui.persistence.Submission;
import de.uni_passau.fim.se2.litterbox_web.web_ui.persistence.SubmissionRepository;
import de.uni_passau.fim.se2.litterbox_web.web_ui.single_project.ProjectArchiveInspector;
import io.micrometer.core.instrument.MeterRegistry;
import io.micrometer.core.instrument.Tags;
import io.micrometer.core.instrument.Timer;
import reactor.core.Exceptions;
import reactor.core.publisher.Mono;

/** Token-authorized, bounded, non-retained export of a retained Scratch project. */
@Service
final class ProgramExportCapabilityService implements ProgramExportCapability {

    private static final long ABSOLUTE_MAX_INPUT_BYTES = 50L * 1024 * 1024;
    private static final int ABSOLUTE_MAX_AST_NODES = 200_000;
    private static final int ABSOLUTE_MAX_OUTPUT_BYTES = 10 * 1024 * 1024;
    private static final Duration ABSOLUTE_TIMEOUT = Duration.ofSeconds(20);
    private static final int SHA256_BYTES = 32;
    private static final int MAX_METADATA_BYTES = 1024 * 1024;
    private static final int MAX_TARGET_ACTORS = 1_000;
    private static final int MAX_TARGET_SCRIPTS = 10_000;
    private static final int MAX_TARGET_TEXT_LENGTH = 255;
    private static final int MAX_SCRIPT_PREVIEW_BYTES = 256 * 1024;
    private static final String RETAINED_PROGRAM_NAME = "retained-project";
    private static final String SUCCESS = "success";
    private static final Set<String> SUPPORTED_SOURCE_FORMATS = Set.of(".sb3", ".mblock");
    private static final Set<String> REJECTION_OUTCOMES = Set.of("limit", "unavailable");

    private final SubmissionRepository submissions;
    private final AnalysisRepository analyses;
    private final SourceArtifactAccess sourceArtifacts;
    private final AnalysisWork analysisWork;
    private final Scratch3ParserService parser;
    private final ProjectArchiveInspector archiveInspector;
    private final AdvancedCapabilitiesConfiguration configuration;
    private final MeterRegistry meterRegistry;

    ProgramExportCapabilityService(
        final SubmissionRepository submissions,
        final AnalysisRepository analyses,
        final SourceArtifactAccess sourceArtifacts,
        final AnalysisWork analysisWork,
        final Scratch3ParserService parser,
        final ProjectArchiveInspector archiveInspector,
        final AdvancedCapabilitiesConfiguration configuration,
        final MeterRegistry meterRegistry
    ) {
        this.submissions = Objects.requireNonNull(submissions, "submissions");
        this.analyses = Objects.requireNonNull(analyses, "analyses");
        this.sourceArtifacts = Objects.requireNonNull(sourceArtifacts, "sourceArtifacts");
        this.analysisWork = Objects.requireNonNull(analysisWork, "analysisWork");
        this.parser = Objects.requireNonNull(parser, "parser");
        this.archiveInspector = Objects.requireNonNull(archiveInspector, "archiveInspector");
        this.configuration = Objects.requireNonNull(configuration, "configuration");
        this.meterRegistry = Objects.requireNonNull(meterRegistry, "meterRegistry");
    }

    @Override
    public Mono<CapabilityContent> export(
        final String submissionToken,
        final long analysisId,
        final AdvancedCapabilityDtos.ExportRequest request
    ) {
        return Mono.defer(() -> instrumentedExport(submissionToken, analysisId, request));
    }

    @Override
    public Mono<AdvancedCapabilityDtos.ExportTargetsView> targets(
        final String submissionToken,
        final long analysisId
    ) {
        return Mono.defer(() -> instrumentedTargets(submissionToken, analysisId));
    }

    private Mono<CapabilityContent> instrumentedExport(
        final String submissionToken,
        final long analysisId,
        final AdvancedCapabilityDtos.ExportRequest request
    ) {
        final String metricFormat = metricFormat(request);
        final String metricTargetKind = metricTargetKind(request);
        final AtomicReference<String> outcome = new AtomicReference<>("failure");
        final Timer.Sample timer = Timer.start(meterRegistry);
        return Mono.fromCallable(() -> validateRequest(request))
            .flatMap(
                specification -> authorize(submissionToken, analysisId)
                    .flatMap(analysis -> loadProgram(analysis, program -> exportProgram(program, specification)))
            )
            .timeout(exportTimeout())
            .onErrorMap(this::mapFailure)
            .doOnSuccess(ignored -> outcome.set(SUCCESS))
            .doOnError(error -> outcome.set(outcome(error)))
            .doFinally(
                signal -> recordMetrics(
                    timer, metricFormat, metricTargetKind, outcome.get(),
                    signal == reactor.core.publisher.SignalType.CANCEL
                )
            );
    }

    private Mono<AdvancedCapabilityDtos.ExportTargetsView> instrumentedTargets(
        final String submissionToken,
        final long analysisId
    ) {
        final AtomicReference<String> outcome = new AtomicReference<>("failure");
        final Timer.Sample timer = Timer.start(meterRegistry);
        return authorize(submissionToken, analysisId)
            .flatMap(analysis -> loadProgram(analysis, this::catalogue))
            .timeout(exportTimeout())
            .onErrorMap(this::mapFailure)
            .doOnSuccess(ignored -> outcome.set(SUCCESS))
            .doOnError(error -> outcome.set(outcome(error)))
            .doFinally(
                signal -> recordMetrics(
                    timer, "catalogue", "catalogue", outcome.get(),
                    signal == reactor.core.publisher.SignalType.CANCEL
                )
            );
    }

    private Mono<AuthorizedAnalysis> authorize(final String submissionToken, final long analysisId) {
        if (submissionToken == null || submissionToken.isBlank() || submissionToken.length() > 128 || analysisId < 1) {
            return Mono.error(CapabilityException.analysisNotFound());
        }
        return nonNull(submissions.findByToken(submissionToken))
            .filter(this::isRetainedSubmission)
            .flatMap(
                owner -> nonNull(analyses.findById(analysisId))
                    .flatMap(analysis -> authorizedAnalysis(owner, analysis))
            )
            .switchIfEmpty(Mono.error(CapabilityException.analysisNotFound()));
    }

    private Mono<AuthorizedAnalysis> authorizedAnalysis(final Submission owner, final Analysis analysis) {
        if (analysis.submissionId() != owner.id()) {
            return Mono.error(CapabilityException.analysisNotFound());
        }
        if (!isCompleted(analysis.status())) {
            return Mono.error(CapabilityException.analysisNotReady());
        }
        return Mono.just(new AuthorizedAnalysis(owner, analysis));
    }

    private <T> Mono<T> loadProgram(
        final AuthorizedAnalysis authorized,
        final ProgramOperation<T> operation
    ) {
        final Analysis analysis = authorized.analysis();
        final String sourceFormat = normalizedSourceFormat(analysis.inputFormat());
        if (!SUPPORTED_SOURCE_FORMATS.contains(sourceFormat)) {
            return Mono.error(CapabilityException.unsupportedSourceFormat());
        }
        if (analysis.sourceArtifactId() < 1) {
            return Mono.error(CapabilityException.analysisNotFound());
        }
        return nonNull(sourceArtifacts.findById(analysis.sourceArtifactId()))
            .switchIfEmpty(Mono.error(CapabilityException.analysisNotFound()))
            .flatMap(artifact -> loadProgram(analysis, artifact, operation));
    }

    private <T> Mono<T> loadProgram(
        final Analysis analysis,
        final SourceArtifact artifact,
        final ProgramOperation<T> operation
    ) {
        if (!validArtifactSize(artifact) || artifact.byteSize() > maxInputBytes()) {
            return Mono.error(CapabilityException.limitExceeded());
        }
        final byte[] expectedDigest = analysis.inputSha256();
        final byte[] recordedDigest = artifact.sha256();
        if (
            !validDigest(expectedDigest) || !validDigest(recordedDigest)
                || !MessageDigest.isEqual(expectedDigest, recordedDigest)
        ) {
            return Mono.error(CapabilityException.analysisNotFound());
        }
        return nonNull(sourceArtifacts.findMetadataById(artifact.id()))
            .filter(metadata -> metadataMatches(artifact, metadata))
            .switchIfEmpty(Mono.error(CapabilityException.analysisNotFound()))
            .flatMap(ignored -> openProgram(analysis, artifact, operation));
    }

    private <T> Mono<T> openProgram(
        final Analysis analysis,
        final SourceArtifact artifact,
        final ProgramOperation<T> operation
    ) {
        // The stream is opened by the publisher below and owned by Mono.using from the moment the work subscribes.
        // Between those two there is a moment that belongs to neither: the timeout bounding this operation cancels
        // from outside and can land in it, and what it leaves behind is an open stream nothing holds. Reactor hands
        // a value dropped that way to the discard handler, which is the only place left to close it.
        return nonNull(sourceArtifacts.open(artifact.sha256()))
            .switchIfEmpty(Mono.error(CapabilityException.analysisNotFound()))
            .flatMap(
                stream -> Mono.using(
                    () -> stream,
                    owned -> analysisWork.submit(() -> applyToStream(analysis, artifact, owned, operation)),
                    this::closeQuietly
                )
            )
            .doOnDiscard(InputStream.class, this::closeQuietly);
    }

    private <T> T applyToStream(
        final Analysis analysis,
        final SourceArtifact artifact,
        final InputStream stream,
        final ProgramOperation<T> operation
    ) throws IOException {
        final byte[] archive = readAndVerify(analysis, artifact, stream);
        final ProjectArchiveInspector.Inspection inspection;
        try {
            inspection = archiveInspector.inspect(archive);
        }
        catch (IOException | IllegalArgumentException | StackOverflowError exception) {
            throw new UnsupportedSourceFormat();
        }

        final Program program;
        try {
            program = parser.parseFromString(
                RETAINED_PROGRAM_NAME, new String(inspection.projectJson(), StandardCharsets.UTF_8)
            );
        }
        catch (RuntimeException | StackOverflowError exception) {
            throw new UnsupportedSourceFormat();
        }
        if (AstNodes.count(program, maxAstNodes()) > maxAstNodes()) {
            throw new ExportLimitExceeded();
        }

        return operation.apply(program);
    }

    private CapabilityContent exportProgram(final Program program, final ExportSpecification specification) {
        final ExportService.ExportResult result;
        try {
            result = new ExportService().export(program, specification.format(), specification.target());
        }
        catch (IllegalArgumentException exception) {
            throw new TargetNotFound();
        }
        final byte[] content = result.utf8Content();
        if (content.length > maxOutputBytes()) {
            throw new ExportLimitExceeded();
        }
        return new CapabilityContent(content);
    }

    private AdvancedCapabilityDtos.ExportTargetsView catalogue(final Program program) {
        final List<ActorDefinition> actors = new ArrayList<>(
            program.getActorDefinitionList().getDefinitions()
        );
        if (actors.size() > MAX_TARGET_ACTORS) {
            throw new ExportLimitExceeded();
        }
        actors.sort(
            Comparator.comparing(ActorDefinition::isStage).reversed()
                .thenComparing(actor -> actor.getIdent().getName())
        );

        final List<AdvancedCapabilityDtos.ExportSpriteTargetView> sprites = new ArrayList<>(actors.size());
        final List<AdvancedCapabilityDtos.ExportScriptTargetView> scripts = new ArrayList<>();
        final Set<String> spriteNames = new HashSet<>();
        final Set<String> scriptIds = new HashSet<>();
        long previewBytes = 0;

        for (ActorDefinition actor : actors) {
            previewBytes = addActorTargets(
                actor, sprites, scripts, spriteNames, scriptIds, previewBytes
            );
        }
        final AdvancedCapabilityDtos.ExportTargetsView result = new AdvancedCapabilityDtos.ExportTargetsView(
            sprites, scripts
        );
        try {
            if (tools.jackson.databind.json.JsonMapper.shared().writeValueAsBytes(result).length > maxOutputBytes()) {
                throw new ExportLimitExceeded();
            }
        }
        catch (ExportLimitExceeded exception) {
            throw exception;
        }
        catch (RuntimeException exception) {
            throw new UnsupportedSourceFormat();
        }
        return result;
    }

    private long addActorTargets(
        final ActorDefinition actor,
        final List<AdvancedCapabilityDtos.ExportSpriteTargetView> sprites,
        final List<AdvancedCapabilityDtos.ExportScriptTargetView> scripts,
        final Set<String> spriteNames,
        final Set<String> scriptIds,
        final long previewBytes
    ) {
        final String actorName = actor.getIdent().getName();
        requireCatalogueText(actorName);
        if (actor.isSprite() && !spriteNames.add(actorName)) {
            throw new TargetNotFound();
        }
        sprites.add(new AdvancedCapabilityDtos.ExportSpriteTargetView(actorName, actor.isStage()));
        final List<ScriptEntity> actorScripts = actorScripts(actor);
        if (scripts.size() + actorScripts.size() > MAX_TARGET_SCRIPTS) {
            throw new ExportLimitExceeded();
        }
        long totalPreviewBytes = previewBytes;
        int ordinal = 1;
        for (ScriptEntity script : actorScripts) {
            totalPreviewBytes = addScriptTarget(
                actorName, script, ordinal++, scripts, scriptIds, totalPreviewBytes
            );
        }
        return totalPreviewBytes;
    }

    private List<ScriptEntity> actorScripts(final ActorDefinition actor) {
        final List<ScriptEntity> scripts = new ArrayList<>();
        scripts.addAll(actor.getProcedureDefinitionList().getList());
        scripts.addAll(actor.getScripts().getScriptList());
        return scripts;
    }

    private long addScriptTarget(
        final String actorName,
        final ScriptEntity script,
        final int ordinal,
        final List<AdvancedCapabilityDtos.ExportScriptTargetView> scripts,
        final Set<String> scriptIds,
        final long previewBytes
    ) {
        final String scriptId;
        final String scratchblocks;
        try {
            scriptId = AstNodeUtil.getBlockId(script);
            scratchblocks = normalizeLineEndings(ScratchBlocksVisitor.of(script));
        }
        catch (RuntimeException | StackOverflowError exception) {
            throw new UnsupportedSourceFormat();
        }
        requireCatalogueText(scriptId);
        if (!scriptIds.add(scriptId)) {
            throw new TargetNotFound();
        }
        final int scratchblocksBytes = scratchblocks.getBytes(StandardCharsets.UTF_8).length;
        if (scratchblocksBytes > MAX_SCRIPT_PREVIEW_BYTES || previewBytes + scratchblocksBytes > maxOutputBytes()) {
            throw new ExportLimitExceeded();
        }
        scripts.add(
            new AdvancedCapabilityDtos.ExportScriptTargetView(scriptId, actorName, ordinal, scratchblocks)
        );
        return previewBytes + scratchblocksBytes;
    }

    private void requireCatalogueText(final String value) {
        if (value == null || value.isBlank() || value.length() > MAX_TARGET_TEXT_LENGTH) {
            throw new ExportLimitExceeded();
        }
    }

    private String normalizeLineEndings(final String value) {
        return value.replace("\r\n", "\n").replace('\r', '\n');
    }

    private byte[] readAndVerify(
        final Analysis analysis,
        final SourceArtifact artifact,
        final InputStream stream
    ) throws IOException {
        final long limit = maxInputBytes();
        if (limit < 1 || artifact.byteSize() > limit) {
            throw new ExportLimitExceeded();
        }
        final ByteArrayOutputStream output = new ByteArrayOutputStream((int) Math.min(limit, 8192));
        final MessageDigest digest = sha256();
        final byte[] buffer = new byte[8192];
        long size = 0;
        int read;
        while ((read = stream.read(buffer)) >= 0) {
            if (read == 0) {
                continue;
            }
            size += read;
            if (size > limit) {
                throw new ExportLimitExceeded();
            }
            digest.update(buffer, 0, read);
            output.write(buffer, 0, read);
        }
        if (
            size != artifact.byteSize()
                || !MessageDigest.isEqual(digest.digest(), artifact.sha256())
                || !MessageDigest.isEqual(analysis.inputSha256(), artifact.sha256())
        ) {
            throw new ArtifactIntegrityFailure();
        }
        return output.toByteArray();
    }

    private ExportSpecification validateRequest(final AdvancedCapabilityDtos.ExportRequest request) {
        if (request == null) {
            throw invalidRequest("Export request is required");
        }
        final ExportService.Format format = switch (request.format()) {
            case "scratchblocks" -> ExportService.Format.SCRATCHBLOCKS;
            case "goboscript" -> ExportService.Format.GOBOSCRIPT;
            case "pystage" -> ExportService.Format.PYSTAGE;
            case null -> throw invalidRequest("Export format is required");
            default -> throw invalidRequest("Unsupported export format");
        };
        final AdvancedCapabilityDtos.ExportTarget target = request.target();
        if (target == null) {
            throw invalidRequest("Export target is required");
        }
        return new ExportSpecification(format, target(target));
    }

    private ExportService.Target target(final AdvancedCapabilityDtos.ExportTarget request) {
        return switch (request.kind()) {
            case "program" -> {
                if (request.spriteName() != null || request.scriptId() != null) {
                    throw invalidRequest("Program export target is contradictory");
                }
                yield ExportService.Target.program();
            }
            case "sprite" -> {
                requireTargetValue(request.spriteName(), "Sprite export target is required");
                if (request.scriptId() != null) {
                    throw invalidRequest("Sprite export target is contradictory");
                }
                yield ExportService.Target.sprite(request.spriteName());
            }
            case "script" -> {
                requireTargetValue(request.scriptId(), "Script export target is required");
                if (request.spriteName() != null) {
                    throw invalidRequest("Script export target is contradictory");
                }
                yield ExportService.Target.script(request.scriptId());
            }
            case null, default -> throw invalidRequest("Unsupported export target kind");
        };
    }

    private void requireTargetValue(final String value, final String message) {
        if (value == null || value.isBlank() || value.length() > 255) {
            throw invalidRequest(message);
        }
    }

    private InvalidExportRequest invalidRequest(final String message) {
        return new InvalidExportRequest(message);
    }

    private boolean metadataMatches(final SourceArtifact artifact, final SourceArtifactMetadata metadata) {
        if (
            metadata.artifactId() != artifact.id() || metadata.sourceKind() == null || metadata.sourceKind().isBlank()
        ) {
            return false;
        }
        final String manifest = metadata.manifestJson();
        if (manifest == null || manifest.isBlank()) {
            return true;
        }
        if (manifest.getBytes(StandardCharsets.UTF_8).length > MAX_METADATA_BYTES) {
            return false;
        }
        try {
            final tools.jackson.databind.JsonNode root = tools.jackson.databind.json.JsonMapper.shared()
                .readTree(manifest);
            return root != null && root.isObject();
        }
        catch (RuntimeException exception) {
            return false;
        }
    }

    private boolean validArtifactSize(final SourceArtifact artifact) {
        return artifact.byteSize() >= 0;
    }

    private boolean validDigest(final byte[] digest) {
        return digest != null && digest.length == SHA256_BYTES;
    }

    private boolean isCompleted(final String status) {
        return "DONE".equals(status) || "COMPLETED".equals(status);
    }

    private boolean isRetainedSubmission(final Submission submission) {
        return submission != null && "ACTIVE".equalsIgnoreCase(submission.retentionState());
    }

    private String normalizedSourceFormat(final String format) {
        if (format == null) {
            return "";
        }
        final String normalized = format.toLowerCase(Locale.ROOT);
        return normalized.startsWith(".") ? normalized : "." + normalized;
    }

    private String metricFormat(final AdvancedCapabilityDtos.ExportRequest request) {
        if (request == null || request.format() == null) {
            return "unsupported";
        }
        return switch (request.format()) {
            case "scratchblocks", "goboscript", "pystage" -> request.format();
            default -> "unsupported";
        };
    }

    private String metricTargetKind(final AdvancedCapabilityDtos.ExportRequest request) {
        if (request == null || request.target() == null || request.target().kind() == null) {
            return "invalid";
        }
        return switch (request.target().kind()) {
            case "program", "sprite", "script" -> request.target().kind();
            default -> "invalid";
        };
    }

    private void recordMetrics(
        final Timer.Sample timer,
        final String format,
        final String targetKind,
        final String result,
        final boolean cancelled
    ) {
        final String metricOutcome = cancelled ? "cancelled" : result;
        meterRegistry.counter(
            "litterbox.capabilities.export.outcomes",
            "format", format,
            "target_kind", targetKind,
            "outcome", metricOutcome
        ).increment();
        if ("timeout".equals(metricOutcome)) {
            meterRegistry.counter(
                "litterbox.capabilities.export.timeouts", "format", format, "target_kind", targetKind
            ).increment();
        }
        if (REJECTION_OUTCOMES.contains(metricOutcome)) {
            meterRegistry.counter(
                "litterbox.capabilities.export.rejections",
                "format", format,
                "target_kind", targetKind,
                "reason", metricOutcome
            ).increment();
        }
        timer.stop(
            meterRegistry.timer(
                "litterbox.capabilities.export.duration",
                Tags.of("format", format, "target_kind", targetKind, "outcome", metricOutcome)
            )
        );
    }

    private Throwable mapFailure(final Throwable error) {
        final Throwable cause = Exceptions.unwrap(error);
        if (cause instanceof CapabilityException) {
            return cause;
        }
        return mapKnownFailure(cause);
    }

    private Throwable mapKnownFailure(final Throwable cause) {
        if (cause instanceof TimeoutException) {
            return CapabilityException.timedOut();
        }
        if (isUnavailable(cause)) {
            return CapabilityException.unavailable();
        }
        if (cause instanceof ExportLimitExceeded) {
            return CapabilityException.limitExceeded();
        }
        if (isMissingArtifact(cause)) {
            return CapabilityException.analysisNotFound();
        }
        if (cause instanceof UnsupportedSourceFormat) {
            return CapabilityException.unsupportedSourceFormat();
        }
        if (cause instanceof TargetNotFound) {
            return CapabilityException.targetNotFound();
        }
        if (cause instanceof InvalidExportRequest) {
            return cause;
        }
        return CapabilityException.unsupportedSourceFormat();
    }

    private boolean isUnavailable(final Throwable cause) {
        return cause instanceof AnalysisCapacityExceededException
            || cause instanceof DatabaseCapacityExceededException
            || cause instanceof RejectedExecutionException;
    }

    private boolean isMissingArtifact(final Throwable cause) {
        return cause instanceof ArtifactIntegrityFailure || cause instanceof IOException;
    }

    private String outcome(final Throwable error) {
        final Throwable cause = Exceptions.unwrap(error);
        if (cause instanceof CapabilityException capability) {
            return switch (capability.code()) {
                case "capability_timeout" -> "timeout";
                case "capability_limit_exceeded" -> "limit";
                case "capability_unavailable" -> "unavailable";
                case "analysis_not_found" -> "not_found";
                case "analysis_not_ready" -> "not_ready";
                case "unsupported_source_format" -> "unsupported_source";
                case "target_not_found" -> "target_not_found";
                default -> "failure";
            };
        }
        if (cause instanceof InvalidExportRequest) {
            return "invalid_request";
        }
        return "failure";
    }

    private Duration exportTimeout() {
        final Duration configured = configuration.getProgramExport().getTimeout();
        return configured.compareTo(ABSOLUTE_TIMEOUT) < 0 ? configured : ABSOLUTE_TIMEOUT;
    }

    private long maxInputBytes() {
        return Math.min(configuration.getProgramExport().getMaxInputBytes(), ABSOLUTE_MAX_INPUT_BYTES);
    }

    private int maxAstNodes() {
        return Math.min(configuration.getProgramExport().getMaxAstNodes(), ABSOLUTE_MAX_AST_NODES);
    }

    private int maxOutputBytes() {
        return Math.min(configuration.getProgramExport().getMaxOutputBytes(), ABSOLUTE_MAX_OUTPUT_BYTES);
    }

    private void closeQuietly(final InputStream stream) {
        try {
            stream.close();
        }
        catch (IOException ignored) {
            // Cleanup must not replace the stable capability response.
        }
    }

    private MessageDigest sha256() {
        try {
            return MessageDigest.getInstance("SHA-256");
        }
        catch (NoSuchAlgorithmException exception) {
            throw new IllegalStateException("SHA-256 is unavailable", exception);
        }
    }

    private <T> Mono<T> nonNull(final Mono<T> mono) {
        return mono == null ? Mono.empty() : mono;
    }

    private record AuthorizedAnalysis(Submission owner, Analysis analysis) {
    }

    private record ExportSpecification(ExportService.Format format, ExportService.Target target) {
    }

    @FunctionalInterface
    private interface ProgramOperation<T> {

        T apply(Program program);
    }

    private static final class ExportLimitExceeded extends RuntimeException {
    }

    private static final class ArtifactIntegrityFailure extends RuntimeException {
    }

    private static final class UnsupportedSourceFormat extends RuntimeException {
    }

    private static final class TargetNotFound extends RuntimeException {
    }

    private static final class InvalidExportRequest extends IllegalArgumentException {

        private InvalidExportRequest(final String message) {
            super(message);
        }
    }
}
