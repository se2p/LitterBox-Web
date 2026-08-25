/*
 * Copyright (C) 2024-2026 LitterBox-Web contributors
 *
 * This file is part of LitterBox-Web.
 * Licenced under the EUPL-1.2 or later.
 *
 * SPDX-FileCopyrightText: 2024-2026 LitterBox-Web contributors
 * SPDX-License-Identifier: EUPL-1.2
 */
package de.uni_passau.fim.se2.litterbox_web.web_ui.capabilities.metrics;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Duration;
import java.util.Locale;
import java.util.Objects;
import java.util.Set;
import java.util.concurrent.TimeoutException;
import java.util.concurrent.atomic.AtomicReference;

import org.springframework.stereotype.Service;

import de.uni_passau.fim.se2.litterbox.analytics.GraphType;
import de.uni_passau.fim.se2.litterbox.ast.model.Program;
import de.uni_passau.fim.se2.litterbox_web.shared.Scratch3ParserService;
import de.uni_passau.fim.se2.litterbox_web.web_ui.capabilities.AdvancedCapabilitiesConfiguration;
import de.uni_passau.fim.se2.litterbox_web.web_ui.capabilities.AstNodes;
import de.uni_passau.fim.se2.litterbox_web.web_ui.capabilities.CapabilityException;
import de.uni_passau.fim.se2.litterbox_web.web_ui.capabilities.GraphCapability;
import de.uni_passau.fim.se2.litterbox_web.web_ui.execution.AnalysisCapacityExceededException;
import de.uni_passau.fim.se2.litterbox_web.web_ui.execution.AnalysisWork;
import de.uni_passau.fim.se2.litterbox_web.web_ui.persistence.Analysis;
import de.uni_passau.fim.se2.litterbox_web.web_ui.persistence.DatabaseCapacityExceededException;
import de.uni_passau.fim.se2.litterbox_web.web_ui.persistence.SourceArtifact;
import de.uni_passau.fim.se2.litterbox_web.web_ui.persistence.SourceArtifactAccess;
import de.uni_passau.fim.se2.litterbox_web.web_ui.single_project.ProjectArchiveInspector;
import de.uni_passau.fim.se2.litterbox_web.web_ui.single_project.SubmissionAnalysisAuthorizer;
import io.micrometer.core.instrument.MeterRegistry;
import io.micrometer.core.instrument.Tags;
import io.micrometer.core.instrument.Timer;
import reactor.core.Exceptions;
import reactor.core.publisher.Mono;

/** Token-authorized, bounded on-demand graph generation for retained project archives. */
@Service
final class MetricsGraphCapability implements GraphCapability {

    private static final Set<String> GRAPH_TYPES = Set.of("ast", "cfg", "cdg", "ddg", "dt", "pdt", "tdg", "pdg");
    private static final String SUCCESS = "success";

    private final SubmissionAnalysisAuthorizer authorizer;
    private final SourceArtifactAccess sourceArtifacts;
    private final AnalysisWork analysisWork;
    private final Scratch3ParserService parser;
    private final ProjectArchiveInspector archiveInspector;
    private final AdvancedCapabilitiesConfiguration configuration;
    private final GraphRenderer renderer;
    private final MeterRegistry meterRegistry;

    MetricsGraphCapability(
        final SubmissionAnalysisAuthorizer authorizer,
        final SourceArtifactAccess sourceArtifacts,
        final AnalysisWork analysisWork,
        final Scratch3ParserService parser,
        final ProjectArchiveInspector archiveInspector,
        final AdvancedCapabilitiesConfiguration configuration,
        final GraphRenderer renderer,
        final MeterRegistry meterRegistry
    ) {
        this.authorizer = Objects.requireNonNull(authorizer, "authorizer");
        this.sourceArtifacts = Objects.requireNonNull(sourceArtifacts, "sourceArtifacts");
        this.analysisWork = Objects.requireNonNull(analysisWork, "analysisWork");
        this.parser = Objects.requireNonNull(parser, "parser");
        this.archiveInspector = Objects.requireNonNull(archiveInspector, "archiveInspector");
        this.configuration = Objects.requireNonNull(configuration, "configuration");
        this.renderer = Objects.requireNonNull(renderer, "renderer");
        this.meterRegistry = Objects.requireNonNull(meterRegistry, "meterRegistry");
    }

    @Override
    public Mono<GraphResult> graph(final String submissionToken, final long analysisId, final String graphType) {
        return Mono.defer(() -> instrumentedGraph(submissionToken, analysisId, graphType));
    }

    private Mono<GraphResult> instrumentedGraph(
        final String submissionToken, final long analysisId, final String graphType
    ) {
        final String normalizedType = validateGraphType(graphType);
        final String metricGraphType = normalizedType;
        final AtomicReference<String> outcome = new AtomicReference<>("failure");
        final Timer.Sample timer = Timer.start(meterRegistry);
        final Mono<GraphResult> operation = authorize(submissionToken, analysisId)
            .flatMap(analysis -> loadAndGenerate(analysis, normalizedType))
            .timeout(graphTimeout())
            .onErrorMap(this::mapFailure)
            .doOnSuccess(result -> outcome.set(SUCCESS))
            .doOnError(error -> outcome.set(outcome(error)));
        return operation.doFinally(
            signal -> recordGraphMetrics(
                metricGraphType, outcome.get(), timer
            )
        );
    }

    private void recordGraphMetrics(final String graphType, final String result, final Timer.Sample timer) {
        meterRegistry.counter(
            "litterbox.capabilities.graph.outcomes", "graph_type", graphType, "outcome", result
        ).increment();
        if ("timeout".equals(result)) {
            meterRegistry.counter("litterbox.capabilities.graph.timeouts", "graph_type", graphType)
                .increment();
        }
        if (isRejection(result)) {
            meterRegistry.counter(
                "litterbox.capabilities.graph.rejections", "graph_type", graphType, "reason", result
            ).increment();
        }
        timer.stop(
            meterRegistry.timer(
                "litterbox.capabilities.graph.duration",
                Tags.of("graph_type", graphType, "outcome", result)
            )
        );
    }

    /**
     * The analysis this token may have a graph of.
     *
     * <p>
     * Whether the token owns the analysis at all is {@link SubmissionAnalysisAuthorizer}'s to say, and is the same
     * question the single-project endpoints ask. Only what this capability additionally needs — an analysis that has
     * finished, and so has source to render — is decided here, because a caller who is told to come back later must not
     * be told the same thing as one asking about somebody else's analysis.
     */
    private Mono<Analysis> authorize(final String token, final long analysisId) {
        return authorizer.ownedAnalysis(token, analysisId)
            .switchIfEmpty(Mono.error(CapabilityException.analysisNotFound()))
            .flatMap(this::readyAnalysis);
    }

    private Mono<Analysis> readyAnalysis(final Analysis analysis) {
        if (!"DONE".equals(analysis.status()) && !"COMPLETED".equals(analysis.status())) {
            return Mono.error(CapabilityException.analysisNotReady());
        }
        return Mono.just(analysis);
    }

    private Mono<GraphResult> loadAndGenerate(final Analysis analysis, final String graphType) {
        final String recordedFormat = analysis.inputFormat() == null
            ? ""
            : analysis.inputFormat().toLowerCase(Locale.ROOT);
        final String inputFormat = recordedFormat.startsWith(".") ? recordedFormat : "." + recordedFormat;
        if (!Set.of(".sb3", ".mblock").contains(inputFormat)) {
            return Mono.error(CapabilityException.unsupportedSourceFormat());
        }
        if (analysis.sourceArtifactId() < 1) {
            return Mono.error(CapabilityException.analysisNotFound());
        }
        return sourceArtifacts.findById(analysis.sourceArtifactId())
            .switchIfEmpty(Mono.error(CapabilityException.analysisNotFound()))
            .flatMap(artifact -> loadAndGenerate(analysis, artifact, graphType));
    }

    private Mono<GraphResult> loadAndGenerate(
        final Analysis analysis, final SourceArtifact artifact, final String graphType
    ) {
        if (artifact.byteSize() < 0 || artifact.byteSize() > graphLimits().getMaxInputBytes()) {
            return Mono.error(CapabilityException.limitExceeded());
        }
        final byte[] expectedDigest = analysis.inputSha256();
        if (expectedDigest != null && !MessageDigest.isEqual(expectedDigest, artifact.sha256())) {
            return Mono.error(CapabilityException.analysisNotFound());
        }
        return sourceArtifacts.open(artifact.sha256())
            .switchIfEmpty(Mono.error(CapabilityException.analysisNotFound()))
            .flatMap(
                stream -> Mono.using(
                    () -> stream,
                    owned -> analysisWork.submit(() -> generate(owned, graphType)),
                    this::closeQuietly
                )
            );
    }

    private GraphResult generate(final InputStream stream, final String graphType) {
        try {
            final byte[] archive = readLimited(stream, graphLimits().getMaxInputBytes());
            final ProjectArchiveInspector.Inspection inspection = archiveInspector.inspect(archive);
            final Program program = parser.parseFromString(
                "retained-project", new String(inspection.projectJson(), StandardCharsets.UTF_8)
            );
            final int astNodes = AstNodes.count(program, graphLimits().getMaxAstNodes());
            if (astNodes > graphLimits().getMaxAstNodes()) {
                throw new GraphLimitExceeded();
            }
            final GraphType type = GraphType.valueOf(graphType.toUpperCase(Locale.ROOT));
            final GraphRenderer.RenderedGraph rendered = renderer.render(program, type);
            validateResult(rendered);
            return new GraphResult(rendered.dot(), rendered.nodeCount(), rendered.edgeCount());
        }
        catch (GraphLimitExceeded exception) {
            throw CapabilityException.limitExceeded();
        }
        catch (IOException | IllegalArgumentException | StackOverflowError exception) {
            throw CapabilityException.unsupportedSourceFormat();
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

    private void validateResult(final GraphRenderer.RenderedGraph rendered) {
        if (rendered == null || rendered.dot() == null) {
            throw new GraphLimitExceeded();
        }
        if (rendered.nodeCount() < 0 || rendered.edgeCount() < 0) {
            throw new GraphLimitExceeded();
        }
        if (!withinGraphLimits(rendered)) {
            throw new GraphLimitExceeded();
        }
    }

    private boolean withinGraphLimits(final GraphRenderer.RenderedGraph rendered) {
        if (rendered.nodeCount() > graphLimits().getMaxGraphNodes()) {
            return false;
        }
        if (rendered.edgeCount() > graphLimits().getMaxGraphEdges()) {
            return false;
        }
        return rendered.dot().getBytes(StandardCharsets.UTF_8).length <= graphLimits().getMaxDotBytes();
    }

    private byte[] readLimited(final InputStream stream, final long limit) throws IOException {
        final ByteArrayOutputStream output = new ByteArrayOutputStream((int) Math.min(limit, 8192));
        final byte[] buffer = new byte[8192];
        long total = 0;
        int read;
        while ((read = stream.read(buffer)) >= 0) {
            if (read == 0) {
                continue;
            }
            total += read;
            if (total > limit) {
                throw new GraphLimitExceeded();
            }
            output.write(buffer, 0, read);
        }
        return output.toByteArray();
    }

    private AdvancedCapabilitiesConfiguration.GraphLimits graphLimits() {
        return configuration.getMetricsGraphs();
    }

    private Duration graphTimeout() {
        return graphLimits().getTimeout();
    }

    private String validateGraphType(final String graphType) {
        if (graphType == null || !GRAPH_TYPES.contains(graphType)) {
            throw new IllegalArgumentException("Unsupported graph type");
        }
        return graphType;
    }

    private Throwable mapFailure(final Throwable error) {
        final Throwable cause = Exceptions.unwrap(error);
        if (cause instanceof CapabilityException) {
            return cause;
        }
        if (cause instanceof TimeoutException) {
            return CapabilityException.timedOut();
        }
        if (cause instanceof IOException) {
            return CapabilityException.analysisNotFound();
        }
        if (cause instanceof AnalysisCapacityExceededException || cause instanceof DatabaseCapacityExceededException) {
            return CapabilityException.unavailable();
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

    private boolean isRejection(final String result) {
        return Set.of("limit", "unavailable").contains(result);
    }

    private static final class GraphLimitExceeded extends RuntimeException {
    }

}
