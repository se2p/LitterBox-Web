/*
 * Copyright (C) 2024-2026 LitterBox-Web contributors
 *
 * This file is part of LitterBox-Web.
 * Licenced under the EUPL-1.2 or later.
 *
 * SPDX-FileCopyrightText: 2024-2026 LitterBox-Web contributors
 * SPDX-License-Identifier: EUPL-1.2
 */
package de.uni_passau.fim.se2.litterbox_web.web_ui.assessment;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyBoolean;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.argThat;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.time.temporal.ChronoUnit;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import org.junit.jupiter.api.Test;
import org.mockito.invocation.InvocationOnMock;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

import de.uni_passau.fim.se2.litterbox.analytics.questions.QuestionType;
import de.uni_passau.fim.se2.litterbox_web.shared.ChoiceAnswers;
import de.uni_passau.fim.se2.litterbox_web.web_ui.capabilities.AdvancedCapabilitiesConfiguration;
import de.uni_passau.fim.se2.litterbox_web.web_ui.capabilities.AdvancedCapabilityDtos;
import de.uni_passau.fim.se2.litterbox_web.web_ui.capabilities.CapabilityException;
import de.uni_passau.fim.se2.litterbox_web.web_ui.capabilities.ProgramExportCapability;
import de.uni_passau.fim.se2.litterbox_web.web_ui.persistence.Analysis;
import de.uni_passau.fim.se2.litterbox_web.web_ui.persistence.AnalysisRepository;
import de.uni_passau.fim.se2.litterbox_web.web_ui.persistence.Assessment;
import de.uni_passau.fim.se2.litterbox_web.web_ui.persistence.AssessmentAnswerCount;
import de.uni_passau.fim.se2.litterbox_web.web_ui.persistence.AssessmentAttempt;
import de.uni_passau.fim.se2.litterbox_web.web_ui.persistence.AssessmentQuestionMark;
import de.uni_passau.fim.se2.litterbox_web.web_ui.persistence.AssessmentRepository;
import de.uni_passau.fim.se2.litterbox_web.web_ui.persistence.AssessmentResultsSnapshot;
import de.uni_passau.fim.se2.litterbox_web.web_ui.persistence.AttemptClaim;
import de.uni_passau.fim.se2.litterbox_web.web_ui.persistence.Submission;
import de.uni_passau.fim.se2.litterbox_web.web_ui.persistence.SubmissionRepository;
import de.uni_passau.fim.se2.litterbox_web.web_ui.single_project.QuizAnswerPort;
import de.uni_passau.fim.se2.litterbox_web.web_ui.single_project.SingleProjectDtos;
import reactor.core.publisher.Mono;
import tools.jackson.databind.json.JsonMapper;

class AssessmentServiceTest {

    private static final String SUBMISSION_TOKEN = "synthetic-submission-token";
    private static final String PUBLIC_TOKEN = "synthetic-public-token";
    private static final String TEACHER_TOKEN = "synthetic-teacher-token";
    private static final long ANALYSIS_ID = 41;
    private static final long SUBMISSION_ID = 7;
    private static final String ATTEMPT_TOKEN = "attempt-token";
    private static final String SCHEMA_VERSION = "1";
    private static final String LOCALE = "en";
    private static final String TITLE = "A quiz";
    private static final String INSTRUCTIONS = "Answer every question";
    private static final String AUTHORIZATION_REQUIRED = "authorization_required";
    private static final String ORIGINAL_ID = "7";
    private static final String GENERATED_ID = "1";
    private static final String CUSTOM_ID = "2";
    private static final String SPRITE_QUESTION = "How many sprites?";
    private static final String ONE_SPRITE = "1";
    private static final String TWO_SPRITES = "2";
    private static final String THREE_SPRITES = "3";
    private static final List<String> SPRITE_COUNTS = List.of(ONE_SPRITE, TWO_SPRITES, THREE_SPRITES);
    private static final String FOREVER = "forever";
    private static final String REPEAT_TEN = "repeat 10";

    private static final Instant FAR_FUTURE = Instant.parse("2099-01-01T00:00:00Z");

    private static final Instant NOW = Instant.parse("2026-06-01T00:00:00Z");

    private final AssessmentRepository assessments = mock(AssessmentRepository.class);
    private final AnalysisRepository analyses = mock(AnalysisRepository.class);
    private final SubmissionRepository submissions = mock(SubmissionRepository.class);
    private final QuizAnswerPort marking = mock(QuizAnswerPort.class);
    private final AssessmentCapabilitiesConfiguration configuration = new AssessmentCapabilitiesConfiguration();
    private final AdvancedCapabilitiesConfiguration capabilitiesConfiguration = new AdvancedCapabilitiesConfiguration();
    private final ProgramExportCapability exportCapabilityImplementation = mock(ProgramExportCapability.class);
    private final ObjectProvider<ProgramExportCapability> exportCapability = provider(exportCapabilityImplementation);

    private final AssessmentService service = new AssessmentService(
        assessments, analyses, submissions, marking, configuration, exportCapability, capabilitiesConfiguration
    );

    private final AssessmentService clockedService = new AssessmentService(
        assessments, analyses, submissions, marking, configuration, exportCapability, capabilitiesConfiguration,
        Clock.fixed(NOW, ZoneOffset.UTC)
    );

    @SuppressWarnings("unchecked")
    private static <T> ObjectProvider<T> provider(final T value) {
        final ObjectProvider<T> provider = mock(ObjectProvider.class);
        when(provider.getIfAvailable()).thenReturn(value);
        return provider;
    }

    private final Map<String, AssessmentQuestionMark> recorded = new HashMap<>();

    private void recordingAnswers() {
        when(assessments.recordAnswer(anyLong(), anyString(), anyString(), any())).thenAnswer(this::record);
    }

    private Mono<AssessmentQuestionMark> record(final InvocationOnMock invocation) {
        final long attemptId = invocation.getArgument(0);
        final String questionId = invocation.getArgument(1);
        final String key = key(attemptId, questionId);
        recorded.putIfAbsent(key, new AssessmentQuestionMark(attemptId, questionId, invocation.getArgument(3)));
        return Mono.just(recorded.get(key));
    }

    private static String key(final long attemptId, final String questionId) {
        return attemptId + ":" + questionId;
    }

    private static Analysis completedAnalysis() {
        return new Analysis(ANALYSIS_ID, SUBMISSION_ID, 9, "NEW", SCHEMA_VERSION, "synthetic", LOCALE, "DONE", ".sb3");
    }

    private static Submission submission(final String token) {
        return new Submission(SUBMISSION_ID, token, "single", LOCALE, "COMPLETED", "ACTIVE", 1, 1, 0);
    }

    private static AssessmentDtos.CreateAssessmentRequest createRequest() {
        return new AssessmentDtos.CreateAssessmentRequest(
            ANALYSIS_ID, TITLE, INSTRUCTIONS, LOCALE,
            List.of(
                new AssessmentDtos.QuestionInput(
                    AssessmentDtos.SOURCE_GENERATED, ORIGINAL_ID, null, null, null, null, null
                )
            )
        );
    }

    /**
     * Builds a request for a quiz with the given title that picks the one generated question.
     *
     * @param title the title the teacher typed
     * @return a create request that differs from {@link #createRequest()} only in its title and lack of instructions
     */
    private static AssessmentDtos.CreateAssessmentRequest createRequestTitled(final String title) {
        return new AssessmentDtos.CreateAssessmentRequest(
            ANALYSIS_ID, title, null, LOCALE,
            List.of(
                new AssessmentDtos.QuestionInput(
                    AssessmentDtos.SOURCE_GENERATED, ORIGINAL_ID, null, null, null, null, null
                )
            )
        );
    }

    private static SingleProjectDtos.QuizView generatedQuestion() {
        return new SingleProjectDtos.QuizView(
            ORIGINAL_ID, SPRITE_QUESTION, SPRITE_COUNTS, "MULTIPLE_CHOICE", null, null, null, null, null, 1
        );
    }

    private void enable() {
        configuration.setEnabled(true);
    }

    private void enableExport() {
        capabilitiesConfiguration.getProgramExport().setEnabled(true);
    }

    @Test
    void createIsRefusedWithoutABearerToken() {
        enable();

        assertThatThrownBy(() -> service.create(null, createRequest()).block())
            .isInstanceOfSatisfying(
                CapabilityException.class, error -> assertThat(error.code()).isEqualTo(AUTHORIZATION_REQUIRED)
            );
        assertThatThrownBy(() -> service.create("  ", createRequest()).block())
            .isInstanceOfSatisfying(
                CapabilityException.class, error -> assertThat(error.code()).isEqualTo(AUTHORIZATION_REQUIRED)
            );
        verifyNoInteractions(analyses, submissions, assessments);
    }

    @Test
    void createIsRefusedWhenTheBearerDoesNotMatchTheAnalysissOwnSubmission() {
        enable();
        when(analyses.findById(ANALYSIS_ID)).thenReturn(Mono.just(completedAnalysis()));
        when(submissions.findById(SUBMISSION_ID)).thenReturn(Mono.just(submission(SUBMISSION_TOKEN)));

        assertThatThrownBy(() -> service.create("a-different-teachers-token", createRequest()).block())
            .isInstanceOfSatisfying(
                CapabilityException.class, error -> assertThat(error.code()).isEqualTo("analysis_not_found")
            );
        verify(assessments, never()).create(any(), anyInt());
    }

    @Test
    void createIsRefusedForAnAnalysisThatIsNotCompleted() {
        enable();
        final Analysis running = new Analysis(
            ANALYSIS_ID, SUBMISSION_ID, 9, "NEW", SCHEMA_VERSION, "synthetic", LOCALE, "RUNNING", ".sb3"
        );
        when(analyses.findById(ANALYSIS_ID)).thenReturn(Mono.just(running));
        when(submissions.findById(SUBMISSION_ID)).thenReturn(Mono.just(submission(SUBMISSION_TOKEN)));

        assertThatThrownBy(() -> service.create(SUBMISSION_TOKEN, createRequest()).block())
            .isInstanceOfSatisfying(
                CapabilityException.class, error -> assertThat(error.code()).isEqualTo("analysis_not_ready")
            );
        verify(assessments, never()).create(any(), anyInt());
    }

    @Test
    void createStoresTheAssessmentAndReturnsBothTokensWhenTheBearerMatches() {
        enable();
        when(analyses.findById(ANALYSIS_ID)).thenReturn(Mono.just(completedAnalysis()));
        when(submissions.findById(SUBMISSION_ID)).thenReturn(Mono.just(submission(SUBMISSION_TOKEN)));
        when(marking.generatedQuiz(any(Analysis.class))).thenReturn(
            Mono.just(
                new QuizAnswerPort.GeneratedQuiz(
                    List.of(generatedQuestion()),
                    List.of(new SingleProjectDtos.QuizAnswerKeyQuestion(ORIGINAL_ID, List.of(TWO_SPRITES)))
                )
            )
        );
        when(assessments.create(any(), anyInt())).thenReturn(
            Mono.just(
                new Assessment(
                    1, PUBLIC_TOKEN, TEACHER_TOKEN, ANALYSIS_ID, TITLE, INSTRUCTIONS, LOCALE, "{}",
                    Assessment.OPEN, FAR_FUTURE, 0
                )
            )
        );

        final AssessmentDtos.CreatedAssessment created = service.create(SUBMISSION_TOKEN, createRequest()).block();

        assertThat(created).isNotNull();
        assertThat(created.publicToken()).isEqualTo(PUBLIC_TOKEN);
        assertThat(created.teacherToken()).isEqualTo(TEACHER_TOKEN);
        verify(assessments).create(
            argThat(request -> request.questionsJson().contains("\"correctAnswers\":[\"2\"]")), anyInt()
        );
    }

    @Test
    void createIsRefusedOnceAnAnalysisIsCarryingAsManyQuizzesAsItMay() {
        enable();
        configuration.setMaxAssessmentsPerAnalysis(2);
        when(analyses.findById(ANALYSIS_ID)).thenReturn(Mono.just(completedAnalysis()));
        when(submissions.findById(SUBMISSION_ID)).thenReturn(Mono.just(submission(SUBMISSION_TOKEN)));
        when(marking.generatedQuiz(any(Analysis.class))).thenReturn(
            Mono.just(
                new QuizAnswerPort.GeneratedQuiz(
                    List.of(generatedQuestion()),
                    List.of(new SingleProjectDtos.QuizAnswerKeyQuestion(ORIGINAL_ID, List.of(TWO_SPRITES)))
                )
            )
        );
        when(assessments.create(any(), anyInt())).thenReturn(Mono.empty());

        assertThatThrownBy(() -> service.create(SUBMISSION_TOKEN, createRequest()).block())
            .isInstanceOfSatisfying(
                ResponseStatusException.class,
                error -> assertThat(error.getStatusCode()).isEqualTo(HttpStatus.TOO_MANY_REQUESTS)
            );
        verify(assessments).create(any(), eq(2));
    }

    @Test
    void createIsAllowedWhileAnAnalysisIsStillBelowItsCeiling() {
        enable();
        configuration.setMaxAssessmentsPerAnalysis(2);
        when(analyses.findById(ANALYSIS_ID)).thenReturn(Mono.just(completedAnalysis()));
        when(submissions.findById(SUBMISSION_ID)).thenReturn(Mono.just(submission(SUBMISSION_TOKEN)));
        when(marking.generatedQuiz(any(Analysis.class))).thenReturn(
            Mono.just(
                new QuizAnswerPort.GeneratedQuiz(
                    List.of(generatedQuestion()),
                    List.of(new SingleProjectDtos.QuizAnswerKeyQuestion(ORIGINAL_ID, List.of(TWO_SPRITES)))
                )
            )
        );
        when(assessments.create(any(), anyInt())).thenReturn(
            Mono.just(
                new Assessment(
                    1, PUBLIC_TOKEN, TEACHER_TOKEN, ANALYSIS_ID, TITLE, null, LOCALE, "{}", Assessment.OPEN,
                    FAR_FUTURE, 0
                )
            )
        );

        assertThat(service.create(SUBMISSION_TOKEN, createRequest()).block()).isNotNull();
    }

    @Test
    void createRejectsATitleLongerThanTheConfiguredCeiling() {
        enable();
        configuration.setMaxTitleLength(3);

        assertThatThrownBy(
            () -> service.create(SUBMISSION_TOKEN, createRequestTitled("Too long a title")).block()
        ).isInstanceOf(IllegalArgumentException.class);
        verifyNoInteractions(analyses);
    }

    @Test
    void createRejectsAMissingTitle() {
        enable();

        assertThatThrownBy(
            () -> service.create(SUBMISSION_TOKEN, createRequestTitled("  ")).block()
        ).isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void createNormalisesSupportedLocale() {
        enable();
        when(analyses.findById(ANALYSIS_ID)).thenReturn(Mono.just(completedAnalysis()));
        when(submissions.findById(SUBMISSION_ID)).thenReturn(Mono.just(submission(SUBMISSION_TOKEN)));
        when(marking.generatedQuiz(any(Analysis.class))).thenReturn(
            Mono.just(
                new QuizAnswerPort.GeneratedQuiz(
                    List.of(generatedQuestion()),
                    List.of(new SingleProjectDtos.QuizAnswerKeyQuestion(ORIGINAL_ID, List.of(TWO_SPRITES)))
                )
            )
        );
        when(assessments.create(any(), anyInt())).thenAnswer(
            invocation -> Mono.just(
                new Assessment(
                    1, PUBLIC_TOKEN, TEACHER_TOKEN, ANALYSIS_ID, TITLE, null, LOCALE, "{}", Assessment.OPEN,
                    FAR_FUTURE, 0
                )
            )
        );

        service.create(
            SUBMISSION_TOKEN,
            new AssessmentDtos.CreateAssessmentRequest(
                ANALYSIS_ID, TITLE, null, " EN ", createRequest().questions()
            )
        ).block();

        verify(assessments).create(
            argThat(request -> LOCALE.equals(request.locale())), eq(configuration.getMaxAssessmentsPerAnalysis())
        );
    }

    @Test
    void createRejectsUnsupportedLocale() {
        enable();

        assertThatThrownBy(
            () -> service.create(
                SUBMISSION_TOKEN,
                new AssessmentDtos.CreateAssessmentRequest(
                    ANALYSIS_ID, TITLE, null, "fr", createRequest().questions()
                )
            ).block()
        ).isInstanceOf(IllegalArgumentException.class);
        verifyNoInteractions(analyses, submissions, assessments);
    }

    @Test
    void learnerViewLeaksNeitherAnswerGuidesNorCorrectAnswers() {
        enable();
        final Assessment assessment = new Assessment(
            1, PUBLIC_TOKEN, TEACHER_TOKEN, ANALYSIS_ID, TITLE, INSTRUCTIONS, LOCALE,
            JsonMapper.shared().writeValueAsString(
                new StoredAssessmentQuestions(
                    List.of(
                        new StoredAssessmentQuestion(
                            GENERATED_ID, AssessmentDtos.SOURCE_GENERATED, ORIGINAL_ID, SPRITE_QUESTION, SPRITE_COUNTS,
                            QuestionType.MULTIPLE_CHOICE, null, null, null, null, null, 1, List.of()
                        ),
                        new StoredAssessmentQuestion(
                            CUSTOM_ID, AssessmentDtos.SOURCE_CUSTOM, null, "Explain the loop.", List.of(), null, null,
                            null, null, null, null, null, List.of()
                        )
                    )
                )
            ), Assessment.OPEN, FAR_FUTURE, 0
        );
        when(assessments.findByPublicToken(PUBLIC_TOKEN)).thenReturn(Mono.just(assessment));

        final AssessmentDtos.LearnerView view = service.learnerView(PUBLIC_TOKEN).block();
        final String serialized = JsonMapper.shared().writeValueAsString(view);

        assertThat(serialized).doesNotContain("originalQuestionId");
        assertThat(view.questions()).hasSize(2);
    }

    @Test
    void readsAssessmentsPersistedBeforeAnswerGuidesWereRemoved() {
        final String legacy = "{\"questions\":[{\"questionId\":\"1\",\"source\":\"custom\","
            + "\"questionText\":\"Explain the loop.\",\"options\":[],\"questionType\":\"FREE_TEXT\","
            + "\"correctAnswers\":[],\"answerGuide\":\"old teacher-only note\"}]}";

        assertThat(JsonMapper.shared().readValue(legacy, StoredAssessmentQuestions.class).questions()).hasSize(1);
    }

    @Test
    void learnerViewIsRefusedForAnUnknownToken() {
        enable();
        when(assessments.findByPublicToken("nope")).thenReturn(Mono.empty());

        assertThatThrownBy(() -> service.learnerView("nope").block())
            .isInstanceOf(ResponseStatusException.class);
    }

    @Test
    void codeReturnsTheExportTargetsOfTheQuizsAnalysis() {
        enable();
        enableExport();
        final Assessment assessment = assessmentWithGeneratedAndCustomQuestions();
        final AdvancedCapabilityDtos.ExportTargetsView targets = new AdvancedCapabilityDtos.ExportTargetsView(
            List.of(new AdvancedCapabilityDtos.ExportSpriteTargetView("Stage", true)), List.of()
        );
        when(assessments.findByPublicToken(PUBLIC_TOKEN)).thenReturn(Mono.just(assessment));
        when(analyses.findById(ANALYSIS_ID)).thenReturn(Mono.just(completedAnalysis()));
        when(exportCapabilityImplementation.targets(completedAnalysis())).thenReturn(Mono.just(targets));

        final AdvancedCapabilityDtos.ExportTargetsView result = service.code(PUBLIC_TOKEN).block();

        assertThat(result).isEqualTo(targets);
        verify(exportCapabilityImplementation).targets(completedAnalysis());
        verifyNoInteractions(submissions);
    }

    @Test
    void codeIsRefusedWhenTheProgramExportCapabilityIsDisabled() {
        enable();

        assertThatThrownBy(() -> service.code(PUBLIC_TOKEN).block())
            .isInstanceOfSatisfying(
                CapabilityException.class, error -> assertThat(error.code()).isEqualTo("capability_disabled")
            );
        verifyNoInteractions(assessments, analyses, submissions);
    }

    @Test
    void codeIsRefusedWhenTheProgramExportCapabilityHasNoAvailableImplementation() {
        enable();
        enableExport();
        final AssessmentService serviceWithNoExportImplementation = new AssessmentService(
            assessments, analyses, submissions, marking, configuration, provider(null), capabilitiesConfiguration
        );

        assertThatThrownBy(() -> serviceWithNoExportImplementation.code(PUBLIC_TOKEN).block())
            .isInstanceOfSatisfying(
                CapabilityException.class, error -> assertThat(error.code()).isEqualTo("capability_unavailable")
            );
        verifyNoInteractions(assessments, analyses, submissions);
    }

    @Test
    void codeIsRefusedForAnUnknownPublicToken() {
        enable();
        enableExport();
        when(assessments.findByPublicToken("nope")).thenReturn(Mono.empty());

        assertThatThrownBy(() -> service.code("nope").block())
            .isInstanceOfSatisfying(
                ResponseStatusException.class,
                error -> assertThat(error.getStatusCode()).isEqualTo(HttpStatus.NOT_FOUND)
            );
    }

    @Test
    void codeIsRefusedOnceTheQuizHasClosed() {
        enable();
        enableExport();
        final Assessment assessment = assessmentWithGeneratedAndCustomQuestions(Assessment.CLOSED, FAR_FUTURE);
        when(assessments.findByPublicToken(PUBLIC_TOKEN)).thenReturn(Mono.just(assessment));

        assertGone(() -> clockedService.code(PUBLIC_TOKEN));
        verifyNoInteractions(analyses, submissions);
    }

    @Test
    void codeIsRefusedOnceTheQuizHasExpired() {
        enable();
        enableExport();
        final Assessment assessment = assessmentWithGeneratedAndCustomQuestions(Assessment.OPEN, NOW.minusSeconds(1));
        when(assessments.findByPublicToken(PUBLIC_TOKEN)).thenReturn(Mono.just(assessment));

        assertGone(() -> clockedService.code(PUBLIC_TOKEN));
        verifyNoInteractions(analyses, submissions);
    }

    @Test
    void codeIsNotFoundForAnAnalysisRecordedUnderAnInputFormatTheExporterCannotReadBack() {
        enable();
        enableExport();
        final Assessment assessment = assessmentWithGeneratedAndCustomQuestions();
        final Analysis unexportable = new Analysis(
            ANALYSIS_ID, SUBMISSION_ID, 9, "NEW", SCHEMA_VERSION, "synthetic", LOCALE, "DONE", "json"
        );
        when(assessments.findByPublicToken(PUBLIC_TOKEN)).thenReturn(Mono.just(assessment));
        when(analyses.findById(ANALYSIS_ID)).thenReturn(Mono.just(unexportable));

        assertThatThrownBy(() -> service.code(PUBLIC_TOKEN).block())
            .isInstanceOfSatisfying(
                ResponseStatusException.class,
                error -> assertThat(error.getStatusCode()).isEqualTo(HttpStatus.NOT_FOUND)
            );
        verifyNoInteractions(submissions, exportCapabilityImplementation);
    }

    @Test
    void marksPublishedGeneratedQuestionsFromTheirSavedAnswerKey() {
        enable();
        final String questionsJson = JsonMapper.shared().writeValueAsString(
            new StoredAssessmentQuestions(
                List.of(
                    new StoredAssessmentQuestion(
                        GENERATED_ID, AssessmentDtos.SOURCE_GENERATED, ORIGINAL_ID, SPRITE_QUESTION, SPRITE_COUNTS,
                        QuestionType.MULTIPLE_CHOICE, null, null, null, null, null, 1, List.of(TWO_SPRITES)
                    )
                )
            )
        );
        final Assessment assessment = new Assessment(
            3, PUBLIC_TOKEN, TEACHER_TOKEN, ANALYSIS_ID, TITLE, null, LOCALE, questionsJson,
            Assessment.OPEN, FAR_FUTURE, 0
        );
        answeredBy(assessment, ATTEMPT_TOKEN, 5);
        recordingAnswers();

        final AssessmentDtos.AnswerResult result = service.answer(
            PUBLIC_TOKEN, ATTEMPT_TOKEN, new AssessmentDtos.AnswerRequest(GENERATED_ID, TWO_SPRITES)
        ).block();

        assertThat(result).isNotNull();
        assertThat(result.correct()).isTrue();
        verify(assessments).recordAnswer(5, GENERATED_ID, TWO_SPRITES, true);
        verifyNoInteractions(marking);
    }

    @Test
    void storesATeacherAuthoredQuestionAsNotMarkable() {
        enable();
        final Assessment assessment = assessmentWithGeneratedAndCustomQuestions();
        answeredBy(assessment, ATTEMPT_TOKEN, 5);
        recordingAnswers();

        final AssessmentDtos.AnswerResult result = service.answer(
            PUBLIC_TOKEN, ATTEMPT_TOKEN, new AssessmentDtos.AnswerRequest(CUSTOM_ID, "My free-text answer")
        ).block();

        assertThat(result).isNotNull();
        assertThat(result.correct()).isNull();
        assertThat(result.correctAnswers()).isEmpty();
        verify(assessments).recordAnswer(5, CUSTOM_ID, "My free-text answer", null);
        verifyNoInteractions(marking);
    }

    @Test
    void reportsASittingReleasedMidAnswerAsNotFound() {
        enable();
        final Assessment assessment = assessmentWithGeneratedAndCustomQuestions();
        answeredBy(assessment, ATTEMPT_TOKEN, 5);
        when(assessments.recordAnswer(anyLong(), anyString(), anyString(), any())).thenReturn(Mono.empty());

        assertThatThrownBy(
            () -> service.answer(PUBLIC_TOKEN, ATTEMPT_TOKEN, new AssessmentDtos.AnswerRequest(CUSTOM_ID, "late"))
                .block()
        ).isInstanceOfSatisfying(
            ResponseStatusException.class,
            error -> assertThat(error.getStatusCode()).isEqualTo(HttpStatus.NOT_FOUND)
        );
    }

    @Test
    void marksATeacherAuthoredQuestionExpectingSeveralChoicesHoweverTheyWereJoined() {
        enable();
        final Assessment assessment = assessmentWithMultiAnswerCustomQuestion();
        answeredBy(assessment, ATTEMPT_TOKEN, 5);
        answeredBy(assessment, "second-attempt-token", 6);
        answeredBy(assessment, "third-attempt-token", 7);
        recordingAnswers();

        final String both = String.join(ChoiceAnswers.SEPARATOR, FOREVER, REPEAT_TEN);
        final AssessmentDtos.AnswerResult correct = service.answer(
            PUBLIC_TOKEN, ATTEMPT_TOKEN, new AssessmentDtos.AnswerRequest(CUSTOM_ID, both)
        ).block();
        assertThat(correct).isNotNull();
        assertThat(correct.correct()).isTrue();
        assertThat(correct.correctAnswers()).containsExactly(FOREVER, REPEAT_TEN);

        final AssessmentDtos.AnswerResult reversed = service.answer(
            PUBLIC_TOKEN, "second-attempt-token",
            new AssessmentDtos.AnswerRequest(CUSTOM_ID, String.join(ChoiceAnswers.SEPARATOR, REPEAT_TEN, FOREVER))
        ).block();
        assertThat(reversed).isNotNull();
        assertThat(reversed.correct()).isTrue();

        final AssessmentDtos.AnswerResult half = service.answer(
            PUBLIC_TOKEN, "third-attempt-token", new AssessmentDtos.AnswerRequest(CUSTOM_ID, FOREVER)
        ).block();
        assertThat(half).isNotNull();
        assertThat(half.correct()).isFalse();

        verifyNoInteractions(marking);
    }

    @Test
    void marksATeacherAuthoredQuestionAgainstTheCorrectAnswersItWasBuiltWith() {
        enable();
        final Assessment assessment = assessmentWithMarkableCustomQuestion();
        answeredBy(assessment, ATTEMPT_TOKEN, 5);
        answeredBy(assessment, "second-attempt-token", 6);
        recordingAnswers();

        final AssessmentDtos.AnswerResult correct = service.answer(
            PUBLIC_TOKEN, ATTEMPT_TOKEN, new AssessmentDtos.AnswerRequest(CUSTOM_ID, FOREVER)
        ).block();
        assertThat(correct).isNotNull();
        assertThat(correct.correct()).isTrue();
        assertThat(correct.correctAnswers()).containsExactly(FOREVER);

        final AssessmentDtos.AnswerResult incorrect = service.answer(
            PUBLIC_TOKEN, "second-attempt-token", new AssessmentDtos.AnswerRequest(CUSTOM_ID, REPEAT_TEN)
        ).block();
        assertThat(incorrect).isNotNull();
        assertThat(incorrect.correct()).isFalse();

        verify(assessments).recordAnswer(5, CUSTOM_ID, FOREVER, true);
        verify(assessments).recordAnswer(6, CUSTOM_ID, REPEAT_TEN, false);
        verifyNoInteractions(marking);
    }

    @Test
    void rejectsARepeatedChoiceToATeacherAuthoredQuestionInsteadOfMarkingItCorrect() {
        enable();
        final Assessment assessment = assessmentWithMarkableCustomQuestion();
        answeredBy(assessment, ATTEMPT_TOKEN, 5);
        recordingAnswers();

        assertThatThrownBy(
            () -> service.answer(
                PUBLIC_TOKEN, ATTEMPT_TOKEN,
                new AssessmentDtos.AnswerRequest(CUSTOM_ID, String.join(ChoiceAnswers.SEPARATOR, FOREVER, FOREVER))
            ).block()
        ).isInstanceOf(IllegalArgumentException.class);
        verify(assessments, never()).recordAnswer(anyLong(), anyString(), anyString(), any());
    }

    @Test
    void rejectsARepeatedChoiceToATeacherAuthoredQuestionExpectingSeveralChoices() {
        enable();
        final Assessment assessment = assessmentWithMultiAnswerCustomQuestion();
        answeredBy(assessment, ATTEMPT_TOKEN, 5);
        recordingAnswers();

        assertThatThrownBy(
            () -> service.answer(
                PUBLIC_TOKEN, ATTEMPT_TOKEN,
                new AssessmentDtos.AnswerRequest(
                    CUSTOM_ID, String.join(ChoiceAnswers.SEPARATOR, FOREVER, REPEAT_TEN, FOREVER)
                )
            ).block()
        ).isInstanceOf(IllegalArgumentException.class);
        verify(assessments, never()).recordAnswer(anyLong(), anyString(), anyString(), any());
    }

    @Test
    void rejectsAChoiceThatIsNotAmongTheOptionsOfATeacherAuthoredQuestion() {
        enable();
        final Assessment assessment = assessmentWithMarkableCustomQuestion();
        answeredBy(assessment, ATTEMPT_TOKEN, 5);
        recordingAnswers();

        assertThatThrownBy(
            () -> service.answer(
                PUBLIC_TOKEN, ATTEMPT_TOKEN, new AssessmentDtos.AnswerRequest(CUSTOM_ID, "not an option")
            ).block()
        ).isInstanceOf(IllegalArgumentException.class);
        verify(assessments, never()).recordAnswer(anyLong(), anyString(), anyString(), any());
    }

    @Test
    void keepsTheFirstAnswerToAQuestionAndReportsTheVerdictThatIsStoredRatherThanTheOneJustSubmitted() {
        enable();
        final Assessment assessment = assessmentWithMarkableCustomQuestion();
        answeredBy(assessment, ATTEMPT_TOKEN, 5);
        recordingAnswers();

        final AssessmentDtos.AnswerResult wrong = service.answer(
            PUBLIC_TOKEN, ATTEMPT_TOKEN, new AssessmentDtos.AnswerRequest(CUSTOM_ID, REPEAT_TEN)
        ).block();
        assertThat(wrong).isNotNull();
        assertThat(wrong.correct()).isFalse();
        assertThat(wrong.correctAnswers()).containsExactly(FOREVER);

        final AssessmentDtos.AnswerResult second = service.answer(
            PUBLIC_TOKEN, ATTEMPT_TOKEN, new AssessmentDtos.AnswerRequest(CUSTOM_ID, FOREVER)
        ).block();

        assertThat(second).isNotNull();
        assertThat(second.correct()).isFalse();
        assertThat(recorded.get(key(5, CUSTOM_ID)).correct()).isFalse();
    }

    private void answeredBy(final Assessment assessment, final String attemptToken, final long attemptId) {
        when(assessments.findByPublicToken(PUBLIC_TOKEN)).thenReturn(Mono.just(assessment));
        when(assessments.findAttemptByPublicToken(attemptToken)).thenReturn(
            Mono.just(new AssessmentAttempt(attemptId, attemptToken, assessment.id()))
        );
    }

    @Test
    void refusesAnAnswerForAnAttemptOfADifferentAssessment() {
        enable();
        final Assessment assessment = assessmentWithGeneratedAndCustomQuestions();
        final AssessmentAttempt foreignAttempt = new AssessmentAttempt(99, "foreign-token", assessment.id() + 1);
        when(assessments.findByPublicToken(PUBLIC_TOKEN)).thenReturn(Mono.just(assessment));
        when(assessments.findAttemptByPublicToken("foreign-token")).thenReturn(Mono.just(foreignAttempt));

        assertThatThrownBy(
            () -> service.answer(PUBLIC_TOKEN, "foreign-token", new AssessmentDtos.AnswerRequest(CUSTOM_ID, "answer"))
                .block()
        ).isInstanceOf(ResponseStatusException.class);
    }

    @Test
    void resultsAggregateAcrossSeveralAttempts() {
        enable();
        final Assessment assessment = assessmentWithGeneratedAndCustomQuestions(Assessment.OPEN, FAR_FUTURE, 3);
        when(assessments.findByPublicToken(PUBLIC_TOKEN)).thenReturn(Mono.just(assessment));
        when(assessments.findResults(eq(assessment.id()), any())).thenReturn(
            Mono.just(
                new AssessmentResultsSnapshot(
                    assessment,
                    List.of(
                        new AssessmentQuestionMark(10, GENERATED_ID, true),
                        new AssessmentQuestionMark(11, GENERATED_ID, true),
                        new AssessmentQuestionMark(12, GENERATED_ID, false),
                        new AssessmentQuestionMark(10, CUSTOM_ID, null)
                    ),
                    List.of(new AssessmentAnswerCount(GENERATED_ID, TWO_SPRITES, 3))
                )
            )
        );

        final AssessmentDtos.ResultsView results = service.results(PUBLIC_TOKEN, TEACHER_TOKEN).block();

        assertThat(results).isNotNull();
        assertThat(results.title()).isEqualTo(TITLE);
        assertThat(results.status()).isEqualTo(Assessment.OPEN);
        assertThat(results.totalAttempts()).isEqualTo(3);
        assertThat(results.questions()).containsExactlyInAnyOrder(
            new AssessmentDtos.QuestionResult(
                GENERATED_ID, SPRITE_QUESTION, 3, 2, 1, 0,
                List.of(
                    new AssessmentDtos.AnswerTally(ONE_SPRITE, 0),
                    new AssessmentDtos.AnswerTally(TWO_SPRITES, 3),
                    new AssessmentDtos.AnswerTally(THREE_SPRITES, 0)
                ),
                0
            ),
            new AssessmentDtos.QuestionResult(CUSTOM_ID, "Explain the loop.", 1, 0, 0, 1, List.of(), 0)
        );
        assertThat(results.scores()).isEqualTo(
            new AssessmentDtos.ScoreDistribution(1, 3, 0, List.of(1, 2))
        );
    }

    @Test
    void resultsCountAttemptsFromTheSameSnapshotAsTheMarks() {
        enable();
        final Assessment authorized = assessmentWithGeneratedAndCustomQuestions(Assessment.OPEN, FAR_FUTURE, 1);
        final Assessment snapshotted = assessmentWithGeneratedAndCustomQuestions(Assessment.OPEN, FAR_FUTURE, 2);
        when(assessments.findByPublicToken(PUBLIC_TOKEN)).thenReturn(Mono.just(authorized));
        when(assessments.findResults(eq(authorized.id()), any())).thenReturn(
            Mono.just(
                new AssessmentResultsSnapshot(
                    snapshotted,
                    List.of(
                        new AssessmentQuestionMark(10, GENERATED_ID, true),
                        new AssessmentQuestionMark(11, GENERATED_ID, false)
                    ),
                    List.of()
                )
            )
        );

        final AssessmentDtos.ResultsView results = service.results(PUBLIC_TOKEN, TEACHER_TOKEN).block();

        assertThat(results).isNotNull();
        assertThat(results.totalAttempts()).isEqualTo(2);
    }

    @Test
    void resultsAreNotFoundOnceTheQuizIsDeletedWhileTheyAreRead() {
        enable();
        final Assessment assessment = assessmentWithGeneratedAndCustomQuestions();
        when(assessments.findByPublicToken(PUBLIC_TOKEN)).thenReturn(Mono.just(assessment));
        when(assessments.findResults(eq(assessment.id()), any())).thenReturn(Mono.empty());

        assertThatThrownBy(() -> service.results(PUBLIC_TOKEN, TEACHER_TOKEN).block())
            .isInstanceOfSatisfying(
                ResponseStatusException.class,
                error -> assertThat(error.getStatusCode()).isEqualTo(HttpStatus.NOT_FOUND)
            );
    }

    @Test
    void resultsAskForAnswerCountsOnlyForTheQuestionsWhoseChoicesTheQuizItselfWroteDown() {
        enable();
        final Assessment assessment = assessmentWithGeneratedAndCustomQuestions(Assessment.OPEN, FAR_FUTURE, 1);
        when(assessments.findByPublicToken(PUBLIC_TOKEN)).thenReturn(Mono.just(assessment));
        when(assessments.findResults(eq(assessment.id()), any())).thenReturn(
            Mono.just(new AssessmentResultsSnapshot(assessment, List.of(), List.of()))
        );

        service.results(PUBLIC_TOKEN, TEACHER_TOKEN).block();

        verify(assessments).findResults(assessment.id(), List.of(GENERATED_ID));
    }

    @Test
    void resultsAreRefusedWithThePublicTokenInsteadOfTheTeacherToken() {
        enable();
        final Assessment assessment = assessmentWithGeneratedAndCustomQuestions();
        when(assessments.findByPublicToken(PUBLIC_TOKEN)).thenReturn(Mono.just(assessment));

        assertThatThrownBy(() -> service.results(PUBLIC_TOKEN, PUBLIC_TOKEN).block())
            .isInstanceOf(ResponseStatusException.class);
        verify(assessments, never()).findResults(anyLong(), any());
    }

    @Test
    void resultsRequireABearerToken() {
        enable();

        assertThatThrownBy(() -> service.results(PUBLIC_TOKEN, null).block())
            .isInstanceOfSatisfying(
                CapabilityException.class, error -> assertThat(error.code()).isEqualTo(AUTHORIZATION_REQUIRED)
            );
        verifyNoInteractions(assessments);
    }

    @Test
    void refusesLearnerViewOnceTheQuizHasClosed() {
        enable();
        final Assessment assessment = assessmentWithGeneratedAndCustomQuestions(Assessment.CLOSED, FAR_FUTURE);
        when(assessments.findByPublicToken(PUBLIC_TOKEN)).thenReturn(Mono.just(assessment));

        assertGone(() -> clockedService.learnerView(PUBLIC_TOKEN));
    }

    @Test
    void refusesLearnerViewOnceTheQuizHasExpired() {
        enable();
        final Assessment assessment = assessmentWithGeneratedAndCustomQuestions(Assessment.OPEN, NOW.minusSeconds(1));
        when(assessments.findByPublicToken(PUBLIC_TOKEN)).thenReturn(Mono.just(assessment));

        assertGone(() -> clockedService.learnerView(PUBLIC_TOKEN));
    }

    @Test
    void refusesStartingAnAttemptOnceTheQuizHasClosed() {
        enable();
        final Assessment assessment = assessmentWithGeneratedAndCustomQuestions(Assessment.CLOSED, FAR_FUTURE);
        when(assessments.findByPublicToken(PUBLIC_TOKEN)).thenReturn(Mono.just(assessment));

        assertGone(() -> clockedService.startAttempt(PUBLIC_TOKEN));
        verify(assessments, never()).createAttempt(anyLong(), anyInt(), any());
    }

    @Test
    void refusesStartingAnAttemptOnceTheQuizHasExpired() {
        enable();
        final Assessment assessment = assessmentWithGeneratedAndCustomQuestions(Assessment.OPEN, NOW.minusSeconds(1));
        when(assessments.findByPublicToken(PUBLIC_TOKEN)).thenReturn(Mono.just(assessment));

        assertGone(() -> clockedService.startAttempt(PUBLIC_TOKEN));
        verify(assessments, never()).createAttempt(anyLong(), anyInt(), any());
    }

    @Test
    void refusesAnAnswerOnceTheQuizHasClosed() {
        enable();
        final Assessment assessment = assessmentWithGeneratedAndCustomQuestions(Assessment.CLOSED, FAR_FUTURE);
        when(assessments.findByPublicToken(PUBLIC_TOKEN)).thenReturn(Mono.just(assessment));

        assertGone(
            () -> clockedService
                .answer(PUBLIC_TOKEN, ATTEMPT_TOKEN, new AssessmentDtos.AnswerRequest(CUSTOM_ID, "answer"))
        );
        verifyNoInteractions(marking);
    }

    @Test
    void refusesAnAnswerOnceTheQuizHasExpired() {
        enable();
        final Assessment assessment = assessmentWithGeneratedAndCustomQuestions(Assessment.OPEN, NOW.minusSeconds(1));
        when(assessments.findByPublicToken(PUBLIC_TOKEN)).thenReturn(Mono.just(assessment));

        assertGone(
            () -> clockedService
                .answer(PUBLIC_TOKEN, ATTEMPT_TOKEN, new AssessmentDtos.AnswerRequest(CUSTOM_ID, "answer"))
        );
        verifyNoInteractions(marking);
    }

    @Test
    void resultsStillWorkOnAClosedQuiz() {
        enable();
        final Assessment assessment = assessmentWithGeneratedAndCustomQuestions(Assessment.CLOSED, FAR_FUTURE, 1);
        when(assessments.findByPublicToken(PUBLIC_TOKEN)).thenReturn(Mono.just(assessment));
        when(assessments.findResults(eq(assessment.id()), any())).thenReturn(
            Mono.just(new AssessmentResultsSnapshot(assessment, List.of(), List.of()))
        );

        final AssessmentDtos.ResultsView results = clockedService.results(PUBLIC_TOKEN, TEACHER_TOKEN).block();

        assertThat(results).isNotNull();
        assertThat(results.status()).isEqualTo(Assessment.CLOSED);
        assertThat(results.totalAttempts()).isEqualTo(1);
    }

    @Test
    void resultsReportTheQuizsOwnTitleAndQuestionWordingEvenOnceClosed() {
        enable();
        final Assessment assessment = assessmentWithGeneratedAndCustomQuestions(Assessment.CLOSED, FAR_FUTURE, 1);
        when(assessments.findByPublicToken(PUBLIC_TOKEN)).thenReturn(Mono.just(assessment));
        when(assessments.findResults(eq(assessment.id()), any())).thenReturn(
            Mono.just(new AssessmentResultsSnapshot(assessment, List.of(), List.of()))
        );

        final AssessmentDtos.ResultsView results = clockedService.results(PUBLIC_TOKEN, TEACHER_TOKEN).block();

        assertThat(results).isNotNull();
        assertThat(results.title()).isEqualTo(TITLE);
        assertThat(results.questions()).extracting(AssessmentDtos.QuestionResult::questionText)
            .containsExactlyInAnyOrder(SPRITE_QUESTION, "Explain the loop.");
    }

    private void assertGone(final java.util.function.Supplier<Mono<?>> call) {
        assertThatThrownBy(() -> call.get().block())
            .isInstanceOfSatisfying(
                ResponseStatusException.class, error -> assertThat(error.getStatusCode()).isEqualTo(HttpStatus.GONE)
            );
    }

    @Test
    void refusesStartingAnAttemptOnceTheQuizHasTakenAllTheAttemptsItCanHave() {
        enable();
        configuration.setMaxAttempts(2);
        final Assessment assessment = assessmentWithGeneratedAndCustomQuestions();
        when(assessments.findByPublicToken(PUBLIC_TOKEN)).thenReturn(Mono.just(assessment));
        when(assessments.createAttempt(eq(assessment.id()), eq(2), any()))
            .thenReturn(Mono.just(AttemptClaim.exhausted()));

        assertThatThrownBy(() -> clockedService.startAttempt(PUBLIC_TOKEN).block())
            .isInstanceOfSatisfying(
                ResponseStatusException.class,
                error -> assertThat(error.getStatusCode()).isEqualTo(HttpStatus.TOO_MANY_REQUESTS)
            );
    }

    @Test
    void refusesStartingAnAttemptWhenTheQuizStoppedAnsweringBeforeTheClaimLanded() {
        enable();
        final Assessment assessment = assessmentWithGeneratedAndCustomQuestions();
        when(assessments.findByPublicToken(PUBLIC_TOKEN)).thenReturn(Mono.just(assessment));
        when(assessments.createAttempt(eq(assessment.id()), anyInt(), any()))
            .thenReturn(Mono.just(AttemptClaim.unavailable()));

        assertGone(() -> clockedService.startAttempt(PUBLIC_TOKEN));
    }

    @Test
    void updateClosesAnOpenQuiz() {
        enable();
        final Assessment assessment = assessmentWithGeneratedAndCustomQuestions(Assessment.OPEN, FAR_FUTURE);
        when(assessments.findByPublicToken(PUBLIC_TOKEN)).thenReturn(Mono.just(assessment));
        when(assessments.updateLifecycle(assessment.id(), Assessment.CLOSED, null, false))
            .thenReturn(Mono.just(withLifecycle(assessment, Assessment.CLOSED, FAR_FUTURE)));

        final AssessmentDtos.AssessmentState state = clockedService.update(
            PUBLIC_TOKEN, TEACHER_TOKEN, new AssessmentDtos.UpdateAssessmentRequest(Assessment.CLOSED, null, null)
        ).block();

        assertThat(state).isNotNull();
        assertThat(state.status()).isEqualTo(Assessment.CLOSED);
    }

    @Test
    void updateReopensAClosedQuiz() {
        enable();
        final Assessment assessment = assessmentWithGeneratedAndCustomQuestions(Assessment.CLOSED, FAR_FUTURE);
        when(assessments.findByPublicToken(PUBLIC_TOKEN)).thenReturn(Mono.just(assessment));
        when(assessments.updateLifecycle(assessment.id(), Assessment.OPEN, null, false))
            .thenReturn(Mono.just(withLifecycle(assessment, Assessment.OPEN, FAR_FUTURE)));

        final AssessmentDtos.AssessmentState state = clockedService.update(
            PUBLIC_TOKEN, TEACHER_TOKEN, new AssessmentDtos.UpdateAssessmentRequest(Assessment.OPEN, null, null)
        ).block();

        assertThat(state).isNotNull();
        assertThat(state.status()).isEqualTo(Assessment.OPEN);
    }

    @Test
    void updateRejectsAnUnknownStatus() {
        enable();

        assertThatThrownBy(
            () -> clockedService.update(
                PUBLIC_TOKEN, TEACHER_TOKEN, new AssessmentDtos.UpdateAssessmentRequest("ARCHIVED", null, null)
            ).block()
        ).isInstanceOf(IllegalArgumentException.class);
        verifyNoInteractions(assessments);
    }

    @Test
    void updateRejectsAnExtensionBeyondTheConfiguredCeiling() {
        enable();
        configuration.setMaxRetentionDays(30);

        assertThatThrownBy(
            () -> clockedService.update(
                PUBLIC_TOKEN, TEACHER_TOKEN, new AssessmentDtos.UpdateAssessmentRequest(null, 31, null)
            ).block()
        ).isInstanceOf(IllegalArgumentException.class);
        verifyNoInteractions(assessments);
    }

    @Test
    void updateCountsAnExtensionFromNowRatherThanFromTheExistingDeadline() {
        enable();
        final Assessment assessment = assessmentWithGeneratedAndCustomQuestions(Assessment.OPEN, NOW.plusSeconds(10));
        when(assessments.findByPublicToken(PUBLIC_TOKEN)).thenReturn(Mono.just(assessment));
        final Instant expectedExpiry = NOW.plus(7, ChronoUnit.DAYS);
        when(assessments.updateLifecycle(assessment.id(), null, expectedExpiry, false))
            .thenReturn(Mono.just(withLifecycle(assessment, Assessment.OPEN, expectedExpiry)));

        final AssessmentDtos.AssessmentState state = clockedService.update(
            PUBLIC_TOKEN, TEACHER_TOKEN, new AssessmentDtos.UpdateAssessmentRequest(null, 7, null)
        ).block();

        assertThat(state).isNotNull();
        assertThat(state.expiresAt()).isEqualTo(expectedExpiry.toString());
        verify(assessments).updateLifecycle(assessment.id(), null, expectedExpiry, false);
    }

    @Test
    void updateWithoutAStatusIsNotRefusedOnAQuizPastItsDeadline() {
        enable();
        final Assessment lapsed = assessmentWithGeneratedAndCustomQuestions(Assessment.OPEN, NOW.minusSeconds(1));
        when(assessments.findByPublicToken(PUBLIC_TOKEN)).thenReturn(Mono.just(lapsed));
        when(assessments.updateLifecycle(lapsed.id(), null, null, true)).thenReturn(Mono.just(lapsed));

        final AssessmentDtos.AssessmentState state = clockedService.update(
            PUBLIC_TOKEN, TEACHER_TOKEN, new AssessmentDtos.UpdateAssessmentRequest(null, null, true)
        ).block();

        assertThat(state).isNotNull();
        assertThat(state.status()).isEqualTo(Assessment.CLOSED);
        verify(assessments).updateLifecycle(lapsed.id(), null, null, true);
    }

    @Test
    void updateRefusesToReopenAQuizPastItsDeadlineWithoutExtendingIt() {
        enable();
        final Assessment lapsed = assessmentWithGeneratedAndCustomQuestions(Assessment.CLOSED, NOW.minusSeconds(1));
        when(assessments.findByPublicToken(PUBLIC_TOKEN)).thenReturn(Mono.just(lapsed));

        assertThatThrownBy(
            () -> clockedService.update(
                PUBLIC_TOKEN, TEACHER_TOKEN, new AssessmentDtos.UpdateAssessmentRequest(Assessment.OPEN, null, null)
            ).block()
        ).isInstanceOf(IllegalArgumentException.class);
        verify(assessments, never()).updateLifecycle(anyLong(), any(), any(), anyBoolean());
    }

    @Test
    void updateAsksForTheUnusedSittingsToBeReleasedWhenTheRequestSaysSo() {
        enable();
        final Assessment assessment = assessmentWithGeneratedAndCustomQuestions(Assessment.OPEN, FAR_FUTURE, 2000);
        when(assessments.findByPublicToken(PUBLIC_TOKEN)).thenReturn(Mono.just(assessment));
        when(assessments.updateLifecycle(assessment.id(), null, null, true)).thenReturn(
            Mono.just(withAttempts(withLifecycle(assessment, Assessment.OPEN, FAR_FUTURE), 1))
        );

        final AssessmentDtos.AssessmentState state = clockedService.update(
            PUBLIC_TOKEN, TEACHER_TOKEN, new AssessmentDtos.UpdateAssessmentRequest(null, null, true)
        ).block();

        assertThat(state).isNotNull();
        assertThat(state.totalAttempts()).isEqualTo(1);
        verify(assessments).updateLifecycle(assessment.id(), null, null, true);
    }

    @Test
    void updateLeavesTheSittingsAloneWhenTheRequestDoesNotAskForThem() {
        enable();
        final Assessment assessment = assessmentWithGeneratedAndCustomQuestions(Assessment.OPEN, FAR_FUTURE, 7);
        when(assessments.findByPublicToken(PUBLIC_TOKEN)).thenReturn(Mono.just(assessment));
        when(assessments.updateLifecycle(assessment.id(), Assessment.CLOSED, null, false))
            .thenReturn(Mono.just(withLifecycle(assessment, Assessment.CLOSED, FAR_FUTURE)));

        clockedService.update(
            PUBLIC_TOKEN, TEACHER_TOKEN, new AssessmentDtos.UpdateAssessmentRequest(Assessment.CLOSED, null, false)
        ).block();

        verify(assessments).updateLifecycle(assessment.id(), Assessment.CLOSED, null, false);
    }

    @Test
    void updateRefusesAsDisabledBeforeItLooksAtTheRequestAtAll() {
        assertThat(configuration.isEnabled()).isFalse();

        assertDisabled(
            () -> clockedService.update(
                PUBLIC_TOKEN, TEACHER_TOKEN, new AssessmentDtos.UpdateAssessmentRequest("ARCHIVED", null, null)
            )
        );
        verifyNoInteractions(assessments);
    }

    @Test
    void updateRejectsANullRequestAsBadInput() {
        enable();

        assertThatThrownBy(() -> clockedService.update(PUBLIC_TOKEN, TEACHER_TOKEN, null).block())
            .isInstanceOf(IllegalArgumentException.class);
        verifyNoInteractions(assessments);
    }

    @Test
    void updateRequiresATeacherToken() {
        enable();

        assertThatThrownBy(
            () -> clockedService.update(
                PUBLIC_TOKEN, null, new AssessmentDtos.UpdateAssessmentRequest(Assessment.CLOSED, null, null)
            ).block()
        ).isInstanceOfSatisfying(
            CapabilityException.class, error -> assertThat(error.code()).isEqualTo(AUTHORIZATION_REQUIRED)
        );
        verifyNoInteractions(assessments);
    }

    @Test
    void updateIsRefusedWithThePublicTokenInsteadOfTheTeacherToken() {
        enable();
        final Assessment assessment = assessmentWithGeneratedAndCustomQuestions();
        when(assessments.findByPublicToken(PUBLIC_TOKEN)).thenReturn(Mono.just(assessment));

        assertThatThrownBy(
            () -> clockedService.update(
                PUBLIC_TOKEN, PUBLIC_TOKEN, new AssessmentDtos.UpdateAssessmentRequest(Assessment.CLOSED, null, null)
            ).block()
        ).isInstanceOf(ResponseStatusException.class);
        verify(assessments, never()).updateLifecycle(anyLong(), any(), any(), anyBoolean());
    }

    @Test
    void deleteRequiresATeacherToken() {
        enable();

        assertThatThrownBy(() -> clockedService.delete(PUBLIC_TOKEN, null).block())
            .isInstanceOfSatisfying(
                CapabilityException.class, error -> assertThat(error.code()).isEqualTo(AUTHORIZATION_REQUIRED)
            );
        verifyNoInteractions(assessments);
    }

    @Test
    void deleteIsRefusedWithThePublicTokenInsteadOfTheTeacherToken() {
        enable();
        final Assessment assessment = assessmentWithGeneratedAndCustomQuestions();
        when(assessments.findByPublicToken(PUBLIC_TOKEN)).thenReturn(Mono.just(assessment));

        assertThatThrownBy(() -> clockedService.delete(PUBLIC_TOKEN, PUBLIC_TOKEN).block())
            .isInstanceOf(ResponseStatusException.class);
        verify(assessments, never()).delete(anyLong());
    }

    @Test
    void removeExpiredDoesNothingWhenTheCapabilityIsDisabled() {
        assertThat(configuration.isEnabled()).isFalse();

        final Integer removed = clockedService.removeExpired().block();

        assertThat(removed).isZero();
        verifyNoInteractions(assessments);
    }

    @Test
    void removeExpiredCountsOnlyRowsStillExpiredWhenDeletionRuns() {
        enable();
        when(assessments.findExpired(NOW, configuration.getCleanupBatchSize())).thenReturn(Mono.just(List.of(1L, 2L)));
        when(assessments.deleteExpired(1L, NOW)).thenReturn(Mono.just(false));
        when(assessments.deleteExpired(2L, NOW)).thenReturn(Mono.just(true));

        assertThat(clockedService.removeExpired().block()).isEqualTo(1);
    }

    @Test
    void everyEndpointRefusesWhenTheCapabilityIsOff() {
        assertThat(configuration.isEnabled()).isFalse();

        assertDisabled(() -> service.create(SUBMISSION_TOKEN, createRequest()));
        assertDisabled(() -> service.learnerView(PUBLIC_TOKEN));
        assertDisabled(() -> service.startAttempt(PUBLIC_TOKEN));
        assertDisabled(
            () -> service.answer(PUBLIC_TOKEN, "1", new AssessmentDtos.AnswerRequest(GENERATED_ID, "answer"))
        );
        assertDisabled(() -> service.results(PUBLIC_TOKEN, TEACHER_TOKEN));
        assertDisabled(() -> service.code(PUBLIC_TOKEN));
        assertDisabled(
            () -> service.update(
                PUBLIC_TOKEN, TEACHER_TOKEN, new AssessmentDtos.UpdateAssessmentRequest(Assessment.CLOSED, null, null)
            )
        );
        assertDisabled(() -> service.delete(PUBLIC_TOKEN, TEACHER_TOKEN));
        verifyNoInteractions(assessments, analyses, submissions, marking);
    }

    private void assertDisabled(final java.util.function.Supplier<Mono<?>> call) {
        assertThatThrownBy(() -> call.get().block())
            .isInstanceOfSatisfying(
                CapabilityException.class, error -> assertThat(error.code()).isEqualTo("capability_disabled")
            );
    }

    private Assessment assessmentWithGeneratedAndCustomQuestions() {
        return assessmentWithGeneratedAndCustomQuestions(Assessment.OPEN, FAR_FUTURE);
    }

    private Assessment assessmentWithGeneratedAndCustomQuestions(final String status, final Instant expiresAt) {
        return assessmentWithGeneratedAndCustomQuestions(status, expiresAt, 0);
    }

    private Assessment assessmentWithGeneratedAndCustomQuestions(
        final String status, final Instant expiresAt, final int attempts
    ) {
        final String questionsJson = JsonMapper.shared().writeValueAsString(
            new StoredAssessmentQuestions(
                List.of(
                    new StoredAssessmentQuestion(
                        GENERATED_ID, AssessmentDtos.SOURCE_GENERATED, ORIGINAL_ID, SPRITE_QUESTION, SPRITE_COUNTS,
                        QuestionType.MULTIPLE_CHOICE, null, null, null, null, null, 1, List.of()
                    ),
                    new StoredAssessmentQuestion(
                        CUSTOM_ID, AssessmentDtos.SOURCE_CUSTOM, null, "Explain the loop.", List.of(), null, null, null,
                        null, null, null, null, List.of()
                    )
                )
            )
        );
        return new Assessment(
            3, PUBLIC_TOKEN, TEACHER_TOKEN, ANALYSIS_ID, TITLE, INSTRUCTIONS, LOCALE, questionsJson,
            status, expiresAt, attempts
        );
    }

    private Assessment assessmentWithMultiAnswerCustomQuestion() {
        final String questionsJson = JsonMapper.shared().writeValueAsString(
            new StoredAssessmentQuestions(
                List.of(
                    new StoredAssessmentQuestion(
                        CUSTOM_ID, AssessmentDtos.SOURCE_CUSTOM, null, "Which two blocks repeat?",
                        List.of(FOREVER, REPEAT_TEN, "if then", "say hello"), QuestionType.MULTIPLE_CHOICE, null,
                        null, null,
                        null, null, 2, List.of(FOREVER, REPEAT_TEN)
                    )
                )
            )
        );
        return new Assessment(
            3, PUBLIC_TOKEN, TEACHER_TOKEN, ANALYSIS_ID, TITLE, INSTRUCTIONS, LOCALE, questionsJson,
            Assessment.OPEN, FAR_FUTURE, 0
        );
    }

    private Assessment assessmentWithMarkableCustomQuestion() {
        final String questionsJson = JsonMapper.shared().writeValueAsString(
            new StoredAssessmentQuestions(
                List.of(
                    new StoredAssessmentQuestion(
                        CUSTOM_ID, AssessmentDtos.SOURCE_CUSTOM, null, "Which loop repeats forever?",
                        List.of(REPEAT_TEN, FOREVER), QuestionType.MULTIPLE_CHOICE, null, null, null, null, null, 1,
                        List.of(FOREVER)
                    )
                )
            )
        );
        return new Assessment(
            3, PUBLIC_TOKEN, TEACHER_TOKEN, ANALYSIS_ID, TITLE, INSTRUCTIONS, LOCALE, questionsJson,
            Assessment.OPEN, FAR_FUTURE, 0
        );
    }

    private static Assessment withLifecycle(final Assessment assessment, final String status, final Instant expiresAt) {
        return new Assessment(
            assessment.id(), assessment.publicToken(), assessment.teacherToken(), assessment.analysisId(),
            assessment.title(), assessment.instructions(), assessment.locale(), assessment.questionsJson(), status,
            expiresAt, assessment.attempts()
        );
    }

    private static Assessment withAttempts(final Assessment assessment, final int attempts) {
        return new Assessment(
            assessment.id(), assessment.publicToken(), assessment.teacherToken(), assessment.analysisId(),
            assessment.title(), assessment.instructions(), assessment.locale(), assessment.questionsJson(),
            assessment.status(), assessment.expiresAt(), attempts
        );
    }
}
