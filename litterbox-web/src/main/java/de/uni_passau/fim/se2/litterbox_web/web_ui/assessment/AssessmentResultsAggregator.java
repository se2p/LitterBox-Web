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

import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;

import de.uni_passau.fim.se2.litterbox.analytics.questions.QuestionType;
import de.uni_passau.fim.se2.litterbox_web.shared.AnswerMatching;
import de.uni_passau.fim.se2.litterbox_web.shared.ChoiceAnswers;
import de.uni_passau.fim.se2.litterbox_web.web_ui.persistence.Assessment;
import de.uni_passau.fim.se2.litterbox_web.web_ui.persistence.AssessmentAnswerCount;
import de.uni_passau.fim.se2.litterbox_web.web_ui.persistence.AssessmentQuestionMark;

final class AssessmentResultsAggregator {

    private AssessmentResultsAggregator() {
    }

    static List<String> talliedQuestionIds(final List<StoredAssessmentQuestion> questions) {
        return questions.stream()
            .filter(AssessmentResultsAggregator::tallied)
            .map(StoredAssessmentQuestion::questionId)
            .toList();
    }

    static AssessmentDtos.ResultsView aggregate(
        final Assessment assessment,
        final String status,
        final List<StoredAssessmentQuestion> questions,
        final List<AssessmentQuestionMark> marks,
        final List<AssessmentAnswerCount> answers
    ) {
        final Map<String, List<AssessmentQuestionMark>> marksByQuestion = marks.stream()
            .collect(Collectors.groupingBy(AssessmentQuestionMark::questionId));
        final Map<String, List<AssessmentAnswerCount>> answersByQuestion = answers.stream()
            .collect(Collectors.groupingBy(AssessmentAnswerCount::questionId));
        return new AssessmentDtos.ResultsView(
            AssessmentDtos.SCHEMA_VERSION,
            assessment.title(),
            status,
            assessment.expiresAt().toString(),
            assessment.attempts(),
            questions.stream()
                .map(
                    question -> aggregate(
                        question, marksByQuestion.getOrDefault(question.questionId(), List.of()),
                        answersByQuestion.getOrDefault(question.questionId(), List.of())
                    )
                )
                .toList(),
            scores(questions, marks)
        );
    }

    private static AssessmentDtos.QuestionResult aggregate(
        final StoredAssessmentQuestion question,
        final List<AssessmentQuestionMark> marks,
        final List<AssessmentAnswerCount> answers
    ) {
        int correct = 0;
        int incorrect = 0;
        int notMarkable = 0;
        for (final AssessmentQuestionMark mark : marks) {
            if (mark.correct() == null) {
                notMarkable++;
            }
            else if (mark.correct()) {
                correct++;
            }
            else {
                incorrect++;
            }
        }
        final TalliedAnswers tallied = tallies(question, answers);
        return new AssessmentDtos.QuestionResult(
            question.questionId(), question.questionText(), marks.size(), correct, incorrect, notMarkable,
            tallied.tallies(), tallied.otherAnswers()
        );
    }

    private static boolean tallied(final StoredAssessmentQuestion question) {
        if (question.questionType() == QuestionType.YES_NO) {
            return true;
        }
        return question.questionType() == QuestionType.MULTIPLE_CHOICE && !question.options().isEmpty();
    }

    private static TalliedAnswers tallies(
        final StoredAssessmentQuestion question, final List<AssessmentAnswerCount> answers
    ) {
        if (!tallied(question)) {
            return TalliedAnswers.NONE;
        }
        if (question.questionType() == QuestionType.YES_NO) {
            return yesNoTallies(answers);
        }
        return choiceTallies(question.options(), answers);
    }

    private static TalliedAnswers choiceTallies(
        final List<String> options, final List<AssessmentAnswerCount> answers
    ) {
        final List<String> offered = options.stream().map(ChoiceAnswers::normalise).toList();
        final int[] counts = new int[offered.size()];
        int others = 0;
        for (final AssessmentAnswerCount answer : answers) {
            final Set<String> selected = ChoiceAnswers.selected(answer.answer());
            if (selected.isEmpty() || selected.stream().anyMatch(choice -> !offered.contains(choice))) {
                others += answer.submissions();
                continue;
            }
            for (final String choice : selected) {
                final int index = offered.indexOf(choice);
                counts[index] += answer.submissions();
            }
        }
        return new TalliedAnswers(labelled(options, counts), others);
    }

    private static List<AssessmentDtos.AnswerTally> labelled(final List<String> options, final int[] counts) {
        final List<AssessmentDtos.AnswerTally> tallies = new ArrayList<>(options.size());
        for (int index = 0; index < options.size(); index++) {
            tallies.add(new AssessmentDtos.AnswerTally(options.get(index), counts[index]));
        }
        return List.copyOf(tallies);
    }

    private static TalliedAnswers yesNoTallies(final List<AssessmentAnswerCount> answers) {
        int yes = 0;
        int no = 0;
        int others = 0;
        for (final AssessmentAnswerCount answer : answers) {
            final String value = AnswerMatching.yesNoValue(answer.answer());
            if (AnswerMatching.YES.equals(value)) {
                yes += answer.submissions();
            }
            else if (AnswerMatching.NO.equals(value)) {
                no += answer.submissions();
            }
            else {
                others += answer.submissions();
            }
        }
        return new TalliedAnswers(
            List.of(
                new AssessmentDtos.AnswerTally(AnswerMatching.YES, yes),
                new AssessmentDtos.AnswerTally(AnswerMatching.NO, no)
            ),
            others
        );
    }

    private static AssessmentDtos.ScoreDistribution scores(
        final List<StoredAssessmentQuestion> questions, final List<AssessmentQuestionMark> marks
    ) {
        final Set<String> markable = questions.stream()
            .filter(StoredAssessmentQuestion::markable)
            .map(StoredAssessmentQuestion::questionId)
            .collect(Collectors.toSet());
        final Map<Long, List<AssessmentQuestionMark>> byAttempt = marks.stream()
            .filter(mark -> markable.contains(mark.questionId()))
            .collect(Collectors.groupingBy(AssessmentQuestionMark::attemptId));
        final int[] counts = new int[markable.size() + 1];
        int completed = 0;
        int partial = 0;
        for (final List<AssessmentQuestionMark> attempt : byAttempt.values()) {
            if (attempt.size() < markable.size()) {
                partial++;
            }
            else {
                completed++;
                counts[scoreOf(attempt)]++;
            }
        }
        return new AssessmentDtos.ScoreDistribution(
            markable.size(), completed, partial, Arrays.stream(counts).boxed().toList()
        );
    }

    private static int scoreOf(final List<AssessmentQuestionMark> attempt) {
        return (int) attempt.stream().filter(mark -> Boolean.TRUE.equals(mark.correct())).count();
    }

    private record TalliedAnswers(List<AssessmentDtos.AnswerTally> tallies, int otherAnswers) {

        static final TalliedAnswers NONE = new TalliedAnswers(List.of(), 0);
    }
}
