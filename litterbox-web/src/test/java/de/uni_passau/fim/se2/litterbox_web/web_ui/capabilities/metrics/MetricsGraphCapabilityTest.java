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

import static de.uni_passau.fim.se2.litterbox_web.web_ui.capabilities.CapabilityAssertions.assertCode;
import static org.assertj.core.api.Assertions.assertThat;
import static org.awaitility.Awaitility.await;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Duration;
import java.util.ArrayList;
import java.util.EnumSet;
import java.util.List;
import java.util.Map;
import java.util.concurrent.Callable;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicReference;
import java.util.zip.ZipEntry;
import java.util.zip.ZipOutputStream;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import de.uni_passau.fim.se2.litterbox.analytics.GraphType;
import de.uni_passau.fim.se2.litterbox.ast.model.Program;
import de.uni_passau.fim.se2.litterbox_web.shared.Scratch3ParserService;
import de.uni_passau.fim.se2.litterbox_web.util.FixtureLoader;
import de.uni_passau.fim.se2.litterbox_web.web_ui.capabilities.AdvancedCapabilitiesConfiguration;
import de.uni_passau.fim.se2.litterbox_web.web_ui.capabilities.GraphCapability;
import de.uni_passau.fim.se2.litterbox_web.web_ui.execution.AnalysisCapacityExceededException;
import de.uni_passau.fim.se2.litterbox_web.web_ui.execution.AnalysisWork;
import de.uni_passau.fim.se2.litterbox_web.web_ui.persistence.Analysis;
import de.uni_passau.fim.se2.litterbox_web.web_ui.persistence.AnalysisRepository;
import de.uni_passau.fim.se2.litterbox_web.web_ui.persistence.SourceArtifact;
import de.uni_passau.fim.se2.litterbox_web.web_ui.persistence.SourceArtifactAccess;
import de.uni_passau.fim.se2.litterbox_web.web_ui.persistence.Submission;
import de.uni_passau.fim.se2.litterbox_web.web_ui.persistence.SubmissionRepository;
import de.uni_passau.fim.se2.litterbox_web.web_ui.single_project.ProjectArchiveInspector;
import de.uni_passau.fim.se2.litterbox_web.web_ui.single_project.SubmissionAnalysisAuthorizer;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import reactor.core.publisher.Mono;
import reactor.core.scheduler.Scheduler;
import reactor.core.scheduler.Schedulers;

class MetricsGraphCapabilityTest {

    private static final String TOKEN = "synthetic-token";
    private static final String OTHER_TOKEN = "other-token";
    private static final long SUBMISSION_ID = 41;
    private static final long OTHER_SUBMISSION_ID = 42;
    private static final long ANALYSIS_ID = 71;
    private static final long ARTIFACT_ID = 81;

    private final SubmissionRepository submissions = mock(SubmissionRepository.class);
    private final AnalysisRepository analyses = mock(AnalysisRepository.class);
    private final SourceArtifactAccess sourceArtifacts = mock(SourceArtifactAccess.class);
    private final SimpleMeterRegistry meters = new SimpleMeterRegistry();
    private final AdvancedCapabilitiesConfiguration configuration = new AdvancedCapabilitiesConfiguration();
    private final byte[] archive = archive();
    private final SourceArtifact artifact = artifact(archive, ".sb3");
    private final Analysis analysis = analysis(archive, ".sb3", "DONE", SUBMISSION_ID);

    @BeforeEach
    void setUp() {
        when(submissions.findByToken(TOKEN)).thenReturn(Mono.just(submission(SUBMISSION_ID, TOKEN)));
        when(analyses.findById(ANALYSIS_ID)).thenReturn(Mono.just(analysis));
        when(sourceArtifacts.findById(ARTIFACT_ID)).thenReturn(Mono.just(artifact));
        when(sourceArtifacts.open(any())).thenAnswer(
            ignored -> Mono.just(new ByteArrayInputStream(archive))
        );
    }

    @Test
    void supportsEveryApprovedGraphIdentifierAndGeneratesOnlyThatGraph() {
        final List<GraphType> requested = new CopyOnWriteArrayList<>();
        final MetricsGraphCapability capability = capability(
            (program, type) -> {
                requested.add(type);
                return new GraphRenderer.RenderedGraph("digraph {\n}\n", 0, 0);
            },
            immediateWork()
        );

        for (String identifier : List.of("ast", "cfg", "cdg", "ddg", "dt", "pdt", "tdg", "pdg")) {
            capability.graph(TOKEN, ANALYSIS_ID, identifier).block(Duration.ofSeconds(2));
        }

        assertThat(requested).containsExactly(
            GraphType.AST, GraphType.CFG, GraphType.CDG, GraphType.DDG,
            GraphType.DT, GraphType.PDT, GraphType.TDG, GraphType.PDG
        );
    }

    @Test
    void rendersDeterministicDotAndCountsForEveryGraphType() throws Exception {
        final String json = FixtureLoader.loadFixture("scratch_programs/boatRace.json");
        final Scratch3ParserService parser = new Scratch3ParserService();
        final Program first = parser.parseFromString("retained-project", json);
        final Program second = parser.parseFromString("retained-project", json);
        final Program adversarial = parser.parseFromString(
            "retained-project", json.replace("\"name\": \"Stage\"", "\"name\": \"<script>\\n/tmp/secret\"")
        );
        final CoreGraphRenderer renderer = new CoreGraphRenderer();

        for (GraphType type : EnumSet.allOf(GraphType.class)) {
            final GraphRenderer.RenderedGraph left = renderer.render(first, type);
            final GraphRenderer.RenderedGraph right = renderer.render(second, type);
            assertThat(left.dot()).isEqualTo(right.dot());
            assertThat(left.nodeCount()).isEqualTo(right.nodeCount());
            assertThat(left.edgeCount()).isEqualTo(right.edgeCount());
            assertThat(left.dot()).doesNotContain("/tmp", "<script>", "attacker-token");
            assertThat(left.dot()).startsWith("digraph {");
        }
        assertThat(renderer.render(adversarial, GraphType.AST).dot())
            .doesNotContain("<script>", "/tmp/secret");
    }

    @Test
    void labelsFlowNodesWithBlockSourceAndKeepsProjectTextInsideQuotedLabels() throws Exception {
        final String json = FixtureLoader.loadFixture("scratch_programs/boatRace.json");
        final Scratch3ParserService parser = new Scratch3ParserService();
        final CoreGraphRenderer renderer = new CoreGraphRenderer();
        // Sprite names reach the graph now that labels are block source, so they have to survive as inert label text.
        final Program adversarial = parser.parseFromString(
            "retained-project",
            json.replace("\"name\": \"Stage\"", "\"name\": \"</text><script>alert(1)</script>\\n\\\"x\"")
        );

        final String dot = renderer.render(adversarial, GraphType.CFG).dot();

        // Scratchblocks can only recognise a label that is block source; a class name would come out obsolete-red.
        assertThat(dot).contains("when green flag clicked");
        assertThat(dot).doesNotContain("GreenFlag");
        for (String line : dot.lines().filter(line -> line.contains("[label=")).toList()) {
            assertThat(line).matches("^ {2}n\\d+ \\[label=\"(?:[^\"\\\\]|\\\\.)*\"(?:, penwidth=\"1\\.5\")?\\];$");
        }
    }

    @Test
    void supportsRetainedMblockProjects() throws IOException {
        final byte[] mblock = zip("project.json", fixtureJson());
        when(analyses.findById(ANALYSIS_ID))
            .thenReturn(Mono.just(analysis(mblock, "mblock", "COMPLETED", SUBMISSION_ID)));
        when(sourceArtifacts.findById(ARTIFACT_ID)).thenReturn(Mono.just(artifact(mblock, "mblock")));
        when(sourceArtifacts.open(any())).thenReturn(Mono.just(new ByteArrayInputStream(mblock)));

        final GraphCapability.GraphResult result = capability((p, t) -> result()).graph(TOKEN, ANALYSIS_ID, "ast")
            .block();

        assertThat(result).isNotNull();
        assertThat(result.dot()).startsWith("digraph");
    }

    @Test
    void performsParsingAndRenderingOnTheAnalysisExecutor() {
        final AtomicReference<String> renderingThread = new AtomicReference<>();
        final AnalysisWork boundedWork = new AnalysisWork() {

            @Override
            public <T> Mono<T> submit(final Callable<T> task) {
                return Mono.fromCallable(task).subscribeOn(Schedulers.boundedElastic());
            }
        };
        final MetricsGraphCapability capability = capability(
            (program, type) -> {
                renderingThread.set(Thread.currentThread().getName());
                return result();
            }, boundedWork
        );

        final Scheduler eventLoop = Schedulers.newSingle("synthetic-event-loop");
        try {
            Mono.just(TOKEN)
                .publishOn(eventLoop)
                .flatMap(token -> capability.graph(token, ANALYSIS_ID, "ast"))
                .block(Duration.ofSeconds(2));
        }
        finally {
            eventLoop.dispose();
        }

        assertThat(renderingThread).hasValueSatisfying(
            thread -> assertThat(thread).doesNotContain("synthetic-event-loop")
        );
    }

    @Test
    void keepsPersistedMetricNamesInStableOrder() {
        final Analysis snapshot = new Analysis(
            ANALYSIS_ID, SUBMISSION_ID, ARTIFACT_ID, "synthetic", "NEW", "1", "1", "en", "DONE", ".sb3",
            null, null, null, null, null, digest(archive), Map.of("zeta", 3.0, "alpha", 1.0, "middle", 2.0)
        );

        assertThat(snapshot.metrics().keySet()).containsExactly("alpha", "middle", "zeta");
        assertThat(snapshot.metrics()).containsEntry("alpha", 1.0).containsEntry("middle", 2.0)
            .containsEntry("zeta", 3.0);
    }

    @Test
    void deniesAnAnalysisOwnedByAnotherToken() {
        when(submissions.findByToken(OTHER_TOKEN)).thenReturn(Mono.just(submission(OTHER_SUBMISSION_ID, OTHER_TOKEN)));
        final MetricsGraphCapability capability = capability((program, type) -> result(), immediateWork());

        assertCode("analysis_not_found", () -> capability.graph(OTHER_TOKEN, ANALYSIS_ID, "ast").block());
        verifyNoInteractions(sourceArtifacts);
    }

    @Test
    void rejectsMissingFailedAndIncompleteAnalysesWithoutReadingArtifacts() {
        when(submissions.findByToken("missing-token")).thenReturn(Mono.empty());
        assertCode("analysis_not_found", () -> capability((p, t) -> result()).graph("missing-token", 1, "ast").block());

        when(analyses.findById(ANALYSIS_ID)).thenReturn(Mono.just(analysis(archive, ".sb3", "FAILED", SUBMISSION_ID)));
        assertCode("analysis_not_ready", () -> capability((p, t) -> result()).graph(TOKEN, ANALYSIS_ID, "ast").block());

        when(analyses.findById(ANALYSIS_ID)).thenReturn(Mono.just(analysis(archive, ".sb3", "RUNNING", SUBMISSION_ID)));
        assertCode("analysis_not_ready", () -> capability((p, t) -> result()).graph(TOKEN, ANALYSIS_ID, "ast").block());
        verifyNoInteractions(sourceArtifacts);
    }

    @Test
    void rejectsMissingMalformedAndNonProjectArtifactsWithoutDisclosure() {
        when(sourceArtifacts.findById(ARTIFACT_ID)).thenReturn(Mono.empty());
        assertCode("analysis_not_found", () -> capability((p, t) -> result()).graph(TOKEN, ANALYSIS_ID, "ast").block());

        final byte[] malformed = "not-a-zip".getBytes(StandardCharsets.UTF_8);
        when(analyses.findById(ANALYSIS_ID)).thenReturn(Mono.just(analysis(malformed, ".sb3", "DONE", SUBMISSION_ID)));
        when(sourceArtifacts.findById(ARTIFACT_ID)).thenReturn(Mono.just(artifact(malformed, ".sb3")));
        when(sourceArtifacts.open(any())).thenReturn(Mono.just(new ByteArrayInputStream(malformed)));
        assertCode(
            "unsupported_source_format", () -> capability((p, t) -> result()).graph(TOKEN, ANALYSIS_ID, "ast").block()
        );

        final byte[] nonProject = zip("not-project.json", "{}");
        when(analyses.findById(ANALYSIS_ID))
            .thenReturn(Mono.just(analysis(nonProject, ".mblock", "DONE", SUBMISSION_ID)));
        when(sourceArtifacts.findById(ARTIFACT_ID)).thenReturn(Mono.just(artifact(nonProject, ".mblock")));
        when(sourceArtifacts.open(any())).thenReturn(Mono.just(new ByteArrayInputStream(nonProject)));
        assertCode(
            "unsupported_source_format", () -> capability((p, t) -> result()).graph(TOKEN, ANALYSIS_ID, "ast").block()
        );
    }

    @Test
    void rejectsUnsupportedSourceAndOversizedInput() {
        when(analyses.findById(ANALYSIS_ID)).thenReturn(Mono.just(analysis(archive, "json", "DONE", SUBMISSION_ID)));
        assertCode(
            "unsupported_source_format", () -> capability((p, t) -> result()).graph(TOKEN, ANALYSIS_ID, "ast").block()
        );

        configuration.getMetricsGraphs().setMaxInputBytes(archive.length - 1L);
        when(analyses.findById(ANALYSIS_ID)).thenReturn(Mono.just(analysis));
        assertCode(
            "capability_limit_exceeded", () -> capability((p, t) -> result()).graph(TOKEN, ANALYSIS_ID, "ast").block()
        );
    }

    @Test
    void rejectsAstGraphAndResponseCeilings() {
        configuration.getMetricsGraphs().setMaxAstNodes(1);
        assertCode(
            "capability_limit_exceeded", () -> capability((p, t) -> result()).graph(TOKEN, ANALYSIS_ID, "ast").block()
        );

        configuration.getMetricsGraphs().setMaxAstNodes(200_000);
        configuration.getMetricsGraphs().setMaxGraphNodes(1);
        assertCode(
            "capability_limit_exceeded",
            () -> capability((p, t) -> new GraphRenderer.RenderedGraph("digraph {}", 2, 0))
                .graph(TOKEN, ANALYSIS_ID, "ast").block()
        );

        configuration.getMetricsGraphs().setMaxGraphNodes(100_000);
        configuration.getMetricsGraphs().setMaxGraphEdges(1);
        assertCode(
            "capability_limit_exceeded",
            () -> capability((p, t) -> new GraphRenderer.RenderedGraph("digraph {}", 0, 2))
                .graph(TOKEN, ANALYSIS_ID, "ast").block()
        );

        configuration.getMetricsGraphs().setMaxGraphEdges(250_000);
        configuration.getMetricsGraphs().setMaxDotBytes(3);
        assertCode(
            "capability_limit_exceeded",
            () -> capability((p, t) -> new GraphRenderer.RenderedGraph("digraph {}", 0, 0))
                .graph(TOKEN, ANALYSIS_ID, "ast").block()
        );
    }

    @Test
    void convertsTimeoutsToBoundedCapabilityErrorsAndRecordsThem() {
        configuration.getMetricsGraphs().setTimeout(Duration.ofMillis(10));
        final AtomicBoolean streamClosed = new AtomicBoolean();
        when(sourceArtifacts.open(any())).thenReturn(Mono.just(new ByteArrayInputStream(archive) {

            @Override
            public void close() {
                streamClosed.set(true);
            }
        }));
        final MetricsGraphCapability capability = capability((p, t) -> result(), neverWork());

        assertCode(
            "capability_timeout", () -> capability.graph(TOKEN, ANALYSIS_ID, "cfg").block(Duration.ofSeconds(1))
        );
        // The timeout unwinds on the timer thread, so the close and the count may land after block() returns.
        await().atMost(Duration.ofSeconds(2)).untilAsserted(() -> {
            assertThat(streamClosed).isTrue();
            assertThat(
                meters.get("litterbox.capabilities.graph.timeouts")
                    .tag("graph_type", "cfg").counter().count()
            ).isEqualTo(1.0);
        });
    }

    @Test
    void mapsAnalysisAdmissionRejectionToAStableUnavailableErrorAndClosesTheSource() {
        final AtomicBoolean streamClosed = new AtomicBoolean();
        when(sourceArtifacts.open(any())).thenReturn(Mono.just(new ByteArrayInputStream(archive) {

            @Override
            public void close() {
                streamClosed.set(true);
            }
        }));

        assertCode(
            "capability_unavailable",
            () -> capability((program, type) -> result(), rejectingWork()).graph(TOKEN, ANALYSIS_ID, "ast").block()
        );
        assertThat(streamClosed).isTrue();
        assertThat(
            meters.get("litterbox.capabilities.graph.rejections")
                .tag("graph_type", "ast").tag("reason", "unavailable").counter().count()
        ).isEqualTo(1.0);
    }

    @Test
    void doesNotPerformBlockingWorkWhenTheMonoIsCreated() {
        final MetricsGraphCapability capability = capability((p, t) -> result());

        capability.graph(TOKEN, ANALYSIS_ID, "ast");

        verifyNoInteractions(analyses, sourceArtifacts);
    }

    @Test
    void doesNotReturnSourceStorageOrPathContent() {
        final List<GraphType> requested = new ArrayList<>();
        final MetricsGraphCapability capability = capability(
            (program, type) -> {
                requested.add(type);
                return new GraphRenderer.RenderedGraph("digraph { n0 [label=\"safe\"]; }", 1, 0);
            }
        );

        final GraphCapability.GraphResult result = capability.graph(TOKEN, ANALYSIS_ID, "ast").block();

        assertThat(result.dot()).doesNotContain(
            TOKEN, "sha256", "project.json", "/Users/", "<script>", "http://", "https://",
            "javascript:", "onload", "onclick"
        );
        assertThat(requested).containsExactly(GraphType.AST);
    }

    private MetricsGraphCapability capability(final GraphRenderer renderer) {
        return capability(renderer, immediateWork());
    }

    private MetricsGraphCapability capability(final GraphRenderer renderer, final AnalysisWork work) {
        return new MetricsGraphCapability(
            new SubmissionAnalysisAuthorizer(submissions, analyses), sourceArtifacts, work,
            new Scratch3ParserService(), new ProjectArchiveInspector(), configuration, renderer, meters
        );
    }

    private GraphRenderer.RenderedGraph result() {
        return new GraphRenderer.RenderedGraph("digraph {\n}\n", 0, 0);
    }

    private AnalysisWork immediateWork() {
        return new AnalysisWork() {

            @Override
            public <T> Mono<T> submit(final java.util.concurrent.Callable<T> task) {
                return Mono.fromCallable(task);
            }
        };
    }

    private AnalysisWork neverWork() {
        return new AnalysisWork() {

            @Override
            public <T> Mono<T> submit(final java.util.concurrent.Callable<T> task) {
                return Mono.never();
            }
        };
    }

    private AnalysisWork rejectingWork() {
        return new AnalysisWork() {

            @Override
            public <T> Mono<T> submit(final Callable<T> task) {
                return Mono.error(new AnalysisCapacityExceededException());
            }
        };
    }

    private Submission submission(final long id, final String token) {
        return new Submission(id, token, "SINGLE_PROJECT", "en", "COMPLETED", "ACTIVE", 1, 1, 0);
    }

    private Analysis analysis(final byte[] source, final String format, final String status, final long submissionId) {
        return new Analysis(
            ANALYSIS_ID, submissionId, ARTIFACT_ID, "synthetic", "NEW", "1", "1", "en", status, format,
            "{}", null, null, "synthetic-detectors", "{}", digest(source), Map.of()
        );
    }

    private SourceArtifact artifact(final byte[] source, final String format) {
        return new SourceArtifact(ARTIFACT_ID, digest(source), source.length, "application/zip", "synthetic" + format);
    }

    private byte[] archive() {
        try {
            return zip("project.json", fixtureJson());
        }
        catch (IOException exception) {
            throw new IllegalStateException("Synthetic fixture could not be loaded", exception);
        }
    }

    private String fixtureJson() throws IOException {
        return FixtureLoader.loadFixture("scratch_programs/boatRace.json");
    }

    private byte[] zip(final String entryName, final String content) {
        try {
            final ByteArrayOutputStream output = new ByteArrayOutputStream();
            try (ZipOutputStream zip = new ZipOutputStream(output)) {
                zip.putNextEntry(new ZipEntry(entryName));
                zip.write(content.getBytes(StandardCharsets.UTF_8));
                zip.closeEntry();
            }
            return output.toByteArray();
        }
        catch (IOException exception) {
            throw new IllegalStateException("Synthetic archive could not be created", exception);
        }
    }

    private byte[] digest(final byte[] bytes) {
        try {
            return MessageDigest.getInstance("SHA-256").digest(bytes);
        }
        catch (java.security.NoSuchAlgorithmException exception) {
            throw new IllegalStateException("SHA-256 is unavailable", exception);
        }
    }
}
