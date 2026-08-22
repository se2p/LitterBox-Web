// SPDX-License-Identifier: EUPL-1.2
// SPDX-FileCopyrightText: 2026 LitterBox-Web contributors

import { describe, expect, it } from 'vitest';
import {
    balancedQuizSample,
    blockModelCell,
    isMultipleSelection,
    learnerQuizQuestions,
    normalizeQuizQuestion,
    type QuizQuestion,
} from '../src/components/questions/quiz-question';

const question = (overrides: Partial<QuizQuestion> & { questionId: string }): QuizQuestion => ({
    question: 'Why?',
    options: [],
    questionType: 'FREE_TEXT',
    typeDeclared: true,
    expectedAnswers: 1,
    ...overrides,
});

describe('quiz questions', () => {
    it('keeps the context the analysis sends and degrades what it does not', () => {
        expect(
            normalizeQuizQuestion({
                questionId: '7',
                question: 'What is the purpose of this script?',
                options: ['A'],
                questionType: 'MULTIPLE_CHOICE',
                sprite: 'Papagei',
                scratchBlocks: 'move (10) steps',
                programDimension: 'PURPOSE',
                scopeOfFocus: 'MACRO',
                expectedAnswers: 3,
            }),
        ).toEqual({
            questionId: '7',
            question: 'What is the purpose of this script?',
            options: ['A'],
            questionType: 'MULTIPLE_CHOICE',
            typeDeclared: true,
            sprite: 'Papagei',
            scratchBlocks: 'move (10) steps',
            hint: undefined,
            programDimension: 'PURPOSE',
            scopeOfFocus: 'MACRO',
            expectedAnswers: 3,
        });

        // A report written before the question carried its type is still answerable, just as free text — but the
        // type was inferred here rather than stated by the analysis, and the two are not the same claim.
        const legacy = normalizeQuizQuestion({ questionId: '1', question: 'Why?', options: [] });
        expect(legacy?.questionType).toBe('FREE_TEXT');
        expect(legacy?.typeDeclared).toBe(false);
        expect(legacy?.expectedAnswers).toBe(1);
        expect(blockModelCell(legacy!)).toBeUndefined();

        expect(normalizeQuizQuestion({ question: 'No identity' })).toBeUndefined();
        expect(normalizeQuizQuestion(undefined)).toBeUndefined();
        expect(
            normalizeQuizQuestion({
                questionId: '2',
                question: 'x',
                options: ['a', 3],
                questionType: 'NONSENSE',
                programDimension: 'NONSENSE',
                expectedAnswers: -4,
            }),
        ).toMatchObject({
            options: ['a'],
            questionType: 'FREE_TEXT',
            typeDeclared: false,
            programDimension: undefined,
            expectedAnswers: 1,
        });
    });

    it('leaves free text out of the learner set and keeps everything else', () => {
        const questions = [
            question({ questionId: 'choice', questionType: 'MULTIPLE_CHOICE' }),
            question({ questionId: 'declared-text', questionType: 'FREE_TEXT' }),
            question({ questionId: 'number', questionType: 'NUMBER' }),
            question({ questionId: 'yes-no', questionType: 'YES_NO' }),
        ];

        expect(learnerQuizQuestions(questions, 10).map((one) => one.questionId)).toEqual([
            'choice',
            'number',
            'yes-no',
        ]);
    });

    it('keeps a question whose type never travelled', () => {
        // It looks like free text here only because nothing said otherwise. Dropping it would empty the page for
        // a report written before the type field existed.
        const questions = [
            question({ questionId: 'undeclared', questionType: 'FREE_TEXT', typeDeclared: false }),
            question({ questionId: 'declared', questionType: 'FREE_TEXT' }),
        ];

        expect(learnerQuizQuestions(questions, 10).map((one) => one.questionId)).toEqual([
            'undeclared',
        ]);
    });

    it('balances the learner set over what is left after filtering', () => {
        const questions = [
            question({
                questionId: 'text-atom-free',
                questionType: 'FREE_TEXT',
                programDimension: 'TEXT',
                scopeOfFocus: 'ATOM',
            }),
            question({
                questionId: 'execution-block',
                questionType: 'NUMBER',
                programDimension: 'EXECUTION',
                scopeOfFocus: 'BLOCK',
            }),
            question({
                questionId: 'text-atom-number',
                questionType: 'NUMBER',
                programDimension: 'TEXT',
                scopeOfFocus: 'ATOM',
            }),
        ];

        // One per cell first, and the cell the excluded question occupied is filled by the survivor in it rather
        // than left empty.
        expect(learnerQuizQuestions(questions, 2).map((one) => one.questionId)).toEqual([
            'text-atom-number',
            'execution-block',
        ]);
    });

    it('samples across the block model before falling back to order', () => {
        const questions = [
            question({ questionId: '1', programDimension: 'TEXT', scopeOfFocus: 'ATOM' }),
            question({ questionId: '2', programDimension: 'TEXT', scopeOfFocus: 'ATOM' }),
            question({ questionId: '3', programDimension: 'TEXT', scopeOfFocus: 'ATOM' }),
            question({ questionId: '4', programDimension: 'PURPOSE', scopeOfFocus: 'MACRO' }),
            question({ questionId: '5', programDimension: 'EXECUTION', scopeOfFocus: 'BLOCK' }),
        ];

        // One per cell first — 1, 5, 4 — then the rest in order.
        expect(balancedQuizSample(questions, 4).map((item) => item.questionId)).toEqual([
            '1',
            '5',
            '4',
            '2',
        ]);
        expect(balancedQuizSample(questions, 99)).toHaveLength(5);
        expect(balancedQuizSample(questions, 0)).toEqual([]);
        // Stable, so a reload asks the same things.
        expect(balancedQuizSample(questions, 3)).toEqual(balancedQuizSample(questions, 3));
    });

    it('asks for several answers only when the question expects several', () => {
        expect(
            isMultipleSelection(
                question({ questionId: '1', questionType: 'MULTIPLE_CHOICE', expectedAnswers: 4 }),
            ),
        ).toBe(true);
        expect(
            isMultipleSelection(
                question({ questionId: '1', questionType: 'MULTIPLE_CHOICE', expectedAnswers: 1 }),
            ),
        ).toBe(false);
        // The backend refuses a multiple selection for anything else, so the control must not offer one.
        expect(
            isMultipleSelection(
                question({ questionId: '1', questionType: 'YES_NO', expectedAnswers: 2 }),
            ),
        ).toBe(false);
    });
});
