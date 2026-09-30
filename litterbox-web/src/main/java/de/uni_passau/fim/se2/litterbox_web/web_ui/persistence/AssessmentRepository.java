/*
 * Copyright (C) 2024-2026 LitterBox-Web contributors
 *
 * This file is part of LitterBox-Web.
 * Licenced under the EUPL-1.2 or later.
 *
 * SPDX-FileCopyrightText: 2024-2026 LitterBox-Web contributors
 * SPDX-License-Identifier: EUPL-1.2
 */
package de.uni_passau.fim.se2.litterbox_web.web_ui.persistence;

import java.time.Instant;
import java.util.Collection;
import java.util.List;
import java.util.Objects;
import java.util.function.LongToIntFunction;

import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.data.domain.Limit;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.support.TransactionTemplate;

import de.uni_passau.fim.se2.litterbox_web.web_ui.persistence.entity.AssessmentAttemptEntity;
import de.uni_passau.fim.se2.litterbox_web.web_ui.persistence.entity.AssessmentEntity;
import de.uni_passau.fim.se2.litterbox_web.web_ui.persistence.jpa.Analyses;
import de.uni_passau.fim.se2.litterbox_web.web_ui.persistence.jpa.AssessmentAnswers;
import de.uni_passau.fim.se2.litterbox_web.web_ui.persistence.jpa.AssessmentAttempts;
import de.uni_passau.fim.se2.litterbox_web.web_ui.persistence.jpa.Assessments;
import reactor.core.publisher.Mono;

@Repository
public class AssessmentRepository {

    private final Assessments assessments;
    private final AssessmentAttempts attempts;
    private final AssessmentAnswers answers;
    private final Analyses analyses;
    private final DatabaseWork databaseWork;
    private final ReadCommittedTransactions transactions;
    private final TransactionTemplate snapshots;
    private final ShareTokenGenerator tokenGenerator;

    public AssessmentRepository(
        final Assessments assessments,
        final AssessmentAttempts attempts,
        final AssessmentAnswers answers,
        final Analyses analyses,
        final DatabaseWork databaseWork,
        final ReadCommittedTransactions transactions
    ) {
        this.assessments = Objects.requireNonNull(assessments, "assessments");
        this.attempts = Objects.requireNonNull(attempts, "attempts");
        this.answers = Objects.requireNonNull(answers, "answers");
        this.analyses = Objects.requireNonNull(analyses, "analyses");
        this.databaseWork = Objects.requireNonNull(databaseWork, "databaseWork");
        this.transactions = Objects.requireNonNull(transactions, "transactions");
        this.snapshots = snapshotReads(transactions);
        this.tokenGenerator = new ShareTokenGenerator();
    }

    private static TransactionTemplate snapshotReads(final ReadCommittedTransactions transactions) {
        final TransactionTemplate template = new TransactionTemplate(
            Objects.requireNonNull(transactions.getTransactionManager(), "transactionManager")
        );
        template.setIsolationLevel(TransactionDefinition.ISOLATION_REPEATABLE_READ);
        template.setReadOnly(true);
        return template;
    }

    /**
     * Creates an open assessment, provided its analysis has not yet reached its assessment limit.
     *
     * @param assessment         the assessment to create
     * @param maximumPerAnalysis the most assessments one analysis may have
     * @return the created assessment, or an empty {@code Mono} when the analysis has no free assessment slot
     */
    public Mono<Assessment> create(final NewAssessment assessment, final int maximumPerAnalysis) {
        Objects.requireNonNull(assessment, "assessment");
        return databaseWork.submit(
            () -> transactions.execute(transaction -> createIfSlotFree(assessment, maximumPerAnalysis))
        );
    }

    private Assessment createIfSlotFree(final NewAssessment assessment, final int maximumPerAnalysis) {
        if (analyses.claimAssessmentSlot(assessment.analysisId(), maximumPerAnalysis) != 1) {
            return null;
        }
        return createInDatabase(assessment);
    }

    private Assessment createInDatabase(final NewAssessment assessment) {
        final AssessmentEntity entity = new AssessmentEntity();
        entity.setPublicToken(tokenGenerator.nextToken());
        entity.setTeacherToken(tokenGenerator.nextToken());
        entity.setAnalysisId(assessment.analysisId());
        entity.setTitle(assessment.title());
        entity.setInstructions(assessment.instructions());
        entity.setLocale(assessment.locale());
        entity.setQuestionsJson(assessment.questionsJson());
        entity.setStatus(Assessment.OPEN);
        entity.setExpiresAt(assessment.expiresAt());
        return toAssessment(assessments.saveAndFlush(entity));
    }

    public Mono<Assessment> findByPublicToken(final String publicToken) {
        Objects.requireNonNull(publicToken, "publicToken");
        return databaseWork.submit(
            () -> assessments.findByPublicToken(publicToken).map(AssessmentRepository::toAssessment).orElse(null)
        );
    }

    public Mono<AttemptClaim> createAttempt(final long assessmentId, final int maxAttempts, final Instant now) {
        Objects.requireNonNull(now, "now");
        return databaseWork.submit(
            () -> transactions.execute(status -> createAttemptInDatabase(assessmentId, maxAttempts, now))
        );
    }

    private AttemptClaim createAttemptInDatabase(final long assessmentId, final int maxAttempts, final Instant now) {
        if (assessments.claimAttempt(assessmentId, maxAttempts, now) != 1) {
            return refusedClaim(assessmentId, maxAttempts, now);
        }
        final AssessmentAttemptEntity entity = new AssessmentAttemptEntity();
        entity.setPublicToken(tokenGenerator.nextToken());
        entity.setAssessmentId(assessmentId);
        return AttemptClaim.opened(toAttempt(attempts.saveAndFlush(entity)));
    }

    private AttemptClaim refusedClaim(final long assessmentId, final int maxAttempts, final Instant now) {
        return assessments.findById(assessmentId)
            .map(AssessmentRepository::toAssessment)
            .filter(assessment -> assessment.answerable(now) && assessment.attempts() >= maxAttempts)
            .map(assessment -> AttemptClaim.exhausted())
            .orElseGet(AttemptClaim::unavailable);
    }

    public Mono<AssessmentAttempt> findAttemptByPublicToken(final String publicToken) {
        Objects.requireNonNull(publicToken, "publicToken");
        return databaseWork.submit(
            () -> attempts.findByPublicToken(publicToken).map(AssessmentRepository::toAttempt).orElse(null)
        );
    }

    /**
     * Stores the first answer and returns the persisted mark.
     *
     * @param attemptId  the attempt the answer belongs to
     * @param questionId the question being answered
     * @param answer     the learner's answer
     * @param correct    whether the answer is correct, or {@code null} if it could not be marked
     * @return the mark stored for the question, which is the earlier one if the question was already answered, or an
     *         empty {@code Mono} if the attempt no longer exists
     */
    public Mono<AssessmentQuestionMark> recordAnswer(
        final long attemptId, final String questionId, final String answer, final Boolean correct
    ) {
        Objects.requireNonNull(questionId, "questionId");
        Objects.requireNonNull(answer, "answer");
        return databaseWork.submit(() -> recordAnswerInDatabase(attemptId, questionId, answer, correct));
    }

    private AssessmentQuestionMark recordAnswerInDatabase(
        final long attemptId, final String questionId, final String answer, final Boolean correct
    ) {
        try {
            answers.upsert(attemptId, questionId, answer, correct);
        }
        catch (DataIntegrityViolationException sittingGone) {
            if (attempts.existsById(attemptId)) {
                throw sittingGone;
            }
            return null;
        }
        return answers.findMark(attemptId, questionId)
            .map(row -> new AssessmentQuestionMark(attemptId, questionId, row.getCorrect()))
            .orElse(new AssessmentQuestionMark(attemptId, questionId, correct));
    }

    /**
     * Reads the assessment, its marks and its answer counts in one read-only {@code REPEATABLE READ} transaction, so
     * the attempt count and the answers agree even while learners are still answering.
     *
     * @param assessmentId the assessment whose results are read
     * @param questionIds  the questions to count answers for
     * @return the assessment with its marks and per-answer counts, or an empty {@code Mono} if it does not exist
     */
    public Mono<AssessmentResultsSnapshot> findResults(final long assessmentId, final Collection<String> questionIds) {
        Objects.requireNonNull(questionIds, "questionIds");
        return databaseWork.submit(
            () -> snapshots.execute(transaction -> findResultsInDatabase(assessmentId, questionIds))
        );
    }

    private AssessmentResultsSnapshot findResultsInDatabase(
        final long assessmentId, final Collection<String> questionIds
    ) {
        final Assessment assessment = assessments.findById(assessmentId)
            .map(AssessmentRepository::toAssessment)
            .orElse(null);
        if (assessment == null) {
            return null;
        }
        return new AssessmentResultsSnapshot(
            assessment, findMarks(assessmentId), findAnswerCounts(assessmentId, questionIds)
        );
    }

    private List<AssessmentQuestionMark> findMarks(final long assessmentId) {
        return answers.findMarksByAssessmentId(assessmentId).stream()
            .map(row -> new AssessmentQuestionMark(row.getAttemptId(), row.getQuestionId(), row.getCorrect()))
            .toList();
    }

    private List<AssessmentAnswerCount> findAnswerCounts(
        final long assessmentId, final Collection<String> questionIds
    ) {
        if (questionIds.isEmpty()) {
            return List.of();
        }
        return answers.findAnswerCountsByAssessmentId(assessmentId, questionIds).stream()
            .map(AssessmentRepository::toAnswerCount)
            .toList();
    }

    private static AssessmentAnswerCount toAnswerCount(final AssessmentAnswers.AnswerCountRow row) {
        return new AssessmentAnswerCount(
            row.getQuestionId(), row.getAnswer(), Math.toIntExact(row.getSubmissions())
        );
    }

    private static Assessment toAssessment(final AssessmentEntity entity) {
        return new Assessment(
            entity.getId(), entity.getPublicToken(), entity.getTeacherToken(), entity.getAnalysisId(),
            entity.getTitle(), entity.getInstructions(), entity.getLocale(), entity.getQuestionsJson(),
            entity.getStatus(), entity.getExpiresAt(), entity.getAttempts()
        );
    }

    private static AssessmentAttempt toAttempt(final AssessmentAttemptEntity entity) {
        return new AssessmentAttempt(entity.getId(), entity.getPublicToken(), entity.getAssessmentId());
    }

    /**
     * Changes an assessment's status and expiry, leaving omitted lifecycle fields unchanged.
     *
     * @param id                    the assessment to update
     * @param status                the new status, or {@code null} to keep the current one
     * @param expiresAt             the new expiry, or {@code null} to keep the current one
     * @param releaseUnusedAttempts whether to delete attempts without answers and give their slots back
     * @return the updated assessment, or an empty {@code Mono} if it does not exist
     */
    public Mono<Assessment> updateLifecycle(
        final long id, final String status, final Instant expiresAt, final boolean releaseUnusedAttempts
    ) {
        return databaseWork.submit(
            () -> transactions.execute(
                transaction -> updateLifecycleInDatabase(id, status, expiresAt, releaseUnusedAttempts)
            )
        );
    }

    private Assessment updateLifecycleInDatabase(
        final long id, final String status, final Instant expiresAt, final boolean releaseUnusedAttempts
    ) {
        if (releaseUnusedAttempts) {
            attempts.deleteUnanswered(id);
        }
        if (assessments.updateLifecycleById(id, status, expiresAt, releaseUnusedAttempts) != 1) {
            return null;
        }
        return assessments.findById(id).map(AssessmentRepository::toAssessment).orElse(null);
    }

    public Mono<Void> delete(final long assessmentId) {
        return databaseWork.submit(
            () -> transactions.execute(transaction -> deleteInDatabase(assessmentId))
        );
    }

    private Void deleteInDatabase(final long assessmentId) {
        deleteAndRelease(assessmentId, assessments::deleteAssessmentById);
        return null;
    }

    /**
     * Deletes an assessment if it has expired and frees its analysis's assessment slot.
     *
     * @param assessmentId the assessment to delete
     * @param now          the moment the assessment must have expired before
     * @return {@code true} if the assessment was deleted, {@code false} if it is missing or has not expired
     */
    public Mono<Boolean> deleteExpired(final long assessmentId, final Instant now) {
        Objects.requireNonNull(now, "now");
        return databaseWork.submit(
            () -> transactions.execute(
                transaction -> deleteExpiredInDatabase(assessmentId, now)
            )
        );
    }

    private boolean deleteExpiredInDatabase(final long assessmentId, final Instant now) {
        return deleteAndRelease(assessmentId, id -> assessments.deleteExpiredAssessmentById(id, now));
    }

    private boolean deleteAndRelease(final long assessmentId, final LongToIntFunction delete) {
        final AssessmentEntity entity = assessments.findById(assessmentId).orElse(null);
        if (entity == null || delete.applyAsInt(assessmentId) != 1) {
            return false;
        }
        analyses.releaseAssessmentSlot(entity.getAnalysisId());
        return true;
    }

    public Mono<List<Long>> findExpired(final Instant now, final int limit) {
        Objects.requireNonNull(now, "now");
        return databaseWork.submit(() -> assessments.findExpiredIds(now, Limit.of(limit)));
    }

    public record NewAssessment(
        long analysisId, String title, String instructions, String locale, String questionsJson, Instant expiresAt
    ) {

        public NewAssessment {
            Objects.requireNonNull(title, "title");
            Objects.requireNonNull(locale, "locale");
            Objects.requireNonNull(questionsJson, "questionsJson");
            Objects.requireNonNull(expiresAt, "expiresAt");
        }
    }
}
