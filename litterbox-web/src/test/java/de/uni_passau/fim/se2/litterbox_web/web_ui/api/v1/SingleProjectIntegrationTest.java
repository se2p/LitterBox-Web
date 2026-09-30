/*
 * Copyright (C) 2024-2026 LitterBox-Web contributors
 *
 * This file is part of LitterBox-Web.
 * Licenced under the EUPL-1.2 or later.
 *
 * SPDX-FileCopyrightText: 2024-2026 LitterBox-Web contributors
 * SPDX-License-Identifier: EUPL-1.2
 */
package de.uni_passau.fim.se2.litterbox_web.web_ui.api.v1;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.Base64;
import java.util.HexFormat;
import java.util.concurrent.TimeUnit;
import java.util.function.UnaryOperator;
import java.util.zip.ZipEntry;
import java.util.zip.ZipOutputStream;

import org.awaitility.Awaitility;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.core.io.ByteArrayResource;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.annotation.DirtiesContext;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.reactive.server.WebTestClient;
import org.springframework.util.LinkedMultiValueMap;
import org.springframework.web.reactive.function.client.ExchangeStrategies;

import de.uni_passau.fim.se2.litterbox_web.util.TestDatabase;
import de.uni_passau.fim.se2.litterbox_web.web_ui.single_project.SingleProjectDtos;
import de.uni_passau.fim.se2.litterbox_web.web_ui.support.WebUiProfiles;
import mockwebserver3.MockResponse;
import mockwebserver3.MockWebServer;
import mockwebserver3.QueueDispatcher;
import okio.Buffer;

@DirtiesContext
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@ActiveProfiles({ "test", WebUiProfiles.PUBLIC_WEB })
class SingleProjectIntegrationTest {

    private static final String SUBMISSION_PATH = "/api/v1/submissions/{token}";
    private static final String ANALYSIS_REPORT_PATH = "/api/v1/submissions/{token}/analyses/{analysisId}/report.html";
    private static final String COMPLETED = "completed";
    private static final String SHA_256 = "SHA-256";
    private static final String BEARER_PREFIX = "Bearer ";
    private static final String ENGLISH = "en";
    private static final String QUESTIONS = "questions";
    private static final String FAILED = "failed";
    private static final String MD5 = "MD5";
    private static final String IDEMPOTENCY_KEY = "Idempotency-Key";

    private static final TestDatabase DATABASE = TestDatabase.freshSchema("single_project").migrated();
    private static final MockWebServer SCRATCH = startScratchServer();

    @AfterAll
    static void stopDatabase() {
        SCRATCH.close();
        DATABASE.close();
    }

    @DynamicPropertySource
    static void databaseProperties(final DynamicPropertyRegistry properties) {
        properties.add("spring.datasource.url", DATABASE::jdbcUrl);
        properties.add("spring.datasource.username", DATABASE::username);
        properties.add("spring.datasource.password", DATABASE::password);
        properties.add("litterbox.jobs.enabled", () -> "true");
        properties.add("litterbox.version", () -> "1.13-SNAPSHOT");
        properties.add(
            "litterbox.storage.root", () -> System.getProperty("java.io.tmpdir")
                + "/litterbox-single-project-integration"
        );
        properties.add("litterbox.scratch.api-base", SingleProjectIntegrationTest::scratchBase);
        properties.add("litterbox.scratch.projects-base", SingleProjectIntegrationTest::scratchBase);
        properties.add("litterbox.scratch.assets-base", SingleProjectIntegrationTest::scratchBase);
    }

    @LocalServerPort
    private int port;

    @Autowired
    private JdbcTemplate jdbc;

    private WebTestClient client;

    /**
     * Gives each test the mock to itself.
     *
     * <p>
     * The job coordinator keeps polling between tests, so a submission left running by one test can still be asking
     * Scratch for things while the next test is queueing up the answers it expects — and the queue hands them out in
     * the order they are asked for, not the order they were meant for. Emptying it here means the straggler is told no
     * rather than served somebody else's project.
     */
    @BeforeEach
    void giveThisTestTheScratchMock() {
        final QueueDispatcher responses = new QueueDispatcher();
        responses.setFailFast(true);
        SCRATCH.setDispatcher(responses);
    }

    @BeforeEach
    void createClient() {
        client = WebTestClient.bindToServer()
            .baseUrl("http://127.0.0.1:" + port)
            .exchangeStrategies(
                ExchangeStrategies.builder()
                    .codecs(configurer -> configurer.defaultCodecs().maxInMemorySize(16 * 1024 * 1024))
                    .build()
            )
            .build();
    }

    @ParameterizedTest
    @ValueSource(strings = { "de", ENGLISH, "es", "nl" })
    @SuppressWarnings("checkstyle:MethodLength")
    void persistsAnalyzesAndRetrievesSingleProjectWithIdempotency(final String locale) throws IOException {
        final byte[] archive = archive();
        final SingleProjectDtos.CreatedSubmission first = submit(archive, "synthetic-" + locale, locale);
        final SingleProjectDtos.CreatedSubmission retry = submit(archive, "synthetic-" + locale, locale);

        assertThat(retry.submissionId()).isEqualTo(first.submissionId());
        assertThat(retry.token()).isEqualTo(first.token());
        assertThat(first.token()).hasSize(22);

        Awaitility.await().atMost(java.time.Duration.ofSeconds(15)).untilAsserted(() -> {
            final SingleProjectDtos.SubmissionView pending = client.get()
                .uri(SUBMISSION_PATH, first.token())
                .exchange()
                .expectStatus().isOk()
                .expectBody(SingleProjectDtos.SubmissionView.class)
                .returnResult().getResponseBody();
            assertThat(pending).isNotNull();
            assertThat(pending.status()).isEqualTo(COMPLETED);
        });
        final SingleProjectDtos.SubmissionView view = client.get()
            .uri(SUBMISSION_PATH, first.token())
            .exchange()
            .expectStatus().isOk()
            .expectBody(SingleProjectDtos.SubmissionView.class)
            .returnResult().getResponseBody();

        assertThat(view).isNotNull();
        assertThat(view.status()).isEqualTo(COMPLETED);
        assertThat(view.locale()).isEqualTo(locale);
        assertThat(view.analysis().status()).isEqualTo(COMPLETED);
        assertThat(view.analysis().name()).isEqualTo("synthetic.sb3");
        assertThat(view.analysis().reportSchemaVersion()).isEqualTo("1");
        assertThat(view.analysis().litterboxVersion()).isEqualTo("1.13-SNAPSHOT");
        assertThat(view.analysis().locale()).isEqualTo(locale);
        assertThat(view.analysis().provenance()).isEqualTo("NEW");
        assertThat(view.analysis().detectors()).containsExactly("all");
        assertThat(view.analysis().configuration()).containsKeys("detectors", "reportOptions");
        assertThat(view.analysis().configuration()).doesNotContainKey("qlc");
        assertThat(view.analysis().sourceSha256()).isEqualTo(HexFormat.of().formatHex(digest(SHA_256, archive)));
        assertThat(view.analysis().inputFormat()).isEqualTo(".sb3");
        assertThat(view.analysis().metrics()).isNotEmpty();
        assertThat(view.analysis().issues()).isNotEmpty();
        assertThat(view.analysis().issues())
            .extracting(SingleProjectDtos.IssueView::type)
            .contains("bug", "smell", "perfume");
        assertThat(view.analysis().quiz()).isEmpty();
        assertThat(view.analysis().catalogue()).isNotEmpty();
        assertThat(view.analysis().catalogue()).allMatch(entry -> entry.locale().equals(locale) || entry.fallback());
        assertThat(view.analysis().assetRefs()).hasSize(1);
        assertThat(view.analysis().issues())
            .filteredOn(issue -> "Stage".equals(issue.sprite()))
            .isNotEmpty()
            .allMatch(issue -> view.analysis().assetRefs().getFirst().equals(issue.thumbnailRef()));
        assertThat(view.analysis().issues())
            .filteredOn(issue -> !"Stage".equals(issue.sprite()))
            .allMatch(issue -> issue.thumbnailRef() == null);

        final SingleProjectDtos.SubmissionView reloaded = client.get()
            .uri(SUBMISSION_PATH, first.token())
            .exchange()
            .expectStatus().isOk()
            .expectBody(SingleProjectDtos.SubmissionView.class)
            .returnResult().getResponseBody();
        assertThat(reloaded).isEqualTo(view);

        client.get()
            .uri(view.analysis().assetRefs().getFirst())
            .exchange()
            .expectStatus().isOk()
            .expectHeader().valueEquals("X-Content-Type-Options", "nosniff")
            .expectHeader().exists(HttpHeaders.ETAG)
            .expectBody().consumeWith(result -> assertThat(result.getResponseBody()).isEqualTo(thumbnail()));

        client.get()
            .uri("/api/v1/submissions/{token}/report.html", first.token())
            .exchange()
            .expectStatus().isOk()
            .expectHeader().contentTypeCompatibleWith(MediaType.TEXT_HTML)
            .expectHeader().valueMatches(HttpHeaders.CONTENT_DISPOSITION, "attachment;.*")
            .expectHeader().valueEquals(HttpHeaders.CACHE_CONTROL, "no-store")
            .expectBody(String.class).value(report -> assertThat(report).contains("synthetic.sb3"));

        client.post()
            .uri("/api/v1/analyses/{id}/feedback", view.analysis().id())
            .header(HttpHeaders.AUTHORIZATION, BEARER_PREFIX + first.token())
            .contentType(MediaType.APPLICATION_JSON)
            .bodyValue(
                new SingleProjectDtos.FeedbackRequest(
                    view.analysis().issues().getFirst().finderId(), "helpful"
                )
            )
            .exchange()
            .expectStatus().isNoContent();

        client.post()
            .uri("/api/v1/analyses/{id}/feedback", view.analysis().id())
            .header(HttpHeaders.AUTHORIZATION, BEARER_PREFIX + first.token())
            .contentType(MediaType.APPLICATION_JSON)
            .bodyValue(
                new SingleProjectDtos.FeedbackRequest(
                    view.analysis().issues().getFirst().finderId(), "not-helpful"
                )
            )
            .exchange()
            .expectStatus().isNoContent();

    }

    @Test
    void generatesQuestionsOnlyThroughDedicatedSubmissions() throws IOException {
        final SingleProjectDtos.CreatedSubmission created = submitQuestions(
            archive(), "synthetic-questions", ENGLISH
        );

        Awaitility.await().atMost(java.time.Duration.ofSeconds(15)).untilAsserted(
            () -> assertThat(submission(created.token()).status()).isEqualTo(COMPLETED)
        );
        final SingleProjectDtos.SubmissionView view = submission(created.token());

        assertThat(view.sourceType()).isEqualTo("QUESTION_UPLOAD");
        assertThat(view.analysis().detectors()).containsExactly(QUESTIONS);
        assertThat(view.analysis().configuration())
            .containsEntry("detectors", QUESTIONS)
            .containsEntry("reportOptions", "none")
            .containsEntry("qlc", "balanced=false,max=300,per-cell=0,seed=0,shuffle=false");
        assertThat(view.analysis().metrics()).isEmpty();
        assertThat(view.analysis().issues()).isEmpty();
        assertThat(view.analysis().relationships()).isEmpty();
        assertThat(view.analysis().catalogue()).isEmpty();
        assertThat(view.analysis().assetRefs()).isEmpty();
        assertThat(view.analysis().quiz()).isNotEmpty().hasSizeLessThanOrEqualTo(300);

        final SingleProjectDtos.QuizView question = view.analysis().quiz().getFirst();
        final String answer = question.options().isEmpty() ? "answer" : question.options().getFirst();
        final SingleProjectDtos.QuizAnswerResult verdict = client.post()
            .uri("/api/v1/analyses/{id}/quiz-answers", view.analysis().id())
            .header(HttpHeaders.AUTHORIZATION, BEARER_PREFIX + created.token())
            .contentType(MediaType.APPLICATION_JSON)
            .bodyValue(new SingleProjectDtos.QuizAnswerRequest(question.questionId(), answer))
            .exchange()
            .expectStatus().isOk()
            .expectBody(SingleProjectDtos.QuizAnswerResult.class)
            .returnResult().getResponseBody();
        assertThat(verdict).isNotNull();
        assertThat(verdict.questionId()).isEqualTo(question.questionId());
        assertThat(verdict.correctAnswers()).isNotEmpty();

        assertThat(question.questionType()).isNotBlank();
        assertThat(question.programDimension()).isNotBlank();
        assertThat(question.scopeOfFocus()).isNotBlank();
        assertThat(view.analysis().quiz()).anyMatch(entry -> entry.scratchBlocks() != null);

        final SingleProjectDtos.QuizAnswerKeyView answerKey = quizAnswerKey(view.analysis().id(), created.token());
        assertThat(answerKey).isNotNull();
        assertThat(answerKey.questions()).hasSameSizeAs(view.analysis().quiz());
        assertThat(answerKey.questions())
            .filteredOn(entry -> entry.questionId().equals(question.questionId()))
            .singleElement()
            .satisfies(entry -> assertThat(entry.correctAnswers()).isEqualTo(verdict.correctAnswers()));

        // A stray token from another submission is refused exactly as the write side already is, without saying
        // whether the analysis itself exists.
        client.get()
            .uri("/api/v1/analyses/{id}/quiz-answer-key", view.analysis().id())
            .header(HttpHeaders.AUTHORIZATION, BEARER_PREFIX + "a-different-submissions-token")
            .exchange()
            .expectStatus().isNotFound();
    }

    private SingleProjectDtos.QuizAnswerKeyView quizAnswerKey(final long analysisId, final String token) {
        return client.get()
            .uri("/api/v1/analyses/{id}/quiz-answer-key", analysisId)
            .header(HttpHeaders.AUTHORIZATION, BEARER_PREFIX + token)
            .exchange()
            .expectStatus().isOk()
            .expectBody(SingleProjectDtos.QuizAnswerKeyView.class)
            .returnResult().getResponseBody();
    }

    @Test
    void acceptsMblockAndRetainsItsExactInputChecksum() throws IOException {
        final byte[] input = archive(
            thumbnail(), project -> project.replace("\"name\": \"boat\"", "\"name\": \"mblock-boat\"")
        );
        final SingleProjectDtos.CreatedSubmission created = submit(
            input, "synthetic-mblock", "de", "synthetic.mblock"
        );

        Awaitility.await().atMost(java.time.Duration.ofSeconds(15)).untilAsserted(
            () -> assertThat(submission(created.token()).status()).isEqualTo(COMPLETED)
        );

        final SingleProjectDtos.AnalysisView analysis = submission(created.token()).analysis();
        assertThat(analysis.name()).isEqualTo("synthetic.mblock");
        assertThat(analysis.inputFormat()).isEqualTo(".mblock");
        assertThat(analysis.sourceSha256()).isEqualTo(HexFormat.of().formatHex(digest(SHA_256, input)));
    }

    @Test
    void namesAProjectAfterThisUploadEvenWhenTheSameBytesWereUploadedUnderAnotherName() throws IOException {
        final byte[] input = archive(
            thumbnail(), project -> project.replace("\"name\": \"boat\"", "\"name\": \"shared-boat\"")
        );
        final SingleProjectDtos.CreatedSubmission first = submit(input, "shared-first", "en", "first-upload.sb3");
        final SingleProjectDtos.CreatedSubmission second = submit(input, "shared-second", "en", "second-upload.sb3");

        Awaitility.await().atMost(java.time.Duration.ofSeconds(15)).untilAsserted(() -> {
            assertThat(submission(first.token()).status()).isEqualTo(COMPLETED);
            assertThat(submission(second.token()).status()).isEqualTo(COMPLETED);
        });

        assertThat(submission(first.token()).analysis().name()).isEqualTo("first-upload.sb3");
        assertThat(submission(second.token()).analysis().name()).isEqualTo("second-upload.sb3");

        DATABASE.jdbcTemplate().update(
            "UPDATE submission_artifact SET original_filename = NULL WHERE submission_id = ?",
            submission(second.token()).submissionId()
        );
        assertThat(submission(second.token()).analysis().name())
            .as("a link made before names were kept shows no name, not the one stored in its report")
            .isNull();
    }

    @Test
    @SuppressWarnings("checkstyle:MethodLength")
    void analyzesCanonicalScratchUrlThroughTheConfiguredFixedHostMock() throws Exception {
        final byte[] metadata = ("{\"project_token\":\"synthetic-url-token\","
            + "\"username\":\"synthetic-user\",\"stats\":{\"views\":12,\"loves\":3,"
            + "\"favorites\":2,\"remixes\":1},"
            + "\"history\":{\"created\":\"2020-01-02T03:04:05Z\"}}").getBytes(StandardCharsets.UTF_8);
        final byte[] project = scratchUrlProject();
        jsonResponse(metadata);
        jsonResponse(project);
        response(thumbnail(), MediaType.IMAGE_PNG_VALUE);

        final SingleProjectDtos.CreatedSubmission created = submitUrl(
            "https://scratch.mit.edu/projects/987654/", "synthetic-url", "nl"
        );

        Awaitility.await().atMost(java.time.Duration.ofSeconds(15)).untilAsserted(
            () -> assertThat(submission(created.token()).status())
                .isIn(COMPLETED, FAILED)
        );
        final SingleProjectDtos.SubmissionView view = submission(created.token());
        assertThat(view.status())
            .withFailMessage("Synthetic URL analysis failed: %s", view.analysis().failureMessage())
            .isEqualTo(COMPLETED);
        assertThat(view.sourceType()).isEqualTo("SCRATCH_URL");
        assertThat(view.locale()).isEqualTo("nl");
        assertThat(view.analysis().inputFormat()).isEqualTo(".sb3");
        assertThat(view.analysis().sourceSha256()).hasSize(64);
        assertThat(view.analysis().issues()).isNotEmpty();
        assertThat(view.analysis().assetRefs()).hasSize(1);
        assertThat(
            jdbc.queryForMap(
                "SELECT views, loves, favorites, remixes, author_username, username_source, "
                    + "scratch_created_at, fetched_at FROM scratch_project_stats WHERE analysis_id = ?",
                view.analysis().id()
            )
        ).containsEntry("views", 12L)
            .containsEntry("loves", 3L)
            .containsEntry("favorites", 2L)
            .containsEntry("remixes", 1L)
            .containsEntry("author_username", "synthetic-user")
            .containsEntry("username_source", "SCRATCH_API");
        client.get()
            .uri(SUBMISSION_PATH, created.token())
            .exchange()
            .expectStatus().isOk()
            .expectBody(String.class)
            .value(body -> assertThat(body).doesNotContain("synthetic-user").doesNotContain("author_username"));

        assertThat(SCRATCH.takeRequest(5, TimeUnit.SECONDS))
            .isNotNull()
            .extracting(request -> request.getTarget())
            .isEqualTo("/projects/987654");
        assertThat(SCRATCH.takeRequest(5, TimeUnit.SECONDS))
            .isNotNull()
            .extracting(request -> request.getTarget())
            .isEqualTo("/987654?token=synthetic-url-token");
        assertThat(SCRATCH.takeRequest(5, TimeUnit.SECONDS))
            .isNotNull()
            .extracting(request -> request.getTarget())
            .isEqualTo(
                "/internalapi/asset/" + HexFormat.of().formatHex(digest(MD5, thumbnail())) + ".png/get/"
            );
    }

    @Test
    void analyzesAClassSetListedAsScratchProjectUrls() throws Exception {
        jsonResponse(scratchMetadata("list-user", "list-token"));
        jsonResponse(scratchUrlProject());
        response(thumbnail(), MediaType.IMAGE_PNG_VALUE);

        final byte[] list = ("https://scratch.mit.edu/projects/987655/\n"
            + "https://www.scratch.mit.edu/projects/987655").getBytes(StandardCharsets.UTF_8);
        final SingleProjectDtos.CreatedSubmission created = submit(
            list, "synthetic-project-list", "en", "projects.txt"
        );

        Awaitility.await().atMost(java.time.Duration.ofSeconds(15)).untilAsserted(() -> {
            final SingleProjectDtos.SubmissionView view = submission(created.token());
            assertThat(view.status()).isEqualTo(COMPLETED);
            assertThat(view.sourceType()).isEqualTo("SCRATCH_URL_LIST");
            assertThat(view.expectedCount()).isEqualTo(1);
            assertThat(view.completedCount()).isEqualTo(1);
            assertThat(view.analyses()).singleElement()
                .extracting(SingleProjectDtos.AnalysisView::name)
                .isEqualTo("scratch-987655.sb3");
        });
    }

    @Test
    void generatesQuestionsFromCanonicalScratchUrl() throws Exception {
        final byte[] metadata = ("{\"project_token\":\"synthetic-question-url-token\","
            + "\"username\":\"synthetic-question-user\",\"stats\":{},\"history\":{}}")
            .getBytes(StandardCharsets.UTF_8);
        jsonResponse(metadata);
        jsonResponse(scratchUrlProject());
        response(thumbnail(), MediaType.IMAGE_PNG_VALUE);

        final SingleProjectDtos.CreatedSubmission created = submitQuestionUrl(
            "https://scratch.mit.edu/projects/876543/", "synthetic-question-url", "de"
        );

        Awaitility.await().atMost(java.time.Duration.ofSeconds(15)).untilAsserted(
            () -> assertThat(submission(created.token()).status()).isEqualTo(COMPLETED)
        );
        final SingleProjectDtos.SubmissionView view = submission(created.token());
        assertThat(view.sourceType()).isEqualTo("QUESTION_SCRATCH_URL");
        assertThat(view.locale()).isEqualTo("de");
        assertThat(view.analysis().detectors()).containsExactly(QUESTIONS);
        assertThat(view.analysis().quiz()).isNotEmpty().hasSizeLessThanOrEqualTo(300);
        assertThat(view.analysis().issues()).isEmpty();

        assertThat(SCRATCH.takeRequest(5, TimeUnit.SECONDS))
            .isNotNull()
            .extracting(request -> request.getTarget())
            .isEqualTo("/projects/876543");
        assertThat(SCRATCH.takeRequest(5, TimeUnit.SECONDS))
            .isNotNull()
            .extracting(request -> request.getTarget())
            .isEqualTo("/876543?token=synthetic-question-url-token");
        assertThat(SCRATCH.takeRequest(5, TimeUnit.SECONDS))
            .isNotNull()
            .extracting(request -> request.getTarget())
            .isEqualTo(
                "/internalapi/asset/" + HexFormat.of().formatHex(digest(MD5, thumbnail())) + ".png/get/"
            );
    }

    @Test
    void retainsMalformedSingleProjectInputAndRedactsStorageDetails() throws IOException {
        final byte[] malformed = "synthetic malformed archive".getBytes(StandardCharsets.UTF_8);
        final SingleProjectDtos.CreatedSubmission created = submit(
            malformed, "synthetic-malformed", ENGLISH, "broken.mblock"
        );

        Awaitility.await().atMost(java.time.Duration.ofSeconds(15)).untilAsserted(
            () -> assertThat(submission(created.token()).status()).isEqualTo(FAILED)
        );
        final SingleProjectDtos.AnalysisView failed = submission(created.token()).analysis();
        assertThat(failed.status()).isEqualTo(FAILED);
        assertThat(failed.sourceSha256()).isEqualTo(HexFormat.of().formatHex(digest(SHA_256, malformed)));
        assertThat(failed.issues()).isEmpty();
        assertThat(failed.metrics()).isEmpty();
        assertThat(failed.failureMessage()).isNotBlank();

        client.get()
            .uri(SUBMISSION_PATH, created.token())
            .exchange()
            .expectStatus().isOk()
            .expectBody(String.class)
            .value(
                body -> assertThat(body)
                    .doesNotContain("sourceArtifact")
                    .doesNotContain("storageKey")
                    .doesNotContain("manifest")
                    .doesNotContain("synthetic-user")
            );
    }

    @Test
    void asksQuestionsAboutARetainedProjectWithoutASecondUpload() throws IOException {
        final byte[] input = archive();
        final SingleProjectDtos.CreatedSubmission checked = submit(input, "synthetic-reuse", ENGLISH);
        Awaitility.await().atMost(java.time.Duration.ofSeconds(15)).untilAsserted(
            () -> assertThat(submission(checked.token()).status()).isEqualTo(COMPLETED)
        );

        final SingleProjectDtos.CreatedSubmission asked = reuse(checked.token(), QUESTIONS, "synthetic-reuse-q");

        assertThat(asked.token()).isNotEqualTo(checked.token());
        Awaitility.await().atMost(java.time.Duration.ofSeconds(15)).untilAsserted(
            () -> assertThat(submission(asked.token()).status()).isEqualTo(COMPLETED)
        );
        final SingleProjectDtos.SubmissionView view = submission(asked.token());
        assertThat(view.sourceType()).isEqualTo("QUESTION_UPLOAD");
        assertThat(view.analysis().quiz()).isNotEmpty();
        assertThat(view.analysis().sourceSha256())
            .isEqualTo(submission(checked.token()).analysis().sourceSha256());

        client.post()
            .uri("/api/v1/submissions/{token}/reuse", checked.token())
            .contentType(MediaType.APPLICATION_JSON)
            .bodyValue(new SingleProjectDtos.ReuseRequest("everything"))
            .exchange()
            .expectStatus().isBadRequest();
        client.post()
            .uri("/api/v1/submissions/{token}/reuse", "synthetic-unknown-token")
            .contentType(MediaType.APPLICATION_JSON)
            .bodyValue(new SingleProjectDtos.ReuseRequest(QUESTIONS))
            .exchange()
            .expectStatus().isNotFound();
    }

    @Test
    void refusesToReuseABatchThatHoldsNoSingleProject() throws IOException {
        final SingleProjectDtos.CreatedSubmission batch = submit(
            teacherArchive(), "synthetic-reuse-batch", ENGLISH, "synthetic.zip"
        );
        Awaitility.await().atMost(java.time.Duration.ofSeconds(30)).untilAsserted(
            () -> assertThat(submission(batch.token()).status()).isIn(COMPLETED, "partial", FAILED)
        );

        client.post()
            .uri("/api/v1/submissions/{token}/reuse", batch.token())
            .contentType(MediaType.APPLICATION_JSON)
            .bodyValue(new SingleProjectDtos.ReuseRequest(QUESTIONS))
            .exchange()
            .expectStatus().isEqualTo(org.springframework.http.HttpStatus.CONFLICT);
    }

    @Test
    void rejectsUnknownTokensWithoutExposingSubmissionOrReportDetails() {
        final String unknown = "synthetic-unknown-token";
        client.get()
            .uri(SUBMISSION_PATH, unknown)
            .exchange()
            .expectStatus().isNotFound();
        client.get()
            .uri("/api/v1/submissions/{token}/report.html", unknown)
            .exchange()
            .expectStatus().isNotFound();
        client.get()
            .uri("/api/v1/submissions/{token}/assets/{sha256}", unknown, "a".repeat(64))
            .exchange()
            .expectStatus().isNotFound();
    }

    @Test
    @SuppressWarnings({ "checkstyle:MethodLength", "checkstyle:LambdaBodyLength" })
    void retainsAndProcessesTeacherArchiveWithPerProjectFailures() throws IOException {
        final byte[] outerArchive = teacherArchive();
        final SingleProjectDtos.CreatedSubmission first = submit(
            outerArchive, "synthetic-teacher", ENGLISH, "synthetic.zip"
        );
        final SingleProjectDtos.CreatedSubmission retry = submit(
            outerArchive, "synthetic-teacher", ENGLISH, "synthetic.zip"
        );

        assertThat(retry.submissionId()).isEqualTo(first.submissionId());
        Awaitility.await().atMost(java.time.Duration.ofSeconds(15)).untilAsserted(() -> {
            final SingleProjectDtos.SubmissionView view = client.get()
                .uri(SUBMISSION_PATH, first.token())
                .exchange()
                .expectStatus().isOk()
                .expectBody(SingleProjectDtos.SubmissionView.class)
                .returnResult().getResponseBody();
            assertThat(view).isNotNull();
            assertThat(view.status()).isEqualTo("partial");
            assertThat(view.expectedCount()).isEqualTo(2);
            assertThat(view.completedCount()).isEqualTo(1);
            assertThat(view.failedCount()).isEqualTo(1);
            assertThat(view.analyses()).extracting(SingleProjectDtos.AnalysisView::name)
                .containsExactlyInAnyOrder("valid.sb3", "broken.sb3");
            assertThat(view.analyses()).extracting(SingleProjectDtos.AnalysisView::status)
                .containsExactlyInAnyOrder(COMPLETED, FAILED);
            final SingleProjectDtos.AnalysisView failed = view.analyses().stream()
                .filter(analysis -> "broken.sb3".equals(analysis.name()))
                .findFirst().orElseThrow();
            assertThat(failed.sourceSha256()).isNotBlank();
            assertThat(failed.issues()).isEmpty();
            assertThat(failed.metrics()).isEmpty();
        });
        assertThat(
            jdbc.queryForObject(
                "SELECT LOWER(HEX(artifact.sha256)) FROM submission_artifact link "
                    + "JOIN source_artifact artifact ON artifact.id = link.artifact_id "
                    + "WHERE link.submission_id = ? AND link.role = 'ORIGINAL'",
                String.class, first.submissionId()
            )
        ).isEqualTo(HexFormat.of().formatHex(digest(SHA_256, outerArchive)));
        assertThat(
            jdbc.queryForList(
                "SELECT LOWER(HEX(artifact.sha256)) FROM submission_artifact link "
                    + "JOIN source_artifact artifact ON artifact.id = link.artifact_id "
                    + "WHERE link.submission_id = ? AND link.role = 'TEACHER_CHILD' ORDER BY artifact.sha256",
                String.class, first.submissionId()
            )
        ).containsExactlyInAnyOrder(
            HexFormat.of().formatHex(digest(SHA_256, zipEntry(outerArchive, "valid.sb3"))),
            HexFormat.of().formatHex(digest(SHA_256, zipEntry(outerArchive, "broken.sb3")))
        );
        assertThat(
            jdbc.queryForObject(
                "SELECT COUNT(*) FROM analysis WHERE submission_id = ?", Integer.class, first.submissionId()
            )
        ).isEqualTo(2);
        assertThat(
            jdbc.queryForObject(
                "SELECT COUNT(*) FROM analysis_job WHERE submission_id = ?", Integer.class, first.submissionId()
            )
        ).isEqualTo(3);
        assertThat(
            jdbc.queryForObject(
                "SELECT COUNT(*) FROM submission_event WHERE submission_id = ? AND event_type IN ('DONE', 'FAILED')",
                Integer.class, first.submissionId()
            )
        ).isEqualTo(2);
    }

    @Test
    void writesTheReportForTheAnalysisAskedFor() throws IOException {
        final SingleProjectDtos.CreatedSubmission created = submit(
            teacherArchive(), "synthetic-report-per-analysis", ENGLISH, "synthetic.zip"
        );
        Awaitility.await().atMost(java.time.Duration.ofSeconds(15)).untilAsserted(
            () -> assertThat(submission(created.token()).status()).isEqualTo("partial")
        );
        final SingleProjectDtos.SubmissionView view = submission(created.token());
        final long completed = view.analyses().stream()
            .filter(analysis -> COMPLETED.equals(analysis.status()))
            .findFirst().orElseThrow().id();
        final long failed = view.analyses().stream()
            .filter(analysis -> FAILED.equals(analysis.status()))
            .findFirst().orElseThrow().id();

        client.get()
            .uri(ANALYSIS_REPORT_PATH, created.token(), completed)
            .exchange()
            .expectStatus().isOk()
            .expectHeader().contentTypeCompatibleWith(MediaType.TEXT_HTML)
            .expectHeader().valueMatches(HttpHeaders.CONTENT_DISPOSITION, "attachment;.*")
            .expectBody(String.class).value(report -> assertThat(report).contains("valid.sb3"));

        client.get()
            .uri(ANALYSIS_REPORT_PATH, created.token(), failed)
            .exchange()
            .expectStatus().isEqualTo(org.springframework.http.HttpStatus.CONFLICT);

        // The token is what decides what may be read. An id that belongs to no analysis of this submission is not
        // found here, whatever it may be somewhere else.
        client.get()
            .uri(ANALYSIS_REPORT_PATH, created.token(), Long.MAX_VALUE)
            .exchange()
            .expectStatus().isNotFound();
    }

    @Test
    @SuppressWarnings({ "checkstyle:MethodLength", "checkstyle:LambdaBodyLength" })
    void acceptsMultipleTeacherFormatsWithExactRetainedLinksAndTerminalCounts() throws IOException {
        final byte[] sb3 = archive();
        final byte[] mblock = archive(
            thumbnail(), project -> project.replace("\"name\": \"boat\"", "\"name\": \"synthetic-mblock\"")
        );
        final byte[] broken = "synthetic broken child".getBytes(StandardCharsets.UTF_8);
        final byte[] outer = teacherArchive(
            sb3, "successful.sb3", mblock, "successful.mblock", broken, "failed.sb3"
        );
        final SingleProjectDtos.CreatedSubmission created = submit(
            outer, "synthetic-teacher-matrix", "nl", "synthetic-teacher.zip"
        );
        final SingleProjectDtos.CreatedSubmission replay = submit(
            outer, "synthetic-teacher-matrix", "nl", "synthetic-teacher.zip"
        );

        assertThat(replay.submissionId()).isEqualTo(created.submissionId());
        Awaitility.await().atMost(java.time.Duration.ofSeconds(20)).untilAsserted(() -> {
            final SingleProjectDtos.SubmissionView view = submission(created.token());
            assertThat(view.status()).isEqualTo("partial");
            assertThat(view.expectedCount()).isEqualTo(3);
            assertThat(view.completedCount()).isEqualTo(2);
            assertThat(view.failedCount()).isEqualTo(1);
            assertThat(view.analyses()).extracting(SingleProjectDtos.AnalysisView::name)
                .containsExactlyInAnyOrder("successful.sb3", "successful.mblock", "failed.sb3");
            assertThat(view.analyses()).filteredOn(analysis -> "successful.sb3".equals(analysis.name()))
                .singleElement().extracting(SingleProjectDtos.AnalysisView::inputFormat).isEqualTo(".sb3");
            assertThat(view.analyses()).filteredOn(analysis -> "successful.mblock".equals(analysis.name()))
                .singleElement().extracting(SingleProjectDtos.AnalysisView::inputFormat).isEqualTo(".mblock");
            assertThat(view.analyses()).filteredOn(analysis -> "failed.sb3".equals(analysis.name()))
                .singleElement().satisfies(analysis -> {
                    assertThat(analysis.status()).isEqualTo(FAILED);
                    assertThat(analysis.sourceSha256()).isEqualTo(HexFormat.of().formatHex(digest(SHA_256, broken)));
                    assertThat(analysis.failureMessage()).isNotBlank();
                });
        });

        assertThat(
            jdbc.queryForObject(
                "SELECT LOWER(HEX(artifact.sha256)) FROM submission_artifact link "
                    + "JOIN source_artifact artifact ON artifact.id = link.artifact_id "
                    + "WHERE link.submission_id = ? AND link.role = 'ORIGINAL'",
                String.class, created.submissionId()
            )
        ).isEqualTo(HexFormat.of().formatHex(digest(SHA_256, outer)));
        assertThat(
            jdbc.queryForList(
                "SELECT LOWER(HEX(artifact.sha256)) FROM submission_artifact link "
                    + "JOIN source_artifact artifact ON artifact.id = link.artifact_id "
                    + "WHERE link.submission_id = ? AND link.role = 'TEACHER_CHILD'",
                String.class, created.submissionId()
            )
        ).containsExactlyInAnyOrder(
            HexFormat.of().formatHex(digest(SHA_256, sb3)),
            HexFormat.of().formatHex(digest(SHA_256, mblock)),
            HexFormat.of().formatHex(digest(SHA_256, broken))
        );
        assertThat(
            jdbc.queryForObject(
                "SELECT COUNT(*) FROM analysis_job WHERE submission_id = ?", Integer.class, created.submissionId()
            )
        ).isEqualTo(4);
        assertThat(
            jdbc.queryForList(
                "SELECT event_type FROM submission_event WHERE submission_id = ? "
                    + "AND event_type IN ('DONE', 'FAILED') ORDER BY sequence_no",
                String.class, created.submissionId()
            )
        ).containsExactlyInAnyOrder("DONE", "DONE", "FAILED");
        client.get()
            .uri(SUBMISSION_PATH, created.token())
            .exchange()
            .expectStatus().isOk()
            .expectBody(String.class)
            .value(
                body -> assertThat(body)
                    .doesNotContain("manifest", "storageKey", "sourceArtifact", "synthetic broken child")
            );
    }

    @Test
    @SuppressWarnings("checkstyle:MethodLength")
    void paginatesDeduplicatesAndContinuesAStudioAfterOneProjectFailure() throws Exception {
        jsonResponse("[{\"id\":101},{\"id\":102}]".getBytes(StandardCharsets.UTF_8));
        jsonResponse("[{\"id\":102},{\"id\":103}]".getBytes(StandardCharsets.UTF_8));
        jsonResponse("[]".getBytes(StandardCharsets.UTF_8));
        jsonResponse(scratchMetadata("studio-user-one", "studio-token-one"));
        jsonResponse(scratchUrlProject());
        response(thumbnail(), MediaType.IMAGE_PNG_VALUE);
        SCRATCH.enqueue(new MockResponse.Builder().code(404).build());
        jsonResponse(scratchMetadata("studio-user-three", "studio-token-three"));
        jsonResponse(scratchUrlProject());
        response(thumbnail(), MediaType.IMAGE_PNG_VALUE);

        final SingleProjectDtos.CreatedSubmission created = client.post()
            .uri("/api/v1/submissions")
            .header(HttpHeaders.ACCEPT_LANGUAGE, ENGLISH)
            .header(IDEMPOTENCY_KEY, "synthetic-studio-multi-page")
            .contentType(MediaType.APPLICATION_JSON)
            .bodyValue(new SingleProjectController.ProjectUrlRequest(null, "17"))
            .exchange()
            .expectStatus().isAccepted()
            .expectBody(SingleProjectDtos.CreatedSubmission.class)
            .returnResult().getResponseBody();

        assertThat(created).isNotNull();
        Awaitility.await().atMost(java.time.Duration.ofSeconds(20)).untilAsserted(() -> {
            final SingleProjectDtos.SubmissionView view = submission(created.token());
            assertThat(view.status()).isEqualTo("partial");
            assertThat(view.expectedCount()).isEqualTo(3);
            assertThat(view.completedCount()).isEqualTo(2);
            assertThat(view.failedCount()).isEqualTo(1);
            assertThat(view.analyses()).extracting(SingleProjectDtos.AnalysisView::name)
                .containsExactly("scratch-101.sb3", "scratch-102.json", "scratch-103.sb3");
        });
        assertThat(
            jdbc.queryForObject(
                "SELECT COUNT(*) FROM scratch_project_stats stats JOIN analysis a ON a.id = stats.analysis_id "
                    + "WHERE a.submission_id = ?",
                Integer.class, created.submissionId()
            )
        ).isEqualTo(2);
        assertThat(
            jdbc.queryForList(
                "SELECT stats.author_username FROM scratch_project_stats stats "
                    + "JOIN analysis a ON a.id = stats.analysis_id WHERE a.submission_id = ? ORDER BY a.id",
                String.class, created.submissionId()
            )
        ).containsExactly("studio-user-one", "studio-user-three");
        assertThat(
            jdbc.queryForObject(
                "SELECT COUNT(*) FROM submission_artifact WHERE submission_id = ? AND role = 'SCRATCH_PROJECT'",
                Integer.class, created.submissionId()
            )
        ).isEqualTo(2);
        assertThat(
            jdbc.queryForObject(
                "SELECT COUNT(*) FROM submission_artifact WHERE submission_id = ? "
                    + "AND role = 'SCRATCH_PROJECT_FAILURE'",
                Integer.class, created.submissionId()
            )
        ).isEqualTo(1);
        client.get()
            .uri(SUBMISSION_PATH, created.token())
            .exchange()
            .expectStatus().isOk()
            .expectBody(String.class)
            .value(
                body -> assertThat(body)
                    .doesNotContain("studio-user-one")
                    .doesNotContain("studio-user-three")
            );
    }

    @Test
    void hidesAssetsFromOtherSubmissionTokens() throws IOException {
        final byte[] otherThumbnail = thumbnail().clone();
        otherThumbnail[otherThumbnail.length - 1] ^= 1;
        final SingleProjectDtos.CreatedSubmission owner = submit(
            archive(), "synthetic-asset-owner", ENGLISH
        );
        final SingleProjectDtos.CreatedSubmission other = submit(
            archive(otherThumbnail), "synthetic-asset-other", ENGLISH
        );
        final SingleProjectDtos.CreatedSubmission questionOwner = submitQuestions(
            archive(), "synthetic-question-owner", ENGLISH
        );

        Awaitility.await().atMost(java.time.Duration.ofSeconds(15)).untilAsserted(() -> {
            assertThat(submission(owner.token()).status()).isEqualTo(COMPLETED);
            assertThat(submission(other.token()).status()).isEqualTo(COMPLETED);
            assertThat(submission(questionOwner.token()).status()).isEqualTo(COMPLETED);
        });
        final SingleProjectDtos.SubmissionView ownerView = submission(owner.token());
        final String asset = ownerView.analysis().assetRefs().getFirst();
        final String sha256 = asset.substring(asset.lastIndexOf('/') + 1);

        client.get()
            .uri("/api/v1/submissions/{token}/assets/{sha256}", other.token(), sha256)
            .exchange()
            .expectStatus().isNotFound();

        client.post()
            .uri("/api/v1/analyses/{id}/feedback", ownerView.analysis().id())
            .header(HttpHeaders.AUTHORIZATION, BEARER_PREFIX + other.token())
            .contentType(MediaType.APPLICATION_JSON)
            .bodyValue(
                new SingleProjectDtos.FeedbackRequest(
                    ownerView.analysis().issues().getFirst().finderId(), "helpful"
                )
            )
            .exchange()
            .expectStatus().isNotFound();

        final SingleProjectDtos.SubmissionView questionView = submission(questionOwner.token());
        final SingleProjectDtos.QuizView question = questionView.analysis().quiz().getFirst();
        client.post()
            .uri("/api/v1/analyses/{id}/quiz-answers", questionView.analysis().id())
            .header(HttpHeaders.AUTHORIZATION, BEARER_PREFIX + other.token())
            .contentType(MediaType.APPLICATION_JSON)
            .bodyValue(new SingleProjectDtos.QuizAnswerRequest(question.questionId(), "tampered"))
            .exchange()
            .expectStatus().isNotFound();

        client.post()
            .uri("/api/v1/analyses/{id}/feedback", Long.MAX_VALUE)
            .header(HttpHeaders.AUTHORIZATION, BEARER_PREFIX + owner.token())
            .contentType(MediaType.APPLICATION_JSON)
            .bodyValue(new SingleProjectDtos.FeedbackRequest("missing", "helpful"))
            .exchange()
            .expectStatus().isNotFound();
    }

    @Test
    void keepsUntrustedProjectContentInertInDownloadedReports() throws IOException {
        final String payload = "<img src=x onerror=alert(42)>";
        final byte[] untrusted = archive(
            thumbnail(), project -> project.replace("\"name\": \"boat\"", "\"name\": \"" + payload + "\"")
                .replace("Noooooo!", payload)
        );
        final SingleProjectDtos.CreatedSubmission created = submit(
            untrusted, "synthetic-xss", ENGLISH, payload + ".sb3"
        );

        Awaitility.await().atMost(java.time.Duration.ofSeconds(15)).untilAsserted(
            () -> assertThat(submission(created.token()).status()).isEqualTo(COMPLETED)
        );
        assertThat(submission(created.token()).analysis().issues())
            .anyMatch(issue -> payload.equals(issue.sprite()) || issue.scratchblocks().contains(payload));

        client.get()
            .uri("/api/v1/submissions/{token}/report.html", created.token())
            .exchange()
            .expectStatus().isOk()
            .expectHeader().valueMatches(HttpHeaders.CONTENT_DISPOSITION, "attachment;.*")
            .expectHeader().valueEquals(HttpHeaders.CACHE_CONTROL, "no-store")
            .expectBody(String.class)
            .value(
                report -> assertThat(report)
                    .contains("&lt;img src=x onerror=alert(42)&gt;")
                    .doesNotContain(payload)
            );
    }

    private SingleProjectDtos.SubmissionView submission(final String token) {
        return client.get()
            .uri(SUBMISSION_PATH, token)
            .exchange()
            .expectStatus().isOk()
            .expectBody(SingleProjectDtos.SubmissionView.class)
            .returnResult().getResponseBody();
    }

    private SingleProjectDtos.CreatedSubmission submit(
        final byte[] archive,
        final String key,
        final String locale
    ) {
        return submit(archive, key, locale, "synthetic.sb3");
    }

    private SingleProjectDtos.CreatedSubmission submit(
        final byte[] archive,
        final String key,
        final String locale,
        final String filename
    ) {
        final LinkedMultiValueMap<String, Object> parts = new LinkedMultiValueMap<>();
        parts.add("file", new ByteArrayResource(archive) {

            @Override
            public String getFilename() {
                return filename;
            }
        });
        return client.post()
            .uri("/api/v1/submissions")
            .header(HttpHeaders.ACCEPT_LANGUAGE, locale)
            .header(IDEMPOTENCY_KEY, key)
            .contentType(MediaType.MULTIPART_FORM_DATA)
            .bodyValue(parts)
            .exchange()
            .expectStatus().isAccepted()
            .expectHeader().exists(HttpHeaders.LOCATION)
            .expectBody(SingleProjectDtos.CreatedSubmission.class)
            .returnResult().getResponseBody();
    }

    private SingleProjectDtos.CreatedSubmission submitUrl(
        final String projectUrl,
        final String key,
        final String locale
    ) {
        return client.post()
            .uri("/api/v1/submissions")
            .header(HttpHeaders.ACCEPT_LANGUAGE, locale)
            .header(IDEMPOTENCY_KEY, key)
            .contentType(MediaType.APPLICATION_JSON)
            .bodyValue(new SingleProjectController.ProjectUrlRequest(projectUrl, null))
            .exchange()
            .expectStatus().isAccepted()
            .expectHeader().exists(HttpHeaders.LOCATION)
            .expectBody(SingleProjectDtos.CreatedSubmission.class)
            .returnResult().getResponseBody();
    }

    private SingleProjectDtos.CreatedSubmission submitQuestions(
        final byte[] archive,
        final String key,
        final String locale
    ) {
        final LinkedMultiValueMap<String, Object> parts = new LinkedMultiValueMap<>();
        parts.add("file", new ByteArrayResource(archive) {

            @Override
            public String getFilename() {
                return "synthetic.sb3";
            }
        });
        return client.post()
            .uri("/api/v1/question-submissions")
            .header(HttpHeaders.ACCEPT_LANGUAGE, locale)
            .header(IDEMPOTENCY_KEY, key)
            .contentType(MediaType.MULTIPART_FORM_DATA)
            .bodyValue(parts)
            .exchange()
            .expectStatus().isAccepted()
            .expectHeader().exists(HttpHeaders.LOCATION)
            .expectBody(SingleProjectDtos.CreatedSubmission.class)
            .returnResult().getResponseBody();
    }

    private SingleProjectDtos.CreatedSubmission submitQuestionUrl(
        final String projectUrl,
        final String key,
        final String locale
    ) {
        return client.post()
            .uri("/api/v1/question-submissions")
            .header(HttpHeaders.ACCEPT_LANGUAGE, locale)
            .header(IDEMPOTENCY_KEY, key)
            .contentType(MediaType.APPLICATION_JSON)
            .bodyValue(new SingleProjectDtos.QuestionProjectUrlRequest(projectUrl))
            .exchange()
            .expectStatus().isAccepted()
            .expectHeader().exists(HttpHeaders.LOCATION)
            .expectBody(SingleProjectDtos.CreatedSubmission.class)
            .returnResult().getResponseBody();
    }

    private SingleProjectDtos.CreatedSubmission reuse(
        final String token,
        final String analysis,
        final String key
    ) {
        return client.post()
            .uri("/api/v1/submissions/{token}/reuse", token)
            .header(IDEMPOTENCY_KEY, key)
            .contentType(MediaType.APPLICATION_JSON)
            .bodyValue(new SingleProjectDtos.ReuseRequest(analysis))
            .exchange()
            .expectStatus().isAccepted()
            .expectHeader().exists(HttpHeaders.LOCATION)
            .expectBody(SingleProjectDtos.CreatedSubmission.class)
            .returnResult().getResponseBody();
    }

    private byte[] teacherArchive() throws IOException {
        return teacherArchive(
            archive(), "valid.sb3", "not a Scratch archive".getBytes(StandardCharsets.UTF_8),
            "broken.sb3", null, null
        );
    }

    private byte[] teacherArchive(
        final byte[] first,
        final String firstName,
        final byte[] second,
        final String secondName,
        final byte[] third,
        final String thirdName
    ) throws IOException {
        final ByteArrayOutputStream output = new ByteArrayOutputStream();
        try (ZipOutputStream zip = new ZipOutputStream(output)) {
            writeEntry(zip, firstName, first);
            writeEntry(zip, secondName, second);
            if (third != null && thirdName != null) {
                writeEntry(zip, thirdName, third);
            }
        }
        return output.toByteArray();
    }

    private void writeEntry(final ZipOutputStream zip, final String name, final byte[] bytes) throws IOException {
        zip.putNextEntry(new ZipEntry(name));
        zip.write(bytes);
        zip.closeEntry();
    }

    private byte[] zipEntry(final byte[] archive, final String name) throws IOException {
        try (
            java.util.zip.ZipInputStream zip = new java.util.zip.ZipInputStream(
                new java.io.ByteArrayInputStream(archive)
            )
        ) {
            ZipEntry entry;
            while ((entry = zip.getNextEntry()) != null) {
                if (name.equals(entry.getName())) {
                    return zip.readAllBytes();
                }
            }
        }
        throw new IOException("Synthetic ZIP entry is missing");
    }

    private byte[] archive() throws IOException {
        return archive(thumbnail());
    }

    private byte[] archive(final byte[] thumbnail) throws IOException {
        return archive(thumbnail, UnaryOperator.identity());
    }

    private byte[] archive(final byte[] thumbnail, final UnaryOperator<String> projectTransform) throws IOException {
        final byte[] project;
        try (InputStream source = getClass().getResourceAsStream("/fixtures/scratch_programs/boatRace.json")) {
            if (source == null) {
                throw new IOException("Synthetic Scratch fixture is missing");
            }
            final String fixture = new String(source.readAllBytes(), StandardCharsets.UTF_8);
            final String digest = HexFormat.of().formatHex(digest(MD5, thumbnail));
            project = projectTransform.apply(
                fixture.replace("c6e6f0d02cfe3464d5389c49f09a64d4", digest)
            )
                .getBytes(StandardCharsets.UTF_8);
        }
        final ByteArrayOutputStream output = new ByteArrayOutputStream();
        try (ZipOutputStream zip = new ZipOutputStream(output)) {
            zip.putNextEntry(new ZipEntry("project.json"));
            zip.write(project);
            zip.closeEntry();
            final String digest = HexFormat.of().formatHex(digest(MD5, thumbnail));
            zip.putNextEntry(new ZipEntry(digest + ".png"));
            zip.write(thumbnail);
            zip.closeEntry();
        }
        return output.toByteArray();
    }

    private byte[] thumbnail() {
        return Base64.getDecoder().decode(
            "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII="
        );
    }

    private byte[] scratchUrlProject() throws IOException {
        try (InputStream source = getClass().getResourceAsStream("/fixtures/scratch_programs/boatRace.json")) {
            if (source == null) {
                throw new IOException("Synthetic Scratch fixture is missing");
            }
            final String asset = HexFormat.of().formatHex(digest(MD5, thumbnail()));
            return new String(source.readAllBytes(), StandardCharsets.UTF_8)
                .replaceAll(
                    "\"assetId\": \"[0-9a-fA-F]{32}\"", "\"assetId\": \"" + asset + "\""
                )
                .replaceAll(
                    "\"md5ext\": \"[0-9a-fA-F]{32}\\.[A-Za-z0-9]+\"",
                    "\"md5ext\": \"" + asset + ".png\""
                )
                .getBytes(StandardCharsets.UTF_8);
        }
    }

    private byte[] scratchMetadata(final String username, final String token) {
        return ("{\"project_token\":\"" + token + "\",\"username\":\"" + username + "\","
            + "\"stats\":{\"views\":5,\"loves\":4,\"favorites\":3,\"remixes\":2},"
            + "\"history\":{\"created\":\"2020-01-02T03:04:05Z\"}}")
            .getBytes(StandardCharsets.UTF_8);
    }

    private static MockWebServer startScratchServer() {
        try {
            final MockWebServer server = new MockWebServer();
            server.start();
            return server;
        }
        catch (IOException error) {
            throw new ExceptionInInitializerError(error);
        }
    }

    private static String scratchBase() {
        return "http://127.0.0.1:" + SCRATCH.getPort();
    }

    private void jsonResponse(final byte[] body) {
        response(body, "application/json");
    }

    private void response(final byte[] body, final String contentType) {
        SCRATCH.enqueue(
            new MockResponse.Builder()
                .code(200)
                .addHeader("Content-Type", contentType)
                .body(new Buffer().write(body))
                .build()
        );
    }

    private byte[] digest(final String algorithm, final byte[] content) {
        try {
            return MessageDigest.getInstance(algorithm).digest(content);
        }
        catch (NoSuchAlgorithmException error) {
            throw new IllegalStateException(error);
        }
    }
}
