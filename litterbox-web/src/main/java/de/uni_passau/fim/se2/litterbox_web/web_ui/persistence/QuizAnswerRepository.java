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

import java.util.Objects;

import org.springframework.stereotype.Repository;

import de.uni_passau.fim.se2.litterbox_web.web_ui.persistence.entity.QuizAnswerEntity;
import de.uni_passau.fim.se2.litterbox_web.web_ui.persistence.jpa.QuizAnswers;
import reactor.core.publisher.Mono;

@Repository
public class QuizAnswerRepository {

    private final QuizAnswers answers;
    private final DatabaseWork databaseWork;

    public QuizAnswerRepository(final QuizAnswers answers, final DatabaseWork databaseWork) {
        this.answers = Objects.requireNonNull(answers, "answers");
        this.databaseWork = Objects.requireNonNull(databaseWork, "databaseWork");
    }

    public Mono<Void> record(
        final long analysisId, final String questionId, final String answer,
        final boolean correct
    ) {
        Objects.requireNonNull(questionId, "questionId");
        Objects.requireNonNull(answer, "answer");
        return databaseWork.submit(() -> recordAnswer(analysisId, questionId, answer, correct));
    }

    /**
     * The entity is made, saved and left behind inside the one task that runs on a database thread. Nothing that
     * Hibernate is still managing is handed back, so there is no session for a caller to have outlived.
     */
    private Void recordAnswer(
        final long analysisId,
        final String questionId,
        final String answer,
        final boolean correct
    ) {
        final QuizAnswerEntity entity = new QuizAnswerEntity();
        entity.setAnalysisId(analysisId);
        entity.setQuestionId(questionId);
        entity.setAnswer(answer);
        entity.setCorrect(correct);
        answers.save(entity);
        return null;
    }
}
