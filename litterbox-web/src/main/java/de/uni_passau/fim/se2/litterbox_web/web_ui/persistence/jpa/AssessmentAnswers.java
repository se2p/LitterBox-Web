/*
 * Copyright (C) 2024-2026 LitterBox-Web contributors
 *
 * This file is part of LitterBox-Web.
 * Licenced under the EUPL-1.2 or later.
 *
 * SPDX-FileCopyrightText: 2024-2026 LitterBox-Web contributors
 * SPDX-License-Identifier: EUPL-1.2
 */
package de.uni_passau.fim.se2.litterbox_web.web_ui.persistence.jpa;

import java.util.Collection;
import java.util.List;
import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.transaction.annotation.Transactional;

import de.uni_passau.fim.se2.litterbox_web.web_ui.persistence.entity.AssessmentAnswerEntity;

public interface AssessmentAnswers extends JpaRepository<AssessmentAnswerEntity, Long> {

    @Modifying
    @Transactional
    @Query(
        value = "INSERT INTO assessment_answer (attempt_id, question_id, answer, correct, created_at) "
            + "VALUES (:attemptId, :questionId, :answer, :correct, CURRENT_TIMESTAMP(6)) "
            + "ON DUPLICATE KEY UPDATE id = id",
        nativeQuery = true
    )
    void upsert(
        @Param("attemptId") long attemptId,
        @Param("questionId") String questionId,
        @Param("answer") String answer,
        @Param("correct") Boolean correct
    );

    @Query(
        value = "SELECT assessment_answer.correct AS correct FROM assessment_answer "
            + "WHERE assessment_answer.attempt_id = :attemptId AND assessment_answer.question_id = :questionId",
        nativeQuery = true
    )
    Optional<MarkRow> findMark(@Param("attemptId") long attemptId, @Param("questionId") String questionId);

    @Query(
        value = "SELECT assessment_answer.attempt_id AS attemptId, "
            + "assessment_answer.question_id AS questionId, assessment_answer.correct AS correct "
            + "FROM assessment_answer "
            + "JOIN assessment_attempt ON assessment_attempt.id = assessment_answer.attempt_id "
            + "WHERE assessment_attempt.assessment_id = :assessmentId",
        nativeQuery = true
    )
    List<QuestionMarkRow> findMarksByAssessmentId(@Param("assessmentId") long assessmentId);

    @Query(
        value = "SELECT assessment_answer.question_id AS questionId, assessment_answer.answer AS answer, "
            + "COUNT(*) AS submissions FROM assessment_answer "
            + "JOIN assessment_attempt ON assessment_attempt.id = assessment_answer.attempt_id "
            + "WHERE assessment_attempt.assessment_id = :assessmentId "
            + "AND assessment_answer.question_id IN (:questionIds) "
            + "GROUP BY assessment_answer.question_id, assessment_answer.answer",
        nativeQuery = true
    )
    List<AnswerCountRow> findAnswerCountsByAssessmentId(
        @Param("assessmentId") long assessmentId, @Param("questionIds") Collection<String> questionIds
    );

    interface MarkRow {

        Boolean getCorrect();
    }

    interface QuestionMarkRow {

        long getAttemptId();

        String getQuestionId();

        Boolean getCorrect();
    }

    interface AnswerCountRow {

        String getQuestionId();

        String getAnswer();

        long getSubmissions();
    }
}
