/*
 * Copyright (C) 2024-2026 LitterBox-Web contributors
 *
 * This file is part of LitterBox-Web.
 * Licenced under the EUPL-1.2 or later.
 *
 * SPDX-FileCopyrightText: 2024-2026 LitterBox-Web contributors
 * SPDX-License-Identifier: EUPL-1.2
 */
package de.uni_passau.fim.se2.litterbox_web.persistence.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

/** Maps the {@code quiz_answer} table. Rows are read and written by the repositories; none escapes one. */
@Entity
@Table(name = "quiz_answer")
public class QuizAnswerEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "id")
    private Long id;

    @Column(name = "analysis_id")
    private long analysisId;

    @Column(name = "question_id")
    private String questionId;

    @Column(name = "answer")
    private String answer;

    @Column(name = "correct")
    private Boolean correct;

    public void setId(final Long id) {
        this.id = id;
    }

    public void setAnalysisId(final long analysisId) {
        this.analysisId = analysisId;
    }

    public void setQuestionId(final String questionId) {
        this.questionId = questionId;
    }

    public void setAnswer(final String answer) {
        this.answer = answer;
    }

    public void setCorrect(final Boolean correct) {
        this.correct = correct;
    }

}
