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

import static de.uni_passau.fim.se2.litterbox_web.web_ui.capabilities.CapabilityAssertions.assertCode;
import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.argThat;
import static org.mockito.Mockito.clearInvocations;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Duration;
import java.util.HashMap;
import java.util.Map;
import java.util.concurrent.Callable;
import java.util.concurrent.atomic.AtomicReference;
import java.util.zip.ZipEntry;
import java.util.zip.ZipOutputStream;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import de.uni_passau.fim.se2.litterbox_web.shared.Scratch3ParserService;
import de.uni_passau.fim.se2.litterbox_web.util.FixtureLoader;
import de.uni_passau.fim.se2.litterbox_web.web_ui.capabilities.AdvancedCapabilitiesConfiguration;
import de.uni_passau.fim.se2.litterbox_web.web_ui.capabilities.AdvancedCapabilityDtos;
import de.uni_passau.fim.se2.litterbox_web.web_ui.execution.AnalysisCapacityExceededException;
import de.uni_passau.fim.se2.litterbox_web.web_ui.execution.AnalysisWork;
import de.uni_passau.fim.se2.litterbox_web.web_ui.persistence.Analysis;
import de.uni_passau.fim.se2.litterbox_web.web_ui.persistence.AnalysisRepository;
import de.uni_passau.fim.se2.litterbox_web.web_ui.persistence.SourceArtifact;
import de.uni_passau.fim.se2.litterbox_web.web_ui.persistence.SourceArtifactAccess;
import de.uni_passau.fim.se2.litterbox_web.web_ui.persistence.SourceArtifactMetadata;
import de.uni_passau.fim.se2.litterbox_web.web_ui.persistence.Submission;
import de.uni_passau.fim.se2.litterbox_web.web_ui.persistence.SubmissionRepository;
import de.uni_passau.fim.se2.litterbox_web.web_ui.single_project.ProjectArchiveInspector;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import reactor.core.publisher.Mono;
import reactor.core.scheduler.Scheduler;
import reactor.core.scheduler.Schedulers;

class SemanticDiffCapabilityServiceTest {

    private static final String BOAT_RACE_FIXTURE = "scratch_programs/boatRace.json";

    private static final String BEFORE_TOKEN = "before-token";
    private static final String AFTER_TOKEN = "after-token";
    private static final long BEFORE_SUBMISSION = 41;
    private static final long AFTER_SUBMISSION = 42;
    private static final long BEFORE_ANALYSIS = 71;
    private static final long AFTER_ANALYSIS = 72;
    private static final long BEFORE_ARTIFACT = 81;
    private static final long AFTER_ARTIFACT = 82;

    private final SubmissionRepository submissions = mock(SubmissionRepository.class);
    private final AnalysisRepository analyses = mock(AnalysisRepository.class);
    private final SourceArtifactAccess sourceArtifacts = mock(SourceArtifactAccess.class);
    private final AdvancedCapabilitiesConfiguration configuration = new AdvancedCapabilitiesConfiguration();
    private final SimpleMeterRegistry meters = new SimpleMeterRegistry();
    private final Map<String, byte[]> sources = new HashMap<>();
    private byte[] beforeArchive;
    private byte[] afterArchive;

    @BeforeEach
    void setUp() throws IOException {
        beforeArchive = archive(FixtureLoader.loadFixture(BOAT_RACE_FIXTURE));
        afterArchive = beforeArchive.clone();
        installSources(".sb3", ".sb3");
    }

    @Test
    void comparesIdenticalProjectsWithStableEmptyResult() throws Exception {
        final AdvancedCapabilityDtos.DiffRequest request = request();
        final SemanticDiffCapabilityService capability = capability(immediateWork());

        final AdvancedCapabilityDtos.DiffView first = capability.compare(request).block(Duration.ofSeconds(2));
        final AdvancedCapabilityDtos.DiffView second = capability.compare(request).block(Duration.ofSeconds(2));

        assertThat(first).isEqualTo(second);
        assertThat(first.schemaVersion()).isEqualTo(AdvancedCapabilityDtos.SCHEMA_VERSION);
        // The submitted file names the side. Nothing writes an analysis a project name today, so asserting the
        // literals "before" and "after" here was asserting that the reader is told nothing.
        assertThat(first.before())
            .isEqualTo(new AdvancedCapabilityDtos.SourceView(BEFORE_ANALYSIS, "synthetic.sb3"));
        assertThat(first.after())
            .isEqualTo(new AdvancedCapabilityDtos.SourceView(AFTER_ANALYSIS, "synthetic.sb3"));
        assertThat(first.counts().fixed()).isZero();
        assertThat(first.counts().newIssues()).isZero();
        assertThat(first.counts().removed()).isZero();
        assertThat(first.counts().persisting()).isGreaterThan(0);
        assertThat(first.counts().beforeTotal()).isEqualTo(first.counts().persisting());
        assertThat(first.counts().afterTotal()).isEqualTo(first.counts().persisting());
        assertThat(first.fixed()).isEmpty();
        assertThat(first.newIssues()).isEmpty();
        assertThat(first.persisting()).hasSize(first.counts().persisting());
        assertThat(first.removed()).isEmpty();
        assertThat(first.actors()).isEmpty();

        final byte[] serialized = tools.jackson.databind.json.JsonMapper.shared().writeValueAsBytes(first);
        assertThat(serialized).isEqualTo(tools.jackson.databind.json.JsonMapper.shared().writeValueAsBytes(second));
    }

    @Test
    void preservesFixedNewPersistingAndRemovedIssueCategories() throws Exception {
        final String originalJson = FixtureLoader.loadFixture(BOAT_RACE_FIXTURE);
        final String fixedJson = withGateRotationInitialization(originalJson);

        beforeArchive = archive(originalJson);
        afterArchive = archive(fixedJson);
        installSources(".sb3", ".sb3");
        final AdvancedCapabilityDtos.DiffView fixed = capability(immediateWork()).compare(request()).block();

        assertThat(fixed.fixed()).isNotEmpty();
        assertThat(fixed.persisting()).isNotEmpty();

        beforeArchive = archive(fixedJson);
        afterArchive = archive(originalJson);
        installSources(".sb3", ".sb3");
        final AdvancedCapabilityDtos.DiffView added = capability(immediateWork()).compare(request()).block();

        assertThat(added.newIssues()).isNotEmpty();
        assertThat(added.persisting()).isNotEmpty();

        beforeArchive = archive(originalJson);
        afterArchive = archive(stageOnly(originalJson));
        installSources(".sb3", ".sb3");
        final AdvancedCapabilityDtos.DiffView removed = capability(immediateWork()).compare(request()).block();

        assertThat(removed.removed()).isNotEmpty();
    }

    @Test
    void mapsStructuralActorAndScriptChangesAndKeepsOrderingStable() throws Exception {
        final String json = FixtureLoader.loadFixture(BOAT_RACE_FIXTURE);
        afterArchive = archive(json.replace("\"Stage\"", "\"<script>/tmp/changed-stage\""));
        installSources(".sb3", ".sb3");

        final AdvancedCapabilityDtos.DiffView view = capability(immediateWork()).compare(request()).block();

        assertThat(view.actors()).isNotEmpty();
        assertThat(view.actors()).allSatisfy(actor -> assertThat(actor.scripts()).isNotEmpty());
        assertThat(view.actors()).extracting(AdvancedCapabilityDtos.ActorDiffView::stage)
            .contains(true);
        assertThat(view.actors()).flatExtracting(AdvancedCapabilityDtos.ActorDiffView::scripts)
            .extracting(AdvancedCapabilityDtos.ScriptDiffView::changeType)
            .contains("added", "deleted");
        assertThat(view.actors()).isSortedAccordingTo(
            java.util.Comparator.comparing(AdvancedCapabilityDtos.ActorDiffView::stage).reversed()
                .thenComparing(AdvancedCapabilityDtos.ActorDiffView::actorName)
        );
        assertThat(view.actors()).allSatisfy(
            actor -> assertThat(actor.scripts()).isSortedAccordingTo(
                java.util.Comparator.comparing(AdvancedCapabilityDtos.ScriptDiffView::changeType)
            )
        );
        assertThat(view.actors().stream().map(AdvancedCapabilityDtos.ActorDiffView::actorName).toList())
            .anyMatch(name -> name.contains("<script>"));
    }

    @Test
    void supportsMblockAndReversedInputsWithoutPathIdentity() throws Exception {
        final String json = FixtureLoader.loadFixture(BOAT_RACE_FIXTURE);
        beforeArchive = archive(json);
        afterArchive = archive(json.replace("\"Stage\"", "\"After\""));
        installSources(".mblock", ".mblock");

        final AdvancedCapabilityDtos.DiffView forward = capability(immediateWork()).compare(request()).block();
        final AdvancedCapabilityDtos.DiffView reverse = capability(immediateWork()).compare(
            new AdvancedCapabilityDtos.DiffRequest(request().after(), request().before())
        ).block();

        assertThat(forward.before().analysisId()).isEqualTo(BEFORE_ANALYSIS);
        assertThat(forward.after().analysisId()).isEqualTo(AFTER_ANALYSIS);
        assertThat(reverse.before().analysisId()).isEqualTo(AFTER_ANALYSIS);
        assertThat(reverse.after().analysisId()).isEqualTo(BEFORE_ANALYSIS);
        assertThat(tools.jackson.databind.json.JsonMapper.shared().writeValueAsString(forward))
            .doesNotContain(BEFORE_TOKEN, AFTER_TOKEN, "sha256", "project.json", "/Users/");
    }

    @Test
    void namesEachSideByItsProjectNameThenItsFileAndOnlyThenByItsPosition() throws Exception {
        installSources(".sb3", ".sb3");
        // A name recorded against the analysis is the most deliberate one there is, so it wins.
        when(analyses.findById(BEFORE_ANALYSIS)).thenReturn(
            Mono.just(analysis(BEFORE_ANALYSIS, BEFORE_SUBMISSION, beforeArchive, ".sb3", "DONE", "Cat chase"))
        );
        // An artifact that no longer remembers what it was called leaves nothing but the position.
        when(
            sourceArtifacts.findForAnalysis(argThat(read -> read != null && read.sourceArtifactId() == AFTER_ARTIFACT))
        )
            .thenReturn(
                Mono.just(
                    new SourceArtifact(
                        AFTER_ARTIFACT, digest(afterArchive), afterArchive.length,
                        "application/zip", null
                    )
                )
            );

        final AdvancedCapabilityDtos.DiffView result = capability(immediateWork()).compare(request()).block();

        assertThat(result.before().name()).isEqualTo("Cat chase");
        assertThat(result.after().name()).isEqualTo("after");
    }

    @Test
    void stripsSeparatorsAndControlCharactersFromASubmittedFileName() throws Exception {
        installSources(".sb3", ".sb3");
        when(
            sourceArtifacts.findForAnalysis(argThat(read -> read != null && read.sourceArtifactId() == BEFORE_ARTIFACT))
        )
            .thenReturn(
                Mono.just(
                    new SourceArtifact(
                        BEFORE_ARTIFACT, digest(beforeArchive), beforeArchive.length,
                        "application/zip", "../etc/pass\nwd.sb3"
                    )
                )
            );

        final AdvancedCapabilityDtos.DiffView result = capability(immediateWork()).compare(request()).block();

        assertThat(result.before().name()).isEqualTo(".._etc_pass_wd.sb3");
    }

    @Test
    void authorizesBothTokensAndDeniesCrossTokenReferencesBeforeArtifactAccess() {
        final SemanticDiffCapabilityService capability = capability(immediateWork());

        final AdvancedCapabilityDtos.DiffView result = capability.compare(request()).block();
        assertThat(result.before().analysisId()).isEqualTo(BEFORE_ANALYSIS);

        clearInvocations(sourceArtifacts);
        final AdvancedCapabilityDtos.DiffRequest beforeCrossed = new AdvancedCapabilityDtos.DiffRequest(
            new AdvancedCapabilityDtos.AnalysisReference(AFTER_TOKEN, BEFORE_ANALYSIS), request().after()
        );
        assertCode("analysis_not_found", () -> capability.compare(beforeCrossed).block());
        verifyNoInteractions(sourceArtifacts);

        clearInvocations(sourceArtifacts);
        final AdvancedCapabilityDtos.DiffRequest afterCrossed = new AdvancedCapabilityDtos.DiffRequest(
            request().before(),
            new AdvancedCapabilityDtos.AnalysisReference(BEFORE_TOKEN, AFTER_ANALYSIS)
        );
        assertCode("analysis_not_found", () -> capability.compare(afterCrossed).block());
        verifyNoInteractions(sourceArtifacts);
    }

    @Test
    void mapsMissingFailedAndIncompleteInputsToStableErrors() {
        when(submissions.findByToken("missing-token")).thenReturn(Mono.empty());
        assertCode(
            "analysis_not_found",
            () -> capability(immediateWork()).compare(
                new AdvancedCapabilityDtos.DiffRequest(
                    new AdvancedCapabilityDtos.AnalysisReference("missing-token", BEFORE_ANALYSIS), request().after()
                )
            ).block()
        );

        when(analyses.findById(BEFORE_ANALYSIS)).thenReturn(
            Mono.just(
                analysis(
                    BEFORE_ANALYSIS, BEFORE_SUBMISSION, beforeArchive, ".sb3", "FAILED", null
                )
            )
        );
        assertCode("analysis_not_ready", () -> capability(immediateWork()).compare(request()).block());

        when(analyses.findById(BEFORE_ANALYSIS)).thenReturn(
            Mono.just(
                analysis(
                    BEFORE_ANALYSIS, BEFORE_SUBMISSION, beforeArchive, ".sb3", "RUNNING", null
                )
            )
        );
        assertCode("analysis_not_ready", () -> capability(immediateWork()).compare(request()).block());
    }

    @Test
    void mapsMissingArtifactsMetadataAndDigestMismatchesWithoutDisclosure() {
        when(
            sourceArtifacts.findForAnalysis(argThat(read -> read != null && read.sourceArtifactId() == BEFORE_ARTIFACT))
        )
            .thenReturn(Mono.empty());
        assertCode("analysis_not_found", () -> capability(immediateWork()).compare(request()).block());

        when(
            sourceArtifacts.findForAnalysis(argThat(read -> read != null && read.sourceArtifactId() == BEFORE_ARTIFACT))
        )
            .thenReturn(
                Mono.just(
                    artifact(
                        BEFORE_ARTIFACT, beforeArchive, ".sb3"
                    )
                )
            );
        when(sourceArtifacts.findMetadataById(BEFORE_ARTIFACT)).thenReturn(
            Mono.just(
                new SourceArtifactMetadata(AFTER_ARTIFACT, "UPLOAD", "{}")
            )
        );
        assertCode("analysis_not_found", () -> capability(immediateWork()).compare(request()).block());

        final Analysis mismatched = new Analysis(
            BEFORE_ANALYSIS, BEFORE_SUBMISSION, BEFORE_ARTIFACT, null, "NEW", "1", "1", "en", "DONE", ".sb3",
            null, null, null, "all", "{}", digest(afterArchive), Map.of()
        );
        when(analyses.findById(BEFORE_ANALYSIS)).thenReturn(Mono.just(mismatched));
        assertCode("analysis_not_found", () -> capability(immediateWork()).compare(request()).block());
    }

    @Test
    void rejectsMalformedNonProjectAndUnsupportedArchives() throws IOException {
        beforeArchive = "not-a-zip".getBytes(StandardCharsets.UTF_8);
        afterArchive = archive("{\"notTargets\":true}", "not-project.json");
        installSources(".sb3", ".sb3");
        assertCode("unsupported_source_format", () -> capability(immediateWork()).compare(request()).block());

        when(analyses.findById(BEFORE_ANALYSIS)).thenReturn(
            Mono.just(
                analysis(
                    BEFORE_ANALYSIS, BEFORE_SUBMISSION, beforeArchive, "json", "DONE", null
                )
            )
        );
        assertCode("unsupported_source_format", () -> capability(immediateWork()).compare(request()).block());
    }

    @Test
    void enforcesIndependentInputAstAndResponseCeilings() throws IOException {
        final byte[] padded = archive(
            FixtureLoader.loadFixture(BOAT_RACE_FIXTURE), "padding.bin", 1_000_000
        );
        beforeArchive = archive(FixtureLoader.loadFixture(BOAT_RACE_FIXTURE));
        afterArchive = padded;
        installSources(".sb3", ".sb3");
        configuration.getSemanticDiff().setMaxInputBytes(beforeArchive.length + 1L);
        assertCode("capability_limit_exceeded", () -> capability(immediateWork()).compare(request()).block());

        configuration.getSemanticDiff().setMaxInputBytes(50L * 1024 * 1024);
        configuration.getSemanticDiff().setMaxAstNodesPerInput(1);
        assertCode("capability_limit_exceeded", () -> capability(immediateWork()).compare(request()).block());

        configuration.getSemanticDiff().setMaxAstNodesPerInput(200_000);
        configuration.getSemanticDiff().setMaxResponseBytes(1);
        assertCode("capability_limit_exceeded", () -> capability(immediateWork()).compare(request()).block());
    }

    @Test
    @SuppressWarnings("checkstyle:LambdaBodyLength")
    void closesBothStreamsOnTimeoutAndExecutorRejection() {
        try {
            afterArchive = archive(
                FixtureLoader.loadFixture(BOAT_RACE_FIXTURE).replace("\"Stage\"", "\"After\"")
            );
        }
        catch (IOException exception) {
            throw new AssertionError(exception);
        }
        installSources(".sb3", ".sb3");
        final AtomicReference<TrackingInputStream> beforeStream = new AtomicReference<>();
        final AtomicReference<TrackingInputStream> afterStream = new AtomicReference<>();
        when(sourceArtifacts.open(any(byte[].class))).thenAnswer(invocation -> {
            final byte[] source = sources.get(hex(invocation.getArgument(0)));
            final TrackingInputStream stream = new TrackingInputStream(source);
            if (hex(invocation.getArgument(0)).equals(hex(digest(beforeArchive)))) {
                beforeStream.set(stream);
            }
            else {
                afterStream.set(stream);
            }
            return Mono.just(stream);
        });
        configuration.getSemanticDiff().setTimeout(Duration.ofMillis(10));
        assertCode("capability_timeout", () -> capability(neverWork()).compare(request()).block());
        assertThat(beforeStream.get().closed).isTrue();
        assertThat(afterStream.get().closed).isTrue();

        beforeStream.set(null);
        afterStream.set(null);
        assertCode(
            "capability_unavailable", () -> capability(rejectedWork()).compare(request()).block()
        );
        assertThat(beforeStream.get().closed).isTrue();
        assertThat(afterStream.get().closed).isTrue();
        assertThat(
            meters.get("litterbox.capabilities.diff.rejections")
                .tag("reason", "unavailable").counter().count()
        ).isEqualTo(1.0);
    }

    @Test
    void keepsTheEventLoopFreeOfParsingAndDiffWork() {
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
            Mono.just(request()).publishOn(eventLoop)
                .flatMap(value -> capability(bounded).compare(value))
                .block(Duration.ofSeconds(2));
        }
        finally {
            eventLoop.dispose();
        }
        assertThat(workerThread).hasValueSatisfying(name -> assertThat(name).doesNotContain("synthetic-event-loop"));
    }

    private SemanticDiffCapabilityService capability(final AnalysisWork work) {
        return new SemanticDiffCapabilityService(
            submissions, analyses, sourceArtifacts, work, new Scratch3ParserService(),
            new ProjectArchiveInspector(), configuration, meters
        );
    }

    private AdvancedCapabilityDtos.DiffRequest request() {
        return new AdvancedCapabilityDtos.DiffRequest(
            new AdvancedCapabilityDtos.AnalysisReference(BEFORE_TOKEN, BEFORE_ANALYSIS),
            new AdvancedCapabilityDtos.AnalysisReference(AFTER_TOKEN, AFTER_ANALYSIS)
        );
    }

    private void installSources(final String beforeFormat, final String afterFormat) {
        sources.clear();
        sources.put(hex(digest(beforeArchive)), beforeArchive);
        sources.put(hex(digest(afterArchive)), afterArchive);
        when(submissions.findByToken(BEFORE_TOKEN)).thenReturn(
            Mono.just(
                submission(BEFORE_SUBMISSION, BEFORE_TOKEN)
            )
        );
        when(submissions.findByToken(AFTER_TOKEN)).thenReturn(
            Mono.just(
                submission(AFTER_SUBMISSION, AFTER_TOKEN)
            )
        );
        when(analyses.findById(BEFORE_ANALYSIS)).thenReturn(
            Mono.just(
                analysis(BEFORE_ANALYSIS, BEFORE_SUBMISSION, beforeArchive, beforeFormat, "DONE", null)
            )
        );
        when(analyses.findById(AFTER_ANALYSIS)).thenReturn(
            Mono.just(
                analysis(AFTER_ANALYSIS, AFTER_SUBMISSION, afterArchive, afterFormat, "DONE", null)
            )
        );
        when(
            sourceArtifacts.findForAnalysis(argThat(read -> read != null && read.sourceArtifactId() == BEFORE_ARTIFACT))
        )
            .thenReturn(
                Mono.just(
                    artifact(BEFORE_ARTIFACT, beforeArchive, beforeFormat)
                )
            );
        when(
            sourceArtifacts.findForAnalysis(argThat(read -> read != null && read.sourceArtifactId() == AFTER_ARTIFACT))
        )
            .thenReturn(
                Mono.just(
                    artifact(AFTER_ARTIFACT, afterArchive, afterFormat)
                )
            );
        when(sourceArtifacts.findMetadataById(BEFORE_ARTIFACT)).thenReturn(Mono.just(metadata(BEFORE_ARTIFACT)));
        when(sourceArtifacts.findMetadataById(AFTER_ARTIFACT)).thenReturn(Mono.just(metadata(AFTER_ARTIFACT)));
        when(sourceArtifacts.open(any(byte[].class))).thenAnswer(invocation -> {
            final byte[] source = sources.get(hex(invocation.getArgument(0)));
            return Mono.just(new TrackingInputStream(source));
        });
    }

    private Submission submission(final long id, final String token) {
        return new Submission(id, token, "SINGLE_PROJECT", "en", "COMPLETED", "ACTIVE", 1, 1, 0);
    }

    private Analysis analysis(
        final long id,
        final long submissionId,
        final byte[] source,
        final String format,
        final String status,
        final String projectName
    ) {
        return new Analysis(
            id, submissionId, id == BEFORE_ANALYSIS ? BEFORE_ARTIFACT : AFTER_ARTIFACT, projectName,
            "NEW", "1", "1", "en", status, format, null, null, null, "all", "{}", digest(source), Map.of()
        );
    }

    private SourceArtifact artifact(final long id, final byte[] source, final String format) {
        return new SourceArtifact(id, digest(source), source.length, "application/zip", "synthetic" + format);
    }

    private SourceArtifactMetadata metadata(final long id) {
        return new SourceArtifactMetadata(id, "UPLOAD", "{\"format\":\"original-archive\",\"version\":1}");
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

    private byte[] archive(final String projectJson, final String paddingName, final int paddingBytes)
        throws IOException {
        final ByteArrayOutputStream output = new ByteArrayOutputStream();
        try (ZipOutputStream zip = new ZipOutputStream(output)) {
            zip.putNextEntry(new ZipEntry("project.json"));
            zip.write(projectJson.getBytes(StandardCharsets.UTF_8));
            zip.closeEntry();
            zip.putNextEntry(new ZipEntry(paddingName));
            zip.write(new byte[paddingBytes]);
            zip.closeEntry();
        }
        return output.toByteArray();
    }

    private String withGateRotationInitialization(final String json) {
        final String updated = json
            .replace(
                "\"next\": \"U91PmH1F4s%G@iYv{@eo\"",
                "\"next\": \"synthetic-rotation-init\""
            )
            .replace(
                "\"parent\": \"n2:qJ.(VMzR1er{AXAin\"",
                "\"parent\": \"synthetic-rotation-init\""
            );
        final String initialization = "\"synthetic-rotation-init\": {"
            + "\"opcode\": \"motion_pointindirection\","
            + "\"next\": \"U91PmH1F4s%G@iYv{@eo\","
            + "\"parent\": \"n2:qJ.(VMzR1er{AXAin\","
            + "\"inputs\": {\"DIRECTION\": [1, [8, 0]]},"
            + "\"fields\": {},\"shadow\": false,\"topLevel\": false},";
        return updated.replace(
            "\"U91PmH1F4s%G@iYv{@eo\": {",
            initialization + "\"U91PmH1F4s%G@iYv{@eo\": {"
        );
    }

    private String stageOnly(final String json) {
        final var mapper = tools.jackson.databind.json.JsonMapper.shared();
        final var root = (tools.jackson.databind.node.ObjectNode) mapper.readTree(json);
        final var targets = (tools.jackson.databind.node.ArrayNode) root.get("targets");
        final var stageTargets = mapper.createArrayNode().add(targets.get(0).deepCopy());
        root.set("targets", stageTargets);
        return mapper.writeValueAsString(root);
    }

    private byte[] digest(final byte[] value) {
        try {
            return MessageDigest.getInstance("SHA-256").digest(value);
        }
        catch (NoSuchAlgorithmException exception) {
            throw new IllegalStateException(exception);
        }
    }

    private String hex(final byte[] value) {
        return java.util.HexFormat.of().formatHex(value);
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

        private boolean closed;

        private TrackingInputStream(final byte[] source) {
            super(source);
        }

        @Override
        public void close() {
            closed = true;
        }
    }
}
