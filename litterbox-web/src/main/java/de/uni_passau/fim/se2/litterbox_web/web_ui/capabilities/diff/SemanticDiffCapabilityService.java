/*
 * Copyright (C) 2024-2026 LitterBox-Web contributors
 *
 * This file is part of LitterBox-Web.
 * Licenced under the EUPL-1.2 or later.
 *
 * SPDX-FileCopyrightText: 2024-2026 LitterBox-Web contributors
 * SPDX-License-Identifier: EUPL-1.2
 */
package de.uni_passau.fim.se2.litterbox_web.web_ui.capabilities.diff;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Duration;
import java.util.Comparator;
import java.util.List;
import java.util.Locale;
import java.util.Objects;
import java.util.Set;
import java.util.concurrent.RejectedExecutionException;
import java.util.concurrent.TimeoutException;
import java.util.concurrent.atomic.AtomicReference;

import org.springframework.stereotype.Service;

import de.uni_passau.fim.se2.litterbox.analytics.DiffAnalyzer;
import de.uni_passau.fim.se2.litterbox.analytics.DiffResult;
import de.uni_passau.fim.se2.litterbox.analytics.Issue;
import de.uni_passau.fim.se2.litterbox.ast.model.ASTNode;
import de.uni_passau.fim.se2.litterbox.ast.model.Program;
import de.uni_passau.fim.se2.litterbox.ast.model.ScriptEntity;
import de.uni_passau.fim.se2.litterbox.ast.util.AstNodeUtil;
import de.uni_passau.fim.se2.litterbox.diff.ActorCodeDiff;
import de.uni_passau.fim.se2.litterbox.diff.ProjectCodeDiff;
import de.uni_passau.fim.se2.litterbox.diff.ScriptChangeType;
import de.uni_passau.fim.se2.litterbox.diff.ScriptCodeDiff;
import de.uni_passau.fim.se2.litterbox.export.scratchblocks.ScratchBlocksVisitor;
import de.uni_passau.fim.se2.litterbox.utils.IssueTranslator;
import de.uni_passau.fim.se2.litterbox.utils.IssueTranslatorFactory;
import de.uni_passau.fim.se2.litterbox_web.shared.Scratch3ParserService;
import de.uni_passau.fim.se2.litterbox_web.web_ui.capabilities.AdvancedCapabilitiesConfiguration;
import de.uni_passau.fim.se2.litterbox_web.web_ui.capabilities.AdvancedCapabilityDtos;
import de.uni_passau.fim.se2.litterbox_web.web_ui.capabilities.AdvancedCapabilityDtos.ActorDiffView;
import de.uni_passau.fim.se2.litterbox_web.web_ui.capabilities.AdvancedCapabilityDtos.DiffIssueView;
import de.uni_passau.fim.se2.litterbox_web.web_ui.capabilities.AdvancedCapabilityDtos.DiffView;
import de.uni_passau.fim.se2.litterbox_web.web_ui.capabilities.AdvancedCapabilityDtos.ScriptDiffView;
import de.uni_passau.fim.se2.litterbox_web.web_ui.capabilities.AdvancedCapabilityDtos.SourceView;
import de.uni_passau.fim.se2.litterbox_web.web_ui.capabilities.AstNodes;
import de.uni_passau.fim.se2.litterbox_web.web_ui.capabilities.CapabilityException;
import de.uni_passau.fim.se2.litterbox_web.web_ui.capabilities.SemanticDiffCapability;
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
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/** Token-authorized, bounded, non-retained semantic comparison of two projects. */
@Service
final class SemanticDiffCapabilityService implements SemanticDiffCapability {

    private static final String DETECTORS = "all";
    private static final boolean IGNORE_LOOSE_BLOCKS = false;
    private static final String SUCCESS = "success";
    private static final String BEFORE_FALLBACK_NAME = "before";
    private static final String AFTER_FALLBACK_NAME = "after";
    private static final String RETAINED_PROGRAM_NAME = "retained-project";
    private static final Set<String> SUPPORTED_FORMATS = Set.of(".sb3", ".mblock");
    private static final int MAX_METADATA_BYTES = 1024 * 1024;
    private static final Comparator<DiffIssueView> ISSUE_ORDER = Comparator
        .comparing(DiffIssueView::finderId, Comparator.nullsFirst(String::compareTo))
        .thenComparing(DiffIssueView::issueType, Comparator.nullsFirst(String::compareTo))
        .thenComparing(DiffIssueView::sprite, Comparator.nullsFirst(String::compareTo))
        .thenComparing(DiffIssueView::blockId, Comparator.nullsFirst(String::compareTo))
        .thenComparingInt(DiffIssueView::severity)
        .thenComparing(DiffIssueView::scratchblocks, Comparator.nullsFirst(String::compareTo))
        .thenComparing(DiffIssueView::finderName, Comparator.nullsFirst(String::compareTo));
    private static final Comparator<ScriptDiffView> SCRIPT_ORDER = Comparator
        .comparing(ScriptDiffView::changeType, Comparator.nullsFirst(String::compareTo))
        .thenComparing(ScriptDiffView::beforeScratchblocks, Comparator.nullsFirst(String::compareTo))
        .thenComparing(ScriptDiffView::afterScratchblocks, Comparator.nullsFirst(String::compareTo))
        .thenComparing(
            ScriptDiffView::annotatedBeforeScratchblocks, Comparator.nullsFirst(String::compareTo)
        )
        .thenComparing(
            ScriptDiffView::annotatedAfterScratchblocks, Comparator.nullsFirst(String::compareTo)
        );

    private final SubmissionRepository submissions;
    private final AnalysisRepository analyses;
    private final SourceArtifactAccess sourceArtifacts;
    private final AnalysisWork analysisWork;
    private final Scratch3ParserService parser;
    private final ProjectArchiveInspector archiveInspector;
    private final AdvancedCapabilitiesConfiguration configuration;
    private final MeterRegistry meterRegistry;
    private final JsonMapper mapper = JsonMapper.shared();

    SemanticDiffCapabilityService(
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
    public Mono<AdvancedCapabilityDtos.DiffView> compare(final AdvancedCapabilityDtos.DiffRequest request) {
        return Mono.defer(() -> instrumentedCompare(request));
    }

    private Mono<DiffView> instrumentedCompare(final AdvancedCapabilityDtos.DiffRequest request) {
        final AtomicReference<String> outcome = new AtomicReference<>("failure");
        final Timer.Sample timer = Timer.start(meterRegistry);
        return compareAuthorized(request)
            .timeout(diffTimeout())
            .onErrorMap(this::mapFailure)
            .doOnSuccess(ignored -> outcome.set(SUCCESS))
            .doOnError(error -> outcome.set(outcome(error)))
            .doFinally(ignored -> recordMetrics(timer, outcome.get()));
    }

    private Mono<DiffView> compareAuthorized(final AdvancedCapabilityDtos.DiffRequest request) {
        if (request == null) {
            return Mono.error(CapabilityException.analysisNotFound());
        }
        return Mono.zip(resolve(request.before()), resolve(request.after()))
            .switchIfEmpty(Mono.error(CapabilityException.analysisNotFound()))
            .flatMap(references -> {
                final AuthorizedAnalysis before = references.getT1();
                final AuthorizedAnalysis after = references.getT2();
                if (!isCompleted(before.analysis()) || !isCompleted(after.analysis())) {
                    return Mono.error(CapabilityException.analysisNotReady());
                }
                return Mono.zip(loadInput(before), loadInput(after))
                    .switchIfEmpty(Mono.error(CapabilityException.analysisNotFound()))
                    .flatMap(inputs -> compareInputs(inputs.getT1(), inputs.getT2()));
            });
    }

    private Mono<AuthorizedAnalysis> resolve(final AdvancedCapabilityDtos.AnalysisReference reference) {
        if (!validReference(reference)) {
            return Mono.empty();
        }
        final Mono<Submission> submission = nonNull(submissions.findByToken(reference.submissionToken()));
        return submission
            .filter(this::isRetainedSubmission)
            .flatMap(
                owner -> nonNull(analyses.findById(reference.analysisId()))
                    .filter(analysis -> analysis.submissionId() == owner.id())
                    .map(analysis -> new AuthorizedAnalysis(owner, analysis))
            );
    }

    private Mono<ArtifactInput> loadInput(final AuthorizedAnalysis authorized) {
        final Analysis analysis = authorized.analysis();
        if (analysis.sourceArtifactId() < 1) {
            return Mono.empty();
        }
        return nonNull(sourceArtifacts.findForAnalysis(analysis))
            .flatMap(
                artifact -> nonNull(sourceArtifacts.findMetadataById(artifact.id()))
                    .filter(metadata -> metadataMatches(artifact, metadata))
                    .filter(metadata -> digestMatches(analysis, artifact))
                    .map(ignored -> new ArtifactInput(analysis, artifact))
            );
    }

    private Mono<DiffView> compareInputs(final ArtifactInput before, final ArtifactInput after) {
        final String beforeFormat = normalizedFormat(before.analysis().inputFormat());
        final String afterFormat = normalizedFormat(after.analysis().inputFormat());
        if (!SUPPORTED_FORMATS.contains(beforeFormat) || !SUPPORTED_FORMATS.contains(afterFormat)) {
            return Mono.error(CapabilityException.unsupportedSourceFormat());
        }
        final long maximum = diffLimits().getMaxInputBytes();
        if (!withinInputLimits(before, after, maximum)) {
            return Mono.error(CapabilityException.limitExceeded());
        }
        return nonNull(sourceArtifacts.open(before.artifact().sha256()))
            .flatMap(beforeStream -> compareOpenedStreams(before, after, beforeStream));
    }

    private boolean validReference(final AdvancedCapabilityDtos.AnalysisReference reference) {
        if (reference == null || reference.analysisId() < 1 || reference.submissionToken() == null) {
            return false;
        }
        return !reference.submissionToken().isBlank() && reference.submissionToken().length() <= 128;
    }

    private boolean withinInputLimits(
        final ArtifactInput before,
        final ArtifactInput after,
        final long maximum
    ) {
        if (maximum < 1 || before.artifact().byteSize() < 0 || after.artifact().byteSize() < 0) {
            return false;
        }
        return before.artifact().byteSize() <= maximum && after.artifact().byteSize() <= maximum;
    }

    private Mono<DiffView> compareOpenedStreams(
        final ArtifactInput before,
        final ArtifactInput after,
        final InputStream beforeStream
    ) {
        return Mono.using(
            () -> beforeStream,
            ownedBefore -> nonNull(sourceArtifacts.open(after.artifact().sha256()))
                .flatMap(afterStream -> analyzeOpenedStreams(before, after, ownedBefore, afterStream)),
            this::closeQuietly
        );
    }

    private Mono<DiffView> analyzeOpenedStreams(
        final ArtifactInput before,
        final ArtifactInput after,
        final InputStream beforeStream,
        final InputStream afterStream
    ) {
        return Mono.using(
            () -> afterStream,
            ownedAfter -> analysisWork.submit(() -> analyzeStreams(before, after, beforeStream, ownedAfter)),
            this::closeQuietly
        );
    }

    private DiffView analyzeStreams(
        final ArtifactInput before,
        final ArtifactInput after,
        final InputStream beforeStream,
        final InputStream afterStream
    ) throws IOException {
        final byte[] beforeArchive = readAndVerify(before, beforeStream);
        final byte[] afterArchive = readAndVerify(after, afterStream);
        final ProjectArchiveInspector.Inspection beforeInspection;
        final ProjectArchiveInspector.Inspection afterInspection;
        try {
            beforeInspection = archiveInspector.inspect(beforeArchive);
            afterInspection = archiveInspector.inspect(afterArchive);
        }
        catch (IOException | IllegalArgumentException | StackOverflowError exception) {
            throw new UnsupportedSourceFormat();
        }
        final Program beforeProgram = parse(beforeInspection.projectJson());
        final Program afterProgram = parse(afterInspection.projectJson());
        if (
            AstNodes.count(beforeProgram, diffLimits().getMaxAstNodesPerInput()) > diffLimits().getMaxAstNodesPerInput()
                || AstNodes.count(afterProgram, diffLimits().getMaxAstNodesPerInput()) > diffLimits()
                    .getMaxAstNodesPerInput()
        ) {
            throw new DiffLimitExceeded();
        }
        final IssueTranslator translator = IssueTranslatorFactory.getIssueTranslator(
            safeLocale(before.analysis().locale())
        );
        final DiffResult result = new DiffAnalyzer(DETECTORS, IGNORE_LOOSE_BLOCKS, translator)
            .analyze(beforeProgram, afterProgram);
        final DiffView view = mapResult(result, before, after, translator);
        if (mapper.writeValueAsBytes(view).length > diffLimits().getMaxResponseBytes()) {
            throw new DiffLimitExceeded();
        }
        return view;
    }

    private Program parse(final byte[] projectJson) {
        return parser.parseFromString(
            RETAINED_PROGRAM_NAME, new String(projectJson, StandardCharsets.UTF_8)
        );
    }

    private DiffView mapResult(
        final DiffResult result,
        final ArtifactInput before,
        final ArtifactInput after,
        final IssueTranslator translator
    ) {
        final List<DiffIssueView> fixed = mapIssues(result.fixed(), translator);
        final List<DiffIssueView> newIssues = mapIssues(result.newIssues(), translator);
        final List<DiffIssueView> persisting = mapIssues(result.persisting(), translator);
        final List<DiffIssueView> removed = mapIssues(result.removed(), translator);
        final AdvancedCapabilityDtos.DiffCounts counts = new AdvancedCapabilityDtos.DiffCounts(
            fixed.size() + persisting.size() + removed.size(),
            newIssues.size() + persisting.size(),
            fixed.size(),
            newIssues.size(),
            persisting.size(),
            removed.size()
        );
        return new DiffView(
            AdvancedCapabilityDtos.SCHEMA_VERSION,
            new SourceView(before.analysis().id(), sourceName(before, BEFORE_FALLBACK_NAME)),
            new SourceView(after.analysis().id(), sourceName(after, AFTER_FALLBACK_NAME)),
            counts,
            fixed,
            newIssues,
            persisting,
            removed,
            mapActors(result.projectDiff())
        );
    }

    private List<DiffIssueView> mapIssues(final List<Issue> issues, final IssueTranslator translator) {
        return issues.stream().map(issue -> mapIssue(issue, translator)).sorted(ISSUE_ORDER).toList();
    }

    private DiffIssueView mapIssue(final Issue issue, final IssueTranslator translator) {
        final String finderId = value(issue.getFinderName());
        final String finderName = value(issue.getTranslatedFinderName(translator));
        final String issueType = issue.getIssueType().name().toLowerCase(Locale.ROOT);
        final int severity = issue.getSeverity().getSeverityLevel();
        return new DiffIssueView(
            finderId,
            finderName,
            issueType,
            severity,
            value(issue.getActorName()),
            issueBlockId(issue),
            issueScratchblocks(issue)
        );
    }

    private List<ActorDiffView> mapActors(final ProjectCodeDiff projectDiff) {
        if (projectDiff == null || projectDiff.actorDiffs() == null) {
            return List.of();
        }
        return projectDiff.actorDiffs().stream()
            .map(this::mapActor)
            .filter(actor -> !actor.scripts().isEmpty())
            .sorted(
                Comparator.comparing(ActorDiffView::stage).reversed()
                    .thenComparing(ActorDiffView::actorName)
            )
            .toList();
    }

    private ActorDiffView mapActor(final ActorCodeDiff actor) {
        final List<ScriptDiffView> scripts = actor.scriptDiffs().stream()
            .filter(script -> script.changeType() != ScriptChangeType.UNCHANGED)
            .map(this::mapScript)
            .sorted(SCRIPT_ORDER)
            .toList();
        return new ActorDiffView(value(actor.actorName()), actor.isStage(), scripts);
    }

    private ScriptDiffView mapScript(final ScriptCodeDiff script) {
        return new ScriptDiffView(
            script.changeType().name().toLowerCase(Locale.ROOT),
            script.beforeCode(),
            script.afterCode(),
            script.annotatedBeforeCode(),
            script.annotatedAfterCode()
        );
    }

    private String issueBlockId(final Issue issue) {
        final String original = issue.getOriginalBlockId();
        if (original != null && !original.isBlank() && !"N/A".equals(original)) {
            return original;
        }
        final ASTNode location = issue.getCodeLocation();
        if (location == null) {
            return null;
        }
        final ASTNode withId = AstNodeUtil.findNearestNodeWithBlockId(location);
        return withId == null ? null : AstNodeUtil.getBlockId(withId);
    }

    private String issueScratchblocks(final Issue issue) {
        final String original = issue.getOriginalCodeSnippet();
        if (original != null && !original.isBlank()) {
            return original;
        }
        final ASTNode location = issue.getCodeLocation();
        if (location == null) {
            return "";
        }
        final ScratchBlocksVisitor visitor = new ScratchBlocksVisitor(issue);
        visitor.begin();
        final ScriptEntity script = AstNodeUtil.findParent(location, ScriptEntity.class);
        if (script == null) {
            location.accept(visitor);
        }
        else {
            script.accept(visitor);
        }
        visitor.end();
        return value(visitor.getScratchBlocks());
    }

    private boolean metadataMatches(final SourceArtifact artifact, final SourceArtifactMetadata metadata) {
        if (
            metadata.artifactId() != artifact.id() || metadata.sourceKind() == null
                || metadata.sourceKind().isBlank()
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
            final JsonNode root = mapper.readTree(manifest);
            return root != null && root.isObject();
        }
        catch (RuntimeException exception) {
            return false;
        }
    }

    private boolean digestMatches(final Analysis analysis, final SourceArtifact artifact) {
        final byte[] expected = analysis.inputSha256();
        final byte[] recorded = artifact.sha256();
        return expected != null && expected.length == 32 && recorded.length == 32
            && MessageDigest.isEqual(expected, recorded);
    }

    private byte[] readAndVerify(final ArtifactInput input, final InputStream stream) throws IOException {
        final long limit = diffLimits().getMaxInputBytes();
        final ByteArrayOutputStream output = new ByteArrayOutputStream((int) Math.min(Math.max(limit, 1), 8192));
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
                throw new DiffLimitExceeded();
            }
            digest.update(buffer, 0, read);
            output.write(buffer, 0, read);
        }
        if (
            size != input.artifact().byteSize()
                || !MessageDigest.isEqual(digest.digest(), input.artifact().sha256())
        ) {
            throw new ArtifactIntegrityFailure();
        }
        return output.toByteArray();
    }

    private boolean isCompleted(final Analysis analysis) {
        return "DONE".equals(analysis.status()) || "COMPLETED".equals(analysis.status());
    }

    private boolean isRetainedSubmission(final Submission submission) {
        return submission != null && "ACTIVE".equalsIgnoreCase(value(submission.retentionState()));
    }

    /**
     * What to call one side of the comparison. An analysis only carries a project name when something set one, so the
     * file the reader actually submitted is the next best thing; "before" and "after" name nothing at all and are kept
     * only for a source that has lost its artifact.
     */
    private String sourceName(final ArtifactInput input, final String fallback) {
        String name = input.analysis().projectName();
        if (name == null || name.isBlank()) {
            name = input.artifact() == null ? null : input.artifact().originalFilename();
        }
        if (name == null || name.isBlank()) {
            return fallback;
        }
        final StringBuilder safe = new StringBuilder(Math.min(name.length(), 255));
        for (int index = 0; index < name.length() && safe.length() < 255; index++) {
            final char character = name.charAt(index);
            safe.append(safeCharacter(character));
        }
        return safe.toString().isBlank() ? fallback : safe.toString();
    }

    private char safeCharacter(final char character) {
        if (character == '/' || character == '\\' || Character.isISOControl(character)) {
            return '_';
        }
        return character;
    }

    private Locale safeLocale(final String locale) {
        return switch (locale == null ? "" : locale.toLowerCase(Locale.ROOT)) {
            case "de" -> Locale.GERMAN;
            case "es" -> Locale.forLanguageTag("es");
            case "nl" -> Locale.forLanguageTag("nl");
            default -> Locale.ENGLISH;
        };
    }

    private String normalizedFormat(final String format) {
        if (format == null) {
            return "";
        }
        final String normalized = format.toLowerCase(Locale.ROOT);
        return normalized.startsWith(".") ? normalized : "." + normalized;
    }

    private AdvancedCapabilitiesConfiguration.DiffLimits diffLimits() {
        return configuration.getSemanticDiff();
    }

    private Duration diffTimeout() {
        return diffLimits().getTimeout();
    }

    private void recordMetrics(final Timer.Sample timer, final String result) {
        meterRegistry.counter("litterbox.capabilities.diff.outcomes", "outcome", result).increment();
        if ("timeout".equals(result)) {
            meterRegistry.counter("litterbox.capabilities.diff.timeouts").increment();
        }
        if (Set.of("limit", "unavailable").contains(result)) {
            meterRegistry.counter("litterbox.capabilities.diff.rejections", "reason", result).increment();
        }
        timer.stop(meterRegistry.timer("litterbox.capabilities.diff.duration", Tags.of("outcome", result)));
    }

    private Throwable mapFailure(final Throwable error) {
        final Throwable cause = Exceptions.unwrap(error);
        if (cause instanceof CapabilityException capability) {
            return capability;
        }
        if (cause instanceof TimeoutException) {
            return CapabilityException.timedOut();
        }
        if (
            cause instanceof AnalysisCapacityExceededException
                || cause instanceof DatabaseCapacityExceededException
                || cause instanceof RejectedExecutionException
        ) {
            return CapabilityException.unavailable();
        }
        if (cause instanceof DiffLimitExceeded) {
            return CapabilityException.limitExceeded();
        }
        if (cause instanceof ArtifactIntegrityFailure || cause instanceof IOException) {
            return CapabilityException.analysisNotFound();
        }
        return CapabilityException.unsupportedSourceFormat();
    }

    private String outcome(final Throwable error) {
        final Throwable cause = Exceptions.unwrap(error);
        if (cause instanceof CapabilityException capability) {
            return switch (capability.code()) {
                case "capability_timeout" -> "timeout";
                case "capability_limit_exceeded" -> "limit";
                case "analysis_not_found" -> "not_found";
                case "analysis_not_ready" -> "not_ready";
                case "unsupported_source_format" -> "unsupported_source";
                case "capability_unavailable" -> "unavailable";
                default -> "failure";
            };
        }
        return "failure";
    }

    private MessageDigest sha256() {
        try {
            return MessageDigest.getInstance("SHA-256");
        }
        catch (NoSuchAlgorithmException exception) {
            throw new IllegalStateException("SHA-256 is unavailable", exception);
        }
    }

    private void closeQuietly(final InputStream stream) {
        try {
            stream.close();
        }
        catch (IOException ignored) {
            // Cleanup must not replace the stable capability response.
        }
    }

    private String value(final String value) {
        return value == null ? "" : value;
    }

    private <T> Mono<T> nonNull(final Mono<T> mono) {
        return mono == null ? Mono.empty() : mono;
    }

    private record AuthorizedAnalysis(Submission owner, Analysis analysis) {
    }

    private record ArtifactInput(Analysis analysis, SourceArtifact artifact) {
    }

    private static final class DiffLimitExceeded extends RuntimeException {
    }

    private static final class ArtifactIntegrityFailure extends RuntimeException {
    }

    private static final class UnsupportedSourceFormat extends RuntimeException {
    }
}
