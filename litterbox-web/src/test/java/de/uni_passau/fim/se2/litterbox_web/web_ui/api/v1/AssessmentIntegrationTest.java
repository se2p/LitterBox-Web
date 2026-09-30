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
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Base64;
import java.util.HexFormat;
import java.util.List;
import java.util.concurrent.Callable;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.zip.ZipEntry;
import java.util.zip.ZipOutputStream;

import org.awaitility.Awaitility;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.core.io.ByteArrayResource;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.reactive.server.WebTestClient;
import org.springframework.util.LinkedMultiValueMap;
import org.springframework.web.reactive.function.client.ExchangeStrategies;

import de.uni_passau.fim.se2.litterbox_web.util.TestDatabase;
import de.uni_passau.fim.se2.litterbox_web.web_ui.assessment.AssessmentDtos;
import de.uni_passau.fim.se2.litterbox_web.web_ui.assessment.AssessmentService;
import de.uni_passau.fim.se2.litterbox_web.web_ui.persistence.Assessment;
import de.uni_passau.fim.se2.litterbox_web.web_ui.persistence.AssessmentRepository;
import de.uni_passau.fim.se2.litterbox_web.web_ui.persistence.AttemptClaim;
import de.uni_passau.fim.se2.litterbox_web.web_ui.single_project.SingleProjectDtos;
import de.uni_passau.fim.se2.litterbox_web.web_ui.support.WebUiProfiles;
import tools.jackson.databind.json.JsonMapper;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@ActiveProfiles({ "test", WebUiProfiles.PUBLIC_WEB })
class AssessmentIntegrationTest {

    private static final String ENGLISH = "en";
    private static final String COMPLETED = "completed";
    private static final String MD5 = "MD5";
    private static final String BEARER_PREFIX = "Bearer ";
    private static final String ASSESSMENTS_PATH = "/api/v1/assessments";
    private static final String PUBLIC_ASSESSMENT_PATH = ASSESSMENTS_PATH + "/{publicToken}";
    private static final String ATTEMPTS_PATH = PUBLIC_ASSESSMENT_PATH + "/attempts";
    private static final String ANSWERS_PATH = ATTEMPTS_PATH + "/{attemptToken}/answers";
    private static final String RESULTS_PATH = PUBLIC_ASSESSMENT_PATH + "/results";
    private static final String ATTEMPT_ID_SUBQUERY = "(SELECT id FROM assessment_attempt WHERE public_token = ?)";
    private static final String CUSTOM_QUESTION_ID = "1";
    private static final String FOREVER = "forever";
    private static final String REPEAT_TEN = "repeat 10";

    private static final TestDatabase DATABASE = TestDatabase.freshSchema("assessment_integration").migrated();

    @AfterAll
    static void stopDatabase() {
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
                + "/litterbox-assessment-integration"
        );
        properties.add("litterbox.capabilities.assessments.enabled", () -> "true");
        properties.add("litterbox.capabilities.assessments.max-attempts", () -> "3");
        properties.add("litterbox.capabilities.assessments.max-options", () -> "5");
        properties.add("litterbox.capabilities.assessments.max-answer-length", () -> "120");
        properties.add("litterbox.capabilities.assessments.max-option-length", () -> "100");
        properties.add("litterbox.capabilities.assessments.max-assessments-per-analysis", () -> "25");
    }

    private static final int MAX_ASSESSMENTS_PER_ANALYSIS = 25;

    @LocalServerPort
    private int port;

    @Autowired
    private JdbcTemplate jdbc;

    @Autowired
    private AssessmentService assessmentService;

    @Autowired
    private AssessmentRepository assessments;

    private WebTestClient client;

    private static SharedAnalysis sharedAnalysis;

    private record SharedAnalysis(long analysisId, String submissionToken) {
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

    @Test
    void publishesAnAssessmentStartsAnAttemptAndRecordsAnAnswerThroughTheRealController() throws IOException {
        final SingleProjectDtos.CreatedSubmission submission = submitQuestions();
        Awaitility.await().atMost(Duration.ofSeconds(15)).untilAsserted(
            () -> assertThat(submission(submission.token()).status()).isEqualTo(COMPLETED)
        );
        final SingleProjectDtos.SubmissionView view = submission(submission.token());
        final SingleProjectDtos.QuizView question = view.analysis().quiz().getFirst();

        final AssessmentDtos.CreatedAssessment created = publishGeneratedAssessment(
            submission.token(), view.analysis().id(), question.questionId()
        );
        assertThat(created).isNotNull();

        final AssessmentDtos.LearnerView learnerView = client.get()
            .uri(PUBLIC_ASSESSMENT_PATH, created.publicToken())
            .exchange()
            .expectStatus().isOk()
            .expectBody(AssessmentDtos.LearnerView.class)
            .returnResult().getResponseBody();
        assertThat(learnerView).isNotNull();
        final AssessmentDtos.LearnerQuestion learnerQuestion = learnerView.questions().getFirst();

        final String rawAttempt = client.post()
            .uri(ATTEMPTS_PATH, created.publicToken())
            .exchange()
            .expectStatus().isCreated()
            .expectBody(String.class)
            .returnResult().getResponseBody();
        assertThat(rawAttempt).isNotNull().containsPattern("\"attemptId\"\\s*:\\s*\"[^\"]+\"");
        final AssessmentDtos.AttemptStarted attempt = JsonMapper.shared()
            .readValue(rawAttempt, AssessmentDtos.AttemptStarted.class);
        assertThat(attempt.attemptId()).isNotBlank();

        final String answer = firstOfferedAnswer(learnerQuestion);
        client.post()
            .uri(ANSWERS_PATH, created.publicToken(), attempt.attemptId())
            .contentType(MediaType.APPLICATION_JSON)
            .bodyValue(new AssessmentDtos.AnswerRequest(learnerQuestion.questionId(), answer))
            .exchange()
            .expectStatus().isOk()
            .expectBody(AssessmentDtos.AnswerResult.class)
            .value(result -> assertThat(result.questionId()).isEqualTo(learnerQuestion.questionId()));

        assertThat(
            jdbc.queryForObject(
                "SELECT COUNT(*) FROM assessment_answer WHERE attempt_id = "
                    + ATTEMPT_ID_SUBQUERY,
                Integer.class, attempt.attemptId()
            )
        ).isEqualTo(1);
    }

    @Test
    void assessmentQuotaAllowsOnlyOneConcurrentCreate() throws Exception {
        final SingleProjectDtos.CreatedSubmission submission = submitQuestions("synthetic-assessment-quota-concurrent");
        Awaitility.await().atMost(Duration.ofSeconds(15)).untilAsserted(
            () -> assertThat(submission(submission.token()).status()).isEqualTo(COMPLETED)
        );
        final long analysisId = submission(submission.token()).analysis().id();
        final AssessmentRepository.NewAssessment request = new AssessmentRepository.NewAssessment(
            analysisId, "Concurrent quiz", null, ENGLISH, "{}", Instant.now().plusSeconds(3600)
        );
        final ExecutorService pool = Executors.newFixedThreadPool(8);
        final CountDownLatch ready = new CountDownLatch(8);
        final CountDownLatch go = new CountDownLatch(1);
        try {
            final List<Future<Assessment>> replies = new ArrayList<>();
            for (int index = 0; index < 8; index++) {
                replies.add(pool.submit(() -> {
                    ready.countDown();
                    go.await();
                    return assessments.create(request, 1).block(Duration.ofSeconds(30));
                }));
            }
            assertThat(ready.await(30, TimeUnit.SECONDS)).isTrue();
            go.countDown();
            long created = 0;
            for (final Future<Assessment> reply : replies) {
                if (reply.get(60, TimeUnit.SECONDS) != null) {
                    created++;
                }
            }
            assertThat(created).isEqualTo(1);
        }
        finally {
            pool.shutdownNow();
        }
        assertThat(
            jdbc.queryForObject(
                "SELECT assessment_count FROM analysis WHERE id = ?", Integer.class, analysisId
            )
        ).isEqualTo(1);
        assertThat(
            jdbc.queryForObject(
                "SELECT COUNT(*) FROM assessment WHERE analysis_id = ?", Integer.class, analysisId
            )
        ).isEqualTo(1);
    }

    @Test
    void cleanupDoesNotDeleteAnAssessmentExtendedAfterItWasSelected() throws IOException {
        final AssessmentDtos.CreatedAssessment created = createCustomAssessment();
        final long id = assessmentId(created);
        jdbc.update(
            "UPDATE assessment SET expires_at = CURRENT_TIMESTAMP(6) - INTERVAL 1 MINUTE WHERE id = ?", id
        );
        final Instant now = Instant.now();
        assertThat(assessments.findExpired(now, 50).block()).contains(id);

        jdbc.update(
            "UPDATE assessment SET expires_at = CURRENT_TIMESTAMP(6) + INTERVAL 1 DAY WHERE id = ?", id
        );
        assertThat(assessments.deleteExpired(id, now).block()).isFalse();
        assertThat(
            jdbc.queryForObject(
                "SELECT COUNT(*) FROM assessment WHERE id = ?", Integer.class, id
            )
        ).isEqualTo(1);
    }

    @Test
    void submittingTheSameAnswerTwiceLeavesOneRowAndResultsReportOneAnswered() throws IOException {
        final AssessmentDtos.CreatedAssessment created = createCustomAssessment();
        final AssessmentDtos.AttemptStarted attempt = startAttempt(created.publicToken());

        submitAnswer(created.publicToken(), attempt.attemptId(), CUSTOM_QUESTION_ID, FOREVER);
        submitAnswer(created.publicToken(), attempt.attemptId(), CUSTOM_QUESTION_ID, FOREVER);

        assertThat(
            jdbc.queryForObject(
                "SELECT COUNT(*) FROM assessment_answer WHERE question_id = '1' AND attempt_id = "
                    + ATTEMPT_ID_SUBQUERY,
                Integer.class, attempt.attemptId()
            )
        ).isEqualTo(1);

        final AssessmentDtos.ResultsView results = results(created);
        assertThat(results.questions()).singleElement()
            .satisfies(question -> assertThat(question.answered()).isEqualTo(1));
    }

    @Test
    void answeringASecondTimeChangesNeitherTheStoredAnswerNorTheVerdictReported() throws IOException {
        final AssessmentDtos.CreatedAssessment created = createCustomAssessment();
        final AssessmentDtos.AttemptStarted attempt = startAttempt(created.publicToken());

        final AssessmentDtos.AnswerResult first = submitAnswer(
            created.publicToken(), attempt.attemptId(), CUSTOM_QUESTION_ID, REPEAT_TEN
        );
        assertThat(first.correct()).isFalse();
        assertThat(first.correctAnswers()).containsExactly(FOREVER);

        final AssessmentDtos.AnswerResult second = submitAnswer(
            created.publicToken(), attempt.attemptId(), CUSTOM_QUESTION_ID, FOREVER
        );
        assertThat(second.correct()).isFalse();

        assertThat(
            jdbc.queryForObject(
                "SELECT COUNT(*) FROM assessment_answer WHERE question_id = '1' AND attempt_id = "
                    + ATTEMPT_ID_SUBQUERY,
                Integer.class, attempt.attemptId()
            )
        ).isEqualTo(1);
        assertThat(
            jdbc.queryForObject(
                "SELECT answer FROM assessment_answer WHERE question_id = '1' AND attempt_id = "
                    + ATTEMPT_ID_SUBQUERY,
                String.class, attempt.attemptId()
            )
        ).isEqualTo(REPEAT_TEN);
        assertThat(
            jdbc.queryForObject(
                "SELECT correct FROM assessment_answer WHERE question_id = '1' AND attempt_id = "
                    + ATTEMPT_ID_SUBQUERY,
                Boolean.class, attempt.attemptId()
            )
        ).isFalse();
        assertThat(results(created).questions()).singleElement()
            .satisfies(question -> assertThat(question.incorrect()).isEqualTo(1));
    }

    @Test
    void deleteRemovesTheQuizAndItsAttemptsAndAnswers() throws IOException {
        final AssessmentDtos.CreatedAssessment created = createCustomAssessment();
        final AssessmentDtos.AttemptStarted attempt = startAttempt(created.publicToken());
        submitAnswer(created.publicToken(), attempt.attemptId(), CUSTOM_QUESTION_ID, FOREVER);
        final Long attemptRowId = jdbc.queryForObject(
            "SELECT id FROM assessment_attempt WHERE public_token = ?", Long.class, attempt.attemptId()
        );

        client.delete()
            .uri(PUBLIC_ASSESSMENT_PATH, created.publicToken())
            .header(HttpHeaders.AUTHORIZATION, BEARER_PREFIX + created.teacherToken())
            .exchange()
            .expectStatus().isNoContent();

        assertThat(
            jdbc.queryForObject(
                "SELECT COUNT(*) FROM assessment WHERE public_token = ?", Integer.class, created.publicToken()
            )
        ).isZero();
        assertThat(
            jdbc.queryForObject("SELECT COUNT(*) FROM assessment_attempt WHERE id = ?", Integer.class, attemptRowId)
        )
            .isZero();
        assertThat(
            jdbc.queryForObject(
                "SELECT COUNT(*) FROM assessment_answer WHERE attempt_id = ?", Integer.class, attemptRowId
            )
        )
            .isZero();
    }

    @Test
    void refusesLearnerViewStartAttemptAndAnswerOnceTheQuizIsClosedButStillServesResults() throws IOException {
        final AssessmentDtos.CreatedAssessment created = createCustomAssessment();
        final AssessmentDtos.AttemptStarted attempt = startAttempt(created.publicToken());

        client.patch()
            .uri(PUBLIC_ASSESSMENT_PATH, created.publicToken())
            .header(HttpHeaders.AUTHORIZATION, BEARER_PREFIX + created.teacherToken())
            .contentType(MediaType.APPLICATION_JSON)
            .bodyValue(new AssessmentDtos.UpdateAssessmentRequest(AssessmentDtos.STATUS_CLOSED, null, null))
            .exchange()
            .expectStatus().isOk()
            .expectBody(AssessmentDtos.AssessmentState.class)
            .value(state -> assertThat(state.status()).isEqualTo(AssessmentDtos.STATUS_CLOSED));

        client.get().uri(PUBLIC_ASSESSMENT_PATH, created.publicToken())
            .exchange().expectStatus().isEqualTo(HttpStatus.GONE);
        client.post().uri(ATTEMPTS_PATH, created.publicToken())
            .exchange().expectStatus().isEqualTo(HttpStatus.GONE);
        client.post()
            .uri(
                ANSWERS_PATH, created.publicToken(),
                attempt.attemptId()
            )
            .contentType(MediaType.APPLICATION_JSON)
            .bodyValue(new AssessmentDtos.AnswerRequest(CUSTOM_QUESTION_ID, FOREVER))
            .exchange().expectStatus().isEqualTo(HttpStatus.GONE);

        client.get().uri(RESULTS_PATH, created.publicToken())
            .header(HttpHeaders.AUTHORIZATION, BEARER_PREFIX + created.teacherToken())
            .exchange()
            .expectStatus().isOk()
            .expectBody(AssessmentDtos.ResultsView.class)
            .value(
                results -> {
                    assertThat(results.status()).isEqualTo(AssessmentDtos.STATUS_CLOSED);
                    assertThat(results.title()).isEqualTo("A quiz");
                }
            );
    }

    @Test
    void refusesLearnerViewStartAttemptAndAnswerOnceTheQuizHasPassedItsDeadlineButStillServesResults()
        throws IOException {
        final AssessmentDtos.CreatedAssessment created = createCustomAssessment();
        final AssessmentDtos.AttemptStarted attempt = startAttempt(created.publicToken());

        jdbc.update(
            "UPDATE assessment SET expires_at = NOW() - INTERVAL 1 MINUTE WHERE public_token = ?", created.publicToken()
        );

        client.get().uri(PUBLIC_ASSESSMENT_PATH, created.publicToken())
            .exchange().expectStatus().isEqualTo(HttpStatus.GONE);
        client.post().uri(ATTEMPTS_PATH, created.publicToken())
            .exchange().expectStatus().isEqualTo(HttpStatus.GONE);
        client.post()
            .uri(
                ANSWERS_PATH, created.publicToken(),
                attempt.attemptId()
            )
            .contentType(MediaType.APPLICATION_JSON)
            .bodyValue(new AssessmentDtos.AnswerRequest(CUSTOM_QUESTION_ID, FOREVER))
            .exchange().expectStatus().isEqualTo(HttpStatus.GONE);

        client.get().uri(RESULTS_PATH, created.publicToken())
            .header(HttpHeaders.AUTHORIZATION, BEARER_PREFIX + created.teacherToken())
            .exchange()
            .expectStatus().isOk()
            .expectBody(AssessmentDtos.ResultsView.class)
            .value(results -> assertThat(results.status()).isEqualTo(AssessmentDtos.STATUS_CLOSED));
    }

    @Test
    void patchClosesAndReopensAQuizThroughTheRealController() throws IOException {
        final AssessmentDtos.CreatedAssessment created = createCustomAssessment();

        client.patch()
            .uri(PUBLIC_ASSESSMENT_PATH, created.publicToken())
            .header(HttpHeaders.AUTHORIZATION, BEARER_PREFIX + created.teacherToken())
            .contentType(MediaType.APPLICATION_JSON)
            .bodyValue(new AssessmentDtos.UpdateAssessmentRequest(AssessmentDtos.STATUS_CLOSED, null, null))
            .exchange()
            .expectStatus().isOk()
            .expectBody(AssessmentDtos.AssessmentState.class)
            .value(state -> assertThat(state.status()).isEqualTo(AssessmentDtos.STATUS_CLOSED));

        client.patch()
            .uri(PUBLIC_ASSESSMENT_PATH, created.publicToken())
            .header(HttpHeaders.AUTHORIZATION, BEARER_PREFIX + created.teacherToken())
            .contentType(MediaType.APPLICATION_JSON)
            .bodyValue(new AssessmentDtos.UpdateAssessmentRequest(AssessmentDtos.STATUS_OPEN, null, null))
            .exchange()
            .expectStatus().isOk()
            .expectBody(AssessmentDtos.AssessmentState.class)
            .value(state -> assertThat(state.status()).isEqualTo(AssessmentDtos.STATUS_OPEN));
    }

    @Test
    void resultsPatchAndDeleteRequireTheTeacherTokenNotThePublicOne() throws IOException {
        final AssessmentDtos.CreatedAssessment created = createCustomAssessment();

        client.get().uri(RESULTS_PATH, created.publicToken())
            .exchange().expectStatus().isEqualTo(HttpStatus.UNAUTHORIZED);
        client.get().uri(RESULTS_PATH, created.publicToken())
            .header(HttpHeaders.AUTHORIZATION, BEARER_PREFIX + created.publicToken())
            .exchange().expectStatus().isEqualTo(HttpStatus.NOT_FOUND);

        client.patch()
            .uri(PUBLIC_ASSESSMENT_PATH, created.publicToken())
            .header(HttpHeaders.AUTHORIZATION, BEARER_PREFIX + created.publicToken())
            .contentType(MediaType.APPLICATION_JSON)
            .bodyValue(new AssessmentDtos.UpdateAssessmentRequest(AssessmentDtos.STATUS_CLOSED, null, null))
            .exchange().expectStatus().isEqualTo(HttpStatus.NOT_FOUND);

        client.delete()
            .uri(PUBLIC_ASSESSMENT_PATH, created.publicToken())
            .header(HttpHeaders.AUTHORIZATION, BEARER_PREFIX + created.publicToken())
            .exchange().expectStatus().isEqualTo(HttpStatus.NOT_FOUND);
    }

    @Test
    void removeExpiredDeletesAQuizPastItsDeadlineAndLeavesOneStillInDate() throws IOException {
        final AssessmentDtos.CreatedAssessment expiring = createCustomAssessment();
        final AssessmentDtos.CreatedAssessment inDate = createCustomAssessment();
        jdbc.update(
            "UPDATE assessment SET expires_at = NOW() - INTERVAL 1 MINUTE WHERE public_token = ?",
            expiring.publicToken()
        );

        final Integer removed = assessmentService.removeExpired().block();

        assertThat(removed).isGreaterThanOrEqualTo(1);
        assertThat(
            jdbc.queryForObject(
                "SELECT COUNT(*) FROM assessment WHERE public_token = ?", Integer.class, expiring.publicToken()
            )
        ).isZero();
        assertThat(
            jdbc.queryForObject(
                "SELECT COUNT(*) FROM assessment WHERE public_token = ?", Integer.class, inDate.publicToken()
            )
        ).isEqualTo(1);
    }

    @Test
    void startingMoreAttemptsThanTheConfiguredMaximumIsRefused() throws IOException {
        final AssessmentDtos.CreatedAssessment created = createCustomAssessment();

        for (int index = 0; index < 3; index++) {
            client.post().uri(ATTEMPTS_PATH, created.publicToken())
                .exchange().expectStatus().isCreated();
        }

        client.post().uri(ATTEMPTS_PATH, created.publicToken())
            .exchange().expectStatus().isEqualTo(HttpStatus.TOO_MANY_REQUESTS);
    }

    @Test
    void attemptsStartedAtOnceStopAtTheConfiguredMaximum() throws Exception {
        final AssessmentDtos.CreatedAssessment created = createCustomAssessment();

        final List<Integer> statuses = allAtOnce(
            12,
            () -> client.post().uri(ATTEMPTS_PATH, created.publicToken())
                .exchange().returnResult(Void.class).getStatus().value()
        );

        assertThat(statuses).filteredOn(status -> status == HttpStatus.CREATED.value()).hasSize(3);
        assertThat(statuses).filteredOn(status -> status == HttpStatus.TOO_MANY_REQUESTS.value()).hasSize(9);
        assertThat(
            jdbc.queryForObject(
                "SELECT COUNT(*) FROM assessment_attempt WHERE assessment_id = "
                    + "(SELECT id FROM assessment WHERE public_token = ?)",
                Integer.class, created.publicToken()
            )
        ).isEqualTo(3);
        assertThat(
            jdbc.queryForObject(
                "SELECT attempts FROM assessment WHERE public_token = ?", Integer.class, created.publicToken()
            )
        ).isEqualTo(3);
    }

    @Test
    void answersToOneQuestionSubmittedAtOnceLeaveOneRow() throws Exception {
        final AssessmentDtos.CreatedAssessment created = createCustomAssessment();
        final AssessmentDtos.AttemptStarted attempt = startAttempt(created.publicToken());

        final List<Integer> statuses = allAtOnce(
            8,
            () -> client.post()
                .uri(
                    ANSWERS_PATH,
                    created.publicToken(), attempt.attemptId()
                )
                .contentType(MediaType.APPLICATION_JSON)
                .bodyValue(new AssessmentDtos.AnswerRequest(CUSTOM_QUESTION_ID, FOREVER))
                .exchange().returnResult(Void.class).getStatus().value()
        );

        assertThat(statuses).containsOnly(HttpStatus.OK.value());
        assertThat(
            jdbc.queryForObject(
                "SELECT COUNT(*) FROM assessment_answer WHERE question_id = '1' AND attempt_id = "
                    + ATTEMPT_ID_SUBQUERY,
                Integer.class, attempt.attemptId()
            )
        ).isEqualTo(1);
        assertThat(results(created).questions()).singleElement()
            .satisfies(question -> assertThat(question.answered()).isEqualTo(1));
    }

    @Test
    void capabilitiesReportTheLimitsThisDeploymentActuallyEnforces() {
        client.get().uri("/api/v1/capabilities")
            .exchange()
            .expectStatus().isOk()
            .expectBody(CapabilitiesDto.class)
            .value(
                capabilities -> {
                    assertThat(capabilities.enabledFeatures()).contains("assessments");
                    assertThat(capabilities.assessmentLimits()).isNotNull()
                        .satisfies(limits -> assertThat(limits.maxOptions()).isEqualTo(5))
                        .satisfies(limits -> assertThat(limits.maxQuestions()).isEqualTo(100))
                        .satisfies(limits -> assertThat(limits.maxTitleLength()).isEqualTo(200))
                        .satisfies(limits -> assertThat(limits.maxAnswerLength()).isEqualTo(120));
                }
            );
    }

    @Test
    void aClaimRefusesEveryQuizThatWouldNotHaveTakenASitting() throws IOException {
        final AssessmentDtos.CreatedAssessment closed = createCustomAssessment();
        jdbc.update("UPDATE assessment SET status = 'CLOSED' WHERE public_token = ?", closed.publicToken());
        assertThat(claim(closed).outcome()).isEqualTo(AttemptClaim.Outcome.UNAVAILABLE);
        assertThat(attemptsCounter(closed)).isZero();

        final AssessmentDtos.CreatedAssessment expired = createCustomAssessment();
        jdbc.update(
            "UPDATE assessment SET expires_at = NOW() - INTERVAL 1 MINUTE WHERE public_token = ?",
            expired.publicToken()
        );
        assertThat(claim(expired).outcome()).isEqualTo(AttemptClaim.Outcome.UNAVAILABLE);
        assertThat(attemptsCounter(expired)).isZero();

        final AssessmentDtos.CreatedAssessment full = createCustomAssessment();
        for (int index = 0; index < 3; index++) {
            startAttempt(full.publicToken());
        }
        assertThat(claim(full).outcome()).isEqualTo(AttemptClaim.Outcome.EXHAUSTED);
        assertThat(attemptsCounter(full)).isEqualTo(3);

        final AssessmentDtos.CreatedAssessment deleted = createCustomAssessment();
        final long deletedId = assessmentId(deleted);
        jdbc.update("DELETE FROM assessment WHERE public_token = ?", deleted.publicToken());
        assertThat(
            assessments.createAttempt(deletedId, 3, Instant.now()).block(Duration.ofSeconds(30)).outcome()
        ).isEqualTo(AttemptClaim.Outcome.UNAVAILABLE);
    }

    @Test
    void attemptsStartedWhileAQuizIsClosingLeaveTheCounterMatchingItsRows() throws Exception {
        final AssessmentDtos.CreatedAssessment created = createCustomAssessment();

        final List<Integer> statuses = allAtOnce(
            8,
            () -> client.post().uri(ATTEMPTS_PATH, created.publicToken())
                .exchange().returnResult(Void.class).getStatus().value(),
            () -> {
                jdbc.update("UPDATE assessment SET status = 'CLOSED' WHERE public_token = ?", created.publicToken());
                return HttpStatus.OK.value();
            }
        );

        assertThat(statuses.subList(0, 8)).allSatisfy(
            status -> assertThat(status)
                .isIn(HttpStatus.CREATED.value(), HttpStatus.GONE.value(), HttpStatus.TOO_MANY_REQUESTS.value())
        );
        assertThat(attemptsCounter(created)).isEqualTo(
            jdbc.queryForObject(
                "SELECT COUNT(*) FROM assessment_attempt WHERE assessment_id = "
                    + "(SELECT id FROM assessment WHERE public_token = ?)",
                Integer.class, created.publicToken()
            )
        );
        client.post().uri(ATTEMPTS_PATH, created.publicToken())
            .exchange().expectStatus().isEqualTo(HttpStatus.GONE);
    }

    private AttemptClaim claim(final AssessmentDtos.CreatedAssessment created) {
        return assessments.createAttempt(assessmentId(created), 3, Instant.now())
            .block(Duration.ofSeconds(30));
    }

    private long assessmentId(final AssessmentDtos.CreatedAssessment created) {
        return jdbc.queryForObject(
            "SELECT id FROM assessment WHERE public_token = ?", Long.class, created.publicToken()
        );
    }

    private int attemptsCounter(final AssessmentDtos.CreatedAssessment created) {
        return jdbc.queryForObject(
            "SELECT attempts FROM assessment WHERE public_token = ?", Integer.class, created.publicToken()
        );
    }

    @SafeVarargs
    private List<Integer> allAtOnce(final int count, final Callable<Integer> request, final Callable<Integer>... also)
        throws Exception {
        final int total = count + also.length;
        final ExecutorService pool = Executors.newFixedThreadPool(total);
        try {
            final CountDownLatch ready = new CountDownLatch(total);
            final CountDownLatch go = new CountDownLatch(1);
            final List<Future<Integer>> replies = new ArrayList<>();
            final List<Callable<Integer>> work = new ArrayList<>();
            for (int index = 0; index < count; index++) {
                work.add(request);
            }
            work.addAll(List.of(also));
            for (final Callable<Integer> task : work) {
                replies.add(pool.submit(() -> {
                    ready.countDown();
                    go.await();
                    return task.call();
                }));
            }
            assertThat(ready.await(30, TimeUnit.SECONDS)).isTrue();
            go.countDown();
            final List<Integer> statuses = new ArrayList<>();
            for (final Future<Integer> reply : replies) {
                statuses.add(reply.get(60, TimeUnit.SECONDS));
            }
            return statuses;
        }
        finally {
            pool.shutdownNow();
        }
    }

    @Test
    void releasingUnusedSittingsDropsOnlyTheEmptyOnesAndLeavesTheCounterMatchingTheRowsThatRemain()
        throws IOException {
        final AssessmentDtos.CreatedAssessment created = createCustomAssessment();
        final AssessmentDtos.AttemptStarted answered = startAttempt(created.publicToken());
        submitAnswer(created.publicToken(), answered.attemptId(), CUSTOM_QUESTION_ID, FOREVER);
        startAttempt(created.publicToken());
        startAttempt(created.publicToken());
        client.post().uri(ATTEMPTS_PATH, created.publicToken())
            .exchange().expectStatus().isEqualTo(HttpStatus.TOO_MANY_REQUESTS);
        assertThat(attemptsCounter(created)).isEqualTo(3);

        client.patch()
            .uri(PUBLIC_ASSESSMENT_PATH, created.publicToken())
            .header(HttpHeaders.AUTHORIZATION, BEARER_PREFIX + created.teacherToken())
            .contentType(MediaType.APPLICATION_JSON)
            .bodyValue(new AssessmentDtos.UpdateAssessmentRequest(null, null, true))
            .exchange()
            .expectStatus().isOk()
            .expectBody(AssessmentDtos.AssessmentState.class)
            .value(state -> assertThat(state.totalAttempts()).isEqualTo(1));

        assertThat(attemptsCounter(created)).isEqualTo(1);
        assertThat(attemptRows(created)).isEqualTo(1);
        assertThat(
            jdbc.queryForObject(
                "SELECT COUNT(*) FROM assessment_attempt WHERE public_token = ?", Integer.class, answered.attemptId()
            )
        ).isEqualTo(1);
        assertThat(results(created).questions()).singleElement()
            .satisfies(question -> assertThat(question.answered()).isEqualTo(1));
        startAttempt(created.publicToken());
    }

    @Test
    void resultsTallyTheChoicesTheClassPickedAndRefuseAnythingTypedInstead() throws IOException {
        final String typed = "Alice from 14 Mill Lane";
        final AssessmentDtos.CreatedAssessment created = createCustomAssessment();
        final AssessmentDtos.AttemptStarted right = startAttempt(created.publicToken());
        submitAnswer(created.publicToken(), right.attemptId(), CUSTOM_QUESTION_ID, FOREVER);
        final AssessmentDtos.AttemptStarted wrong = startAttempt(created.publicToken());
        submitAnswer(created.publicToken(), wrong.attemptId(), CUSTOM_QUESTION_ID, REPEAT_TEN);
        final AssessmentDtos.AttemptStarted stray = startAttempt(created.publicToken());
        client.post()
            .uri(ANSWERS_PATH, created.publicToken(), stray.attemptId())
            .contentType(MediaType.APPLICATION_JSON)
            .bodyValue(new AssessmentDtos.AnswerRequest(CUSTOM_QUESTION_ID, typed))
            .exchange()
            .expectStatus().isBadRequest();

        final AssessmentDtos.ResultsView results = results(created);

        assertThat(results.questions()).singleElement().satisfies(question -> {
            assertThat(question.answered()).isEqualTo(2);
            assertThat(question.answerTallies()).containsExactly(
                new AssessmentDtos.AnswerTally(REPEAT_TEN, 1),
                new AssessmentDtos.AnswerTally(FOREVER, 1)
            );
            assertThat(question.otherAnswers()).isZero();
        });
        assertThat(rawResults(created)).doesNotContain(typed).doesNotContain("Alice");
    }

    @Test
    void createIsRefusedOnceOneAnalysisIsCarryingAsManyQuizzesAsItMay() throws IOException {
        final SingleProjectDtos.CreatedSubmission submission = submitQuestions("synthetic-assessment-quiz-ceiling");
        Awaitility.await().atMost(Duration.ofSeconds(15)).untilAsserted(
            () -> assertThat(submission(submission.token()).status()).isEqualTo(COMPLETED)
        );
        final long analysisId = submission(submission.token()).analysis().id();

        for (int index = 0; index < MAX_ASSESSMENTS_PER_ANALYSIS; index++) {
            createCustomAssessment(analysisId, submission.token()).expectStatus().isCreated();
        }

        createCustomAssessment(analysisId, submission.token())
            .expectStatus().isEqualTo(HttpStatus.TOO_MANY_REQUESTS);
    }

    private int attemptRows(final AssessmentDtos.CreatedAssessment created) {
        return jdbc.queryForObject(
            "SELECT COUNT(*) FROM assessment_attempt WHERE assessment_id = "
                + "(SELECT id FROM assessment WHERE public_token = ?)",
            Integer.class, created.publicToken()
        );
    }

    private String rawResults(final AssessmentDtos.CreatedAssessment assessment) {
        return client.get()
            .uri(RESULTS_PATH, assessment.publicToken())
            .header(HttpHeaders.AUTHORIZATION, BEARER_PREFIX + assessment.teacherToken())
            .exchange()
            .expectStatus().isOk()
            .expectBody(String.class)
            .returnResult().getResponseBody();
    }

    private AssessmentDtos.CreatedAssessment publishGeneratedAssessment(
        final String submissionToken, final long analysisId, final String questionId
    ) {
        return client.post()
            .uri(ASSESSMENTS_PATH)
            .header(HttpHeaders.AUTHORIZATION, BEARER_PREFIX + submissionToken)
            .contentType(MediaType.APPLICATION_JSON)
            .bodyValue(
                new AssessmentDtos.CreateAssessmentRequest(
                    analysisId, "A quiz", "Answer every question", ENGLISH,
                    List.of(
                        new AssessmentDtos.QuestionInput(
                            AssessmentDtos.SOURCE_GENERATED, questionId, null, null, null, null, null
                        )
                    )
                )
            )
            .exchange()
            .expectStatus().isCreated()
            .expectBody(AssessmentDtos.CreatedAssessment.class)
            .returnResult().getResponseBody();
    }

    private static String firstOfferedAnswer(final AssessmentDtos.LearnerQuestion question) {
        if (question.options().isEmpty()) {
            return "answer";
        }
        return question.options().getFirst();
    }

    private AssessmentDtos.CreatedAssessment createCustomAssessment() throws IOException {
        final SharedAnalysis analysis = sharedCompletedAnalysis();
        return createCustomAssessment(analysis.analysisId(), analysis.submissionToken())
            .expectStatus().isCreated()
            .expectBody(AssessmentDtos.CreatedAssessment.class)
            .returnResult().getResponseBody();
    }

    private WebTestClient.ResponseSpec createCustomAssessment(final long analysisId, final String submissionToken) {
        return client.post()
            .uri(ASSESSMENTS_PATH)
            .header(HttpHeaders.AUTHORIZATION, BEARER_PREFIX + submissionToken)
            .contentType(MediaType.APPLICATION_JSON)
            .bodyValue(
                new AssessmentDtos.CreateAssessmentRequest(
                    analysisId, "A quiz", null, ENGLISH,
                    List.of(
                        new AssessmentDtos.QuestionInput(
                            AssessmentDtos.SOURCE_CUSTOM, null, "Which loop repeats forever?", "MULTIPLE_CHOICE",
                            List.of(REPEAT_TEN, FOREVER), 1, List.of(FOREVER)
                        )
                    )
                )
            )
            .exchange();
    }

    private AssessmentDtos.AttemptStarted startAttempt(final String publicToken) {
        return client.post()
            .uri(ATTEMPTS_PATH, publicToken)
            .exchange()
            .expectStatus().isCreated()
            .expectBody(AssessmentDtos.AttemptStarted.class)
            .returnResult().getResponseBody();
    }

    private AssessmentDtos.AnswerResult submitAnswer(
        final String publicToken, final String attemptToken, final String questionId, final String answer
    ) {
        return client.post()
            .uri(ANSWERS_PATH, publicToken, attemptToken)
            .contentType(MediaType.APPLICATION_JSON)
            .bodyValue(new AssessmentDtos.AnswerRequest(questionId, answer))
            .exchange()
            .expectStatus().isOk()
            .expectBody(AssessmentDtos.AnswerResult.class)
            .returnResult().getResponseBody();
    }

    private AssessmentDtos.ResultsView results(final AssessmentDtos.CreatedAssessment assessment) {
        return client.get()
            .uri(RESULTS_PATH, assessment.publicToken())
            .header(HttpHeaders.AUTHORIZATION, BEARER_PREFIX + assessment.teacherToken())
            .exchange()
            .expectStatus().isOk()
            .expectBody(AssessmentDtos.ResultsView.class)
            .returnResult().getResponseBody();
    }

    private synchronized SharedAnalysis sharedCompletedAnalysis() throws IOException {
        if (sharedAnalysis == null) {
            final SingleProjectDtos.CreatedSubmission created = submitQuestions("synthetic-assessment-lifecycle");
            Awaitility.await().atMost(Duration.ofSeconds(15)).untilAsserted(
                () -> assertThat(submission(created.token()).status()).isEqualTo(COMPLETED)
            );
            sharedAnalysis = new SharedAnalysis(submission(created.token()).analysis().id(), created.token());
        }
        return sharedAnalysis;
    }

    private SingleProjectDtos.SubmissionView submission(final String token) {
        return client.get()
            .uri("/api/v1/submissions/{token}", token)
            .exchange()
            .expectStatus().isOk()
            .expectBody(SingleProjectDtos.SubmissionView.class)
            .returnResult().getResponseBody();
    }

    private SingleProjectDtos.CreatedSubmission submitQuestions() throws IOException {
        return submitQuestions("synthetic-assessment-integration");
    }

    private SingleProjectDtos.CreatedSubmission submitQuestions(final String idempotencyKey) throws IOException {
        final LinkedMultiValueMap<String, Object> parts = new LinkedMultiValueMap<>();
        parts.add("file", new ByteArrayResource(archive()) {

            @Override
            public String getFilename() {
                return "synthetic.sb3";
            }
        });
        return client.post()
            .uri("/api/v1/question-submissions")
            .header(HttpHeaders.ACCEPT_LANGUAGE, ENGLISH)
            .header("Idempotency-Key", idempotencyKey)
            .contentType(MediaType.MULTIPART_FORM_DATA)
            .bodyValue(parts)
            .exchange()
            .expectStatus().isAccepted()
            .expectBody(SingleProjectDtos.CreatedSubmission.class)
            .returnResult().getResponseBody();
    }

    private byte[] archive() throws IOException {
        final byte[] thumbnail = thumbnail();
        final byte[] project;
        try (InputStream source = getClass().getResourceAsStream("/fixtures/scratch_programs/boatRace.json")) {
            if (source == null) {
                throw new IOException("Synthetic Scratch fixture is missing");
            }
            final String digest = HexFormat.of().formatHex(digest(MD5, thumbnail));
            project = new String(source.readAllBytes(), StandardCharsets.UTF_8)
                .replace("c6e6f0d02cfe3464d5389c49f09a64d4", digest)
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

    private byte[] digest(final String algorithm, final byte[] content) {
        try {
            return MessageDigest.getInstance(algorithm).digest(content);
        }
        catch (NoSuchAlgorithmException error) {
            throw new IllegalStateException(error);
        }
    }
}
