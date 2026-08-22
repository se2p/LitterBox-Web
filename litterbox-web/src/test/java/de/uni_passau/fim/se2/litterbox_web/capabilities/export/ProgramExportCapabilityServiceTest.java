/*
 * Copyright (C) 2024-2026 LitterBox-Web contributors
 *
 * This file is part of LitterBox-Web.
 * Licenced under the EUPL-1.2 or later.
 *
 * SPDX-FileCopyrightText: 2024-2026 LitterBox-Web contributors
 * SPDX-License-Identifier: EUPL-1.2
 */
package de.uni_passau.fim.se2.litterbox_web.capabilities.export;

import static de.uni_passau.fim.se2.litterbox_web.capabilities.CapabilityAssertions.assertCode;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.awaitility.Awaitility.await;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.reset;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Duration;
import java.util.List;
import java.util.Map;
import java.util.concurrent.Callable;
import java.util.concurrent.atomic.AtomicReference;
import java.util.zip.ZipEntry;
import java.util.zip.ZipOutputStream;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import de.uni_passau.fim.se2.litterbox.ast.model.Program;
import de.uni_passau.fim.se2.litterbox.ast.util.AstNodeUtil;
import de.uni_passau.fim.se2.litterbox_web.capabilities.AdvancedCapabilitiesConfiguration;
import de.uni_passau.fim.se2.litterbox_web.capabilities.AdvancedCapabilityDtos;
import de.uni_passau.fim.se2.litterbox_web.capabilities.CapabilityContent;
import de.uni_passau.fim.se2.litterbox_web.execution.AnalysisCapacityExceededException;
import de.uni_passau.fim.se2.litterbox_web.execution.AnalysisWork;
import de.uni_passau.fim.se2.litterbox_web.persistence.Analysis;
import de.uni_passau.fim.se2.litterbox_web.persistence.AnalysisRepository;
import de.uni_passau.fim.se2.litterbox_web.persistence.SourceArtifact;
import de.uni_passau.fim.se2.litterbox_web.persistence.SourceArtifactAccess;
import de.uni_passau.fim.se2.litterbox_web.persistence.SourceArtifactMetadata;
import de.uni_passau.fim.se2.litterbox_web.persistence.Submission;
import de.uni_passau.fim.se2.litterbox_web.persistence.SubmissionRepository;
import de.uni_passau.fim.se2.litterbox_web.shared.Scratch3ParserService;
import de.uni_passau.fim.se2.litterbox_web.single_project.ProjectArchiveInspector;
import de.uni_passau.fim.se2.litterbox_web.util.FixtureLoader;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import reactor.core.publisher.Mono;
import reactor.core.scheduler.Scheduler;
import reactor.core.scheduler.Schedulers;

class ProgramExportCapabilityServiceTest {

    private static final String TOKEN = "synthetic-export-token";
    private static final long SUBMISSION_ID = 41;
    private static final long ANALYSIS_ID = 71;
    private static final long ARTIFACT_ID = 81;
    private static final String PROJECT_JSON = loadProjectJson();

    private final SubmissionRepository submissions = mock(SubmissionRepository.class);
    private final AnalysisRepository analyses = mock(AnalysisRepository.class);
    private final SourceArtifactAccess sourceArtifacts = mock(SourceArtifactAccess.class);
    private final AdvancedCapabilitiesConfiguration configuration = new AdvancedCapabilitiesConfiguration();
    private final SimpleMeterRegistry meters = new SimpleMeterRegistry();
    private final Scratch3ParserService parser = new Scratch3ParserService();
    private byte[] archive;
    private SourceArtifact artifact;

    @BeforeEach
    void setUp() throws IOException {
        reset(submissions, analyses, sourceArtifacts);
        archive = archive(PROJECT_JSON);
        installSource(archive, ".sb3");
    }

    @Test
    void exportsAllFormatsAndTargetsAsDeterministicUtf8WithoutSourceMetadata() {
        final Program program = parser.parseFromString("synthetic", PROJECT_JSON);
        final String spriteName = program.getActorDefinitionList().getDefinitions().stream()
            .filter(actor -> actor.isSprite())
            .findFirst()
            .orElseThrow()
            .getIdent()
            .getName();
        final String scriptId = AstNodeUtil.getScripts(program).findFirst().map(AstNodeUtil::getBlockId).orElseThrow();

        final List<String> formats = List.of("scratchblocks", "goboscript", "pystage");
        final List<AdvancedCapabilityDtos.ExportTarget> targets = List.of(
            new AdvancedCapabilityDtos.ExportTarget("program", null, null),
            new AdvancedCapabilityDtos.ExportTarget("sprite", spriteName, null),
            new AdvancedCapabilityDtos.ExportTarget("script", null, scriptId)
        );
        for (String format : formats) {
            for (AdvancedCapabilityDtos.ExportTarget target : targets) {
                final AdvancedCapabilityDtos.ExportRequest request = request(format, target);
                final byte[] first = capability(immediateWork()).export(TOKEN, ANALYSIS_ID, request).block().bytes();
                final byte[] second = capability(immediateWork()).export(TOKEN, ANALYSIS_ID, request).block().bytes();
                assertThat(first).isEqualTo(second);
                assertThat(new String(first, StandardCharsets.UTF_8)).doesNotContain("\r");
                assertThat(new String(first, StandardCharsets.UTF_8).getBytes(StandardCharsets.UTF_8)).isEqualTo(first);
                assertThat(capability(immediateWork()).export(TOKEN, ANALYSIS_ID, request).block().sourceFormat())
                    .isNull();
            }
        }
    }

    @Test
    @SuppressWarnings("checkstyle:LambdaBodyLength")
    void listsDeterministicExportTargetsWithStageAndRenderableScriptPreviews() {
        final AdvancedCapabilityDtos.ExportTargetsView first = capability(immediateWork())
            .targets(TOKEN, ANALYSIS_ID).block();
        final AdvancedCapabilityDtos.ExportTargetsView second = capability(immediateWork())
            .targets(TOKEN, ANALYSIS_ID).block();

        assertThat(first).isEqualTo(second);
        assertThat(first.sprites()).isNotEmpty();
        assertThat(first.sprites().getFirst().stage()).isTrue();
        assertThat(first.sprites()).extracting(AdvancedCapabilityDtos.ExportSpriteTargetView::name)
            .doesNotHaveDuplicates();
        assertThat(first.scripts()).isNotEmpty().allSatisfy(script -> {
            assertThat(script.scriptId()).isNotBlank();
            assertThat(script.spriteName()).isNotBlank();
            assertThat(script.ordinal()).isPositive();
            assertThat(script.scratchblocks()).isNotBlank().doesNotContain("\r");
            final CapabilityContent exported = capability(immediateWork()).export(
                TOKEN,
                ANALYSIS_ID,
                request(
                    "scratchblocks",
                    new AdvancedCapabilityDtos.ExportTarget("script", null, script.scriptId())
                )
            ).block();
            assertThat(new String(exported.bytes(), StandardCharsets.UTF_8)).isEqualTo(script.scratchblocks());
        });
        assertThat(first.scripts()).extracting(AdvancedCapabilityDtos.ExportScriptTargetView::scriptId)
            .doesNotHaveDuplicates();
    }

    @Test
    void listsAnEmptyScriptCatalogueWithoutInventingTargets() throws IOException {
        installSource(archive(emptyProject()), ".sb3");

        final AdvancedCapabilityDtos.ExportTargetsView targets = capability(immediateWork())
            .targets(TOKEN, ANALYSIS_ID).block();

        assertThat(targets.sprites()).containsExactly(
            new AdvancedCapabilityDtos.ExportSpriteTargetView("Stage", true)
        );
        assertThat(targets.scripts()).isEmpty();
    }

    @Test
    void rejectsAmbiguousSpriteNamesInTheTargetCatalogue() throws IOException {
        final var root = (tools.jackson.databind.node.ObjectNode) tools.jackson.databind.json.JsonMapper.shared()
            .readTree(PROJECT_JSON);
        final var targets = (tools.jackson.databind.node.ArrayNode) root.get("targets");
        targets.add(targets.get(1).deepCopy());
        installSource(archive(tools.jackson.databind.json.JsonMapper.shared().writeValueAsString(root)), ".sb3");

        assertCode(
            "target_not_found",
            () -> capability(immediateWork()).targets(TOKEN, ANALYSIS_ID).block()
        );
    }

    @Test
    void targetCatalogueUsesTheSharedAuthorizationSourceAndResourceLimits() throws IOException {
        when(analyses.findById(ANALYSIS_ID)).thenReturn(Mono.just(analysis("FAILED", ".sb3", archive)));
        assertCode(
            "analysis_not_ready",
            () -> capability(immediateWork()).targets(TOKEN, ANALYSIS_ID).block()
        );

        installSource("not-a-zip".getBytes(StandardCharsets.UTF_8), ".sb3");
        assertCode(
            "unsupported_source_format",
            () -> capability(immediateWork()).targets(TOKEN, ANALYSIS_ID).block()
        );

        installSource(archive(PROJECT_JSON), ".sb3");
        configuration.getProgramExport().setMaxOutputBytes(1);
        assertCode(
            "capability_limit_exceeded",
            () -> capability(immediateWork()).targets(TOKEN, ANALYSIS_ID).block()
        );
    }

    @Test
    void supportsMblockWithTheSameBoundedArchivePath() {
        installSource(archive, ".mblock");

        final CapabilityContent content = capability(immediateWork()).export(
            TOKEN, ANALYSIS_ID, request("scratchblocks", new AdvancedCapabilityDtos.ExportTarget("program", null, null))
        ).block();

        assertThat(content.bytes()).isNotEmpty();
        assertThat(content.sourceFormat()).isNull();
    }

    @Test
    void parsesTheRootOnceAndUsesTheExactTargetValues() throws IOException {
        final Program parsed = parser.parseFromString("synthetic", PROJECT_JSON);
        final Scratch3ParserService countingParser = mock(Scratch3ParserService.class);
        final ProjectArchiveInspector inspector = mock(ProjectArchiveInspector.class);
        when(countingParser.parseFromString(anyString(), anyString())).thenReturn(parsed);
        when(inspector.inspect(any())).thenReturn(
            new ProjectArchiveInspector.Inspection(PROJECT_JSON.getBytes(StandardCharsets.UTF_8), List.of())
        );
        final String spriteName = parsed.getActorDefinitionList().getDefinitions().stream()
            .filter(actor -> actor.isSprite())
            .findFirst()
            .orElseThrow()
            .getIdent()
            .getName();

        final CapabilityContent content = capability(immediateWork(), countingParser, inspector).export(
            TOKEN, ANALYSIS_ID,
            request("scratchblocks", new AdvancedCapabilityDtos.ExportTarget("sprite", spriteName, null))
        ).block();

        verify(countingParser).parseFromString("retained-project", PROJECT_JSON);
        assertThat(new String(content.bytes(), StandardCharsets.UTF_8)).contains(spriteName);
    }

    @Test
    void rejectsMissingAndAmbiguousTargets() throws IOException {
        assertCode(
            "target_not_found",
            () -> capability(immediateWork()).export(
                TOKEN, ANALYSIS_ID,
                request("scratchblocks", new AdvancedCapabilityDtos.ExportTarget("sprite", "does-not-exist", null))
            ).block()
        );

        final String duplicated = tools.jackson.databind.json.JsonMapper.shared().writeValueAsString(
            tools.jackson.databind.json.JsonMapper.shared().readTree(PROJECT_JSON)
        );
        final var root = (tools.jackson.databind.node.ObjectNode) tools.jackson.databind.json.JsonMapper.shared()
            .readTree(duplicated);
        final var targets = (tools.jackson.databind.node.ArrayNode) root.get("targets");
        final String duplicatedSpriteName = targets.get(1).path("name").textValue();
        targets.add(targets.get(1).deepCopy());
        installSource(archive(tools.jackson.databind.json.JsonMapper.shared().writeValueAsString(root)), ".sb3");

        assertCode(
            "target_not_found",
            () -> capability(immediateWork()).export(
                TOKEN, ANALYSIS_ID,
                request("scratchblocks", new AdvancedCapabilityDtos.ExportTarget("sprite", duplicatedSpriteName, null))
            ).block()
        );
    }

    @Test
    void validatesContradictoryMalformedAndUnsupportedRequestsBeforeStorageAccess() {
        final AdvancedCapabilityDtos.ExportRequest contradictory = request(
            "scratchblocks", new AdvancedCapabilityDtos.ExportTarget("program", "sprite", null)
        );
        assertThatThrownBy(() -> capability(immediateWork()).export(TOKEN, ANALYSIS_ID, contradictory).block())
            .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(
            () -> capability(immediateWork()).export(
                TOKEN, ANALYSIS_ID,
                request("leila", new AdvancedCapabilityDtos.ExportTarget("program", null, null))
            ).block()
        ).isInstanceOf(IllegalArgumentException.class);
        verifyNoInteractions(submissions, analyses, sourceArtifacts);
    }

    @Test
    void deniesCrossTokenReferencesAndMapsAnalysisStateAndRetention() {
        when(submissions.findByToken("other-token")).thenReturn(
            Mono.just(
                new Submission(SUBMISSION_ID + 1, "other-token", "SINGLE_PROJECT", "en", "COMPLETED", "ACTIVE", 1, 1, 0)
            )
        );
        assertCode(
            "analysis_not_found",
            () -> capability(immediateWork()).export("other-token", ANALYSIS_ID, programRequest()).block()
        );
        verifyNoInteractions(sourceArtifacts);

        when(submissions.findByToken(TOKEN)).thenReturn(
            Mono.just(new Submission(SUBMISSION_ID, TOKEN, "SINGLE_PROJECT", "en", "COMPLETED", "RELEASED", 1, 1, 0))
        );
        assertCode(
            "analysis_not_found", () -> capability(immediateWork()).export(TOKEN, ANALYSIS_ID, programRequest()).block()
        );

        when(submissions.findByToken(TOKEN)).thenReturn(
            Mono.just(new Submission(SUBMISSION_ID, TOKEN, "SINGLE_PROJECT", "en", "COMPLETED", "ACTIVE", 1, 1, 0))
        );
        when(analyses.findById(ANALYSIS_ID)).thenReturn(Mono.just(analysis("FAILED", ".sb3", archive)));
        assertCode(
            "analysis_not_ready", () -> capability(immediateWork()).export(TOKEN, ANALYSIS_ID, programRequest()).block()
        );
    }

    @Test
    void mapsMissingMetadataAndAllArtifactIntegrityFailuresToAnalysisNotFound() {
        when(sourceArtifacts.findMetadataById(ARTIFACT_ID)).thenReturn(Mono.empty());
        assertCode(
            "analysis_not_found", () -> capability(immediateWork()).export(TOKEN, ANALYSIS_ID, programRequest()).block()
        );

        when(sourceArtifacts.findMetadataById(ARTIFACT_ID)).thenReturn(
            Mono.just(new SourceArtifactMetadata(ARTIFACT_ID + 1, "UPLOAD", "{}"))
        );
        assertCode(
            "analysis_not_found", () -> capability(immediateWork()).export(TOKEN, ANALYSIS_ID, programRequest()).block()
        );

        when(sourceArtifacts.findMetadataById(ARTIFACT_ID)).thenReturn(Mono.just(metadata()));
        when(analyses.findById(ANALYSIS_ID))
            .thenReturn(Mono.just(analysis("DONE", ".sb3", "different".getBytes(StandardCharsets.UTF_8))));
        assertCode(
            "analysis_not_found", () -> capability(immediateWork()).export(TOKEN, ANALYSIS_ID, programRequest()).block()
        );

        when(analyses.findById(ANALYSIS_ID)).thenReturn(Mono.just(analysis("DONE", ".sb3", archive)));
        when(sourceArtifacts.open(any(byte[].class)))
            .thenReturn(Mono.just(new ByteArrayInputStream(new byte[] { 1, 2, 3 })));
        assertCode(
            "analysis_not_found", () -> capability(immediateWork()).export(TOKEN, ANALYSIS_ID, programRequest()).block()
        );
    }

    @Test
    void mapsMalformedNonProjectAndUnsupportedInputsToBoundedErrors() throws IOException {
        installSource("not-a-zip".getBytes(StandardCharsets.UTF_8), ".sb3");
        assertCode(
            "unsupported_source_format",
            () -> capability(immediateWork()).export(TOKEN, ANALYSIS_ID, programRequest()).block()
        );

        installSource(archive("{\"notTargets\":true}", "not-project.json"), ".sb3");
        assertCode(
            "unsupported_source_format",
            () -> capability(immediateWork()).export(TOKEN, ANALYSIS_ID, programRequest()).block()
        );

        installSource(archive, "json");
        assertCode(
            "unsupported_source_format",
            () -> capability(immediateWork()).export(TOKEN, ANALYSIS_ID, programRequest()).block()
        );
    }

    @Test
    void enforcesInputAstAndOutputCeilings() {
        configuration.getProgramExport().setMaxInputBytes(archive.length - 1L);
        assertCode(
            "capability_limit_exceeded",
            () -> capability(immediateWork()).export(TOKEN, ANALYSIS_ID, programRequest()).block()
        );

        configuration.getProgramExport().setMaxInputBytes(50L * 1024 * 1024);
        configuration.getProgramExport().setMaxAstNodes(1);
        assertCode(
            "capability_limit_exceeded",
            () -> capability(immediateWork()).export(TOKEN, ANALYSIS_ID, programRequest()).block()
        );

        configuration.getProgramExport().setMaxAstNodes(200_000);
        configuration.getProgramExport().setMaxOutputBytes(1);
        assertCode(
            "capability_limit_exceeded",
            () -> capability(immediateWork()).export(TOKEN, ANALYSIS_ID, programRequest()).block()
        );
    }

    @Test
    void closesStreamsOnTimeoutCancellationAndExecutorRejection() {
        final AtomicReference<TrackingInputStream> stream = new AtomicReference<>();
        when(sourceArtifacts.open(any(byte[].class))).thenAnswer(invocation -> {
            final TrackingInputStream opened = new TrackingInputStream(archive);
            stream.set(opened);
            return Mono.just(opened);
        });
        // Short enough that the stalled work is ended by the clock, which is what this third of the test is about.
        configuration.getProgramExport().setTimeout(Duration.ofMillis(10));
        assertCode(
            "capability_timeout", () -> capability(neverWork()).export(TOKEN, ANALYSIS_ID, programRequest()).block()
        );
        awaitClosed(stream);

        // Long enough that only the dispose below can end the work. Left at ten milliseconds this reads as a test of
        // cancellation and is a race against the clock from the previous third: a pause between subscribing and
        // disposing that outlasts the timeout — ordinary on a loaded runner — records a timeout and no cancellation.
        configuration.getProgramExport().setTimeout(Duration.ofSeconds(30));
        stream.set(null);
        final var disposable = capability(neverWork()).export(TOKEN, ANALYSIS_ID, programRequest()).subscribe();
        disposable.dispose();
        awaitClosed(stream);
        assertThat(
            meters.get("litterbox.capabilities.export.outcomes").tag("outcome", "cancelled").counter().count()
        ).isEqualTo(1.0);

        stream.set(null);
        assertCode(
            "capability_unavailable",
            () -> capability(rejectedWork()).export(TOKEN, ANALYSIS_ID, programRequest()).block()
        );
        awaitClosed(stream);
        assertThat(
            meters.get("litterbox.capabilities.export.rejections").tag("reason", "unavailable").counter().count()
        )
            .isEqualTo(1.0);
    }

    /**
     * The stream is closed as the work it was opened for is unwound, and unwinding runs on whichever thread ended the
     * work rather than on this one. Asserting the flag the instant {@code block} returns asks the two to have happened
     * in an order nothing promises; waiting asks for what the service actually undertakes, which is that no stream is
     * left open.
     */
    private static void awaitClosed(final AtomicReference<TrackingInputStream> stream) {
        await().atMost(Duration.ofSeconds(5))
            .until(() -> stream.get() != null && stream.get().closed);
    }

    @Test
    void keepsArchiveParsingAndRenderingOffTheEventLoop() {
        final AtomicReference<String> workerThread = new AtomicReference<>();
        final AnalysisWork bounded = new AnalysisWork() {

            @Override
            public <T> Mono<T> submit(final Callable<T> task) {
                return Mono.fromCallable(() -> {
                    workerThread.set(Thread.currentThread().getName());
                    return task.call();
                }).subscribeOn(Schedulers.boundedElastic());
            }
        };
        final Scheduler eventLoop = Schedulers.newSingle("synthetic-event-loop");
        try {
            Mono.just(programRequest())
                .publishOn(eventLoop)
                .flatMap(request -> capability(bounded).export(TOKEN, ANALYSIS_ID, request))
                .block(Duration.ofSeconds(2));
        }
        finally {
            eventLoop.dispose();
        }
        assertThat(workerThread).hasValueSatisfying(name -> assertThat(name).doesNotContain("synthetic-event-loop"));
    }

    @Test
    void keepsUserValuesOutOfMetricsAndResponses() {
        final String adversarial = "<script>\r\n/var/../sprite\"😀";
        assertCode(
            "target_not_found",
            () -> capability(immediateWork()).export(
                TOKEN, ANALYSIS_ID,
                request("scratchblocks", new AdvancedCapabilityDtos.ExportTarget("sprite", adversarial, null))
            ).block()
        );
        assertThat(meters.get("litterbox.capabilities.export.outcomes").tag("target_kind", "sprite").counter().count())
            .isEqualTo(1.0);
        assertThat(
            meters.getMeters().stream()
                .flatMap(meter -> meter.getId().getTags().stream())
                .toList()
        ).allSatisfy(tag -> assertThat(tag.getValue()).doesNotContain(adversarial));
    }

    private ProgramExportCapabilityService capability(final AnalysisWork work) {
        return capability(work, parser, new ProjectArchiveInspector());
    }

    private ProgramExportCapabilityService capability(
        final AnalysisWork work,
        final Scratch3ParserService selectedParser,
        final ProjectArchiveInspector inspector
    ) {
        return new ProgramExportCapabilityService(
            submissions, analyses, sourceArtifacts, work, selectedParser, inspector, configuration, meters
        );
    }

    private AdvancedCapabilityDtos.ExportRequest programRequest() {
        return request("scratchblocks", new AdvancedCapabilityDtos.ExportTarget("program", null, null));
    }

    private AdvancedCapabilityDtos.ExportRequest request(
        final String format,
        final AdvancedCapabilityDtos.ExportTarget target
    ) {
        return new AdvancedCapabilityDtos.ExportRequest(format, target);
    }

    private void installSource(final byte[] source, final String inputFormat) {
        archive = source;
        artifact = new SourceArtifact(
            ARTIFACT_ID, digest(source), source.length, "application/zip", "synthetic" + inputFormat
        );
        when(submissions.findByToken(TOKEN)).thenReturn(
            Mono.just(new Submission(SUBMISSION_ID, TOKEN, "SINGLE_PROJECT", "en", "COMPLETED", "ACTIVE", 1, 1, 0))
        );
        when(analyses.findById(ANALYSIS_ID)).thenReturn(Mono.just(analysis("DONE", inputFormat, source)));
        when(sourceArtifacts.findById(ARTIFACT_ID)).thenReturn(Mono.just(artifact));
        when(sourceArtifacts.findMetadataById(ARTIFACT_ID)).thenReturn(Mono.just(metadata()));
        when(sourceArtifacts.open(any(byte[].class))).thenAnswer(
            invocation -> Mono.just(new ByteArrayInputStream(source))
        );
    }

    private Analysis analysis(final String status, final String format, final byte[] source) {
        return new Analysis(
            ANALYSIS_ID, SUBMISSION_ID, ARTIFACT_ID, null, "NEW", "1", "1", "en", status, format,
            null, null, null, "all", "{}", digest(source), Map.of()
        );
    }

    private SourceArtifactMetadata metadata() {
        return new SourceArtifactMetadata(ARTIFACT_ID, "UPLOAD", "{\"format\":\"original-archive\",\"version\":1}");
    }

    private byte[] archive(final String projectJson) throws IOException {
        return archive(projectJson, "project.json");
    }

    private byte[] archive(final String content, final String name) throws IOException {
        final ByteArrayOutputStream output = new ByteArrayOutputStream();
        try (ZipOutputStream zip = new ZipOutputStream(output)) {
            zip.putNextEntry(new ZipEntry(name));
            zip.write(content.getBytes(StandardCharsets.UTF_8));
            zip.closeEntry();
        }
        return output.toByteArray();
    }

    private byte[] digest(final byte[] source) {
        try {
            return MessageDigest.getInstance("SHA-256").digest(source);
        }
        catch (NoSuchAlgorithmException exception) {
            throw new IllegalStateException(exception);
        }
    }

    private static String loadProjectJson() {
        try {
            return FixtureLoader.loadFixture("scratch_programs/boatRace.json");
        }
        catch (IOException exception) {
            throw new ExceptionInInitializerError(exception);
        }
    }

    private String emptyProject() {
        return """
            {
              "targets": [{
                "isStage": true,
                "name": "Stage",
                "variables": {},
                "lists": {},
                "broadcasts": {},
                "blocks": {},
                "comments": {},
                "currentCostume": 0,
                "costumes": [],
                "sounds": [],
                "volume": 100,
                "layerOrder": 0,
                "tempo": 60,
                "videoTransparency": 50,
                "videoState": "on",
                "textToSpeechLanguage": null
              }],
              "monitors": [],
              "extensions": [],
              "meta": {"semver": "3.0.0", "vm": "synthetic", "agent": "synthetic"}
            }
            """;
    }

    private AnalysisWork immediateWork() {
        return new AnalysisWork() {

            @Override
            public <T> Mono<T> submit(final Callable<T> task) {
                return Mono.fromCallable(task);
            }
        };
    }

    private AnalysisWork neverWork() {
        return new AnalysisWork() {

            @Override
            public <T> Mono<T> submit(final Callable<T> task) {
                return Mono.never();
            }
        };
    }

    private AnalysisWork rejectedWork() {
        return new AnalysisWork() {

            @Override
            public <T> Mono<T> submit(final Callable<T> task) {
                return Mono.error(new AnalysisCapacityExceededException());
            }
        };
    }

    private static final class TrackingInputStream extends ByteArrayInputStream {

        /** Written by whichever thread unwinds the work and read by the test thread, so the write must be seen. */
        private volatile boolean closed;

        private TrackingInputStream(final byte[] source) {
            super(source);
        }

        @Override
        public void close() {
            closed = true;
        }
    }
}
