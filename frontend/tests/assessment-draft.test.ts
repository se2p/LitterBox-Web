// SPDX-License-Identifier: EUPL-1.2
// SPDX-FileCopyrightText: 2026 LitterBox-Web contributors

import { describe, expect, it } from 'vitest';
import { DEFAULT_ASSESSMENT_LIMITS } from '../src/api/capabilities';
import {
    draftLimitBreaches,
    exportQuestion,
    importedDraft,
    publishQuestion,
    structurallyInvalid,
    withinLimits,
} from '../src/components/questions/assessment-draft';
import type { AssessmentQuestionDraft } from '../src/components/questions/AssessmentQuestionCard';

const draft = (overrides: Partial<AssessmentQuestionDraft> = {}): AssessmentQuestionDraft => ({
    draftId: 'draft-1',
    questionId: 'question-1',
    source: 'teacher',
    selected: true,
    question: 'Which answer?',
    options: ['First', 'Second'],
    questionType: 'MULTIPLE_CHOICE',
    typeDeclared: true,
    expectedAnswers: 1,
    answerGuide: '',
    correctAnswers: [],
    ...overrides,
});

describe('multiple-choice draft validation', () => {
    it.each([
        ['no options', { options: [] }],
        ['duplicate normalized options', { options: [' First ', 'first'] }],
        ['the answer separator in an option', { options: ['First|Second'] }],
        ['too many expected answers', { expectedAnswers: 3 }],
    ])('rejects %s', (_name, changes) => {
        expect(structurallyInvalid(draft(changes))).toBe(true);
    });

    it('ignores blank lines when checking the available choices', () => {
        expect(structurallyInvalid(draft({ options: [' First ', '  ', 'Second'] }))).toBe(false);
    });

    it('accepts other question types without applying choice rules', () => {
        expect(
            structurallyInvalid(
                draft({ questionType: 'FREE_TEXT', options: [], expectedAnswers: 1 }),
            ),
        ).toBe(false);
    });
});

describe('draft limit breaches', () => {
    const limits = {
        ...DEFAULT_ASSESSMENT_LIMITS,
        maxQuestionTextLength: 20,
        maxAnswerGuideLength: 10,
    };
    const noOriginals = new Map<string, AssessmentQuestionDraft>();

    it('flags question text and answer guide over the limit, which only an import can get past', () => {
        const breaches = draftLimitBreaches(
            draft({ question: 'x'.repeat(21), answerGuide: 'y'.repeat(11) }),
            limits,
            noOriginals,
        );
        expect(breaches.questionTooLong).toBe(true);
        expect(breaches.answerGuideTooLong).toBe(true);
        expect(withinLimits(draft({ question: 'x'.repeat(21) }), limits, noOriginals)).toBe(false);
    });

    it('lets an unedited generated question keep text over the limit, since it is sent by id', () => {
        const generated = draft({ source: 'generated', question: 'x'.repeat(21) });
        const originals = new Map([[generated.draftId, generated]]);
        expect(draftLimitBreaches(generated, limits, originals).questionTooLong).toBe(false);

        const edited = { ...generated, question: 'y'.repeat(21) };
        expect(draftLimitBreaches(edited, limits, originals).questionTooLong).toBe(true);
    });

    it('counts trimmed length, as the service does', () => {
        expect(
            draftLimitBreaches(draft({ question: `${'x'.repeat(20)}   ` }), limits, noOriginals)
                .questionTooLong,
        ).toBe(false);
    });
});

it('keeps answer guidance in the teacher export but not the publish request', () => {
    const question = draft({ answerGuide: 'Award one mark for each event.' });
    expect(exportQuestion(question).answerGuide).toBe('Award one mark for each event.');
    expect(publishQuestion(question, new Map())).not.toHaveProperty('answerGuide');
});

it('exports the marked count as the expected count, as the editor shows it', () => {
    const marked = draft({
        questionType: 'MULTIPLE_CHOICE',
        options: ['A', 'B', 'C'],
        correctAnswers: ['A', 'C'],
        expectedAnswers: 1,
    });

    expect(exportQuestion(marked).expectedAnswers).toBe(2);
    expect(
        exportQuestion({ ...marked, correctAnswers: [], expectedAnswers: 3 }).expectedAnswers,
    ).toBe(3);
});

it.each(['question-1', 'question-from-previous-upload'])(
    'preserves imported answers when publishing with source question %s',
    (sourceQuestionId) => {
        const original = draft({ source: 'generated', selected: false });
        const saved = exportQuestion(
            draft({ source: 'generated', correctAnswers: ['First'], answerGuide: 'Use the flag.' }),
        );
        const imported = importedDraft(
            { ...saved, sourceQuestionId },
            0,
            new Map([[original.questionId, original]]),
        );
        expect(publishQuestion(imported, new Map([[original.draftId, original]]))).toMatchObject({
            source: 'CUSTOM',
            correctAnswers: ['First'],
            expectedAnswers: 1,
        });
        expect(exportQuestion(imported).answerGuide).toBe('Use the flag.');
    },
);
