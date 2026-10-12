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

import java.time.Clock;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.Locale;
import java.util.Objects;
import java.util.function.Supplier;

import org.springframework.beans.factory.ObjectProvider;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

import de.uni_passau.fim.se2.litterbox.analytics.questions.QuestionType;
import de.uni_passau.fim.se2.litterbox_web.web_ui.capabilities.AdvancedCapabilitiesConfiguration;
import de.uni_passau.fim.se2.litterbox_web.web_ui.capabilities.AdvancedCapabilityDtos;
import de.uni_passau.fim.se2.litterbox_web.web_ui.capabilities.CapabilityException;
import de.uni_passau.fim.se2.litterbox_web.web_ui.capabilities.ProgramExportCapability;
import de.uni_passau.fim.se2.litterbox_web.web_ui.persistence.Analysis;
import de.uni_passau.fim.se2.litterbox_web.web_ui.persistence.AnalysisRepository;
import de.uni_passau.fim.se2.litterbox_web.web_ui.persistence.Assessment;
import de.uni_passau.fim.se2.litterbox_web.web_ui.persistence.AssessmentAttempt;
import de.uni_passau.fim.se2.litterbox_web.web_ui.persistence.AssessmentRepository;
import de.uni_passau.fim.se2.litterbox_web.web_ui.persistence.AttemptClaim;
import de.uni_passau.fim.se2.litterbox_web.web_ui.persistence.SubmissionRepository;
import de.uni_passau.fim.se2.litterbox_web.web_ui.single_project.QuizAnswerPort;
import de.uni_passau.fim.se2.litterbox_web.web_ui.single_project.SubmissionAnalysisAuthorizer;
import de.uni_passau.fim.se2.litterbox_web.web_ui.support.SupportedLocales;
import reactor.core.publisher.Flux;
import reactor.core.publisher.Mono;
import tools.jackson.databind.json.JsonMapper;

/** Assessment capability service; disabled deployments do not reveal token existence. */
@Service
public final class AssessmentService {

    private final AssessmentRepository assessments;
    private final AnalysisRepository analyses;
    private final SubmissionRepository submissions;
    private final QuizAnswerPort marking;
    private final AssessmentCapabilitiesConfiguration configuration;
    private final ObjectProvider<ProgramExportCapability> exportCapability;
    private final AdvancedCapabilitiesConfiguration capabilitiesConfiguration;
    private final Clock clock;
    private final JsonMapper mapper = JsonMapper.shared();

    @Autowired
    public AssessmentService(
        final AssessmentRepository assessments,
        final AnalysisRepository analyses,
        final SubmissionRepository submissions,
        final QuizAnswerPort marking,
        final AssessmentCapabilitiesConfiguration configuration,
        final ObjectProvider<ProgramExportCapability> exportCapability,
        final AdvancedCapabilitiesConfiguration capabilitiesConfiguration
    ) {
        this(
            assessments, analyses, submissions, marking, configuration, exportCapability, capabilitiesConfiguration,
            Clock.systemUTC()
        );
    }

    @SuppressWarnings("checkstyle:ParameterNumber")
    AssessmentService(
        final AssessmentRepository assessments,
        final AnalysisRepository analyses,
        final SubmissionRepository submissions,
        final QuizAnswerPort marking,
        final AssessmentCapabilitiesConfiguration configuration,
        final ObjectProvider<ProgramExportCapability> exportCapability,
        final AdvancedCapabilitiesConfiguration capabilitiesConfiguration,
        final Clock clock
    ) {
        this.assessments = Objects.requireNonNull(assessments, "assessments");
        this.analyses = Objects.requireNonNull(analyses, "analyses");
        this.submissions = Objects.requireNonNull(submissions, "submissions");
        this.marking = Objects.requireNonNull(marking, "marking");
        this.configuration = Objects.requireNonNull(configuration, "configuration");
        this.exportCapability = Objects.requireNonNull(exportCapability, "exportCapability");
        this.capabilitiesConfiguration = Objects.requireNonNull(
            capabilitiesConfiguration, "capabilitiesConfiguration"
        );
        this.clock = Objects.requireNonNull(clock, "clock");
    }

    /**
     * Publishes a quiz for an analysis owned by the caller's submission.
     *
     * @param bearerToken the submission token proving ownership of the analysis
     * @param request     the quiz title, instructions, locale and the generated or teacher-authored questions
     * @return the public token learners use and the teacher token that manages the quiz; fails if the analysis is
     *         unknown, not owned, not finished, the request is invalid or the analysis already has too many quizzes
     */
    public Mono<AssessmentDtos.CreatedAssessment> create(
        final String bearerToken, final AssessmentDtos.CreateAssessmentRequest request
    ) {
        return whenEnabled(() -> {
            if (bearerToken == null || bearerToken.isBlank()) {
                return Mono.error(CapabilityException.authorizationRequired());
            }
            final AssessmentDtos.CreateAssessmentRequest validated = requireValidCreateRequest(request);
            return authorizeCreation(bearerToken, validated.analysisId())
                .flatMap(analysis -> storeAssessment(analysis, validated));
        });
    }

    public Mono<AssessmentDtos.LearnerView> learnerView(final String publicToken) {
        return whenEnabled(() -> {
            return findByPublicToken(publicToken).map(this::requireAnswerable).map(this::toLearnerView);
        });
    }

    /**
     * Lists the program exports learners of an open quiz may download.
     *
     * @param publicToken the quiz's learner-facing token
     * @return the export targets of the analysed program; fails if program export is disabled or unavailable, the quiz
     *         is unknown or closed, or its program cannot be exported
     */
    public Mono<AdvancedCapabilityDtos.ExportTargetsView> code(final String publicToken) {
        return whenEnabled(() -> exportTargets(publicToken));
    }

    private Mono<AdvancedCapabilityDtos.ExportTargetsView> exportTargets(final String publicToken) {
        if (!capabilitiesConfiguration.getProgramExport().isEnabled()) {
            return Mono.error(CapabilityException.disabled());
        }
        final ProgramExportCapability operation = exportCapability.getIfAvailable();
        if (operation == null) {
            return Mono.error(CapabilityException.unavailable());
        }
        return findByPublicToken(publicToken)
            .map(this::requireAnswerable)
            .flatMap(assessment -> exportableAnalysis(assessment.analysisId()))
            .flatMap(operation::targets);
    }

    /**
     * Opens a new learner attempt on an open quiz.
     *
     * @param publicToken the quiz's learner-facing token
     * @return the token identifying the new attempt; fails if the quiz is unknown or closed, or has used up its attempt
     *         allowance
     */
    public Mono<AssessmentDtos.AttemptStarted> startAttempt(final String publicToken) {
        return whenEnabled(() -> {
            return findByPublicToken(publicToken)
                .map(this::requireAnswerable)
                .flatMap(
                    assessment -> assessments
                        .createAttempt(assessment.id(), configuration.getMaxAttempts(), clock.instant())
                )
                .map(this::requireOpened)
                .map(attempt -> new AssessmentDtos.AttemptStarted(attempt.publicToken()));
        });
    }

    /**
     * Records and marks a learner's answer to one question of an attempt.
     *
     * @param publicToken  the quiz's learner-facing token
     * @param attemptToken the token of an attempt belonging to that quiz
     * @param request      the question answered and the learner's answer
     * @return whether the answer is correct, {@code null} for a question that cannot be marked, together with the
     *         accepted answers; fails if the quiz, attempt or question is unknown or the answer is invalid
     */
    public Mono<AssessmentDtos.AnswerResult> answer(
        final String publicToken, final String attemptToken, final AssessmentDtos.AnswerRequest request
    ) {
        return whenEnabled(() -> {
            requireValidAnswerRequest(request);
            return findByPublicToken(publicToken)
                .map(this::requireAnswerable)
                .flatMap(
                    assessment -> attemptOf(assessment, attemptToken).flatMap(
                        attempt -> answerForAssessment(assessment, attempt, request)
                    )
                );
        });
    }

    public Mono<AssessmentDtos.ResultsView> results(final String publicToken, final String teacherBearerToken) {
        return whenEnabled(() -> {
            return authorizeTeacher(publicToken, teacherBearerToken).flatMap(this::aggregateResults);
        });
    }

    /**
     * Opens or closes a quiz, extends its deadline and optionally clears its attempts.
     *
     * @param publicToken        the quiz's learner-facing token
     * @param teacherBearerToken the teacher token returned when the quiz was created
     * @param request            the new status, the number of days from now to extend the deadline by, and whether to
     *                           reset attempts; omitted fields leave that part unchanged
     * @return the quiz's resulting status, deadline and attempt count; fails if the teacher token does not match, the
     *         request is invalid, or it would reopen a quiz whose deadline has passed
     */
    public Mono<AssessmentDtos.AssessmentState> update(
        final String publicToken, final String teacherBearerToken, final AssessmentDtos.UpdateAssessmentRequest request
    ) {
        return whenEnabled(() -> applyUpdate(publicToken, teacherBearerToken, request));
    }

    private Mono<AssessmentDtos.AssessmentState> applyUpdate(
        final String publicToken, final String teacherBearerToken, final AssessmentDtos.UpdateAssessmentRequest request
    ) {
        if (request == null) {
            return Mono.error(new IllegalArgumentException("An update request is required"));
        }
        final String status = requestedStatus(request);
        final Instant expiresAt = requestedExpiry(request);
        final boolean release = Boolean.TRUE.equals(request.resetAttempts());
        return authorizeTeacher(publicToken, teacherBearerToken)
            .flatMap(assessment -> applyLifecycle(assessment, status, expiresAt, release))
            .map(this::describe);
    }

    private Mono<Assessment> applyLifecycle(
        final Assessment assessment, final String status, final Instant expiresAt, final boolean release
    ) {
        Instant deadline = expiresAt;
        if (deadline == null) {
            deadline = assessment.expiresAt();
        }
        return requireReachableDeadline(status, deadline).then(
            Mono.defer(
                () -> assessments.updateLifecycle(assessment.id(), status, expiresAt, release)
                    .switchIfEmpty(Mono.error(notFound()))
            )
        );
    }

    public Mono<Void> delete(final String publicToken, final String teacherBearerToken) {
        return whenEnabled(
            () -> authorizeTeacher(publicToken, teacherBearerToken)
                .flatMap(assessment -> assessments.delete(assessment.id()))
        );
    }

    /**
     * Deletes one batch of quizzes whose retention period has ended.
     *
     * @return the number of quizzes actually deleted; zero when assessments are disabled
     */
    public Mono<Integer> removeExpired() {
        return Mono.defer(this::removeExpiredBatch);
    }

    private Mono<Integer> removeExpiredBatch() {
        if (!configuration.isEnabled()) {
            return Mono.just(0);
        }
        final Instant now = clock.instant();
        return assessments.findExpired(now, configuration.getCleanupBatchSize())
            .flatMapMany(Flux::fromIterable)
            .concatMap(id -> assessments.deleteExpired(id, now))
            .filter(deleted -> deleted)
            .count()
            .map(Long::intValue);
    }

    private <T> Mono<T> whenEnabled(final Supplier<Mono<T>> operation) {
        return Mono.defer(() -> {
            if (!configuration.isEnabled()) {
                return Mono.error(CapabilityException.disabled());
            }
            return operation.get();
        });
    }

    private Mono<Assessment> authorizeTeacher(final String publicToken, final String teacherBearerToken) {
        if (teacherBearerToken == null || teacherBearerToken.isBlank()) {
            return Mono.error(CapabilityException.authorizationRequired());
        }
        return findByPublicToken(publicToken)
            .filter(
                assessment -> SubmissionAnalysisAuthorizer.matchesBearer(teacherBearerToken, assessment.teacherToken())
            )
            .switchIfEmpty(Mono.error(notFound()));
    }

    private Mono<Void> requireReachableDeadline(final String status, final Instant deadline) {
        if (!AssessmentDtos.STATUS_OPEN.equals(status) || clock.instant().isBefore(deadline)) {
            return Mono.empty();
        }
        return Mono.error(
            new IllegalArgumentException("A quiz past its deadline can only be reopened by extending it")
        );
    }

    private String requestedStatus(final AssessmentDtos.UpdateAssessmentRequest request) {
        final String requested = request.status();
        if (requested == null || requested.isBlank()) {
            return null;
        }
        final String status = requested.trim().toUpperCase(Locale.ROOT);
        if (!AssessmentDtos.STATUS_OPEN.equals(status) && !AssessmentDtos.STATUS_CLOSED.equals(status)) {
            throw new IllegalArgumentException("A quiz is either OPEN or CLOSED");
        }
        return status;
    }

    private Instant requestedExpiry(final AssessmentDtos.UpdateAssessmentRequest request) {
        final Integer requestedDays = request.extendByDays();
        if (requestedDays == null) {
            return null;
        }
        final int days = requestedDays;
        if (days < 1 || days > configuration.getMaxRetentionDays()) {
            throw new IllegalArgumentException("A quiz cannot be extended that far");
        }
        return clock.instant().plus(days, ChronoUnit.DAYS);
    }

    private AssessmentDtos.AssessmentState describe(final Assessment assessment) {
        return new AssessmentDtos.AssessmentState(
            AssessmentDtos.SCHEMA_VERSION, assessment.publicToken(), statusFor(assessment),
            assessment.expiresAt().toString(), assessment.attempts()
        );
    }

    private String statusFor(final Assessment assessment) {
        if (assessment.answerable(clock.instant())) {
            return AssessmentDtos.STATUS_OPEN;
        }
        return AssessmentDtos.STATUS_CLOSED;
    }

    private Assessment requireAnswerable(final Assessment assessment) {
        if (assessment.answerable(clock.instant())) {
            return assessment;
        }
        throw new ResponseStatusException(HttpStatus.GONE, "This quiz is no longer open");
    }

    private AssessmentAttempt requireOpened(final AttemptClaim claim) {
        return switch (claim.outcome()) {
            case OPENED -> claim.attempt();
            case EXHAUSTED -> throw new ResponseStatusException(
                HttpStatus.TOO_MANY_REQUESTS, "This quiz has taken all the attempts it can"
            );
            case UNAVAILABLE -> throw new ResponseStatusException(HttpStatus.GONE, "This quiz is no longer open");
        };
    }

    private AssessmentDtos.CreateAssessmentRequest requireValidCreateRequest(
        final AssessmentDtos.CreateAssessmentRequest request
    ) {
        if (request == null || request.analysisId() == null || request.analysisId() < 1) {
            throw new IllegalArgumentException("A valid analysis id is required");
        }
        requireValidTexts(request);
        final String locale = requireSupportedLocale(request.locale());
        return new AssessmentDtos.CreateAssessmentRequest(
            request.analysisId(), request.title(), request.instructions(), locale, request.questions()
        );
    }

    private void requireValidTexts(final AssessmentDtos.CreateAssessmentRequest request) {
        if (request.title() == null || request.title().isBlank()) {
            throw new IllegalArgumentException("A title is required");
        }
        if (request.title().length() > configuration.getMaxTitleLength()) {
            throw new IllegalArgumentException("Title is too long");
        }
        if (
            request.instructions() != null
                && request.instructions().length() > configuration.getMaxInstructionsLength()
        ) {
            throw new IllegalArgumentException("Instructions are too long");
        }
    }

    private static String requireSupportedLocale(final String requested) {
        String locale = "";
        if (requested != null) {
            locale = requested.trim().toLowerCase(Locale.ROOT);
        }
        if (!SupportedLocales.contains(locale)) {
            throw new IllegalArgumentException("Unsupported locale");
        }
        return locale;
    }

    private void requireValidAnswerRequest(final AssessmentDtos.AnswerRequest request) {
        if (request == null || request.questionId() == null || request.questionId().isBlank()) {
            throw new IllegalArgumentException("A question id is required");
        }
        if (request.answer() == null || request.answer().isBlank()) {
            throw new IllegalArgumentException("An answer is required");
        }
        if (request.answer().length() > configuration.getMaxAnswerLength()) {
            throw new IllegalArgumentException("Answer is too long");
        }
    }

    private Mono<Analysis> authorizeCreation(final String bearerToken, final long analysisId) {
        return analyses.findById(analysisId)
            .switchIfEmpty(Mono.error(CapabilityException.analysisNotFound()))
            .flatMap(analysis -> requireOwningSubmission(bearerToken, analysis));
    }

    private Mono<Analysis> requireOwningSubmission(final String bearerToken, final Analysis analysis) {
        return SubmissionAnalysisAuthorizer.requireOwningCompletedAnalysis(
            submissions, bearerToken, analysis, CapabilityException::analysisNotFound,
            CapabilityException::analysisNotReady
        );
    }

    private Mono<AssessmentDtos.CreatedAssessment> storeAssessment(
        final Analysis analysis, final AssessmentDtos.CreateAssessmentRequest request
    ) {
        return generatedQuiz(analysis, request).map(
            quiz -> AssessmentQuestionResolver.resolve(
                request.questions(), quiz.questions(), quiz.answerKeys(), configuration
            )
        )
            .onErrorMap(
                QuizAnswerPort.AnalysisNotFoundException.class, error -> CapabilityException.analysisNotFound()
            )
            .flatMap(
                questions -> assessments.create(
                    new AssessmentRepository.NewAssessment(
                        analysis.id(), request.title().trim(), trimmedOrNull(request.instructions()),
                        request.locale(), writeQuestions(questions),
                        clock.instant().plus(configuration.getRetentionDays(), ChronoUnit.DAYS)
                    ), configuration.getMaxAssessmentsPerAnalysis()
                ).switchIfEmpty(Mono.error(assessmentQuotaExceeded()))
            )
            .map(
                assessment -> new AssessmentDtos.CreatedAssessment(
                    AssessmentDtos.SCHEMA_VERSION, assessment.publicToken(), assessment.teacherToken()
                )
            );
    }

    private Mono<QuizAnswerPort.GeneratedQuiz> generatedQuiz(
        final Analysis analysis, final AssessmentDtos.CreateAssessmentRequest request
    ) {
        final boolean usesGenerated = request.questions().stream()
            .anyMatch(question -> AssessmentDtos.SOURCE_GENERATED.equals(question.source()));
        if (usesGenerated) {
            return Mono.defer(() -> marking.generatedQuiz(analysis));
        }
        return Mono.just(QuizAnswerPort.GeneratedQuiz.NONE);
    }

    private Mono<Assessment> findByPublicToken(final String publicToken) {
        if (publicToken == null || publicToken.isBlank()) {
            return Mono.error(notFound());
        }
        return assessments.findByPublicToken(publicToken).switchIfEmpty(Mono.error(notFound()));
    }

    private Mono<Analysis> exportableAnalysis(final long analysisId) {
        return analyses.findById(analysisId)
            .filter(analysis -> ProgramExportCapability.isExportable(analysis.inputFormat()))
            .switchIfEmpty(Mono.error(notFound()));
    }

    private Mono<AssessmentAttempt> attemptOf(final Assessment assessment, final String attemptToken) {
        if (attemptToken == null || attemptToken.isBlank()) {
            return Mono.error(notFound());
        }
        return assessments.findAttemptByPublicToken(attemptToken)
            .filter(attempt -> attempt.assessmentId() == assessment.id())
            .switchIfEmpty(Mono.error(notFound()));
    }

    private Mono<AssessmentDtos.AnswerResult> answerForAssessment(
        final Assessment assessment, final AssessmentAttempt attempt, final AssessmentDtos.AnswerRequest request
    ) {
        final StoredAssessmentQuestion question = readQuestions(assessment.questionsJson()).stream()
            .filter(candidate -> candidate.questionId().equals(request.questionId()))
            .findFirst()
            .orElseThrow(() -> new IllegalArgumentException("Unknown quiz question"));
        if (!question.markable()) {
            return record(attempt, question, request.answer(), null, List.of());
        }
        final QuizAnswerPort.Verdict verdict = QuizAnswerPort.markSnapshot(
            question.questionType(), question.options(), question.correctAnswers(), request.answer()
        );
        return record(attempt, question, request.answer(), verdict.correct(), verdict.correctAnswers());
    }

    private Mono<AssessmentDtos.AnswerResult> record(
        final AssessmentAttempt attempt,
        final StoredAssessmentQuestion question,
        final String answer,
        final Boolean correct,
        final List<String> correctAnswers
    ) {
        return assessments.recordAnswer(attempt.id(), question.questionId(), answer, correct)
            .switchIfEmpty(Mono.error(notFound()))
            .map(
                stored -> new AssessmentDtos.AnswerResult(
                    question.questionId(), stored.correct(), correctAnswers
                )
            );
    }

    private Mono<AssessmentDtos.ResultsView> aggregateResults(final Assessment authorized) {
        final List<StoredAssessmentQuestion> questions = readQuestions(authorized.questionsJson());
        return assessments.findResults(
            authorized.id(), AssessmentResultsAggregator.talliedQuestionIds(questions)
        )
            .switchIfEmpty(Mono.error(notFound()))
            .map(
                snapshot -> AssessmentResultsAggregator.aggregate(
                    snapshot.assessment(), statusFor(snapshot.assessment()), questions, snapshot.marks(),
                    snapshot.answerCounts()
                )
            );
    }

    private AssessmentDtos.LearnerView toLearnerView(final Assessment assessment) {
        final List<StoredAssessmentQuestion> questions = readQuestions(assessment.questionsJson());
        return new AssessmentDtos.LearnerView(
            AssessmentDtos.SCHEMA_VERSION, assessment.title(), assessment.instructions(), assessment.locale(),
            questions.stream().map(AssessmentService::toLearnerQuestion).toList()
        );
    }

    private static AssessmentDtos.LearnerQuestion toLearnerQuestion(final StoredAssessmentQuestion question) {
        return new AssessmentDtos.LearnerQuestion(
            question.questionId(), question.questionText(), question.options(),
            typeName(question.questionType()), question.sprite(),
            question.scratchBlocks(), question.hint(), question.programDimension(),
            question.scopeOfFocus(), question.expectedAnswers()
        );
    }

    private static String typeName(final QuestionType questionType) {
        if (questionType == null) {
            return null;
        }
        return questionType.name();
    }

    private List<StoredAssessmentQuestion> readQuestions(final String questionsJson) {
        return mapper.readValue(questionsJson, StoredAssessmentQuestions.class).questions();
    }

    private String writeQuestions(final List<StoredAssessmentQuestion> questions) {
        return mapper.writeValueAsString(new StoredAssessmentQuestions(questions));
    }

    private static String trimmedOrNull(final String value) {
        if (value == null || value.isBlank()) {
            return null;
        }
        return value.trim();
    }

    private static ResponseStatusException notFound() {
        return new ResponseStatusException(HttpStatus.NOT_FOUND, "Assessment not found");
    }

    private static ResponseStatusException assessmentQuotaExceeded() {
        return new ResponseStatusException(
            HttpStatus.TOO_MANY_REQUESTS, "This project has as many quizzes as it can hold"
        );
    }
}
