/*
 * Copyright (C) 2024-2026 LitterBox-Web contributors
 *
 * This file is part of LitterBox-Web.
 * Licenced under the EUPL-1.2 or later.
 *
 * SPDX-FileCopyrightText: 2024-2026 LitterBox-Web contributors
 * SPDX-License-Identifier: EUPL-1.2
 */
package de.uni_passau.fim.se2.litterbox_web.web_ui.ask_ai;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.List;
import java.util.Map;
import java.util.zip.ZipEntry;
import java.util.zip.ZipOutputStream;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import de.uni_passau.fim.se2.litterbox_web.shared.Scratch3ParserService;
import de.uni_passau.fim.se2.litterbox_web.util.FixtureLoader;
import de.uni_passau.fim.se2.litterbox_web.web_ui.persistence.Analysis;
import de.uni_passau.fim.se2.litterbox_web.web_ui.persistence.AnalysisRepository;
import de.uni_passau.fim.se2.litterbox_web.web_ui.persistence.Digests;
import de.uni_passau.fim.se2.litterbox_web.web_ui.persistence.SourceArtifact;
import de.uni_passau.fim.se2.litterbox_web.web_ui.persistence.SourceArtifactAccess;
import de.uni_passau.fim.se2.litterbox_web.web_ui.persistence.SourceArtifactMetadata;
import de.uni_passau.fim.se2.litterbox_web.web_ui.persistence.Submission;
import de.uni_passau.fim.se2.litterbox_web.web_ui.persistence.SubmissionRepository;
import de.uni_passau.fim.se2.litterbox_web.web_ui.single_project.ProjectArchiveInspector;
import de.uni_passau.fim.se2.litterbox_web.web_ui.util.ImmediateWork;
import reactor.core.publisher.Mono;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;
import tools.jackson.databind.node.ObjectNode;

class AskAiQuestionCatalogueTest {

    private static final String ENGLISH_LOCALE = "en";
    private static final String TOKEN = "synthetic-ask-ai-token";
    private static final long SUBMISSION_ID = 51;
    private static final long ANALYSIS_ID = 91;
    private static final long ARTIFACT_ID = 101;
    private static final String PROJECT_JSON = loadProjectJson();
    private static final String COSTUME_PNG_BASE64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGP4//8/AAX+Av4N70a4AAAAAElFTkSuQmCC";

    private final SubmissionRepository submissions = mock(SubmissionRepository.class);
    private final AnalysisRepository analyses = mock(AnalysisRepository.class);
    private final SourceArtifactAccess sourceArtifacts = mock(SourceArtifactAccess.class);
    private final AskAiConfigurationProperties configuration = new AskAiConfigurationProperties();
    private final Scratch3ParserService parser = new Scratch3ParserService();
    private final ProjectArchiveInspector archiveInspector = new ProjectArchiveInspector();
    private byte[] archive;

    @BeforeEach
    void setUp() throws IOException {
        archive = archive(PROJECT_JSON);
        installSource(archive);
    }

    @Test
    void listsNonEmptyInquiriesWithStableSelectorsAndAValidKind() {
        final AskAiQuestionsView view = catalogue().questions(TOKEN, ANALYSIS_ID, ENGLISH_LOCALE).block();

        assertThat(view).isNotNull();
        assertThat(view.schemaVersion()).isEqualTo(1);
        assertThat(view.inquiries()).isNotEmpty();
        assertThat(view.inquiries()).allSatisfy(inquiry -> {
            assertThat(inquiry.selector()).startsWith("inquiry:v1-");
            assertThat(inquiry.kind()).isNotBlank();
            assertThat(inquiry.label()).isNotBlank();
        });
    }

    @Test
    void resolvesInquiryLabelsInTheRequestedLocaleAndDiffersBetweenEnglishAndGerman() {
        final AskAiQuestionsView english = catalogue().questions(TOKEN, ANALYSIS_ID, ENGLISH_LOCALE).block();
        final AskAiQuestionsView german = catalogue().questions(TOKEN, ANALYSIS_ID, "de").block();

        assertThat(english).isNotNull();
        assertThat(german).isNotNull();
        assertThat(english.inquiries()).hasSameSizeAs(german.inquiries());
        assertThat(english.inquiries()).allSatisfy(inquiry -> assertThat(inquiry.label()).isNotBlank());
        assertThat(german.inquiries()).allSatisfy(inquiry -> assertThat(inquiry.label()).isNotBlank());
        final List<String> englishLabels = english.inquiries().stream().map(AskAiQuestionsView.Inquiry::label).toList();
        final List<String> germanLabels = german.inquiries().stream().map(AskAiQuestionsView.Inquiry::label).toList();
        assertThat(englishLabels).isNotEqualTo(germanLabels);
    }

    @Test
    void mapsFindingsWithStableSelectorsAndAValidFamily() {
        final AskAiQuestionsView view = catalogue().questions(TOKEN, ANALYSIS_ID, ENGLISH_LOCALE).block();

        assertThat(view).isNotNull();
        assertThat(view.findings()).allSatisfy(finding -> {
            assertThat(finding.selector()).startsWith("finding:v1-");
            assertThat(finding.label()).isNotBlank();
            assertThat(finding.family()).isIn("bug", "smell", "perfume", "other");
        });
    }

    @Test
    void namesEachFindingsFinderAndMarkedCodeIndependentlyOfTheLocale() {
        final AskAiQuestionsView english = catalogue().questions(TOKEN, ANALYSIS_ID, ENGLISH_LOCALE).block();
        final AskAiQuestionsView german = catalogue().questions(TOKEN, ANALYSIS_ID, "de").block();

        assertThat(english).isNotNull();
        assertThat(german).isNotNull();
        assertThat(english.findings()).isNotEmpty();
        assertThat(english.findings()).allSatisfy(finding -> assertThat(finding.finder()).isNotBlank());
        assertThat(english.findings()).anySatisfy(
            finding -> assertThat(finding.scratchblocks()).contains(":: #ff0000")
        );
        final List<List<String>> localeFree = List.of(
            english.findings().stream().map(f -> f.finder() + "\n" + f.scratchblocks()).toList(),
            german.findings().stream().map(f -> f.finder() + "\n" + f.scratchblocks()).toList()
        );
        assertThat(localeFree.get(0)).isEqualTo(localeFree.get(1));
    }

    @Test
    void describesTheProjectAsATreeOfProgramActorsAndScripts() {
        final AskAiQuestionsView view = catalogue().questions(TOKEN, ANALYSIS_ID, ENGLISH_LOCALE).block();

        assertThat(view).isNotNull();
        final Map<String, AskAiQuestionsView.Target> byKey = view.targets().stream()
            .collect(java.util.stream.Collectors.toMap(AskAiQuestionsView.Target::key, target -> target));
        assertThat(byKey).hasSameSizeAs(view.targets());

        assertThat(view.targets()).filteredOn(target -> "program".equals(target.kind())).hasSize(1);
        assertThat(view.targets()).anySatisfy(target -> assertThat(target.kind()).isEqualTo("sprite"));
        assertThat(view.targets()).anySatisfy(target -> {
            assertThat(target.kind()).isEqualTo("script");
            assertThat(target.scratchblocks()).isNotBlank();
        });
        assertThat(view.targets()).allSatisfy(target -> {
            assertThat(target.key()).isNotBlank();
            if (!target.parent().isBlank()) {
                assertThat(byKey).containsKey(target.parent());
                assertThat(byKey.get(target.parent()).kind()).isIn("sprite", "stage");
            }
        });
    }

    @Test
    void placesEveryQuestionAndFindingOnATargetItWasSentWith() {
        final AskAiQuestionsView view = catalogue().questions(TOKEN, ANALYSIS_ID, ENGLISH_LOCALE).block();

        assertThat(view).isNotNull();
        final List<String> keys = view.targets().stream().map(AskAiQuestionsView.Target::key).toList();
        assertThat(view.inquiries()).isNotEmpty();
        assertThat(view.inquiries()).allSatisfy(inquiry -> assertThat(inquiry.target()).isIn(keys));
        assertThat(view.findings()).allSatisfy(finding -> assertThat(finding.target()).isIn(keys));
        final List<String> scripts = view.targets().stream()
            .filter(target -> "script".equals(target.kind()))
            .map(AskAiQuestionsView.Target::key).toList();
        assertThat(view.inquiries()).anySatisfy(inquiry -> assertThat(inquiry.target()).isIn(scripts));
    }

    @Test
    void saysWhichGeneralQuestionsEachPlaceCanBeAsked() {
        final AskAiQuestionsView view = catalogue().questions(TOKEN, ANALYSIS_ID, ENGLISH_LOCALE).block();

        assertThat(view).isNotNull();
        assertThat(view.targets()).filteredOn(target -> "program".equals(target.kind()))
            .singleElement()
            .satisfies(
                target -> assertThat(target.intents()).containsExactly(
                    "SUMMARISE", "EXPLAIN", "SUGGEST_EXTENSION", "PROVIDE_FEEDBACK"
                )
            );
        assertThat(view.targets()).filteredOn(target -> "sprite".equals(target.kind()))
            .isNotEmpty()
            .allSatisfy(
                target -> assertThat(target.intents())
                    .containsExactly("SUMMARISE", "EXPLAIN", "SUGGEST_EXTENSION", "PROVIDE_FEEDBACK")
            );
        assertThat(view.targets()).filteredOn(target -> "script".equals(target.kind()))
            .isNotEmpty()
            .allSatisfy(
                target -> assertThat(target.intents()).containsExactly("EXPLAIN", "PROVIDE_FEEDBACK")
            );
    }

    @Test
    void offersEachActorsOwnCostumeThroughThisSubmissionsAssetRoute() {
        final AskAiQuestionsView view = catalogue().questions(TOKEN, ANALYSIS_ID, ENGLISH_LOCALE).block();

        assertThat(view).isNotNull();
        assertThat(view.targets())
            .filteredOn(target -> target.thumbnail() != null)
            .isNotEmpty()
            .allSatisfy(target -> {
                // Asset URLs stay scoped to this submission's token.
                assertThat(target.thumbnail()).startsWith("/litterbox/api/v1/submissions/" + TOKEN + "/assets/");
                assertThat(target.kind()).isIn("sprite", "stage");
            });
        assertThat(view.targets())
            .filteredOn(target -> "script".equals(target.kind()))
            .allSatisfy(target -> assertThat(target.thumbnail()).isNull());
    }

    @Test
    void capsInquiriesAtTheConfiguredMaximum() {
        configuration.getListing().setMaxInquiries(1);

        final AskAiQuestionsView view = catalogue().questions(TOKEN, ANALYSIS_ID, ENGLISH_LOCALE).block();

        assertThat(view).isNotNull();
        assertThat(view.inquiries()).hasSize(1);
    }

    @Test
    void deniesCrossTokenReferencesAndUnfinishedOrUnretainedAnalyses() {
        when(submissions.findByToken("other-token")).thenReturn(
            Mono.just(
                new Submission(
                    SUBMISSION_ID + 1, "other-token", "SINGLE_PROJECT", ENGLISH_LOCALE, "COMPLETED", "ACTIVE", 1, 1, 0
                )
            )
        );
        assertThatThrownBy(() -> catalogue().questions("other-token", ANALYSIS_ID, ENGLISH_LOCALE).block())
            .isInstanceOfSatisfying(AskAiProblemException.class, this::assertContextNotFound);

        when(submissions.findByToken(TOKEN)).thenReturn(
            Mono.just(
                new Submission(SUBMISSION_ID, TOKEN, "SINGLE_PROJECT", ENGLISH_LOCALE, "COMPLETED", "RELEASED", 1, 1, 0)
            )
        );
        assertThatThrownBy(() -> catalogue().questions(TOKEN, ANALYSIS_ID, ENGLISH_LOCALE).block())
            .isInstanceOfSatisfying(AskAiProblemException.class, this::assertContextNotFound);

        when(submissions.findByToken(TOKEN)).thenReturn(
            Mono.just(
                new Submission(SUBMISSION_ID, TOKEN, "SINGLE_PROJECT", ENGLISH_LOCALE, "COMPLETED", "ACTIVE", 1, 1, 0)
            )
        );
        when(analyses.findById(ANALYSIS_ID)).thenReturn(Mono.just(analysis("RUNNING", archive)));
        assertThatThrownBy(() -> catalogue().questions(TOKEN, ANALYSIS_ID, ENGLISH_LOCALE).block())
            .isInstanceOfSatisfying(AskAiProblemException.class, this::assertContextNotFound);
    }

    @Test
    void rejectsAnUnsupportedLocaleOnlyAfterTheContextIsConfirmed() {
        assertThatThrownBy(() -> catalogue().questions(TOKEN, ANALYSIS_ID, "fr").block())
            .isInstanceOf(IllegalArgumentException.class);

        when(submissions.findByToken("does-not-exist")).thenReturn(Mono.empty());
        assertThatThrownBy(() -> catalogue().questions("does-not-exist", ANALYSIS_ID, "fr").block())
            .isInstanceOfSatisfying(AskAiProblemException.class, this::assertContextNotFound);
    }

    private void assertContextNotFound(final AskAiProblemException problem) {
        assertThat(problem.reason()).isEqualTo(AskAiProblemException.Reason.CONTEXT_NOT_FOUND);
    }

    private AskAiQuestionCatalogue catalogue() {
        final AskAiProgramLoader loader = new AskAiProgramLoader(
            submissions, analyses, sourceArtifacts, ImmediateWork.analysis(), parser, archiveInspector
        );
        return new AskAiQuestionCatalogue(loader, configuration);
    }

    private void installSource(final byte[] source) {
        final SourceArtifact artifact = new SourceArtifact(
            ARTIFACT_ID, Digests.sha256().digest(source), source.length, "application/zip", "synthetic.sb3"
        );
        when(submissions.findByToken(TOKEN)).thenReturn(
            Mono.just(
                new Submission(SUBMISSION_ID, TOKEN, "SINGLE_PROJECT", ENGLISH_LOCALE, "COMPLETED", "ACTIVE", 1, 1, 0)
            )
        );
        when(analyses.findById(ANALYSIS_ID)).thenReturn(Mono.just(analysis("DONE", source)));
        when(sourceArtifacts.findById(ARTIFACT_ID)).thenReturn(Mono.just(artifact));
        when(sourceArtifacts.findMetadataById(ARTIFACT_ID)).thenReturn(Mono.just(metadata()));
        when(sourceArtifacts.open(any(byte[].class))).thenAnswer(
            invocation -> Mono.just(new ByteArrayInputStream(source))
        );
    }

    private Analysis analysis(final String status, final byte[] source) {
        return new Analysis(
            ANALYSIS_ID, SUBMISSION_ID, ARTIFACT_ID, null, "NEW", "1", "1", ENGLISH_LOCALE, status, ".sb3",
            null, null, null, "all", "{}", Digests.sha256().digest(source), Map.of()
        );
    }

    private SourceArtifactMetadata metadata() {
        return new SourceArtifactMetadata(ARTIFACT_ID, "UPLOAD", "{\"format\":\"original-archive\",\"version\":1}");
    }

    private byte[] archive(final String projectJson) throws IOException {
        final byte[] costume = java.util.Base64.getDecoder().decode(COSTUME_PNG_BASE64);
        final String md5ext = md5Hex(costume) + ".png";
        final ByteArrayOutputStream output = new ByteArrayOutputStream();
        try (ZipOutputStream zip = new ZipOutputStream(output)) {
            zip.putNextEntry(new ZipEntry("project.json"));
            zip.write(withCurrentCostume(projectJson, md5ext).getBytes(java.nio.charset.StandardCharsets.UTF_8));
            zip.closeEntry();
            zip.putNextEntry(new ZipEntry(md5ext));
            zip.write(costume);
            zip.closeEntry();
        }
        return output.toByteArray();
    }

    private String withCurrentCostume(final String projectJson, final String md5ext) throws IOException {
        final JsonNode root = JsonMapper.shared().readTree(projectJson);
        for (final JsonNode target : root.path("targets")) {
            final JsonNode costumes = target.path("costumes");
            final int current = target.path("currentCostume").asInt(0);
            if (costumes.isArray() && current >= 0 && current < costumes.size()) {
                final ObjectNode costume = (ObjectNode) costumes.get(current);
                costume.put("md5ext", md5ext);
                costume.put("assetId", md5ext.substring(0, 32));
                costume.put("dataFormat", "png");
            }
        }
        return JsonMapper.shared().writeValueAsString(root);
    }

    private String md5Hex(final byte[] content) {
        try {
            return java.util.HexFormat.of().formatHex(MessageDigest.getInstance("MD5").digest(content));
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
}
