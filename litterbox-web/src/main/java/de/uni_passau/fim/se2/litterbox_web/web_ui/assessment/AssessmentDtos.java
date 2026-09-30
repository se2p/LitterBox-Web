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

import java.util.List;
import java.util.Objects;

import org.jspecify.annotations.Nullable;

import de.uni_passau.fim.se2.litterbox_web.web_ui.persistence.Assessment;

public final class AssessmentDtos {

    public static final int SCHEMA_VERSION = 1;

    public static final String SOURCE_GENERATED = "GENERATED";

    public static final String SOURCE_CUSTOM = "CUSTOM";

    private AssessmentDtos() {
    }

    public record CreateAssessmentRequest(
        Long analysisId,
        String title,
        String instructions,
        String locale,
        List<QuestionInput> questions
    ) {

        public CreateAssessmentRequest {
            questions = List.copyOf(Objects.requireNonNullElse(questions, List.of()));
        }
    }

    public record QuestionInput(
        String source,
        @Nullable String questionId,
        @Nullable String questionText,
        @Nullable String questionType,
        @Nullable List<String> options,
        @Nullable Integer expectedAnswers,
        @Nullable List<String> correctAnswers
    ) {

        public QuestionInput {
            if (options != null) {
                options = List.copyOf(options);
            }
            if (correctAnswers != null) {
                correctAnswers = List.copyOf(correctAnswers);
            }
        }
    }

    public record CreatedAssessment(int schemaVersion, String publicToken, String teacherToken) {
    }

    public static final String STATUS_OPEN = Assessment.OPEN;

    public static final String STATUS_CLOSED = Assessment.CLOSED;

    public record UpdateAssessmentRequest(
        @Nullable String status, @Nullable Integer extendByDays, @Nullable Boolean resetAttempts
    ) {
    }

    public record AssessmentState(
        int schemaVersion, String publicToken, String status, String expiresAt, int totalAttempts
    ) {
    }

    public record LearnerView(
        int schemaVersion,
        String title,
        @Nullable String instructions,
        String locale,
        List<LearnerQuestion> questions
    ) {

        public LearnerView {
            questions = List.copyOf(questions);
        }
    }

    public record LearnerQuestion(
        String questionId,
        String questionText,
        List<String> options,
        @Nullable String questionType,
        @Nullable String sprite,
        @Nullable String scratchBlocks,
        @Nullable String hint,
        @Nullable String programDimension,
        @Nullable String scopeOfFocus,
        @Nullable Integer expectedAnswers
    ) {

        public LearnerQuestion {
            options = List.copyOf(Objects.requireNonNullElse(options, List.of()));
        }
    }

    public record AttemptStarted(String attemptId) {
    }

    public record AnswerRequest(String questionId, String answer) {
    }

    public record AnswerResult(String questionId, @Nullable Boolean correct, List<String> correctAnswers) {

        public AnswerResult {
            correctAnswers = List.copyOf(Objects.requireNonNullElse(correctAnswers, List.of()));
        }
    }

    public record ResultsView(
        int schemaVersion,
        String title,
        String status,
        String expiresAt,
        int totalAttempts,
        List<QuestionResult> questions,
        ScoreDistribution scores
    ) {

        public ResultsView {
            questions = List.copyOf(questions);
        }
    }

    public record QuestionResult(
        String questionId,
        String questionText,
        int answered,
        int correct,
        int incorrect,
        int notMarkable,
        List<AnswerTally> answerTallies,
        int otherAnswers
    ) {

        public QuestionResult {
            answerTallies = List.copyOf(Objects.requireNonNullElse(answerTallies, List.of()));
        }
    }

    public record AnswerTally(String answer, int count) {
    }

    public record ScoreDistribution(
        int markableQuestions, int completedAttempts, int partialAttempts, List<Integer> counts
    ) {

        public ScoreDistribution {
            counts = List.copyOf(Objects.requireNonNullElse(counts, List.of()));
        }
    }
}
