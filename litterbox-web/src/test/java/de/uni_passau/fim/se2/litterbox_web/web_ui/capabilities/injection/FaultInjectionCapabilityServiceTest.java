/*
 * Copyright (C) 2024-2026 LitterBox-Web contributors
 *
 * This file is part of LitterBox-Web.
 * Licenced under the EUPL-1.2 or later.
 *
 * SPDX-FileCopyrightText: 2024-2026 LitterBox-Web contributors
 * SPDX-License-Identifier: EUPL-1.2
 */
package de.uni_passau.fim.se2.litterbox_web.web_ui.capabilities.injection;

import static de.uni_passau.fim.se2.litterbox_web.web_ui.capabilities.CapabilityAssertions.assertCode;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.awaitility.Awaitility.await;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.reset;
import static org.mockito.Mockito.when;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Duration;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.concurrent.Callable;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicReference;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;
import java.util.zip.ZipOutputStream;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import de.uni_passau.fim.se2.litterbox.ast.model.Program;
import de.uni_passau.fim.se2.litterbox_web.shared.Scratch3ParserService;
import de.uni_passau.fim.se2.litterbox_web.util.FixtureLoader;
import de.uni_passau.fim.se2.litterbox_web.web_ui.capabilities.AdvancedCapabilitiesConfiguration;
import de.uni_passau.fim.se2.litterbox_web.web_ui.capabilities.AdvancedCapabilityDtos;
import de.uni_passau.fim.se2.litterbox_web.web_ui.capabilities.CapabilityContent;
import de.uni_passau.fim.se2.litterbox_web.web_ui.capabilities.CapabilityException;
import de.uni_passau.fim.se2.litterbox_web.web_ui.catalogue.PatternCatalogueService;
import de.uni_passau.fim.se2.litterbox_web.web_ui.execution.AnalysisCapacityExceededException;
import de.uni_passau.fim.se2.litterbox_web.web_ui.execution.AnalysisWork;
import de.uni_passau.fim.se2.litterbox_web.web_ui.persistence.Analysis;
import de.uni_passau.fim.se2.litterbox_web.web_ui.persistence.AnalysisRepository;
import de.uni_passau.fim.se2.litterbox_web.web_ui.persistence.SourceArtifact;
import de.uni_passau.fim.se2.litterbox_web.web_ui.persistence.SourceArtifactAccess;
import de.uni_passau.fim.se2.litterbox_web.web_ui.persistence.SourceArtifactMetadata;
import de.uni_passau.fim.se2.litterbox_web.web_ui.persistence.Submission;
import de.uni_passau.fim.se2.litterbox_web.web_ui.persistence.SubmissionRepository;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import reactor.core.publisher.Mono;

class FaultInjectionCapabilityServiceTest {

    private static final String ENGLISH = "en";
    private static final String SYNTHETIC_PROJECT = "synthetic-project";
    private static final String PROJECT_JSON = "project.json";

    private static final String TOKEN = "synthetic-injection-token";
    private static final long SUBMISSION_ID = 41;
    private static final long ANALYSIS_ID = 71;
    private static final long ARTIFACT_ID = 81;

    private final SubmissionRepository submissions = mock(SubmissionRepository.class);
    private final AnalysisRepository analyses = mock(AnalysisRepository.class);
    private final SourceArtifactAccess sourceArtifacts = mock(SourceArtifactAccess.class);
    private final AdvancedCapabilitiesConfiguration configuration = new AdvancedCapabilitiesConfiguration();
    private final Scratch3ParserService parser = new Scratch3ParserService();
    private final SimpleMeterRegistry meters = new SimpleMeterRegistry();
    private byte[] archive;
    private byte[] originalArchive;
    private String injectorId;

    @BeforeEach
    void setUp() throws Exception {
        reset(submissions, analyses, sourceArtifacts);
        configuration.getFaultInjection().setEnabled(true);
        final String projectJson = projectWithoutAssets();
        archive = archive(projectJson);
        originalArchive = archive.clone();
        final SourceArtifact artifact = new SourceArtifact(
            ARTIFACT_ID, digest(archive), archive.length, "application/zip", "synthetic.sb3"
        );
        when(submissions.findByToken(TOKEN)).thenReturn(
            Mono.just(new Submission(SUBMISSION_ID, TOKEN, "SINGLE_PROJECT", ENGLISH, "COMPLETED", "ACTIVE", 1, 1, 0))
        );
        when(analyses.findById(ANALYSIS_ID)).thenReturn(
            Mono.just(
                new Analysis(
                    ANALYSIS_ID, SUBMISSION_ID, ARTIFACT_ID, SYNTHETIC_PROJECT, "NEW", "1", "1", ENGLISH, "DONE",
                    ".sb3", null, null, null, "all", "{}", digest(archive), Map.of()
                )
            )
        );
        when(sourceArtifacts.findById(ARTIFACT_ID)).thenReturn(Mono.just(artifact));
        when(sourceArtifacts.findMetadataById(ARTIFACT_ID)).thenReturn(
            Mono.just(new SourceArtifactMetadata(ARTIFACT_ID, "UPLOAD", "{}"))
        );
        when(sourceArtifacts.open(any(byte[].class))).thenAnswer(
            ignored -> Mono.just(new ByteArrayInputStream(archive))
        );
        injectorId = applicableInjector(projectJson);
    }

    @Test
    void listsCanonicalInjectorsWithCatalogueTextForEverySupportedLocale() {
        final FaultInjectionCapabilityService capability = capability();
        for (String locale : List.of("de", ENGLISH, "es", "nl")) {
            final List<AdvancedCapabilityDtos.InjectorView> views = capability.injectors(TOKEN, ANALYSIS_ID, locale)
                .block();
            assertThat(views).isNotEmpty();
            assertThat(views).extracting(AdvancedCapabilityDtos.InjectorView::injectorId)
                .containsExactlyElementsOf(injectorIds());
            assertThat(views).allSatisfy(view -> {
                assertThat(view.finderId()).isNotBlank();
                assertThat(view.name()).isNotBlank();
                assertThat(view.description()).isNotBlank();
            });
        }
    }

    @Test
    void advertisesTheEffectiveExplicitLimitAndResolvesAllInjectorsServerSide() {
        final FaultInjectionCapabilityService capability = capability();
        final AdvancedCapabilityDtos.InjectorCatalogueView catalogue = capability.injectorCatalogue(
            TOKEN, ANALYSIS_ID, ENGLISH
        ).block();

        assertThat(catalogue).isNotNull();
        assertThat(catalogue.maxSelectedInjectors()).isEqualTo(8);
        assertThat(catalogue.allSelectionSupported()).isTrue();
        assertThat(catalogue.injectors()).extracting(AdvancedCapabilityDtos.InjectorView::injectorId)
            .containsExactlyElementsOf(injectorIds());

        final AdvancedCapabilityDtos.InjectionPreview preview = capability.preview(
            TOKEN, ANALYSIS_ID, new AdvancedCapabilityDtos.InjectionRequest(List.of(), true)
        ).block();
        final List<String> resolved = new ArrayList<>();
        preview.results().forEach(result -> resolved.add(result.injectorId()));
        preview.failures().forEach(failure -> resolved.add(failure.injectorId()));
        assertThat(new HashSet<>(resolved)).containsExactlyInAnyOrderElementsOf(injectorIds());
    }

    @Test
    void previewsAndDownloadsAnExactMutationWithStableIndicesAndSourceFormat() throws IOException {
        InjectionArchiveCodec.inspect(
            archive, new InjectionArchiveCodec.Limits(2_000, 100L * 1024 * 1024, 100L * 1024 * 1024, 25L * 1024 * 1024)
        );
        final FaultInjectionCapabilityService capability = capability();
        final AdvancedCapabilityDtos.InjectionPreview preview = capability.preview(
            TOKEN, ANALYSIS_ID, new AdvancedCapabilityDtos.InjectionRequest(List.of(injectorId))
        ).block();

        assertThat(preview.results()).isNotEmpty();
        assertThat(preview.results()).extracting(AdvancedCapabilityDtos.InjectionResultView::resultIndex)
            .containsExactly(0);
        final AdvancedCapabilityDtos.InjectionResultView selected = preview.results().getFirst();
        final CapabilityContent download = capability.download(
            TOKEN, ANALYSIS_ID, new AdvancedCapabilityDtos.InjectionDownloadRequest(injectorId, selected.resultIndex())
        ).block();

        assertThat(download.sourceFormat()).isEqualTo("sb3");
        assertThat(download.bytes()).isNotEmpty();
        assertThat(archive).isEqualTo(originalArchive);
        assertThat(projectJson(download.bytes())).contains("targets");
        assertThat(entries(download.bytes()).keySet()).containsExactly(PROJECT_JSON);
    }

    @Test
    void supportsMultipleInjectorsAndSelectsAStableResultByInjectorAndIndex() throws IOException {
        final Program program = parser.parseFromString(SYNTHETIC_PROJECT, projectWithoutAssets());
        final InjectionService service = new InjectionService();
        final String multiResultInjector = injectorIds().stream()
            .filter(id -> service.inject(program, List.of(id)).results().size() > 1)
            .findFirst()
            .orElseThrow(() -> new AssertionError("Synthetic fixture has no multi-result injector"));
        final List<String> selected = java.util.stream.Stream.concat(
            java.util.stream.Stream.of(multiResultInjector),
            injectorIds().stream()
                .filter(id -> !id.equals(multiResultInjector))
                .filter(id -> !service.inject(program, List.of(id)).results().isEmpty())
        ).distinct().limit(2).toList();

        assertThat(selected).hasSize(2);
        final AdvancedCapabilityDtos.InjectionPreview preview = capability().preview(
            TOKEN, ANALYSIS_ID, new AdvancedCapabilityDtos.InjectionRequest(selected)
        ).block();
        assertThat(preview.results()).extracting(AdvancedCapabilityDtos.InjectionResultView::injectorId)
            .containsAll(selected);

        final int resultIndex = preview.results().stream()
            .filter(result -> result.injectorId().equals(multiResultInjector))
            .mapToInt(AdvancedCapabilityDtos.InjectionResultView::resultIndex)
            .max()
            .orElseThrow(() -> new AssertionError("Multi-result injector was not returned"));
        final CapabilityContent downloaded = capability().download(
            TOKEN, ANALYSIS_ID,
            new AdvancedCapabilityDtos.InjectionDownloadRequest(multiResultInjector, resultIndex)
        ).block();

        assertThat(downloaded.bytes()).isNotEmpty();
        assertThat(archive).isEqualTo(originalArchive);
    }

    @Test
    void bundlesEveryMutationTheSelectionProducesIntoOneUsableArchive() throws IOException {
        final FaultInjectionCapabilityService capability = capability();
        final AdvancedCapabilityDtos.InjectionPreview preview = capability
            .preview(TOKEN, ANALYSIS_ID, new AdvancedCapabilityDtos.InjectionRequest(List.of(), true)).block();
        assertThat(preview.results()).hasSizeGreaterThan(1);

        final CapabilityContent bundle = capability
            .downloadAll(TOKEN, ANALYSIS_ID, new AdvancedCapabilityDtos.InjectionRequest(List.of(), true)).block();

        assertThat(bundle.sourceFormat()).isEqualTo("zip");
        final Map<String, byte[]> members = entries(bundle.bytes());
        // One project per mutation the preview showed, so what was on the page is what arrives in the archive.
        assertThat(members).hasSize(preview.results().size());
        assertThat(members.keySet()).allMatch(name -> name.matches("[A-Za-z0-9._-]+\\.sb3"));
        // A member is named for the injector that made it, so a reader can tell which fault is in which file.
        assertThat(members.keySet()).contains(
            preview.results().getFirst().injectorId().replaceAll("[^A-Za-z0-9_-]", "_") + "-1.sb3"
        );
        for (byte[] member : members.values()) {
            assertThat(projectJson(member)).contains("targets");
        }
        // Every member is a mutation, so none of them is the project that went in; two injectors reaching the same
        // mutation still each keep a file, because which injector produced it is part of what the reader asked for.
        final String original = new String(
            InjectionArchiveCodec.inspect(archive, codecLimits()).projectJson(), StandardCharsets.UTF_8
        );
        assertThat(members.values()).allSatisfy(member -> assertThat(projectJsonOf(member)).isNotEqualTo(original));
        assertThat(members.values().stream().map(this::projectJsonOf).distinct().count())
            .isGreaterThan(1);
        assertThat(archive).isEqualTo(originalArchive);
    }

    @Test
    void refusesToBundleMoreMutationsThanTheServiceWillCarry() {
        configuration.getFaultInjection().setMaxMutationResults(1);

        assertCode(
            "capability_limit_exceeded",
            () -> capability()
                .downloadAll(TOKEN, ANALYSIS_ID, new AdvancedCapabilityDtos.InjectionRequest(List.of(), true))
                .block()
        );
    }

    @Test
    void keepsInjectorUnavailableAndFailedOutcomesExplicit() {
        final List<InjectionService.SupportedInjector> descriptors = InjectionService.supportedInjectors()
            .subList(0, 2);
        final InjectionService synthetic = mock(InjectionService.class);
        when(synthetic.inject(any(), any())).thenReturn(
            new InjectionService.Response(
                List.of(
                    new InjectionService.InjectorOutcome(
                        descriptors.get(0).injectorId(), descriptors.get(0).finderId(), List.of(),
                        new InjectionService.Failure(
                            descriptors.get(0).injectorId(), descriptors.get(0).finderId(),
                            InjectionService.FailureCode.INJECTOR_FAILED
                        )
                    ),
                    new InjectionService.InjectorOutcome(
                        descriptors.get(1).injectorId(), descriptors.get(1).finderId(), List.of(),
                        new InjectionService.Failure(
                            descriptors.get(1).injectorId(), descriptors.get(1).finderId(),
                            InjectionService.FailureCode.INJECTOR_UNAVAILABLE
                        )
                    )
                )
            )
        );

        final AdvancedCapabilityDtos.InjectionPreview preview = capability(immediateWork(), synthetic).preview(
            TOKEN, ANALYSIS_ID,
            new AdvancedCapabilityDtos.InjectionRequest(
                List.of(descriptors.get(0).injectorId(), descriptors.get(1).injectorId())
            )
        ).block();

        assertThat(preview.results()).isEmpty();
        assertThat(preview.failures()).extracting(AdvancedCapabilityDtos.InjectionFailureView::code)
            .containsExactly("injector_failed", "injector_unavailable");
    }

    @Test
    void preservesAssetsAndExcludesPrivateBundleEntriesForSb3AndMblock() throws Exception {
        final byte[] costume = new byte[] { 1, 2, 3, 4 };
        final byte[] sound = new byte[] { 5, 6, 7, 8 };
        final String projectJson = projectWithAssets(costume, sound);
        final String costumeName = md5ext(costume, "png");
        final String soundName = md5ext(sound, "wav");
        final byte[] metadata = "{\"synthetic\":true}".getBytes(StandardCharsets.UTF_8);
        final String manifest = manifest(projectJson, metadata, costumeName, costume, soundName, sound);
        final byte[] source = archiveWithEntries(
            Map.of(
                PROJECT_JSON, projectJson.getBytes(StandardCharsets.UTF_8),
                costumeName, costume,
                soundName, sound,
                "notes.txt", "synthetic-note".getBytes(StandardCharsets.UTF_8),
                "litterbox/manifest.json", manifest.getBytes(StandardCharsets.UTF_8),
                "litterbox/metadata.json", metadata
            )
        );

        for (String format : List.of(".sb3", ".mblock")) {
            installSource(source, format);
            final FaultInjectionCapabilityService capability = capability();
            final AdvancedCapabilityDtos.InjectionPreview preview = capability.preview(
                TOKEN, ANALYSIS_ID, new AdvancedCapabilityDtos.InjectionRequest(List.of(injectorId))
            ).block();
            final CapabilityContent download = capability.download(
                TOKEN, ANALYSIS_ID,
                new AdvancedCapabilityDtos.InjectionDownloadRequest(
                    injectorId, preview.results().getFirst().resultIndex()
                )
            ).block();

            assertThat(download.sourceFormat()).isEqualTo(format.substring(1));
            assertThat(entries(download.bytes())).containsEntry(costumeName, costume).containsEntry(soundName, sound)
                .containsEntry("notes.txt", "synthetic-note".getBytes(StandardCharsets.UTF_8))
                .doesNotContainKeys("litterbox/manifest.json", "litterbox/metadata.json");
            assertThat(entries(download.bytes()).get(PROJECT_JSON)).isNotEqualTo(
                projectJson.getBytes(StandardCharsets.UTF_8)
            );
        }
    }

    @Test
    void rejectsUnknownDuplicateAndExcessiveSelectionsAndInvalidResultIndices() {
        final FaultInjectionCapabilityService capability = capability();
        assertThatThrownBy(
            () -> capability.preview(
                TOKEN, ANALYSIS_ID, new AdvancedCapabilityDtos.InjectionRequest(List.of("unknown"))
            ).block()
        ).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(
            () -> capability.preview(
                TOKEN, ANALYSIS_ID, new AdvancedCapabilityDtos.InjectionRequest(List.of(injectorId, injectorId))
            ).block()
        ).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(
            () -> capability.preview(
                TOKEN, ANALYSIS_ID, new AdvancedCapabilityDtos.InjectionRequest(List.of(" "))
            ).block()
        ).isInstanceOf(IllegalArgumentException.class);
        final List<String> excessive = injectorIds().subList(0, 9);
        assertThatThrownBy(
            () -> capability.preview(TOKEN, ANALYSIS_ID, new AdvancedCapabilityDtos.InjectionRequest(excessive)).block()
        ).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(
            () -> capability.preview(
                TOKEN, ANALYSIS_ID, new AdvancedCapabilityDtos.InjectionRequest(List.of(injectorId), true)
            ).block()
        ).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(
            () -> capability.download(
                TOKEN, ANALYSIS_ID, new AdvancedCapabilityDtos.InjectionDownloadRequest(injectorId, 200)
            ).block()
        ).isInstanceOf(CapabilityException.class)
            .extracting(error -> ((CapabilityException) error).code())
            .isEqualTo("no_applicable_mutation");
    }

    @Test
    void enforcesInputAndAstCeilingsBeforeMutationWork() {
        configuration.getFaultInjection().setMaxInputBytes(archive.length - 1L);
        assertCode(
            "capability_limit_exceeded",
            () -> capability().preview(
                TOKEN, ANALYSIS_ID, new AdvancedCapabilityDtos.InjectionRequest(List.of(injectorId))
            ).block()
        );

        configuration.getFaultInjection().setMaxInputBytes(50L * 1024 * 1024);
        configuration.getFaultInjection().setMaxAstNodes(1);
        assertCode(
            "capability_limit_exceeded",
            () -> capability().preview(
                TOKEN, ANALYSIS_ID, new AdvancedCapabilityDtos.InjectionRequest(List.of(injectorId))
            ).block()
        );
    }

    @Test
    void mapsNoApplicableMutation() throws IOException {
        final String project = projectWithoutAssets();
        final String noApplicableInjector = nonApplicableInjector(project);
        installSource(archive(project), ".sb3");
        final FaultInjectionCapabilityService capability = capability();
        final AdvancedCapabilityDtos.InjectionPreview preview = capability.preview(
            TOKEN, ANALYSIS_ID, new AdvancedCapabilityDtos.InjectionRequest(List.of(noApplicableInjector))
        ).block();

        assertThat(preview.results()).isEmpty();
        assertThat(preview.failures()).singleElement()
            .extracting(AdvancedCapabilityDtos.InjectionFailureView::code)
            .isEqualTo("no_applicable_mutation");
    }

    @Test
    void rejectsAResultIndexOutsideTheReturnedMutationList() {
        final FaultInjectionCapabilityService capability = capability();
        final AdvancedCapabilityDtos.InjectionPreview preview = capability.preview(
            TOKEN, ANALYSIS_ID, new AdvancedCapabilityDtos.InjectionRequest(List.of(injectorId))
        ).block();
        final int invalidIndex = preview.results().stream()
            .mapToInt(AdvancedCapabilityDtos.InjectionResultView::resultIndex).max().orElse(-1) + 1;

        assertThatThrownBy(
            () -> capability.download(
                TOKEN, ANALYSIS_ID,
                new AdvancedCapabilityDtos.InjectionDownloadRequest(injectorId, invalidIndex)
            ).block()
        ).isInstanceOf(CapabilityException.class)
            .extracting(error -> ((CapabilityException) error).code())
            .isEqualTo("no_applicable_mutation");
    }

    @Test
    void deniesCrossTokenAndDisabledRequestsBeforeReadingSource() {
        configuration.getFaultInjection().setEnabled(false);
        assertThatThrownBy(() -> capability().injectors(TOKEN, ANALYSIS_ID, ENGLISH).block())
            .isInstanceOf(CapabilityException.class)
            .extracting(error -> ((CapabilityException) error).code())
            .isEqualTo("capability_disabled");

        configuration.getFaultInjection().setEnabled(true);
        when(submissions.findByToken("other-token")).thenReturn(
            Mono.just(new Submission(42, "other-token", "SINGLE_PROJECT", ENGLISH, "COMPLETED", "ACTIVE", 1, 1, 0))
        );
        assertThatThrownBy(
            () -> capability().preview(
                "other-token", ANALYSIS_ID, new AdvancedCapabilityDtos.InjectionRequest(List.of(injectorId))
            ).block()
        ).isInstanceOf(CapabilityException.class)
            .extracting(error -> ((CapabilityException) error).code())
            .isEqualTo("analysis_not_found");
    }

    @Test
    void closesSourceStreamsOnTimeoutCancellationAndExecutorRejection() {
        final AtomicReference<TrackingInputStream> stream = new AtomicReference<>();
        when(sourceArtifacts.open(any(byte[].class))).thenAnswer(ignored -> {
            final TrackingInputStream opened = new TrackingInputStream(archive);
            stream.set(opened);
            return Mono.just(opened);
        });
        final AdvancedCapabilityDtos.InjectionRequest request = new AdvancedCapabilityDtos.InjectionRequest(
            List.of(injectorId)
        );

        // Short enough that the stalled work is ended by the clock, which is what this third of the test is about.
        configuration.getFaultInjection().setTimeout(Duration.ofMillis(10));
        assertCode(
            "capability_timeout",
            () -> capability(stallAfterAuthorization()).preview(TOKEN, ANALYSIS_ID, request).block()
        );
        awaitClosed(stream);

        // Long enough that only the dispose below can end the work. Left at ten milliseconds this reads as a test of
        // cancellation and is a race against the clock from the previous third: a pause between subscribing and
        // disposing that outlasts the timeout — ordinary on a loaded runner — records a timeout and no cancellation.
        configuration.getFaultInjection().setTimeout(Duration.ofSeconds(30));
        stream.set(null);
        final var disposable = capability(stallAfterAuthorization()).preview(TOKEN, ANALYSIS_ID, request).subscribe();
        disposable.dispose();
        awaitClosed(stream);
        assertThat(
            meters.get("litterbox.capabilities.injection.outcomes").tag("outcome", "cancelled").counter().count()
        ).isEqualTo(1.0);

        stream.set(null);
        assertCode(
            "capability_unavailable",
            () -> capability(rejectAfterAuthorization()).preview(TOKEN, ANALYSIS_ID, request).block()
        );
        awaitClosed(stream);
        assertThat(
            meters.get("litterbox.capabilities.injection.rejections").tag("reason", "unavailable").counter().count()
        ).isEqualTo(1.0);
    }

    /**
     * The stream is closed as the work it was opened for is unwound, and unwinding runs on whichever thread ended the
     * work rather than on this one. Asserting the flag the instant the call returns asks the two to have happened in an
     * order nothing promises; waiting asks for what the service actually undertakes, which is that no stream is left
     * open.
     */
    private static void awaitClosed(final AtomicReference<TrackingInputStream> stream) {
        await().atMost(Duration.ofSeconds(5))
            .until(() -> stream.get() != null && stream.get().closed);
    }

    private FaultInjectionCapabilityService capability() {
        return capability(immediateWork());
    }

    private FaultInjectionCapabilityService capability(final AnalysisWork work) {
        return capability(work, new InjectionService());
    }

    private FaultInjectionCapabilityService capability(
        final AnalysisWork work, final InjectionService injectionService
    ) {
        return new FaultInjectionCapabilityService(
            submissions, analyses, sourceArtifacts, work, parser, configuration, meters,
            injectionService, new PatternCatalogueService()
        );
    }

    private static List<String> injectorIds() {
        return InjectionService.supportedInjectors().stream()
            .map(InjectionService.SupportedInjector::injectorId)
            .toList();
    }

    private String applicableInjector(final String projectJson) {
        final Program program = parser.parseFromString(SYNTHETIC_PROJECT, projectJson);
        final InjectionService service = new InjectionService();
        return injectorIds().stream()
            .filter(id -> !service.inject(program, List.of(id)).results().isEmpty())
            .findFirst()
            .orElseThrow(() -> new AssertionError("Synthetic fixture has no applicable injector"));
    }

    private String nonApplicableInjector(final String projectJson) {
        final Program program = parser.parseFromString(SYNTHETIC_PROJECT, projectJson);
        final InjectionService service = new InjectionService();
        return injectorIds().stream()
            .filter(id -> service.inject(program, List.of(id)).results().isEmpty())
            .findFirst()
            .orElseThrow(() -> new AssertionError("Synthetic fixture has no non-applicable injector"));
    }

    private String projectWithoutAssets() throws IOException {
        final var mapper = tools.jackson.databind.json.JsonMapper.shared();
        final var root = (tools.jackson.databind.node.ObjectNode) mapper.readTree(
            FixtureLoader.loadFixture("scratch_programs/boatRace.json")
        );
        for (var target : root.withArray("targets")) {
            ((tools.jackson.databind.node.ObjectNode) target).remove("costumes");
            ((tools.jackson.databind.node.ObjectNode) target).remove("sounds");
        }
        return mapper.writeValueAsString(root);
    }

    private String projectWithAssets(final byte[] costume, final byte[] sound) throws IOException {
        final var mapper = tools.jackson.databind.json.JsonMapper.shared();
        final var root = (tools.jackson.databind.node.ObjectNode) mapper.readTree(
            FixtureLoader.loadFixture("scratch_programs/boatRace.json")
        );
        final String costumeName = md5ext(costume, "png");
        final String soundName = md5ext(sound, "wav");
        for (var target : root.withArray("targets")) {
            final var object = (tools.jackson.databind.node.ObjectNode) target;
            for (var asset : object.withArray("costumes")) {
                final var entry = (tools.jackson.databind.node.ObjectNode) asset;
                entry.put("md5ext", costumeName);
                entry.put("assetId", costumeName.substring(0, 32));
                entry.put("dataFormat", "png");
            }
            for (var asset : object.withArray("sounds")) {
                final var entry = (tools.jackson.databind.node.ObjectNode) asset;
                entry.put("md5ext", soundName);
                entry.put("assetId", soundName.substring(0, 32));
                entry.put("dataFormat", "wav");
            }
        }
        return mapper.writeValueAsString(root);
    }

    private String manifest(
        final String projectJson,
        final byte[] metadata,
        final String costumeName,
        final byte[] costume,
        final String soundName,
        final byte[] sound
    ) throws IOException {
        final var mapper = tools.jackson.databind.json.JsonMapper.shared();
        final var manifest = mapper.createObjectNode();
        manifest.put("format", "scratch-project-bundle");
        manifest.put("version", 2);
        manifest.put("projectId", SYNTHETIC_PROJECT);
        manifest.put("fetchedAt", "2026-08-05T00:00:00Z");
        manifest.put("projectJsonSha256", hex(digestSha256(projectJson.getBytes(StandardCharsets.UTF_8))));
        manifest.put("metadataSha256", hex(digestSha256(metadata)));
        final var assets = manifest.putArray("assets");
        assets.addObject().put("name", costumeName).put("sha256", hex(digestSha256(costume)));
        assets.addObject().put("name", soundName).put("sha256", hex(digestSha256(sound)));
        return mapper.writeValueAsString(manifest);
    }

    private byte[] archive(final String projectJson) throws IOException {
        return archiveWithEntries(Map.of(PROJECT_JSON, projectJson.getBytes(StandardCharsets.UTF_8)));
    }

    private byte[] archiveWithEntries(final Map<String, byte[]> sourceEntries) throws IOException {
        final ByteArrayOutputStream output = new ByteArrayOutputStream();
        try (ZipOutputStream zip = new ZipOutputStream(output)) {
            for (Map.Entry<String, byte[]> entry : new java.util.TreeMap<>(sourceEntries).entrySet()) {
                zip.putNextEntry(new ZipEntry(entry.getKey()));
                zip.write(entry.getValue());
                zip.closeEntry();
            }
        }
        return output.toByteArray();
    }

    private void installSource(final byte[] source, final String format) {
        archive = source;
        originalArchive = source.clone();
        final SourceArtifact artifact = new SourceArtifact(
            ARTIFACT_ID, digest(source), source.length, "application/zip", "synthetic" + format
        );
        when(analyses.findById(ANALYSIS_ID)).thenReturn(
            Mono.just(
                new Analysis(
                    ANALYSIS_ID, SUBMISSION_ID, ARTIFACT_ID, SYNTHETIC_PROJECT, "NEW", "1", "1", ENGLISH, "DONE",
                    format, null, null, null, "all", "{}", digest(source), Map.of()
                )
            )
        );
        when(sourceArtifacts.findById(ARTIFACT_ID)).thenReturn(Mono.just(artifact));
        when(sourceArtifacts.open(any(byte[].class))).thenAnswer(
            ignored -> Mono.just(new ByteArrayInputStream(archive))
        );
    }

    private String projectJson(final byte[] source) throws IOException {
        return new String(entries(source).get(PROJECT_JSON), StandardCharsets.UTF_8);
    }

    private InjectionArchiveCodec.Limits codecLimits() {
        return new InjectionArchiveCodec.Limits(
            2_000, 100L * 1024 * 1024, 100L * 1024 * 1024, 25L * 1024 * 1024
        );
    }

    private String projectJsonOf(final byte[] source) {
        try {
            return projectJson(source);
        }
        catch (IOException exception) {
            throw new IllegalStateException(exception);
        }
    }

    private Map<String, byte[]> entries(final byte[] source) throws IOException {
        final Map<String, byte[]> entries = new java.util.LinkedHashMap<>();
        try (ZipInputStream zip = new ZipInputStream(new ByteArrayInputStream(source))) {
            ZipEntry entry;
            while ((entry = zip.getNextEntry()) != null) {
                entries.put(entry.getName(), zip.readAllBytes());
            }
        }
        return entries;
    }

    private byte[] digest(final byte[] source) {
        return digestSha256(source);
    }

    private byte[] digestSha256(final byte[] source) {
        try {
            return MessageDigest.getInstance("SHA-256").digest(source);
        }
        catch (NoSuchAlgorithmException exception) {
            throw new IllegalStateException(exception);
        }
    }

    private String md5ext(final byte[] source, final String extension) {
        try {
            return hex(MessageDigest.getInstance("MD5").digest(source)) + "." + extension;
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

    private AnalysisWork stallAfterAuthorization() {
        return workAfterAuthorization(false);
    }

    private AnalysisWork rejectAfterAuthorization() {
        return workAfterAuthorization(true);
    }

    private AnalysisWork workAfterAuthorization(final boolean reject) {
        final AtomicInteger submissionCount = new AtomicInteger();
        return new AnalysisWork() {

            @Override
            public <T> Mono<T> submit(final Callable<T> task) {
                if (submissionCount.getAndIncrement() == 0) {
                    return Mono.fromCallable(task);
                }
                return reject
                    ? Mono.error(new AnalysisCapacityExceededException())
                    : Mono.never();
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
