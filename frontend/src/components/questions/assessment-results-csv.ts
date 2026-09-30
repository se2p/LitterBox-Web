// SPDX-License-Identifier: EUPL-1.2
// SPDX-FileCopyrightText: 2026 LitterBox-Web contributors

import type { AssessmentResults, AssessmentResultsQuestion } from '../../api/assessments';
import { csvDocument, field, numeric } from '../../lib/csv';
import { richHintPlainText } from '../single-project/rich-hint';

export interface AssessmentResultsCsvLabels {
    question: string;
    answered: string;
    correct: string;
    incorrect: string;
    notMarkable: string;
    otherAnswers: string;
    tallyAnswer: (position: number) => string;
    tallyCount: (position: number) => string;
    answerText: (answer: string) => string;
}

export const assessmentResultsCsv = (
    results: AssessmentResults,
    locale: string,
    labels: AssessmentResultsCsvLabels,
): string => {
    const words = (value: string) => richHintPlainText(value, locale);
    const widest = results.questions.reduce(
        (most: number, question: AssessmentResultsQuestion) =>
            Math.max(most, question.answerTallies.length),
        0,
    );
    const header = [
        labels.question,
        labels.answered,
        labels.correct,
        labels.incorrect,
        labels.notMarkable,
        labels.otherAnswers,
    ];
    for (let position = 1; position <= widest; position += 1)
        header.push(labels.tallyAnswer(position), labels.tallyCount(position));

    const lines = [header.map(field)];
    results.questions.forEach((question) => {
        const cells = [
            field(words(question.questionText)),
            numeric(question.answered),
            numeric(question.correct),
            numeric(question.incorrect),
            numeric(question.notMarkable),
            numeric(question.otherAnswers),
        ];
        for (let index = 0; index < widest; index += 1) {
            const tally = question.answerTallies[index];
            cells.push(
                tally ? field(words(labels.answerText(tally.answer))) : '',
                tally ? numeric(tally.count) : '',
            );
        }
        lines.push(cells);
    });
    return csvDocument(lines);
};
