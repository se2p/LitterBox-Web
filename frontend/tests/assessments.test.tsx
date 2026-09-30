// SPDX-License-Identifier: EUPL-1.2
// SPDX-FileCopyrightText: 2026 LitterBox-Web contributors

import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useNavigate } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
    fetchAssessment,
    fetchAssessmentCode,
    fetchAssessmentResults,
    publishAssessment,
    startAssessmentAttempt,
    submitAssessmentAnswer,
} from '../src/api/assessments';
import { DEFAULT_ASSESSMENT_LIMITS } from '../src/api/capabilities';
import { App } from '../src/App';
import i18n from '../src/i18n';
import { capabilitiesResponse, mockFetchRoutes, response } from './helpers';
import { renderAt } from './render';

/** The whole application with a control that moves to another address in-app, so no component is remounted by a reload. */
function GoTo({ path }: { path: string }) {
    const navigate = useNavigate();
    return (
        <button type="button" onClick={() => void navigate(path)}>
            go to {path}
        </button>
    );
}

const renderAtWithLink = (path: string, next: string) =>
    render(
        <MemoryRouter initialEntries={[path]}>
            <GoTo path={next} />
            <App />
        </MemoryRouter>,
    );

vi.mock('../src/components/single-project/ScratchblocksPreview', () => ({
    ScratchblocksPreview: ({ source }: { source: string | null | undefined }) => (
        <pre>{source}</pre>
    ),
}));

const WHOLE_SCRIPT_OPTION =
    '[scratchblocks]\nwhen green flag clicked\nhide\nswitch costume to (Drop v)\nset size to (50) %\nset [Points v] to (0)\ngo to x: (0) y: (170)\nrepeat until <(Points) > (10)>\nshow\nchange y by (-7)\nif <touching (Bucket v) ?> then\nchange [Points v] by (1)\ngo to x: (0) y: (170)\nend\nif <touching (Floor v) ?> then\nchange [Points v] by (-1)\nsay [Missed] for (1) seconds\nhide\npoint in direction (90)\ngo to x: (0) y: (170)\nwait (1) seconds\nshow\nend\nend\n[/scratchblocks]';

const questionResult = (quiz: unknown[]) =>
    response({
        schemaVersion: 1,
        submissionId: 44,
        token: 'question-token',
        status: 'completed',
        locale: 'en',
        sourceType: 'QUESTION_SCRATCH_URL',
        analysis: {
            id: 88,
            status: 'completed',
            name: 'synthetic-question-project.sb3',
            inputFormat: '.sb3',
            quiz,
            issues: [],
        },
        analyses: [],
        counts: { expected: 1, completed: 1, failed: 0 },
    });

describe('assessment API validation', () => {
    afterEach(() => vi.restoreAllMocks());

    it('refuses a publish response missing the teacher token', async () => {
        vi.spyOn(globalThis, 'fetch').mockResolvedValue(
            response({ schemaVersion: 1, publicToken: 'pub-1' }, 201),
        );
        await expect(
            publishAssessment(
                'submission-token',
                {
                    analysisId: 1,
                    title: 'Quiz',
                    locale: 'en',
                    questions: [{ source: 'GENERATED', questionId: 'q1' }],
                },
                DEFAULT_ASSESSMENT_LIMITS,
            ),
        ).rejects.toMatchObject({ category: 'malformed_response' });
    });

    it('refuses a title longer than the service accepts', async () => {
        await expect(
            publishAssessment(
                'submission-token',
                {
                    analysisId: 1,
                    title: 'Q'.repeat(201),
                    locale: 'en',
                    questions: [{ source: 'GENERATED', questionId: 'q1' }],
                },
                DEFAULT_ASSESSMENT_LIMITS,
            ),
        ).rejects.toMatchObject({ category: 'validation' });
    });

    it('refuses more questions than the service accepts in one quiz', async () => {
        await expect(
            publishAssessment(
                'submission-token',
                {
                    analysisId: 1,
                    title: 'Quiz',
                    locale: 'en',
                    questions: Array.from({ length: 101 }, (_, index) => ({
                        source: 'GENERATED' as const,
                        questionId: `q${index}`,
                    })),
                },
                DEFAULT_ASSESSMENT_LIMITS,
            ),
        ).rejects.toMatchObject({ category: 'validation' });
    });

    it('accepts, and sends, a custom question whose correct answer is one of its own options', async () => {
        const fetchMock = vi
            .spyOn(globalThis, 'fetch')
            .mockResolvedValue(
                response({ schemaVersion: 1, publicToken: 'pub-1', teacherToken: 'teach-1' }, 201),
            );
        await publishAssessment(
            'submission-token',
            {
                analysisId: 1,
                title: 'Quiz',
                locale: 'en',
                questions: [
                    {
                        source: 'CUSTOM',
                        questionText: 'Which script moves the cat?',
                        questionType: 'MULTIPLE_CHOICE',
                        options: ['The first', 'The second'],
                        correctAnswers: ['The first'],
                        expectedAnswers: 1,
                    },
                ],
            },
            DEFAULT_ASSESSMENT_LIMITS,
        );
        const body = JSON.parse((fetchMock.mock.calls[0]?.[1]?.body as string) ?? '{}');
        expect(body.questions[0]).toMatchObject({ correctAnswers: ['The first'] });
    });

    const customQuestion = (question: Record<string, unknown>) =>
        publishAssessment(
            'submission-token',
            {
                analysisId: 1,
                title: 'Quiz',
                locale: 'en',
                questions: [{ source: 'CUSTOM', questionText: 'A question?', ...question }],
            },
            DEFAULT_ASSESSMENT_LIMITS,
        );

    it.each([
        ['a question text that is only whitespace', { questionText: '   ' }],
        ['a question type this client has never heard of', { questionType: 'ESSAY' }],
        [
            'more choices than the service accepts',
            {
                questionType: 'MULTIPLE_CHOICE',
                options: Array.from({ length: 13 }, (_, index) => `Choice ${index}`),
            },
        ],
        [
            'a choice longer than the service accepts',
            { questionType: 'MULTIPLE_CHOICE', options: ['x'.repeat(501)] },
        ],
        [
            'an accepted answer longer than the service accepts',
            { questionType: 'FREE_TEXT', correctAnswers: ['x'.repeat(501)] },
        ],
        ['an expected-answer count that is not a whole number', { expectedAnswers: 1.5 }],
    ])('refuses %s', async (_name, question) => {
        await expect(customQuestion(question)).rejects.toMatchObject({ category: 'validation' });
    });

    it.each([
        [
            'a correct answer that is not one of the question’s own choices',
            {
                questionType: 'MULTIPLE_CHOICE',
                options: ['The first', 'The second'],
                correctAnswers: ['Not an option'],
                expectedAnswers: 1,
            },
        ],
        [
            'an expected-answer count disagreeing with how many were named correct',
            {
                questionType: 'MULTIPLE_CHOICE',
                options: ['The first', 'The second'],
                correctAnswers: ['The first'],
                expectedAnswers: 2,
            },
        ],
        [
            'a yes/no answer that is not a yes or a no',
            { questionType: 'YES_NO', correctAnswers: ['maybe'] },
        ],
        [
            'two answers to a yes/no question',
            { questionType: 'YES_NO', correctAnswers: ['yes', 'no'] },
        ],
        [
            'a number answer that is not a number',
            { questionType: 'NUMBER', correctAnswers: ['four'] },
        ],
        [
            'choices on a question that is not answered by choosing',
            { questionType: 'YES_NO', options: ['Yes', 'No'], correctAnswers: ['yes'] },
        ],
        [
            'a free-text question expecting more answers than it has choices',
            { questionType: 'FREE_TEXT', correctAnswers: ['a loop'], expectedAnswers: 2 },
        ],
    ])(
        'leaves %s for the service to refuse, rather than deciding here',
        async (_name, question) => {
            const fetchMock = vi
                .spyOn(globalThis, 'fetch')
                .mockResolvedValue(response({ title: 'Bad Request' }, 400));

            await expect(customQuestion(question)).rejects.toMatchObject({
                category: 'malformed_request',
            });
            expect(fetchMock).toHaveBeenCalled();
        },
    );

    it.each([
        [
            'a yes/no answer in another language the service reads',
            { questionType: 'YES_NO', correctAnswers: ['ja'] },
        ],
        ['a negative decimal number', { questionType: 'NUMBER', correctAnswers: ['-2.5'] }],
        [
            'several accepted free-text answers, with the learner still asked for one',
            {
                questionType: 'FREE_TEXT',
                correctAnswers: ['it repeats', 'there is a loop', 'forever'],
                expectedAnswers: 1,
            },
        ],
        [
            'no correct answer at all, which is a question nothing marks',
            { questionType: 'FREE_TEXT' },
        ],
    ])('accepts %s', async (_name, question) => {
        const fetchMock = vi
            .spyOn(globalThis, 'fetch')
            .mockResolvedValue(
                response({ schemaVersion: 1, publicToken: 'pub-1', teacherToken: 'teach-1' }, 201),
            );
        await customQuestion(question);
        const body = JSON.parse((fetchMock.mock.calls[0]?.[1]?.body as string) ?? '{}');
        expect(body.questions[0]).toMatchObject({
            source: 'CUSTOM',
            questionType: question.questionType,
        });
    });

    it('refuses a learner view whose question array holds something other than an object', async () => {
        vi.spyOn(globalThis, 'fetch').mockResolvedValue(
            response({
                schemaVersion: 1,
                title: 'Quiz',
                instructions: '',
                locale: 'en',
                questions: ['not a question'],
            }),
        );
        await expect(fetchAssessment('pub-token', DEFAULT_ASSESSMENT_LIMITS)).rejects.toMatchObject(
            {
                category: 'malformed_response',
            },
        );
    });

    it('refuses an attempt response with no attempt id', async () => {
        vi.spyOn(globalThis, 'fetch').mockResolvedValue(response({}, 201));
        await expect(startAssessmentAttempt('pub-token')).rejects.toMatchObject({
            category: 'malformed_response',
        });
    });

    it('refuses an answer verdict whose correctness is not boolean or null', async () => {
        vi.spyOn(globalThis, 'fetch').mockResolvedValue(
            response({ questionId: 'q1', correct: 'yes', correctAnswers: [] }),
        );
        await expect(
            submitAssessmentAnswer(
                'pub-token',
                'attempt-1',
                { questionId: 'q1', answer: 'a' },
                DEFAULT_ASSESSMENT_LIMITS,
            ),
        ).rejects.toMatchObject({ category: 'malformed_response' });
    });

    it('accepts a learner-view option that quotes a whole script rather than a short phrase', async () => {
        vi.spyOn(globalThis, 'fetch').mockResolvedValue(
            response({
                schemaVersion: 1,
                title: 'Quiz',
                instructions: null,
                locale: 'en',
                questions: [
                    {
                        questionId: '35',
                        questionText: 'Which script in the whole program sets the value of Score?',
                        options: [WHOLE_SCRIPT_OPTION, 'A shorter option'],
                        questionType: 'MULTIPLE_CHOICE',
                        sprite: 'Banana',
                        scratchBlocks: '',
                        hint: null,
                        programDimension: 'TEXT',
                        scopeOfFocus: 'RELATION',
                        expectedAnswers: 1,
                    },
                ],
            }),
        );
        const view = await fetchAssessment('pub-token', DEFAULT_ASSESSMENT_LIMITS);
        expect(view.questions[0]?.options).toContain(WHOLE_SCRIPT_OPTION);
    });

    it('accepts an answer verdict whose correct answer quotes a whole script rather than a short phrase', async () => {
        vi.spyOn(globalThis, 'fetch').mockResolvedValue(
            response({
                questionId: '35',
                correct: false,
                correctAnswers: [WHOLE_SCRIPT_OPTION],
            }),
        );
        const verdict = await submitAssessmentAnswer(
            'pub-token',
            'attempt-1',
            { questionId: '35', answer: 'A shorter option' },
            DEFAULT_ASSESSMENT_LIMITS,
        );
        expect(verdict.correctAnswers).toEqual([WHOLE_SCRIPT_OPTION]);
    });

    const rawResults = (
        question: Record<string, unknown>,
        scores: Record<string, unknown> = {
            markableQuestions: 1,
            completedAttempts: 3,
            partialAttempts: 0,
            counts: [1, 2],
        },
        totalAttempts = 3,
    ) => ({
        schemaVersion: 1,
        title: 'Quiz',
        status: 'OPEN',
        expiresAt: '2099-01-01T00:00:00Z',
        totalAttempts,
        questions: [
            {
                questionId: 'q1',
                questionText: 'What does this block do?',
                answered: 3,
                correct: 3,
                incorrect: 0,
                notMarkable: 0,
                answerTallies: [],
                otherAnswers: 0,
                ...question,
            },
        ],
        scores,
    });

    const refusedResults = async (body: unknown) => {
        vi.spyOn(globalThis, 'fetch').mockResolvedValue(response(body));
        await expect(
            fetchAssessmentResults('pub-token', 'teacher-token', DEFAULT_ASSESSMENT_LIMITS),
        ).rejects.toMatchObject({ category: 'malformed_response' });
    };

    it('refuses a results response whose buckets do not add up to the answered count', async () => {
        await refusedResults(rawResults({ answered: 3, correct: 1, incorrect: 1, notMarkable: 0 }));
    });

    it.each([
        [
            'a choice chosen more often than the question was answered',
            rawResults({ answerTallies: [{ answer: 'The flag', count: 4 }] }),
        ],
        [
            'answers naming nothing on offer outnumbering the answers given',
            rawResults({ otherAnswers: 4 }),
        ],
        [
            'a score distribution with the wrong number of buckets for the questions it marks',
            rawResults(
                {},
                {
                    markableQuestions: 2,
                    completedAttempts: 3,
                    partialAttempts: 0,
                    counts: [1, 2],
                },
            ),
        ],
        [
            'buckets that do not add up to the attempts they are said to describe',
            rawResults(
                {},
                {
                    markableQuestions: 1,
                    completedAttempts: 3,
                    partialAttempts: 0,
                    counts: [1, 1],
                },
            ),
        ],
        [
            'more completed and partial attempts than there were attempts at all',
            rawResults(
                {},
                { markableQuestions: 1, completedAttempts: 3, partialAttempts: 2, counts: [1, 2] },
                4,
            ),
        ],
    ])('refuses a results response reporting %s', async (_name, body) => {
        await refusedResults(body);
    });

    it('reads the tallies, the answers naming nothing on offer, and the score distribution', async () => {
        vi.spyOn(globalThis, 'fetch').mockResolvedValue(
            response(
                rawResults({
                    answered: 3,
                    correct: 2,
                    incorrect: 1,
                    notMarkable: 0,
                    answerTallies: [
                        { answer: 'The flag', count: 3 },
                        { answer: 'A click', count: 2 },
                    ],
                    otherAnswers: 1,
                }),
            ),
        );

        const results = await fetchAssessmentResults(
            'pub-token',
            'teacher-token',
            DEFAULT_ASSESSMENT_LIMITS,
        );

        expect(results.questions[0].answerTallies).toEqual([
            { answer: 'The flag', count: 3 },
            { answer: 'A click', count: 2 },
        ]);
        expect(results.questions[0].otherAnswers).toBe(1);
        expect(results.scores).toEqual({
            markableQuestions: 1,
            completedAttempts: 3,
            partialAttempts: 0,
            counts: [1, 2],
        });
    });

    it('accepts a tally answer that quotes a whole script rather than a short phrase', async () => {
        vi.spyOn(globalThis, 'fetch').mockResolvedValue(
            response(rawResults({ answerTallies: [{ answer: WHOLE_SCRIPT_OPTION, count: 2 }] })),
        );

        const results = await fetchAssessmentResults(
            'pub-token',
            'teacher-token',
            DEFAULT_ASSESSMENT_LIMITS,
        );

        expect(results.questions[0].answerTallies[0].answer).toBe(WHOLE_SCRIPT_OPTION);
    });

    it('refuses assessment code whose response is not the export-targets shape', async () => {
        vi.spyOn(globalThis, 'fetch').mockResolvedValue(response({ sprites: 'not-an-array' }));
        await expect(fetchAssessmentCode('pub-token')).rejects.toMatchObject({
            name: 'AssessmentApiError',
            category: 'malformed_response',
        });
    });

    it('accepts assessment code in the same shape the export endpoint answers with', async () => {
        vi.spyOn(globalThis, 'fetch').mockResolvedValue(
            response({
                sprites: [{ name: 'Cat', stage: false }],
                scripts: [
                    {
                        scriptId: 'a',
                        spriteName: 'Cat',
                        ordinal: 1,
                        scratchblocks: 'when green flag clicked\nmove (10) steps\n',
                    },
                ],
            }),
        );
        const targets = await fetchAssessmentCode('pub-token');
        expect(targets.sprites).toEqual([{ name: 'Cat', stage: false }]);
        expect(targets.scripts).toHaveLength(1);
    });

    it('reports a quiz with no code to offer as not found, distinctly from any other failure', async () => {
        vi.spyOn(globalThis, 'fetch').mockResolvedValue(response({}, 404));
        await expect(fetchAssessmentCode('pub-token')).rejects.toMatchObject({
            category: 'not_found',
        });
    });

    describe('reading a reply from a service configured past the shipped ceilings', () => {
        const roomy = {
            ...DEFAULT_ASSESSMENT_LIMITS,
            maxQuestions: 250,
            maxOptions: 60,
            maxQuestionTextLength: 30_000,
        };

        const learnerQuestion = (index: number, questionText: string, options: string[]) => ({
            questionId: `q${index}`,
            questionText,
            options,
            questionType: 'MULTIPLE_CHOICE',
            sprite: null,
            scratchBlocks: null,
            hint: null,
            programDimension: null,
            scopeOfFocus: null,
            expectedAnswers: 1,
        });

        it('accepts more questions, more options and longer wording than the ceilings alone allow', async () => {
            vi.spyOn(globalThis, 'fetch').mockResolvedValue(
                response({
                    schemaVersion: 1,
                    title: 'Quiz',
                    instructions: null,
                    locale: 'en',
                    questions: Array.from({ length: 250 }, (_, index) =>
                        learnerQuestion(
                            index,
                            index === 0 ? 'W'.repeat(25_000) : 'A question?',
                            Array.from({ length: 60 }, (_, choice) => `Choice ${choice}`),
                        ),
                    ),
                }),
            );

            const view = await fetchAssessment('pub-token', roomy);
            expect(view.questions).toHaveLength(250);
            expect(view.questions[0]?.options).toHaveLength(60);
            expect(view.questions[0]?.questionText).toHaveLength(25_000);
        });

        it('refuses the same reply when the service never said it was configured that way', async () => {
            vi.spyOn(globalThis, 'fetch').mockResolvedValue(
                response({
                    schemaVersion: 1,
                    title: 'Quiz',
                    instructions: null,
                    locale: 'en',
                    questions: Array.from({ length: 250 }, (_, index) =>
                        learnerQuestion(index, 'A question?', ['One', 'Two']),
                    ),
                }),
            );

            await expect(
                fetchAssessment('pub-token', DEFAULT_ASSESSMENT_LIMITS),
            ).rejects.toMatchObject({ category: 'malformed_response' });
        });

        it('accepts a results reply carrying more questions than the ceiling alone allows', async () => {
            vi.spyOn(globalThis, 'fetch').mockResolvedValue(
                response({
                    schemaVersion: 1,
                    title: 'Quiz',
                    status: 'OPEN',
                    expiresAt: '2099-01-01T00:00:00Z',
                    totalAttempts: 1,
                    questions: Array.from({ length: 250 }, (_, index) => ({
                        questionId: `q${index}`,
                        questionText: 'A question?',
                        answered: 0,
                        correct: 0,
                        incorrect: 0,
                        notMarkable: 0,
                        answerTallies: [],
                        otherAnswers: 0,
                    })),
                    scores: {
                        markableQuestions: 250,
                        completedAttempts: 0,
                        partialAttempts: 0,
                        counts: Array.from({ length: 251 }, () => 0),
                    },
                }),
            );

            const results = await fetchAssessmentResults('pub-token', 'teacher-token', roomy);
            expect(results.questions).toHaveLength(250);
        });
    });

    it('reads a refused attempt as exhausted capacity rather than a broken reply', async () => {
        vi.spyOn(globalThis, 'fetch').mockResolvedValue(response({}, 429));
        await expect(startAssessmentAttempt('pub-token')).rejects.toMatchObject({
            category: 'exhausted',
            status: 429,
        });
    });

    describe('against a service configured away from the defaults', () => {
        const looser = { ...DEFAULT_ASSESSMENT_LIMITS, maxTitleLength: 300, maxOptions: 20 };
        const tighter = { ...DEFAULT_ASSESSMENT_LIMITS, maxTitleLength: 80, maxOptions: 4 };

        const publishWith = (
            limits: typeof DEFAULT_ASSESSMENT_LIMITS,
            title: string,
            options: string[],
        ) =>
            publishAssessment(
                'submission-token',
                {
                    analysisId: 1,
                    title,
                    locale: 'en',
                    questions: [
                        {
                            source: 'CUSTOM',
                            questionText: 'Which script moves the cat?',
                            questionType: 'MULTIPLE_CHOICE',
                            options,
                            expectedAnswers: 1,
                        },
                    ],
                },
                limits,
            );

        const choices = (count: number) =>
            Array.from({ length: count }, (_, index) => `Choice ${index + 1}`);

        it('sends a quiz the service accepts but the shipped defaults would have refused', async () => {
            const fetchMock = vi
                .spyOn(globalThis, 'fetch')
                .mockResolvedValue(
                    response(
                        { schemaVersion: 1, publicToken: 'pub-1', teacherToken: 'teach-1' },
                        201,
                    ),
                );
            await publishWith(looser, 'Q'.repeat(250), choices(16));
            expect(fetchMock).toHaveBeenCalledTimes(1);
        });

        it('refuses a quiz the shipped defaults would have allowed but this service will not', async () => {
            const fetchMock = vi.spyOn(globalThis, 'fetch');
            await expect(publishWith(tighter, 'Q'.repeat(120), choices(2))).rejects.toMatchObject({
                category: 'validation',
            });
            await expect(publishWith(tighter, 'Quiz', choices(6))).rejects.toMatchObject({
                category: 'validation',
            });
            expect(fetchMock).not.toHaveBeenCalled();
        });
    });
});

describe('hosted quiz workflow', () => {
    beforeEach(async () => {
        await i18n.changeLanguage('en');
        vi.restoreAllMocks();
        vi.stubGlobal('EventSource', undefined);
        window.localStorage.clear();
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    const resultsBody = ({
        title = 'Chapter 3 quiz',
        status = 'OPEN',
        expiresAt = '2099-01-01T00:00:00Z',
        totalAttempts,
        questions,
        scores,
    }: {
        title?: string;
        status?: 'OPEN' | 'CLOSED';
        expiresAt?: string;
        totalAttempts: number;
        questions: {
            questionId: string;
            questionText: string;
            answered: number;
            correct: number;
            incorrect: number;
            notMarkable: number;
            answerTallies?: { answer: string; count: number }[];
            otherAnswers?: number;
        }[];
        scores?: {
            markableQuestions: number;
            completedAttempts: number;
            partialAttempts: number;
            counts: number[];
        };
    }) =>
        response({
            schemaVersion: 1,
            title,
            status,
            expiresAt,
            totalAttempts,
            questions: questions.map((question) => ({
                answerTallies: [],
                otherAnswers: 0,
                ...question,
            })),
            scores: scores ?? {
                markableQuestions: 0,
                completedAttempts: 0,
                partialAttempts: 0,
                counts: [0],
            },
        });

    it('publishes an assessment and shows the learner and results links distinctly', async () => {
        const user = userEvent.setup();
        mockFetchRoutes({
            features: ['qlc', 'teacher-archive', 'assessments'],
            routes: [
                {
                    when: (url, init) =>
                        url.endsWith('/api/v1/assessments') && init?.method === 'POST',
                    respond: () =>
                        response(
                            { schemaVersion: 1, publicToken: 'pub-1', teacherToken: 'teach-1' },
                            201,
                        ),
                },
            ],
            fallback: () =>
                questionResult([
                    {
                        questionId: 'q-first',
                        question: 'What starts the script?',
                        options: ['The flag', 'A click'],
                        questionType: 'MULTIPLE_CHOICE',
                        expectedAnswers: 1,
                    },
                ]),
        });

        renderAt('/teacher/questions/question-token');
        await screen.findByText('Build a quiz from these questions');
        await user.click(screen.getByRole('button', { name: 'Select shown questions' }));
        await user.click(screen.getByRole('button', { name: 'Publish for learners to open' }));
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

        expect(await screen.findByText('Quiz published')).toBeInTheDocument();
        expect(screen.getByText(/Link for learners/)).toBeInTheDocument();
        expect(screen.getByText(/Link for you — keep this one/)).toBeInTheDocument();
        expect(screen.getByText(/only time this link is shown/)).toBeInTheDocument();

        const values = document.querySelectorAll('.assessment-published .result-link-value');
        expect(values).toHaveLength(2);
        expect(values[0]).toHaveAttribute('href', expect.stringContaining('/quiz/pub-1'));
        expect(values[0]).not.toHaveAttribute('href', expect.stringContaining('results'));
        expect(values[1]).toHaveAttribute(
            'href',
            expect.stringContaining('/quiz/pub-1/results#teacherToken=teach-1'),
        );

        const stored = JSON.parse(
            window.localStorage.getItem('litterbox.published-quizzes') ?? '[]',
        );
        expect(stored).toEqual([
            expect.objectContaining({ publicToken: 'pub-1', teacherToken: 'teach-1' }),
        ]);
    });

    it('disables publish confirmation while the request is in flight', async () => {
        const user = userEvent.setup();
        let resolvePublish!: (value: Response) => void;
        const pendingPublish = new Promise<Response>((resolve) => {
            resolvePublish = resolve;
        });
        const fetchMock = mockFetchRoutes({
            features: ['qlc', 'teacher-archive', 'assessments'],
            routes: [
                {
                    when: (url, init) =>
                        url.endsWith('/api/v1/assessments') && init?.method === 'POST',
                    respond: () => pendingPublish,
                },
            ],
            fallback: () =>
                questionResult([
                    {
                        questionId: 'q-first',
                        question: 'What starts the script?',
                        options: ['The flag', 'A click'],
                        questionType: 'MULTIPLE_CHOICE',
                        expectedAnswers: 1,
                    },
                ]),
        });

        renderAt('/teacher/questions/question-token');
        await screen.findByText('Build a quiz from these questions');
        await user.click(screen.getByRole('button', { name: 'Select shown questions' }));
        const publishButton = screen.getByRole('button', {
            name: 'Publish for learners to open',
        });
        await user.click(publishButton);

        await waitFor(() =>
            expect(
                fetchMock.mock.calls.filter(
                    (call) =>
                        String(call[0]).endsWith('/api/v1/assessments') &&
                        call[1]?.method === 'POST',
                ),
            ).toHaveLength(1),
        );
        const publishingButton = screen.getByRole('button', { name: /Publishing/ });
        expect(publishingButton).toBeDisabled();
        await user.click(publishingButton);
        expect(
            fetchMock.mock.calls.filter(
                (call) =>
                    String(call[0]).endsWith('/api/v1/assessments') && call[1]?.method === 'POST',
            ),
        ).toHaveLength(1);

        resolvePublish(
            response({ schemaVersion: 1, publicToken: 'pub-1', teacherToken: 'teach-1' }, 201),
        );
        expect(await screen.findByText('Quiz published')).toBeInTheDocument();
    });

    it('lists the quizzes published on this device newest first, each with the date it was set', async () => {
        window.localStorage.setItem(
            'litterbox.published-quizzes',
            JSON.stringify([
                {
                    publicToken: 'pub-older',
                    teacherToken: 'teach-older',
                    title: 'Chapter 2 quiz',
                    at: Date.parse('2026-03-01T10:00:00Z'),
                },
                {
                    publicToken: 'pub-newer',
                    teacherToken: 'teach-newer',
                    title: 'Chapter 3 quiz',
                    at: Date.parse('2026-04-01T10:00:00Z'),
                },
            ]),
        );
        mockFetchRoutes({
            features: ['qlc', 'teacher-archive', 'assessments'],
            fallback: () =>
                questionResult([
                    {
                        questionId: 'q-first',
                        question: 'What starts the script?',
                        options: ['The flag', 'A click'],
                        questionType: 'MULTIPLE_CHOICE',
                        expectedAnswers: 1,
                    },
                ]),
        });

        renderAt('/teacher/questions/question-token');
        expect(
            await screen.findByRole('heading', {
                name: 'Quizzes you have published on this device',
                level: 4,
            }),
        ).toBeInTheDocument();
        const rows = Array.from(document.querySelectorAll('.assessment-remembered-quizzes li')).map(
            (row) => row.textContent ?? '',
        );
        expect(rows).toHaveLength(2);
        expect(rows[0]).toContain('Chapter 3 quiz');
        expect(rows[1]).toContain('Chapter 2 quiz');
        expect(rows[0]).toMatch(/Published .*2026/);
        expect(rows[1]).toMatch(/Published .*2026/);
    });

    const twoGeneratedQuestions = () =>
        questionResult([
            {
                questionId: 'q-first',
                question: 'What starts the script?',
                options: ['The flag', 'A click'],
                questionType: 'MULTIPLE_CHOICE',
                expectedAnswers: 1,
            },
            {
                questionId: 'q-second',
                question: 'What colour is the sky in the backdrop?',
                options: ['Blue', 'Green'],
                questionType: 'MULTIPLE_CHOICE',
                expectedAnswers: 1,
            },
        ]);

    it("warns that a teacher's own multiple-choice question publishes as free text", async () => {
        const user = userEvent.setup();
        mockFetchRoutes({
            features: ['qlc', 'teacher-archive', 'assessments'],
            fallback: () => twoGeneratedQuestions(),
        });

        renderAt('/teacher/questions/question-token');
        await screen.findByText('Build a quiz from these questions');
        await user.click(screen.getByRole('button', { name: 'Add your own question' }));

        const questionText = await screen.findByRole('textbox', { name: 'Question text' });
        await user.type(questionText, 'Which script moves the cat?');
        await user.selectOptions(screen.getByRole('combobox', { name: 'Answer type' }), [
            'MULTIPLE_CHOICE',
        ]);
        await user.type(
            screen.getByRole('textbox', { name: 'Answer choices' }),
            'The first\nThe second',
        );
        await user.tab();

        expect(
            await screen.findByText('Added by teacher — not marked automatically'),
        ).toBeInTheDocument();

        await user.click(screen.getByRole('button', { name: 'Publish for learners to open' }));

        const dialog = await screen.findByRole('dialog');
        expect(
            within(dialog).getByText('Some questions will not be marked automatically'),
        ).toBeInTheDocument();
    });

    it("warns about a teacher's free-text question until it names an accepted answer", async () => {
        const user = userEvent.setup();
        mockFetchRoutes({
            features: ['qlc', 'teacher-archive', 'assessments'],
            fallback: () => twoGeneratedQuestions(),
        });

        renderAt('/teacher/questions/question-token');
        await screen.findByText('Build a quiz from these questions');
        await user.click(screen.getByRole('button', { name: 'Add your own question' }));
        const questionText = await screen.findByRole('textbox', { name: 'Question text' });
        await user.type(questionText, 'What would you change?');

        expect(screen.getByText('Added by teacher — not marked automatically')).toBeInTheDocument();

        await user.type(
            screen.getByRole('textbox', { name: 'Accepted answers' }),
            'the backdrop\nthe colours',
        );
        await user.tab();

        expect(screen.getByText('Added by teacher')).toBeInTheDocument();
        expect(screen.queryByText(/not marked automatically/)).not.toBeInTheDocument();
    });

    it('marks an edited generated question in the builder, interrupts publishing, and publishes nothing on backing out', async () => {
        const user = userEvent.setup();
        const fetchMock = mockFetchRoutes({
            features: ['qlc', 'teacher-archive', 'assessments'],
            fallback: () => twoGeneratedQuestions(),
        });

        renderAt('/teacher/questions/question-token');
        await screen.findByText('Build a quiz from these questions');
        await user.click(screen.getByRole('button', { name: 'Select shown questions' }));

        await user.click(screen.getByRole('button', { name: /Question 1 details/ }));
        await user.click(screen.getByRole('button', { name: 'Edit question 1' }));
        const questionText = screen.getByRole('textbox', { name: 'Question text' });
        await user.clear(questionText);
        await user.type(questionText, 'What makes the sprite start moving?');
        await user.click(screen.getByRole('button', { name: 'Close editor' }));

        expect(screen.getByText('Edited — no longer marked automatically')).toBeInTheDocument();

        await user.click(screen.getByRole('button', { name: 'Publish for learners to open' }));

        const dialog = await screen.findByRole('dialog');
        expect(
            within(dialog).getByText('Some questions will not be marked automatically'),
        ).toBeInTheDocument();
        expect(
            within(dialog).getByText(
                '1 question cannot be marked by this service. It is published and answered as usual, but no answer to it is judged right or wrong:',
            ),
        ).toBeInTheDocument();
        expect(within(dialog).getByText('Question 1')).toBeInTheDocument();
        expect(within(dialog).queryByText('Question 2')).not.toBeInTheDocument();

        const publishRequests = () =>
            fetchMock.mock.calls.filter(
                (call) =>
                    String(call[0]).endsWith('/api/v1/assessments') &&
                    (call[1]?.method ?? 'GET') === 'POST',
            ).length;

        const actions = within(dialog.querySelector('.dialog-actions') as HTMLElement);
        await user.click(actions.getByRole('button', { name: 'Go back' }));
        await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
        expect(publishRequests()).toBe(0);
    });

    it('sends an edited generated question as CUSTOM and an unedited one as GENERATED once the interruption is confirmed', async () => {
        const user = userEvent.setup();
        const fetchMock = mockFetchRoutes({
            features: ['qlc', 'teacher-archive', 'assessments'],
            routes: [
                {
                    when: (url, init) =>
                        url.endsWith('/api/v1/assessments') && init?.method === 'POST',
                    respond: () =>
                        response(
                            {
                                schemaVersion: 1,
                                publicToken: 'pub-edit',
                                teacherToken: 'teach-edit',
                            },
                            201,
                        ),
                },
            ],
            fallback: () => twoGeneratedQuestions(),
        });

        renderAt('/teacher/questions/question-token');
        await screen.findByText('Build a quiz from these questions');
        await user.click(screen.getByRole('button', { name: 'Select shown questions' }));

        await user.click(screen.getByRole('button', { name: /Question 1 details/ }));
        await user.click(screen.getByRole('button', { name: 'Edit question 1' }));
        const questionText = screen.getByRole('textbox', { name: 'Question text' });
        await user.clear(questionText);
        await user.type(questionText, 'What makes the sprite start moving?');
        await user.click(screen.getByRole('button', { name: 'Close editor' }));

        await user.click(screen.getByRole('button', { name: 'Publish for learners to open' }));
        const dialog = await screen.findByRole('dialog');
        await user.click(
            within(dialog).getByRole('button', { name: 'Publish for learners to open' }),
        );

        expect(await screen.findByText('Quiz published')).toBeInTheDocument();
        const sent = fetchMock.mock.calls.find(
            (call) => String(call[0]).endsWith('/api/v1/assessments') && call[1]?.method === 'POST',
        );
        const body = JSON.parse((sent?.[1]?.body as string) ?? '{}');
        expect(body.questions).toEqual([
            expect.objectContaining({
                source: 'CUSTOM',
                questionText: 'What makes the sprite start moving?',
                questionType: 'MULTIPLE_CHOICE',
                options: ['The flag', 'A click'],
                expectedAnswers: 1,
            }),
            expect.objectContaining({ source: 'GENERATED', questionId: 'q-second' }),
        ]);
        expect(body.questions[1]).not.toHaveProperty('options');
    });

    describe('a quiz measured against the limits this service reported', () => {
        const reported = {
            maxQuestions: 100,
            maxTitleLength: 200,
            maxInstructionsLength: 2000,
            maxQuestionTextLength: 1000,
            maxAnswerGuideLength: 1000,
            maxOptions: 4,
            maxOptionLength: 12,
        };

        const mockService = () =>
            mockFetchRoutes({
                features: ['qlc', 'teacher-archive', 'assessments'],
                capabilitiesOverrides: {
                    assessmentLimits: reported,
                },
                routes: [
                    {
                        when: (url) => url.endsWith('/api/v1/assessments'),
                        respond: () =>
                            response(
                                {
                                    schemaVersion: 1,
                                    publicToken: 'pub-limit',
                                    teacherToken: 'teach-limit',
                                },
                                201,
                            ),
                    },
                ],
                fallback: () => twoGeneratedQuestions(),
            });

        const addOwnQuestion = async (
            user: ReturnType<typeof userEvent.setup>,
            options: string,
        ) => {
            await user.click(screen.getByRole('button', { name: 'Add your own question' }));
            const questionText = await screen.findByRole('textbox', { name: 'Question text' });
            await user.clear(questionText);
            await user.type(questionText, 'Which script moves the cat?');
            await user.selectOptions(screen.getByRole('combobox', { name: 'Answer type' }), [
                'MULTIPLE_CHOICE',
            ]);
            const choices = screen.getByRole('textbox', { name: 'Answer choices' });
            await user.clear(choices);
            await user.type(choices, options);
            await user.tab();
            return choices;
        };

        const publishButton = () =>
            screen.getByRole('button', { name: 'Publish for learners to open' });

        it('keeps every line a teacher typed past the reported limits, and refuses to publish', async () => {
            const user = userEvent.setup();
            const fetchMock = mockService();

            renderAt('/teacher/questions/question-token');
            await screen.findByText('Build a quiz from these questions');
            const choices = await addOwnQuestion(user, 'One\nTwo\nThree\nFour\nFive\nSix');

            expect(
                await screen.findByText('Keep this to 4 lines or fewer, then publish.'),
            ).toBeInTheDocument();
            expect(choices).toHaveValue('One\nTwo\nThree\nFour\nFive\nSix');
            expect(screen.getByRole('checkbox', { name: 'Six' })).toBeInTheDocument();
            expect(publishButton()).toBeDisabled();
            expect(
                screen.getByText(
                    'One of your questions is over a limit. Fix the lines marked above to publish.',
                ),
            ).toBeInTheDocument();

            await user.clear(choices);
            await user.type(choices, 'One\nTwo\nThree');
            await user.tab();
            await waitFor(() =>
                expect(
                    screen.queryByText('Keep this to 4 lines or fewer, then publish.'),
                ).not.toBeInTheDocument(),
            );
            expect(publishButton()).toBeEnabled();

            await user.click(publishButton());
            const dialog = await screen.findByRole('dialog');
            await user.click(
                within(dialog).getByRole('button', { name: 'Publish for learners to open' }),
            );
            expect(await screen.findByText('Quiz published')).toBeInTheDocument();
            const sent = fetchMock.mock.calls.find(
                (call) =>
                    String(call[0]).endsWith('/api/v1/assessments') && call[1]?.method === 'POST',
            );
            const body = JSON.parse((sent?.[1]?.body as string) ?? '{}');
            expect(body.questions).toContainEqual(
                expect.objectContaining({ options: ['One', 'Two', 'Three'] }),
            );
        }, 20_000);

        it('keeps a line longer than the reported limit, and refuses to publish', async () => {
            const user = userEvent.setup();
            mockService();

            renderAt('/teacher/questions/question-token');
            await screen.findByText('Build a quiz from these questions');
            const choices = await addOwnQuestion(user, 'Short\nA choice well past twelve');

            expect(
                await screen.findByText(
                    'Each line has to be 12 characters or fewer, then publish.',
                ),
            ).toBeInTheDocument();
            expect(choices).toHaveValue('Short\nA choice well past twelve');
            expect(publishButton()).toBeDisabled();

            await user.clear(choices);
            await user.type(choices, 'Short\nAlso short');
            await user.tab();
            await waitFor(() => expect(publishButton()).toBeEnabled());
        });

        it('rejects an import over the reported limits and keeps the current draft', async () => {
            const user = userEvent.setup();
            mockService();

            renderAt('/teacher/questions/question-token');
            await screen.findByText('Build a quiz from these questions');
            await user.click(screen.getByRole('button', { name: 'Select shown questions' }));
            const importFile = async (overrides: Record<string, unknown>) => {
                const payload = JSON.stringify({
                    kind: 'litterbox-assessment',
                    schemaVersion: 1,
                    title: 'Quiz',
                    instructions: '',
                    questions: [
                        {
                            id: 'teacher-long',
                            source: 'teacher',
                            question: 'Why?',
                            questionType: 'FREE_TEXT',
                            options: [],
                            expectedAnswers: 1,
                        },
                    ],
                    ...overrides,
                });
                await user.upload(
                    screen.getByLabelText('Import from JSON'),
                    new File([payload], 'assessment.json', { type: 'application/json' }),
                );
            };
            const message =
                'This quiz has more or longer questions or answers than this site allows, so nothing was loaded.';

            await importFile({ title: 'T'.repeat(201) });
            expect(await screen.findByText(message)).toBeInTheDocument();
            expect(screen.queryByText(/Loaded 1 question/)).not.toBeInTheDocument();
            expect(publishButton()).toBeEnabled();
        });

        it('disables publishing while more questions are selected than the service allows', async () => {
            const user = userEvent.setup();
            mockFetchRoutes({
                features: ['qlc', 'teacher-archive', 'assessments'],
                capabilitiesOverrides: { assessmentLimits: { ...reported, maxQuestions: 1 } },
                fallback: () => twoGeneratedQuestions(),
            });

            renderAt('/teacher/questions/question-token');
            await screen.findByText('Build a quiz from these questions');
            await user.click(screen.getByRole('button', { name: 'Select shown questions' }));

            expect(publishButton()).toBeDisabled();
            expect(
                screen.getByText(
                    'You can publish only 1 question. Deselect the others to continue.',
                ),
            ).toBeInTheDocument();
        });
    });

    describe("marking a teacher's own multiple-choice question", () => {
        const addOwnMultipleChoiceQuestion = async (user: ReturnType<typeof userEvent.setup>) => {
            await user.click(screen.getByRole('button', { name: 'Add your own question' }));
            const questionText = await screen.findByRole('textbox', { name: 'Question text' });
            await user.clear(questionText);
            await user.type(questionText, 'Which script moves the cat?');
            await user.selectOptions(screen.getByRole('combobox', { name: 'Answer type' }), [
                'MULTIPLE_CHOICE',
            ]);
            await user.type(
                screen.getByRole('textbox', { name: 'Answer choices' }),
                'The first\nThe second',
            );
            await user.tab();
            await screen.findByRole('checkbox', { name: 'The first' });
        };

        it('ticking a choice marks the question, and the choice reaches the published payload', async () => {
            const user = userEvent.setup();
            const fetchMock = mockFetchRoutes({
                features: ['qlc', 'teacher-archive', 'assessments'],
                routes: [
                    {
                        when: (url) => url.endsWith('/api/v1/assessments'),
                        respond: () =>
                            response(
                                {
                                    schemaVersion: 1,
                                    publicToken: 'pub-mark',
                                    teacherToken: 'teach-mark',
                                },
                                201,
                            ),
                    },
                ],
                fallback: () => twoGeneratedQuestions(),
            });

            renderAt('/teacher/questions/question-token');
            await screen.findByText('Build a quiz from these questions');
            await addOwnMultipleChoiceQuestion(user);

            await user.click(screen.getByRole('checkbox', { name: 'The first' }));
            expect(screen.getByText('Added by teacher')).toBeInTheDocument();
            expect(screen.queryByText(/not marked automatically/)).not.toBeInTheDocument();

            await user.click(screen.getByRole('button', { name: 'Publish for learners to open' }));
            expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
            expect(await screen.findByText('Quiz published')).toBeInTheDocument();

            const sent = fetchMock.mock.calls.find(
                (call) =>
                    String(call[0]).endsWith('/api/v1/assessments') && call[1]?.method === 'POST',
            );
            const body = JSON.parse((sent?.[1]?.body as string) ?? '{}');
            expect(body.questions).toContainEqual(
                expect.objectContaining({
                    source: 'CUSTOM',
                    questionText: 'Which script moves the cat?',
                    options: ['The first', 'The second'],
                    correctAnswers: ['The first'],
                    expectedAnswers: 1,
                }),
            );
        });

        it('un-ticking a choice removes it from the payload and restores the unmarked warning', async () => {
            const user = userEvent.setup();
            const fetchMock = mockFetchRoutes({
                features: ['qlc', 'teacher-archive', 'assessments'],
                routes: [
                    {
                        when: (url) => url.endsWith('/api/v1/assessments'),
                        respond: () =>
                            response(
                                {
                                    schemaVersion: 1,
                                    publicToken: 'pub-un',
                                    teacherToken: 'teach-un',
                                },
                                201,
                            ),
                    },
                ],
                fallback: () => twoGeneratedQuestions(),
            });

            renderAt('/teacher/questions/question-token');
            await screen.findByText('Build a quiz from these questions');
            await addOwnMultipleChoiceQuestion(user);

            const firstChoice = screen.getByRole('checkbox', { name: 'The first' });
            await user.click(firstChoice);
            await user.click(firstChoice);
            expect(
                screen.getByText('Added by teacher — not marked automatically'),
            ).toBeInTheDocument();

            await user.click(screen.getByRole('button', { name: 'Publish for learners to open' }));
            const dialog = await screen.findByRole('dialog');
            await user.click(
                within(dialog).getByRole('button', { name: 'Publish for learners to open' }),
            );
            expect(await screen.findByText('Quiz published')).toBeInTheDocument();

            const sent = fetchMock.mock.calls.find(
                (call) =>
                    String(call[0]).endsWith('/api/v1/assessments') && call[1]?.method === 'POST',
            );
            const body = JSON.parse((sent?.[1]?.body as string) ?? '{}');
            const own = (body.questions as Array<Record<string, unknown>>).find(
                (question) => question.questionText === 'Which script moves the cat?',
            );
            expect(own).not.toHaveProperty('correctAnswers');
        });

        it('drops a tick the moment its choice is edited out, rather than leaving it stranded', async () => {
            const user = userEvent.setup();
            mockFetchRoutes({
                features: ['qlc', 'teacher-archive', 'assessments'],
                fallback: () => twoGeneratedQuestions(),
            });

            renderAt('/teacher/questions/question-token');
            await screen.findByText('Build a quiz from these questions');
            await addOwnMultipleChoiceQuestion(user);

            await user.click(screen.getByRole('checkbox', { name: 'The second' }));
            expect(screen.getByText('Added by teacher')).toBeInTheDocument();

            const optionsField = screen.getByRole('textbox', { name: 'Answer choices' });
            await user.clear(optionsField);
            await user.type(optionsField, 'The first\nA replacement');
            await user.tab();

            expect(screen.queryByRole('checkbox', { name: 'The second' })).not.toBeInTheDocument();
            expect(screen.getByRole('checkbox', { name: 'A replacement' })).not.toBeChecked();
            expect(
                screen.getByText('Added by teacher — not marked automatically'),
            ).toBeInTheDocument();
        });

        it('carries a ticked choice into free text, and lets go of it on the way back', async () => {
            const user = userEvent.setup();
            mockFetchRoutes({
                features: ['qlc', 'teacher-archive', 'assessments'],
                fallback: () => twoGeneratedQuestions(),
            });

            renderAt('/teacher/questions/question-token');
            await screen.findByText('Build a quiz from these questions');
            await addOwnMultipleChoiceQuestion(user);
            await user.click(screen.getByRole('checkbox', { name: 'The first' }));

            await user.selectOptions(screen.getByRole('combobox', { name: 'Answer type' }), [
                'FREE_TEXT',
            ]);
            expect(screen.getByRole('textbox', { name: 'Accepted answers' })).toHaveValue(
                'The first',
            );

            await user.selectOptions(screen.getByRole('combobox', { name: 'Answer type' }), [
                'MULTIPLE_CHOICE',
            ]);
            expect(screen.queryByRole('checkbox', { name: 'The first' })).not.toBeInTheDocument();
            expect(
                screen.getByText('Added by teacher — not marked automatically'),
            ).toBeInTheDocument();
        });

        it('publishes a multiple-choice question with nothing ticked exactly as before, unmarked', async () => {
            const user = userEvent.setup();
            const fetchMock = mockFetchRoutes({
                features: ['qlc', 'teacher-archive', 'assessments'],
                routes: [
                    {
                        when: (url) => url.endsWith('/api/v1/assessments'),
                        respond: () =>
                            response(
                                {
                                    schemaVersion: 1,
                                    publicToken: 'pub-none',
                                    teacherToken: 'teach-none',
                                },
                                201,
                            ),
                    },
                ],
                fallback: () => twoGeneratedQuestions(),
            });

            renderAt('/teacher/questions/question-token');
            await screen.findByText('Build a quiz from these questions');
            await addOwnMultipleChoiceQuestion(user);

            await user.click(screen.getByRole('button', { name: 'Publish for learners to open' }));
            const dialog = await screen.findByRole('dialog');
            await user.click(
                within(dialog).getByRole('button', { name: 'Publish for learners to open' }),
            );
            expect(await screen.findByText('Quiz published')).toBeInTheDocument();

            const sent = fetchMock.mock.calls.find(
                (call) =>
                    String(call[0]).endsWith('/api/v1/assessments') && call[1]?.method === 'POST',
            );
            const body = JSON.parse((sent?.[1]?.body as string) ?? '{}');
            const own = (body.questions as Array<Record<string, unknown>>).find(
                (question) => question.questionText === 'Which script moves the cat?',
            );
            expect(own).toMatchObject({
                source: 'CUSTOM',
                options: ['The first', 'The second'],
                expectedAnswers: 1,
            });
            expect(own).not.toHaveProperty('correctAnswers');
        });
    });

    it('renders a choice in the tick list the way the question itself renders it, not as its markup', async () => {
        const user = userEvent.setup();
        mockFetchRoutes({
            features: ['qlc', 'teacher-archive', 'assessments'],
            fallback: () =>
                questionResult([
                    {
                        questionId: 'q-script',
                        question: 'Which script starts the sprite?',
                        options: ['[scratchblocks]move (10) steps[/scratchblocks]', 'A click'],
                        questionType: 'MULTIPLE_CHOICE',
                        expectedAnswers: 1,
                    },
                ]),
        });

        renderAt('/teacher/questions/question-token');
        await screen.findByText('Build a quiz from these questions');
        await user.click(screen.getByRole('button', { name: 'Select shown questions' }));
        await user.click(screen.getByRole('button', { name: /Question 1 details/ }));
        await user.click(screen.getByRole('button', { name: 'Edit question 1' }));

        const tickList = screen.getByRole('group', { name: 'Correct choices' });
        expect(within(tickList).getByText('move (10) steps')).toBeInTheDocument();
        expect(tickList.textContent).not.toContain('[scratchblocks]');
        expect(tickList.querySelector('ol[type="A"]')).not.toBeNull();

        await user.click(within(tickList).getByRole('checkbox', { name: 'A click' }));
        expect(within(tickList).getByRole('checkbox', { name: 'A click' })).toBeChecked();
    });

    describe("marking a teacher's own question of every other type", () => {
        const builderFetch = (publicToken: string) =>
            mockFetchRoutes({
                features: ['qlc', 'teacher-archive', 'assessments'],
                routes: [
                    {
                        when: (url) => url.endsWith('/api/v1/assessments'),
                        respond: () =>
                            response(
                                {
                                    schemaVersion: 1,
                                    publicToken,
                                    teacherToken: `${publicToken}-teach`,
                                },
                                201,
                            ),
                    },
                ],
                fallback: () => twoGeneratedQuestions(),
            });

        const addOwnQuestion = async (
            user: ReturnType<typeof userEvent.setup>,
            type: 'YES_NO' | 'NUMBER' | 'FREE_TEXT',
            text: string,
        ) => {
            await user.click(screen.getByRole('button', { name: 'Add your own question' }));
            const questionText = await screen.findByRole('textbox', { name: 'Question text' });
            await user.clear(questionText);
            await user.type(questionText, text);
            await user.selectOptions(screen.getByRole('combobox', { name: 'Answer type' }), [type]);
        };

        const publishedOwnQuestion = async (
            user: ReturnType<typeof userEvent.setup>,
            fetchMock: ReturnType<typeof builderFetch>,
            questionText: string,
        ) => {
            await user.click(screen.getByRole('button', { name: 'Publish for learners to open' }));
            expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
            expect(await screen.findByText('Quiz published')).toBeInTheDocument();
            const sent = fetchMock.mock.calls.find(
                (call) =>
                    String(call[0]).endsWith('/api/v1/assessments') && call[1]?.method === 'POST',
            );
            const body = JSON.parse((sent?.[1]?.body as string) ?? '{}');
            return (body.questions as Array<Record<string, unknown>>).find(
                (question) => question.questionText === questionText,
            );
        };

        it('stores a yes/no answer as the token the service marks by, and publishes it', async () => {
            const user = userEvent.setup();
            const fetchMock = builderFetch('pub-yes-no');

            renderAt('/teacher/questions/question-token');
            await screen.findByText('Build a quiz from these questions');
            await addOwnQuestion(user, 'YES_NO', 'Does the script loop?');

            expect(screen.getByRole('radio', { name: 'Do not mark this question' })).toBeChecked();
            await user.click(screen.getByRole('radio', { name: 'Yes' }));
            expect(screen.getByText('Added by teacher')).toBeInTheDocument();

            const own = await publishedOwnQuestion(user, fetchMock, 'Does the script loop?');
            expect(own).toMatchObject({
                source: 'CUSTOM',
                questionType: 'YES_NO',
                correctAnswers: ['yes'],
                expectedAnswers: 1,
            });
            expect(own).not.toHaveProperty('options');
        });

        it('takes a number as the correct answer and publishes it', async () => {
            const user = userEvent.setup();
            const fetchMock = builderFetch('pub-number');

            renderAt('/teacher/questions/question-token');
            await screen.findByText('Build a quiz from these questions');
            await addOwnQuestion(user, 'NUMBER', 'How many sprites move?');

            await user.type(screen.getByRole('spinbutton', { name: 'Correct number' }), '4');
            expect(screen.getByText('Added by teacher')).toBeInTheDocument();

            const own = await publishedOwnQuestion(user, fetchMock, 'How many sprites move?');
            expect(own).toMatchObject({
                source: 'CUSTOM',
                questionType: 'NUMBER',
                correctAnswers: ['4'],
                expectedAnswers: 1,
            });
        });

        it('takes several accepted answers for free text, any one of which counts', async () => {
            const user = userEvent.setup();
            const fetchMock = builderFetch('pub-free-text');

            renderAt('/teacher/questions/question-token');
            await screen.findByText('Build a quiz from these questions');
            await addOwnQuestion(user, 'FREE_TEXT', 'Why does it repeat?');

            await user.type(
                screen.getByRole('textbox', { name: 'Accepted answers' }),
                'it repeats\nthere is a loop',
            );
            await user.tab();

            const own = await publishedOwnQuestion(user, fetchMock, 'Why does it repeat?');
            expect(own).toMatchObject({
                source: 'CUSTOM',
                questionType: 'FREE_TEXT',
                correctAnswers: ['it repeats', 'there is a loop'],
                expectedAnswers: 1,
            });
        });

        it('keeps an answer a new type can carry and drops one it cannot', async () => {
            const user = userEvent.setup();
            builderFetch('pub-retype');

            renderAt('/teacher/questions/question-token');
            await screen.findByText('Build a quiz from these questions');
            await addOwnQuestion(user, 'FREE_TEXT', 'Does it loop?');

            await user.type(screen.getByRole('textbox', { name: 'Accepted answers' }), 'yes');
            await user.tab();

            await user.selectOptions(screen.getByRole('combobox', { name: 'Answer type' }), [
                'YES_NO',
            ]);
            expect(screen.getByRole('radio', { name: 'Yes' })).toBeChecked();
            expect(screen.getByText('Added by teacher')).toBeInTheDocument();

            await user.selectOptions(screen.getByRole('combobox', { name: 'Answer type' }), [
                'NUMBER',
            ]);
            expect(screen.getByRole('spinbutton', { name: 'Correct number' })).toHaveValue(null);
            expect(
                screen.getByText('Added by teacher — not marked automatically'),
            ).toBeInTheDocument();

            await user.type(screen.getByRole('spinbutton', { name: 'Correct number' }), '4');
            await user.selectOptions(screen.getByRole('combobox', { name: 'Answer type' }), [
                'FREE_TEXT',
            ]);
            expect(screen.getByRole('textbox', { name: 'Accepted answers' })).toHaveValue('4');
        });
    });

    it('hides publishing entirely when the capability is off, leaving the exports untouched', async () => {
        const user = userEvent.setup();
        mockFetchRoutes({
            features: ['qlc', 'teacher-archive'],
            fallback: () =>
                questionResult([
                    {
                        questionId: 'q-first',
                        question: 'What starts the script?',
                        options: ['The flag', 'A click'],
                        questionType: 'MULTIPLE_CHOICE',
                        expectedAnswers: 1,
                    },
                ]),
        });

        renderAt('/teacher/questions/question-token');
        await screen.findByText('Build a quiz from these questions');
        expect(
            screen.queryByRole('button', { name: 'Publish for learners to open' }),
        ).not.toBeInTheDocument();
        await user.click(screen.getByRole('button', { name: 'Select shown questions' }));
        expect(screen.getByRole('button', { name: 'Download printable quiz' })).toBeEnabled();
    });

    it('renders a published quiz for a learner', async () => {
        mockFetchRoutes({
            features: ['assessments'],
            routes: [
                {
                    when: (url) => url.includes('/api/v1/assessments/pub-2'),
                    respond: () =>
                        response({
                            schemaVersion: 1,
                            title: 'Chapter 3 quiz',
                            instructions: 'Answer every question.',
                            locale: 'en',
                            questions: [
                                {
                                    questionId: 'q1',
                                    questionText: 'What does this block do?',
                                    options: ['Moves', 'Waits'],
                                    questionType: 'MULTIPLE_CHOICE',
                                    sprite: null,
                                    scratchBlocks: null,
                                    hint: null,
                                    programDimension: null,
                                    scopeOfFocus: null,
                                    expectedAnswers: 1,
                                },
                            ],
                        }),
                },
            ],
        });

        renderAt('/quiz/pub-2');
        expect(await screen.findByRole('heading', { name: 'Chapter 3 quiz' })).toBeInTheDocument();
        expect(screen.getByText('What does this block do?')).toBeInTheDocument();
    });

    describe('a hosted quiz whose service reported a shorter answer than this client ships with', () => {
        const REPORTED_ANSWER_LENGTH = 120;

        const mockShortAnswerQuiz = () =>
            mockFetchRoutes({
                features: ['assessments'],
                capabilitiesOverrides: {
                    assessmentLimits: { maxAnswerLength: REPORTED_ANSWER_LENGTH },
                },
                routes: [
                    {
                        when: (url) => url.includes('/api/v1/assessments/pub-short'),
                        respond: () =>
                            response({
                                schemaVersion: 1,
                                title: 'Chapter 5 quiz',
                                instructions: null,
                                locale: 'en',
                                questions: [
                                    {
                                        questionId: 'q1',
                                        questionText: 'What does this block do?',
                                        options: [],
                                        questionType: 'FREE_TEXT',
                                        sprite: null,
                                        scratchBlocks: null,
                                        hint: null,
                                        programDimension: null,
                                        scopeOfFocus: null,
                                        expectedAnswers: 1,
                                    },
                                ],
                            }),
                    },
                ],
            });

        it('bounds the answer box and names that bound when it is passed', async () => {
            mockShortAnswerQuiz();

            renderAt('/quiz/pub-short');
            await screen.findByRole('heading', { name: 'Chapter 5 quiz' });
            const box = screen.getByRole('textbox');
            expect(box).toHaveAttribute('maxLength', String(REPORTED_ANSWER_LENGTH));

            const user = userEvent.setup();
            fireEvent.change(box, { target: { value: 'x'.repeat(REPORTED_ANSWER_LENGTH + 1) } });
            await user.click(screen.getByRole('button', { name: 'Send answer' }));
            expect(
                await screen.findByText('Answers can contain at most 120 characters.'),
            ).toBeInTheDocument();
        });
    });

    describe('a hosted quiz that has taken every attempt it will take', () => {
        const mockExhaustedQuiz = () =>
            mockFetchRoutes({
                features: ['assessments'],
                routes: [
                    {
                        when: (url, init) => url.endsWith('/attempts') && init?.method === 'POST',
                        respond: () => response({}, 429),
                    },
                    {
                        when: (url) => url.includes('/api/v1/assessments/pub-full'),
                        respond: () =>
                            response({
                                schemaVersion: 1,
                                title: 'Chapter 6 quiz',
                                instructions: null,
                                locale: 'en',
                                questions: [
                                    {
                                        questionId: 'q1',
                                        questionText: 'What does this block do?',
                                        options: [],
                                        questionType: 'FREE_TEXT',
                                        sprite: null,
                                        scratchBlocks: null,
                                        hint: null,
                                        programDimension: null,
                                        scopeOfFocus: null,
                                        expectedAnswers: 1,
                                    },
                                ],
                            }),
                    },
                ],
            });

        it.each([
            ['en', 'Send answer', /This quiz has been opened as many times as it can be\./],
            ['de', 'Antwort senden', /Dieses Quiz wurde schon so oft geöffnet, wie es geht\./],
            [
                'es',
                'Enviar respuesta',
                /Este cuestionario ya se ha abierto todas las veces que se puede\./,
            ],
            ['nl', 'Antwoord versturen', /Deze quiz is al zo vaak geopend als kan\./],
        ])(
            'says so in %s, keeps the answer, and offers no way to try again',
            async (locale, saveLabel, message) => {
                await i18n.changeLanguage(locale);
                const user = userEvent.setup();

                const fetchMock = mockExhaustedQuiz();

                renderAt('/quiz/pub-full');
                await screen.findByRole('heading', { name: 'Chapter 6 quiz' });
                const box = screen.getByRole('textbox');
                await user.type(box, 'It moves');
                await user.click(screen.getByRole('button', { name: saveLabel }));

                expect(await screen.findByText(message)).toBeInTheDocument();
                expect(box).toHaveValue('It moves');
                expect(screen.queryByRole('button', { name: saveLabel })).not.toBeInTheDocument();

                const attemptsOpened = () =>
                    fetchMock.mock.calls.filter(
                        ([input, init]) =>
                            String(input).endsWith('/attempts') && init?.method === 'POST',
                    ).length;
                const opened = attemptsOpened();
                expect(box).toBeDisabled();
                fireEvent.change(box, { target: { value: 'It jumps' } });

                expect(box).toHaveValue('It moves');
                expect(await screen.findByText(message)).toBeInTheDocument();
                expect(screen.queryByRole('button', { name: saveLabel })).not.toBeInTheDocument();
                expect(attemptsOpened()).toBe(opened);
            },
        );
    });

    it('renders a published quiz whose instructions and teacher-authored question carry no declared shape', async () => {
        mockFetchRoutes({
            features: ['assessments'],
            routes: [
                {
                    when: (url) => url.includes('/api/v1/assessments/pub-8'),
                    respond: () =>
                        response({
                            schemaVersion: 1,
                            title: 'Chapter 4 quiz',
                            instructions: null,
                            locale: 'en',
                            questions: [
                                {
                                    questionId: 'q1',
                                    questionText: 'What do sprites in this project do?',
                                    options: [],
                                    questionType: null,
                                    sprite: null,
                                    scratchBlocks: null,
                                    hint: null,
                                    programDimension: null,
                                    scopeOfFocus: null,
                                    expectedAnswers: null,
                                },
                            ],
                        }),
                },
            ],
        });

        renderAt('/quiz/pub-8');
        expect(await screen.findByRole('heading', { name: 'Chapter 4 quiz' })).toBeInTheDocument();
        expect(screen.getByText('What do sprites in this project do?')).toBeInTheDocument();
    });

    it('tells a class the quiz has ended, with no retry offered', async () => {
        mockFetchRoutes({
            features: ['assessments'],
            routes: [
                {
                    when: (url) => url.includes('/api/v1/assessments/pub-gone'),
                    respond: () => response({ code: 'gone' }, 410),
                },
            ],
        });

        renderAt('/quiz/pub-gone');
        expect(
            await screen.findByText(
                'This quiz has closed, or the date it was open until has passed. Ask whoever set it whether there is a new link.',
            ),
        ).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'Retry' })).not.toBeInTheDocument();
    });

    const oneQuestionAssessment = (title: string) =>
        response({
            schemaVersion: 1,
            title,
            instructions: '',
            locale: 'en',
            questions: [
                {
                    questionId: 'q1',
                    questionText: 'How many scripts does Stage have?',
                    options: [],
                    questionType: 'NUMBER',
                    sprite: null,
                    scratchBlocks: null,
                    hint: null,
                    programDimension: null,
                    scopeOfFocus: null,
                    expectedAnswers: 1,
                },
            ],
        });

    it("names the question list itself on a published quiz, rather than 'this project' the way the questions page a submitter reaches directly does", async () => {
        mockFetchRoutes({
            features: ['qlc', 'assessments'],
            routes: [
                {
                    when: (url) => url.includes('/api/v1/assessments/pub-heading'),
                    respond: () => oneQuestionAssessment('Chapter 5 quiz'),
                },
                {
                    when: (url) => url.includes('question-token'),
                    respond: () =>
                        questionResult([
                            {
                                questionId: 'q1',
                                question: 'What starts the script?',
                                options: ['The flag', 'A click'],
                                questionType: 'MULTIPLE_CHOICE',
                                expectedAnswers: 1,
                            },
                        ]),
                },
            ],
        });

        const learner = renderAt('/questions/question-token');
        expect(
            await screen.findByRole('heading', { name: 'Questions about this project' }),
        ).toBeInTheDocument();
        learner.unmount();

        renderAt('/quiz/pub-heading');
        expect(
            await screen.findByRole('heading', { name: 'Answer the questions' }),
        ).toBeInTheDocument();
        expect(screen.queryByText('Questions about this project')).not.toBeInTheDocument();
    });

    it('hides the project-code fold on a published quiz when program-export is not advertised', async () => {
        mockFetchRoutes({
            features: ['assessments'],
            routes: [
                {
                    when: (url) => url.includes('/api/v1/assessments/pub-nocode'),
                    respond: () => oneQuestionAssessment('No-code quiz'),
                },
            ],
        });

        renderAt('/quiz/pub-nocode');
        await screen.findByText('How many scripts does Stage have?');
        expect(screen.queryByText('Look at the code')).not.toBeInTheDocument();
    });

    it('offers the project code closed on arrival when program-export is advertised, fetching it from the assessment endpoint only once opened', async () => {
        let codeRequests = 0;
        const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
            const url = String(input);
            if (url.includes('/capabilities'))
                return Promise.resolve(capabilitiesResponse(['assessments', 'program-export']));
            if (url.endsWith('/api/v1/assessments/pub-code/code')) {
                codeRequests += 1;
                return Promise.resolve(
                    new Response(
                        JSON.stringify({
                            sprites: [{ name: 'Cat', stage: false }],
                            scripts: [
                                {
                                    scriptId: 'a',
                                    spriteName: 'Cat',
                                    ordinal: 1,
                                    scratchblocks: 'when green flag clicked\nmove (10) steps\n',
                                },
                            ],
                        }),
                        {
                            status: 200,
                            headers: {
                                'Content-Type': 'application/json',
                                'Cache-Control': 'no-store',
                                'X-Content-Type-Options': 'nosniff',
                            },
                        },
                    ),
                );
            }
            if (url.includes('/api/v1/assessments/pub-code'))
                return Promise.resolve(oneQuestionAssessment('Code quiz'));
            return Promise.resolve(response({}, 404));
        });

        const user = userEvent.setup();
        renderAt('/quiz/pub-code');
        const fold = await screen.findByText('Look at the code');
        expect(document.querySelector('.project-code')).not.toHaveAttribute('open');
        expect(codeRequests).toBe(0);

        await user.click(fold);
        expect(await screen.findByRole('combobox', { name: 'Sprite' })).toHaveValue('Cat');
        expect(codeRequests).toBe(1);
        expect(
            fetchMock.mock.calls.some(([call]) =>
                String(call).endsWith('/api/v1/assessments/pub-code/code'),
            ),
        ).toBe(true);
    });

    it('shows a quiet message rather than an error and retry when a published quiz has no code to offer', async () => {
        mockFetchRoutes({
            features: ['assessments', 'program-export'],
            routes: [
                {
                    when: (url) => url.endsWith('/api/v1/assessments/pub-unexportable/code'),
                    respond: () => response({}, 404),
                },
                {
                    when: (url) => url.includes('/api/v1/assessments/pub-unexportable'),
                    respond: () => oneQuestionAssessment('Unexportable quiz'),
                },
            ],
        });

        const user = userEvent.setup();
        renderAt('/quiz/pub-unexportable');
        await user.click(await screen.findByText('Look at the code'));

        expect(
            await screen.findByText("The code isn't available for this quiz."),
        ).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'Retry' })).not.toBeInTheDocument();
    });

    it('shows the same quiet message for a closed or expired quiz as for one with no code at all', async () => {
        mockFetchRoutes({
            features: ['assessments', 'program-export'],
            routes: [
                {
                    when: (url) => url.endsWith('/api/v1/assessments/pub-endedcode/code'),
                    respond: () => response({ code: 'gone' }, 410),
                },
                {
                    when: (url) => url.includes('/api/v1/assessments/pub-endedcode'),
                    respond: () => oneQuestionAssessment('Ended quiz'),
                },
            ],
        });

        const user = userEvent.setup();
        renderAt('/quiz/pub-endedcode');
        await user.click(await screen.findByText('Look at the code'));

        expect(
            await screen.findByText("The code isn't available for this quiz."),
        ).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'Retry' })).not.toBeInTheDocument();
    });

    it('opens no attempt until the first answer, and reports a null verdict as recorded rather than wrong', async () => {
        const user = userEvent.setup();
        const fetchMock = mockFetchRoutes({
            features: ['assessments'],
            routes: [
                {
                    when: (url, init) => url.endsWith('/attempts') && init?.method === 'POST',
                    respond: () => response({ attemptId: 'attempt-1' }, 201),
                },
                {
                    when: (url, init) => url.includes('/answers') && init?.method === 'POST',
                    respond: () =>
                        response({ questionId: 'q1', correct: null, correctAnswers: [] }),
                },
                {
                    when: (url) => url.includes('/api/v1/assessments/pub-3'),
                    respond: () =>
                        response({
                            schemaVersion: 1,
                            title: 'Unmarkable quiz',
                            instructions: '',
                            locale: 'en',
                            questions: [
                                {
                                    questionId: 'q1',
                                    questionText: 'What does this block do?',
                                    options: ['Moves', 'Waits'],
                                    questionType: 'MULTIPLE_CHOICE',
                                    sprite: null,
                                    scratchBlocks: null,
                                    hint: null,
                                    programDimension: null,
                                    scopeOfFocus: null,
                                    expectedAnswers: 1,
                                },
                            ],
                        }),
                },
            ],
        });

        renderAt('/quiz/pub-3');
        await screen.findByText('What does this block do?');
        expect(fetchMock.mock.calls.some(([call]) => String(call).endsWith('/attempts'))).toBe(
            false,
        );

        await user.click(screen.getByRole('radio', { name: 'Moves' }));
        await user.click(screen.getByRole('button', { name: 'Send answer' }));

        await waitFor(() =>
            expect(fetchMock.mock.calls.some(([call]) => String(call).endsWith('/attempts'))).toBe(
                true,
            ),
        );
        expect(await screen.findByText('Answer recorded.')).toBeInTheDocument();
        expect(screen.queryByText('Not quite.')).not.toBeInTheDocument();
    });

    const twoQuestionLearnerView = (title: string) =>
        response({
            schemaVersion: 1,
            title,
            instructions: '',
            locale: 'en',
            questions: [
                {
                    questionId: 'q1',
                    questionText: 'What does this block do?',
                    options: ['Moves', 'Waits'],
                    questionType: 'MULTIPLE_CHOICE',
                    sprite: null,
                    scratchBlocks: null,
                    hint: null,
                    programDimension: null,
                    scopeOfFocus: null,
                    expectedAnswers: 1,
                },
                {
                    questionId: 'q2',
                    questionText: 'What colour is the flag?',
                    options: ['Green', 'Red'],
                    questionType: 'MULTIPLE_CHOICE',
                    sprite: null,
                    scratchBlocks: null,
                    hint: null,
                    programDimension: null,
                    scopeOfFocus: null,
                    expectedAnswers: 1,
                },
            ],
        });

    it('opens exactly one attempt on a fresh visit, even once a second question is answered', async () => {
        const user = userEvent.setup();
        let attemptRequests = 0;
        vi.spyOn(globalThis, 'fetch').mockImplementation((input, init) => {
            const url = String(input);
            if (url.includes('/capabilities'))
                return Promise.resolve(capabilitiesResponse(['assessments']));
            if (url.endsWith('/attempts') && init?.method === 'POST') {
                attemptRequests += 1;
                return Promise.resolve(response({ attemptId: 'attempt-fresh' }, 201));
            }
            if (url.includes('/answers') && init?.method === 'POST')
                return Promise.resolve(
                    response({ questionId: 'q1', correct: true, correctAnswers: [] }),
                );
            if (url.includes('/api/v1/assessments/pub-resume-1'))
                return Promise.resolve(twoQuestionLearnerView('Fresh-attempt quiz'));
            return Promise.resolve(response({}, 404));
        });

        renderAt('/quiz/pub-resume-1');
        await screen.findByText('What does this block do?');
        expect(attemptRequests).toBe(0);

        await user.click(screen.getByRole('radio', { name: 'Moves' }));
        await user.click(screen.getByRole('button', { name: 'Send answer' }));
        await screen.findByText('Correct!');
        expect(attemptRequests).toBe(1);

        await user.click(screen.getByRole('button', { name: 'Next question' }));
        await user.click(screen.getByRole('radio', { name: 'Green' }));
        await user.click(screen.getByRole('button', { name: 'Send answer' }));
        await waitFor(() => expect(screen.getAllByText('Correct!')).toHaveLength(2));

        expect(attemptRequests).toBe(1);
    });

    it('reuses a stored attempt after a reload, without opening a second one', async () => {
        const user = userEvent.setup();
        let attemptRequests = 0;
        const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation((input, init) => {
            const url = String(input);
            if (url.includes('/capabilities'))
                return Promise.resolve(capabilitiesResponse(['assessments']));
            if (url.endsWith('/attempts') && init?.method === 'POST') {
                attemptRequests += 1;
                return Promise.resolve(response({ attemptId: 'attempt-resumed' }, 201));
            }
            if (url.includes('/answers') && init?.method === 'POST')
                return Promise.resolve(
                    response({ questionId: 'q2', correct: true, correctAnswers: [] }),
                );
            if (url.includes('/api/v1/assessments/pub-resume-2'))
                return Promise.resolve(twoQuestionLearnerView('Resumable quiz'));
            return Promise.resolve(response({}, 404));
        });

        const firstVisit = renderAt('/quiz/pub-resume-2');
        await screen.findByText('What does this block do?');
        await user.click(screen.getByRole('radio', { name: 'Moves' }));
        await user.click(screen.getByRole('button', { name: 'Send answer' }));
        await screen.findByText('Correct!');
        expect(attemptRequests).toBe(1);

        firstVisit.unmount();
        renderAt('/quiz/pub-resume-2');
        await screen.findByText('What does this block do?');

        expect(attemptRequests).toBe(1);

        await user.click(screen.getByRole('button', { name: 'Next question' }));
        await user.click(screen.getByRole('radio', { name: 'Green' }));
        await user.click(screen.getByRole('button', { name: 'Send answer' }));
        await waitFor(() =>
            expect(
                fetchMock.mock.calls.filter(([call]) => String(call).endsWith('/answers')).length,
            ).toBe(2),
        );

        expect(attemptRequests).toBe(1);
    });

    it('shows a previously answered question as already done once a resumed attempt renders', async () => {
        const user = userEvent.setup();
        mockFetchRoutes({
            features: ['assessments'],
            routes: [
                {
                    when: (url, init) => url.endsWith('/attempts') && init?.method === 'POST',
                    respond: () => response({ attemptId: 'attempt-shown' }, 201),
                },
                {
                    when: (url, init) => url.includes('/answers') && init?.method === 'POST',
                    respond: () =>
                        response({ questionId: 'q1', correct: false, correctAnswers: ['Waits'] }),
                },
                {
                    when: (url) => url.includes('/api/v1/assessments/pub-resume-3'),
                    respond: () => twoQuestionLearnerView('Resumable quiz'),
                },
            ],
        });

        const firstVisit = renderAt('/quiz/pub-resume-3');
        await screen.findByText('What does this block do?');
        await user.click(screen.getByRole('radio', { name: 'Moves' }));
        await user.click(screen.getByRole('button', { name: 'Send answer' }));
        expect(await screen.findByText('Not quite.')).toBeInTheDocument();

        firstVisit.unmount();
        renderAt('/quiz/pub-resume-3');
        await screen.findByText('What does this block do?');

        expect(screen.queryByRole('button', { name: 'Send answer' })).not.toBeInTheDocument();
        expect(screen.getByText('Not quite.')).toBeInTheDocument();
        expect(document.querySelector('.quiz-expected-answer')?.textContent).toContain('Waits');
        expect(screen.getByRole('radio', { name: 'Moves' })).toBeDisabled();

        expect(screen.getByRole('button', { name: 'Next question' })).toBeEnabled();
    });

    it('reopens answers lost with a stale attempt after replacing it', async () => {
        const user = userEvent.setup();
        let attemptRequests = 0;
        window.localStorage.setItem(
            'litterbox.quiz-attempts',
            JSON.stringify([
                {
                    publicToken: 'pub-resume-4',
                    attemptId: 'attempt-stale',
                    answers: [{ questionId: 'q1', verdict: { correct: true, correctAnswers: [] } }],
                    at: Date.now(),
                },
            ]),
        );
        vi.spyOn(globalThis, 'fetch').mockImplementation((input, init) => {
            const url = String(input);
            if (url.includes('/capabilities'))
                return Promise.resolve(capabilitiesResponse(['assessments']));
            if (url.includes('/attempts/attempt-stale/answers') && init?.method === 'POST')
                return Promise.resolve(response({ code: 'not_found' }, 404));
            if (url.endsWith('/attempts') && init?.method === 'POST') {
                attemptRequests += 1;
                return Promise.resolve(response({ attemptId: 'attempt-replacement' }, 201));
            }
            if (url.includes('/answers') && init?.method === 'POST')
                return Promise.resolve(
                    response({ questionId: 'q2', correct: true, correctAnswers: [] }),
                );
            if (url.includes('/api/v1/assessments/pub-resume-4'))
                return Promise.resolve(twoQuestionLearnerView('Resumable quiz'));
            return Promise.resolve(response({}, 404));
        });

        renderAt('/quiz/pub-resume-4');
        await screen.findByText('What does this block do?');
        expect(screen.queryByRole('button', { name: 'Send answer' })).not.toBeInTheDocument();

        await user.click(screen.getByRole('button', { name: 'Next question' }));
        await user.click(screen.getByRole('radio', { name: 'Green' }));
        await user.click(screen.getByRole('button', { name: 'Send answer' }));

        expect(await screen.findByRole('status')).toHaveTextContent('started again');
        expect(attemptRequests).toBe(1);
        expect(screen.getByRole('radio', { name: 'Moves' })).toBeEnabled();
        expect(screen.getByRole('button', { name: 'Send answer' })).toBeInTheDocument();

        const stored: unknown = JSON.parse(
            window.localStorage.getItem('litterbox.quiz-attempts') ?? '[]',
        );
        expect(stored).toEqual([
            expect.objectContaining({
                publicToken: 'pub-resume-4',
                attemptId: 'attempt-replacement',
                answers: [expect.objectContaining({ questionId: 'q2' })],
            }),
        ]);
    });

    it('keeps the attempt and its answers when the quiz is closed under a learner', async () => {
        const user = userEvent.setup();
        let attemptRequests = 0;
        window.localStorage.setItem(
            'litterbox.quiz-attempts',
            JSON.stringify([
                {
                    publicToken: 'pub-closed-under',
                    attemptId: 'attempt-kept',
                    answers: [{ questionId: 'q1', verdict: { correct: true, correctAnswers: [] } }],
                    at: Date.now(),
                },
            ]),
        );
        vi.spyOn(globalThis, 'fetch').mockImplementation((input, init) => {
            const url = String(input);
            if (url.includes('/capabilities'))
                return Promise.resolve(capabilitiesResponse(['assessments']));
            if (url.endsWith('/attempts') && init?.method === 'POST') {
                attemptRequests += 1;
                return Promise.resolve(response({ attemptId: 'attempt-replacement' }, 201));
            }
            if (url.includes('/answers') && init?.method === 'POST')
                return Promise.resolve(response({ code: 'gone' }, 410));
            if (url.includes('/api/v1/assessments/pub-closed-under'))
                return Promise.resolve(twoQuestionLearnerView('Closed under a learner'));
            return Promise.resolve(response({}, 404));
        });

        renderAt('/quiz/pub-closed-under');
        await screen.findByText('What does this block do?');
        await user.click(screen.getByRole('button', { name: 'Next question' }));
        await user.click(screen.getByRole('radio', { name: 'Green' }));
        await user.click(screen.getByRole('button', { name: 'Send answer' }));

        expect(
            await screen.findByText(
                'This quiz is not open right now, so your answer could not be sent. It is still here — ask your teacher whether the quiz will open again.',
            ),
        ).toBeInTheDocument();
        expect(attemptRequests).toBe(0);
        expect(screen.getByRole('radio', { name: 'Green' })).toBeChecked();
        expect(screen.getByRole('button', { name: 'Send answer' })).toBeEnabled();
        const stored: unknown = JSON.parse(
            window.localStorage.getItem('litterbox.quiz-attempts') ?? '[]',
        );
        expect(stored).toEqual([
            expect.objectContaining({
                publicToken: 'pub-closed-under',
                attemptId: 'attempt-kept',
                answers: [expect.objectContaining({ questionId: 'q1' })],
            }),
        ]);
    });

    it('lets a learner send a single-choice answer that quotes a whole script', async () => {
        const user = userEvent.setup();
        const fetchMock = mockFetchRoutes({
            features: ['assessments'],
            routes: [
                {
                    when: (url, init) => url.endsWith('/attempts') && init?.method === 'POST',
                    respond: () => response({ attemptId: 'attempt-1' }, 201),
                },
                {
                    when: (url, init) => url.includes('/answers') && init?.method === 'POST',
                    respond: () =>
                        response({
                            questionId: '35',
                            correct: true,
                            correctAnswers: [WHOLE_SCRIPT_OPTION],
                        }),
                },
                {
                    when: (url) => url.includes('/api/v1/assessments/pub-8'),
                    respond: () =>
                        response({
                            schemaVersion: 1,
                            title: 'Whole-script quiz',
                            instructions: '',
                            locale: 'en',
                            questions: [
                                {
                                    questionId: '35',
                                    questionText:
                                        'Which script in the whole program sets the value of Score?',
                                    options: [WHOLE_SCRIPT_OPTION, 'A shorter option'],
                                    questionType: 'MULTIPLE_CHOICE',
                                    sprite: 'Banana',
                                    scratchBlocks: '',
                                    hint: null,
                                    programDimension: 'TEXT',
                                    scopeOfFocus: 'RELATION',
                                    expectedAnswers: 1,
                                },
                            ],
                        }),
                },
            ],
        });

        renderAt('/quiz/pub-8');
        await screen.findByText('Which script in the whole program sets the value of Score?');
        const radios = await screen.findAllByRole('radio');
        expect(radios).toHaveLength(2);
        await user.click(radios[0]!);
        await user.click(screen.getByRole('button', { name: 'Send answer' }));

        await waitFor(() =>
            expect(fetchMock.mock.calls.some(([call]) => String(call).endsWith('/answers'))).toBe(
                true,
            ),
        );
        expect(
            screen.queryByText('Answers can contain at most 500 characters.'),
        ).not.toBeInTheDocument();
    });

    it('refuses to send a multi-select answer that would exceed the length bound once joined, rather than let the service reject it', async () => {
        const user = userEvent.setup();
        const fetchMock = mockFetchRoutes({
            features: ['assessments'],
            routes: [
                {
                    when: (url) => url.includes('/api/v1/assessments/pub-9'),
                    respond: () =>
                        response({
                            schemaVersion: 1,
                            title: 'Long multi-select quiz',
                            instructions: '',
                            locale: 'en',
                            questions: [
                                {
                                    questionId: 'q1',
                                    questionText: 'Which of these scripts run first?',
                                    options: [
                                        WHOLE_SCRIPT_OPTION,
                                        WHOLE_SCRIPT_OPTION.slice(0, 60),
                                    ],
                                    questionType: 'MULTIPLE_CHOICE',
                                    sprite: null,
                                    scratchBlocks: null,
                                    hint: null,
                                    programDimension: null,
                                    scopeOfFocus: null,
                                    expectedAnswers: 2,
                                },
                            ],
                        }),
                },
            ],
        });

        renderAt('/quiz/pub-9');
        const boxes = await screen.findAllByRole('checkbox');
        expect(boxes).toHaveLength(2);
        await user.click(boxes[0]!);
        await user.click(boxes[1]!);
        await user.click(screen.getByRole('button', { name: 'Send answer' }));

        expect(
            await screen.findByText('Answers can contain at most 500 characters.'),
        ).toBeInTheDocument();
        expect(fetchMock.mock.calls.some(([call]) => String(call).endsWith('/attempts'))).toBe(
            false,
        );
    });

    it('shows a teacher the aggregate results of a published quiz', async () => {
        mockFetchRoutes({
            features: ['assessments'],
            routes: [
                {
                    when: (url) => url.includes('/api/v1/assessments/pub-4/results'),
                    respond: () =>
                        resultsBody({
                            totalAttempts: 5,
                            questions: [
                                {
                                    questionId: 'q1',
                                    questionText: 'What does this block do?',
                                    answered: 5,
                                    correct: 3,
                                    incorrect: 1,
                                    notMarkable: 1,
                                },
                            ],
                        }),
                },
            ],
        });

        renderAt('/quiz/pub-4/results#teacherToken=teach-4');
        expect(await screen.findByText('5 attempts recorded.')).toBeInTheDocument();
        expect(screen.getByText(/never shows names/)).toBeInTheDocument();
        const cells = screen.getAllByRole('cell').map((cell) => cell.textContent);
        expect(cells).toEqual(['5', '3', '1', '1']);
        expect(
            screen.getByRole('rowheader', { name: 'What does this block do?' }),
        ).toBeInTheDocument();
    });

    const choiceResults = (token: string) =>
        mockFetchRoutes({
            features: ['assessments'],
            routes: [
                {
                    when: (url) => url.endsWith(`/api/v1/assessments/${token}/results`),
                    respond: () =>
                        resultsBody({
                            title: 'Chapter 3 quiz',
                            totalAttempts: 5,
                            questions: [
                                {
                                    questionId: 'q1',
                                    questionText: 'Which [b]blocks[/b] start a script?',
                                    answered: 4,
                                    correct: 3,
                                    incorrect: 1,
                                    notMarkable: 0,
                                    answerTallies: [
                                        { answer: 'The flag', count: 4 },
                                        { answer: 'A click', count: 3 },
                                    ],
                                    otherAnswers: 1,
                                },
                                {
                                    questionId: 'q2',
                                    questionText: 'Is the cat visible?',
                                    answered: 4,
                                    correct: 2,
                                    incorrect: 2,
                                    notMarkable: 0,
                                    answerTallies: [
                                        { answer: 'yes', count: 3 },
                                        { answer: 'no', count: 1 },
                                    ],
                                    otherAnswers: 0,
                                },
                            ],
                            scores: {
                                markableQuestions: 2,
                                completedAttempts: 4,
                                partialAttempts: 1,
                                counts: [1, 1, 2],
                            },
                        }),
                },
            ],
        });

    it('shows what the class chose, as counts of picks rather than a share of the attempts', async () => {
        choiceResults('pub-tally');

        renderAt('/quiz/pub-tally/results#teacherToken=teach-tally');
        expect(await screen.findByText('What the class chose')).toBeInTheDocument();
        const choices = screen.getByRole('table', { name: 'Which blocks start a script?' });
        expect(
            within(choices).getByRole('columnheader', { name: 'Chosen by' }),
        ).toBeInTheDocument();
        expect(within(choices).getByRole('rowheader', { name: 'The flag' })).toBeInTheDocument();
        expect(
            within(choices)
                .getAllByRole('cell')
                .map((cell) => cell.textContent),
        ).toEqual(['4', '3', '1']);
        expect(
            within(choices).getByRole('rowheader', { name: 'Answers naming none of these' }),
        ).toBeInTheDocument();
        expect(
            screen.getByText(/can add up to more than the number of people/),
        ).toBeInTheDocument();

        const yesNo = screen.getByRole('table', { name: 'Is the cat visible?' });
        expect(within(yesNo).getByRole('rowheader', { name: 'Yes' })).toBeInTheDocument();
        expect(within(yesNo).getByRole('rowheader', { name: 'No' })).toBeInTheDocument();
    });

    it('distributes the scores over completed attempts, naming the partial ones beside them', async () => {
        choiceResults('pub-scores');

        renderAt('/quiz/pub-scores/results#teacherToken=teach-scores');
        expect(await screen.findByText('How the class scored')).toBeInTheDocument();
        const scores = screen.getByRole('table', { name: 'How the class scored' });
        expect(within(scores).getByRole('rowheader', { name: '0 of 2' })).toBeInTheDocument();
        expect(within(scores).getByRole('rowheader', { name: '2 of 2' })).toBeInTheDocument();
        expect(
            within(scores)
                .getAllByRole('cell')
                .map((cell) => cell.textContent),
        ).toEqual(['1', '1', '2']);
        expect(
            screen.getByText(
                '1 attempt answered some of the markable questions but not all of them, and is not in the table above.',
            ),
        ).toBeInTheDocument();
    });

    it('says there is no score to report rather than distributing over a quiz nothing marks', async () => {
        mockFetchRoutes({
            features: ['assessments'],
            routes: [
                {
                    when: (url) => url.endsWith('/api/v1/assessments/pub-nomark/results'),
                    respond: () =>
                        resultsBody({
                            totalAttempts: 2,
                            questions: [
                                {
                                    questionId: 'q1',
                                    questionText: 'Why?',
                                    answered: 2,
                                    correct: 0,
                                    incorrect: 0,
                                    notMarkable: 2,
                                },
                            ],
                        }),
                },
            ],
        });

        renderAt('/quiz/pub-nomark/results#teacherToken=teach-nomark');
        expect(
            await screen.findByText(/No question in this quiz is one this service can mark/),
        ).toBeInTheDocument();
        expect(screen.queryByText('What the class chose')).not.toBeInTheDocument();
    });

    it('hands the same numbers over as a CSV, tallies included and nothing anybody typed', async () => {
        const user = userEvent.setup();
        choiceResults('pub-csv');
        const written: { content: string; type: string }[] = [];
        class CapturingBlob {
            public constructor(parts: string[], options?: BlobPropertyBag) {
                written.push({ content: parts.join(''), type: options?.type ?? '' });
            }
        }
        vi.stubGlobal('Blob', CapturingBlob);
        URL.createObjectURL ??= () => '';
        URL.revokeObjectURL ??= () => undefined;
        vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:results');
        vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
        const clicks: HTMLAnchorElement[] = [];
        vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
            this: HTMLAnchorElement,
        ) {
            clicks.push(this);
        });

        renderAt('/quiz/pub-csv/results#teacherToken=teach-csv');
        await user.click(await screen.findByRole('button', { name: 'Download results as CSV' }));

        expect(clicks).toHaveLength(1);
        expect(clicks[0].download).toBe('chapter-3-quiz-results.csv');
        expect(written).toHaveLength(1);
        const csv = written[0].content;
        expect(written[0].type).toBe('text/csv;charset=utf-8');
        expect(csv.startsWith('﻿')).toBe(true);
        expect(csv.slice(1).split('\r\n')[0]).toBe(
            'Question,Answered,Correct,Incorrect,Not markable,Answers naming none of these,Choice 1,Chosen by 1,Choice 2,Chosen by 2',
        );
        expect(csv).toContain('Which blocks start a script?,4,3,1,0,1,The flag,4,A click,3');
        expect(csv).toContain('Is the cat visible?,4,2,2,0,0,Yes,3,No,1');
    });

    it("keeps a closed quiz's title and question labels on its results page", async () => {
        mockFetchRoutes({
            features: ['assessments'],
            routes: [
                {
                    when: (url) => url.endsWith('/api/v1/assessments/pub-7/results'),
                    respond: () =>
                        resultsBody({
                            title: 'Chapter 3 quiz',
                            status: 'CLOSED',
                            totalAttempts: 2,
                            questions: [
                                {
                                    questionId: 'q1',
                                    questionText: 'What does this block do?',
                                    answered: 2,
                                    correct: 1,
                                    incorrect: 1,
                                    notMarkable: 0,
                                },
                            ],
                        }),
                },
            ],
        });

        renderAt('/quiz/pub-7/results#teacherToken=teach-7');
        expect(await screen.findByText('2 attempts recorded.')).toBeInTheDocument();
        expect(screen.getByText('Chapter 3 quiz')).toBeInTheDocument();
        expect(
            screen.getByRole('rowheader', { name: 'What does this block do?' }),
        ).toBeInTheDocument();
        expect(screen.queryByRole('rowheader', { name: 'Question 1' })).not.toBeInTheDocument();
        expect(
            screen.getByText('Closed — the link no longer takes answers. These results stay here.'),
        ).toBeInTheDocument();
    });

    it('says nobody has attempted a published quiz rather than tabulating its zeroes', async () => {
        mockFetchRoutes({
            features: ['assessments'],
            routes: [
                {
                    when: (url) => url.includes('/api/v1/assessments/pub-8/results'),
                    respond: () =>
                        resultsBody({
                            totalAttempts: 0,
                            questions: [
                                {
                                    questionId: 'q1',
                                    questionText: 'What does this block do?',
                                    answered: 0,
                                    correct: 0,
                                    incorrect: 0,
                                    notMarkable: 0,
                                },
                            ],
                        }),
                },
            ],
        });

        renderAt('/quiz/pub-8/results#teacherToken=teach-8');
        expect(await screen.findByText('Nobody has attempted this quiz yet.')).toBeInTheDocument();
        expect(screen.queryByRole('table')).not.toBeInTheDocument();
    });

    it('names the quiz, heads its first column for what it holds, and asks again for answers on request', async () => {
        const user = userEvent.setup();
        let resultsRequests = 0;
        vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
            const url = String(input);
            if (url.includes('/capabilities'))
                return Promise.resolve(capabilitiesResponse(['assessments']));
            if (url.endsWith('/api/v1/assessments/pub-10/results')) {
                resultsRequests += 1;
                return Promise.resolve(
                    resultsBody({
                        title: 'Chapter 3 quiz',
                        totalAttempts: resultsRequests,
                        questions: [
                            {
                                questionId: 'q1',
                                questionText: 'What does this block do?',
                                answered: 1,
                                correct: 1,
                                incorrect: 0,
                                notMarkable: 0,
                            },
                        ],
                    }),
                );
            }
            return Promise.resolve(response({}, 404));
        });

        renderAt('/quiz/pub-10/results#teacherToken=teach-10');
        expect(await screen.findByText('Chapter 3 quiz')).toBeInTheDocument();
        expect(screen.getByRole('columnheader', { name: 'Question' })).toBeInTheDocument();
        expect(screen.queryByRole('columnheader', { name: 'Your score' })).not.toBeInTheDocument();

        await user.click(screen.getByRole('button', { name: 'Check for new answers' }));
        expect(await screen.findByText('2 attempts recorded.')).toBeInTheDocument();
    });

    const lifecycleQuiz = (
        token: string,
        status: 'OPEN' | 'CLOSED',
        expiresAt = '2099-01-01T00:00:00Z',
    ) => ({
        schemaVersion: 1,
        publicToken: token,
        status,
        expiresAt,
        totalAttempts: 3,
    });

    const lifecyclePage = (
        status: 'OPEN' | 'CLOSED',
        expiresAt: string,
        extra: (url: string, init?: RequestInit) => Promise<Response> | undefined,
    ) =>
        vi.spyOn(globalThis, 'fetch').mockImplementation((input, init) => {
            const url = String(input);
            if (url.includes('/capabilities'))
                return Promise.resolve(capabilitiesResponse(['assessments']));
            if (url.endsWith('/api/v1/assessments/pub-life/results'))
                return Promise.resolve(
                    resultsBody({
                        status,
                        expiresAt,
                        totalAttempts: 3,
                        questions: [
                            {
                                questionId: 'q1',
                                questionText: 'What does this block do?',
                                answered: 3,
                                correct: 2,
                                incorrect: 1,
                                notMarkable: 0,
                            },
                        ],
                    }),
                );
            return extra(url, init) ?? Promise.resolve(response({}, 404));
        });

    it('says a quiz has finished rather than offering to reopen one that cannot be reopened', async () => {
        lifecyclePage('CLOSED', '2020-05-06T09:00:00Z', () => undefined);

        renderAt('/quiz/pub-life/results#teacherToken=teach-life');

        expect(
            await screen.findByText(
                'Finished — it reached the date below, so the link no longer takes answers. These results stay here until it is removed.',
            ),
        ).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'Reopen this quiz' })).toBeNull();
        expect(screen.getByRole('button', { name: 'Delete this quiz' })).toBeInTheDocument();
    });

    it('says so and stays usable when the quiz cannot be closed', async () => {
        const user = userEvent.setup();
        lifecyclePage('OPEN', '2099-01-01T00:00:00Z', (url, init) => {
            if (url.endsWith('/api/v1/assessments/pub-life') && init?.method === 'PATCH')
                return Promise.resolve(response({}, 500));
            return undefined;
        });

        renderAt('/quiz/pub-life/results#teacherToken=teach-life');
        await screen.findByText('Open — the link still takes answers.');

        await user.click(screen.getByRole('button', { name: 'Close this quiz' }));

        expect(
            await screen.findByText('That could not be changed just now. You can try again.'),
        ).toBeInTheDocument();
        const button = screen.getByRole('button', { name: 'Close this quiz' });
        expect(button).toBeEnabled();
        expect(screen.getByText('Open — the link still takes answers.')).toBeInTheDocument();
    });

    it('says so and stays usable when the quiz cannot be deleted', async () => {
        const user = userEvent.setup();
        lifecyclePage('OPEN', '2099-01-01T00:00:00Z', (url, init) => {
            if (url.endsWith('/api/v1/assessments/pub-life') && init?.method === 'DELETE')
                return Promise.resolve(response({}, 500));
            return undefined;
        });

        renderAt('/quiz/pub-life/results#teacherToken=teach-life');
        await screen.findByText('Open — the link still takes answers.');

        await user.click(screen.getByRole('button', { name: 'Delete this quiz' }));
        const confirm = screen.getByRole('dialog');
        await user.click(within(confirm).getByRole('button', { name: 'Delete this quiz' }));

        expect(
            await screen.findByText('That could not be changed just now. You can try again.'),
        ).toBeInTheDocument();
        expect(screen.getByText('Open — the link still takes answers.')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Delete this quiz' })).toBeEnabled();
    });

    it('offers a teacher the state of their quiz and closes it on request', async () => {
        const user = userEvent.setup();
        const fetchMock = lifecyclePage('OPEN', '2099-01-01T00:00:00Z', (url, init) => {
            if (url.endsWith('/api/v1/assessments/pub-life') && init?.method === 'PATCH') {
                const status = (JSON.parse(String(init.body)) as { status: 'OPEN' | 'CLOSED' })
                    .status;
                return Promise.resolve(response(lifecycleQuiz('pub-life', status)));
            }
            return undefined;
        });

        renderAt('/quiz/pub-life/results#teacherToken=teach-life');
        expect(await screen.findByText('Open — the link still takes answers.')).toBeInTheDocument();

        await user.click(screen.getByRole('button', { name: 'Close this quiz' }));

        expect(
            await screen.findByText(
                'Closed — the link no longer takes answers. These results stay here.',
            ),
        ).toBeInTheDocument();
        const patched = fetchMock.mock.calls.find((call) => call[1]?.method === 'PATCH');
        expect(JSON.parse(String(patched?.[1]?.body))).toEqual({ status: 'CLOSED' });
        expect(screen.getByRole('button', { name: 'Reopen this quiz' })).toBeInTheDocument();
    });

    it('asks again before deleting a quiz, says so once it is gone, and stops offering its dead link', async () => {
        const user = userEvent.setup();
        window.localStorage.setItem(
            'litterbox.published-quizzes',
            JSON.stringify([
                {
                    publicToken: 'pub-del',
                    teacherToken: 'teach-del',
                    title: 'Chapter 3 quiz',
                    at: 2,
                },
                {
                    publicToken: 'pub-keep',
                    teacherToken: 'teach-keep',
                    title: 'Chapter 2 quiz',
                    at: 1,
                },
            ]),
        );
        const fetchMock = mockFetchRoutes({
            features: ['assessments'],
            routes: [
                {
                    when: (url) => url.endsWith('/api/v1/assessments/pub-del/results'),
                    respond: () => resultsBody({ totalAttempts: 3, questions: [] }),
                },
                {
                    when: (url, init) =>
                        url.endsWith('/api/v1/assessments/pub-del') && init?.method === 'DELETE',
                    respond: () => new Response(null, { status: 204 }),
                },
            ],
        });

        renderAt('/quiz/pub-del/results#teacherToken=teach-del');
        await user.click(await screen.findByRole('button', { name: 'Delete this quiz' }));

        const dialog = await screen.findByRole('dialog');
        expect(
            within(dialog).getByText(/every answer your class gave is removed/),
        ).toBeInTheDocument();
        const actions = () =>
            within(
                (screen.getByRole('dialog').querySelector('.dialog-actions') ??
                    undefined) as HTMLElement,
            );
        await user.click(actions().getByRole('button', { name: 'Keep it' }));
        await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
        expect(fetchMock.mock.calls.some((call) => call[1]?.method === 'DELETE')).toBe(false);

        await user.click(screen.getByRole('button', { name: 'Delete this quiz' }));
        await screen.findByRole('dialog');
        await user.click(actions().getByRole('button', { name: 'Delete this quiz' }));

        expect(
            await screen.findByText('This quiz and every answer to it have been deleted.'),
        ).toBeInTheDocument();
        expect(screen.queryByRole('table')).not.toBeInTheDocument();

        const remembered = JSON.parse(
            window.localStorage.getItem('litterbox.published-quizzes') ?? '[]',
        );
        expect(remembered).toEqual([expect.objectContaining({ publicToken: 'pub-keep' })]);
    });

    it('shows a clear message for a rejected teacher token rather than an empty table', async () => {
        mockFetchRoutes({
            features: ['assessments'],
            routes: [
                {
                    when: (url) => url.includes('/results'),
                    respond: () => response({ code: 'unauthorized' }, 403),
                },
            ],
        });

        renderAt('/quiz/pub-5/results#teacherToken=wrong-token');
        expect(
            await screen.findByText(
                'The link may be mistyped, or its token is no longer valid. Check the address you were given when you published the quiz.',
            ),
        ).toBeInTheDocument();
        expect(screen.queryByRole('table')).not.toBeInTheDocument();
    });

    it('reports hosted quizzes as unavailable on both routes when the capability is off', async () => {
        mockFetchRoutes({
            features: ['qlc'],
        });

        const quiz = renderAt('/quiz/pub-6');
        expect(
            await screen.findByText('Hosted quizzes are not available on this deployment.'),
        ).toBeInTheDocument();
        quiz.unmount();

        renderAt('/quiz/pub-6/results#teacherToken=teach-6');
        expect(
            await screen.findByText('Hosted quizzes are not available on this deployment.'),
        ).toBeInTheDocument();
    });

    it('does not carry a resumed attempt or its answers over to another quiz', async () => {
        const user = userEvent.setup();
        window.localStorage.setItem(
            'litterbox.quiz-attempts',
            JSON.stringify([
                {
                    publicToken: 'pub-a',
                    attemptId: 'attempt-a',
                    answers: [{ questionId: 'q1', verdict: { correct: true, correctAnswers: [] } }],
                    at: Date.now(),
                },
            ]),
        );
        const answered: string[] = [];
        vi.spyOn(globalThis, 'fetch').mockImplementation((input, init) => {
            const url = String(input);
            if (url.includes('/capabilities'))
                return Promise.resolve(capabilitiesResponse(['assessments']));
            if (url.endsWith('/attempts') && init?.method === 'POST')
                return Promise.resolve(response({ attemptId: 'attempt-b' }, 201));
            if (url.includes('/answers') && init?.method === 'POST') {
                answered.push(url);
                return Promise.resolve(
                    response({ questionId: 'q1', correct: true, correctAnswers: [] }),
                );
            }
            if (url.includes('/api/v1/assessments/pub-'))
                return Promise.resolve(twoQuestionLearnerView('Some quiz'));
            return Promise.resolve(response({}, 404));
        });

        renderAtWithLink('/quiz/pub-a', '/quiz/pub-b');
        await screen.findByText('What does this block do?');
        expect(screen.queryByRole('button', { name: 'Send answer' })).not.toBeInTheDocument();

        await user.click(screen.getByRole('button', { name: 'go to /quiz/pub-b' }));
        await screen.findByText('What does this block do?');
        await user.click(screen.getByRole('radio', { name: 'Moves' }));
        await user.click(screen.getByRole('button', { name: 'Send answer' }));

        await waitFor(() => expect(answered).toHaveLength(1));
        expect(answered[0]).toContain('/pub-b/attempts/attempt-b/answers');
    });

    it('does not show one quiz as deleted, or with its changed state, on the results of another', async () => {
        const user = userEvent.setup();
        window.localStorage.setItem(
            'litterbox.published-quizzes',
            JSON.stringify([
                { publicToken: 'pub-a', teacherToken: 'teach-a', title: 'Quiz A', at: 2 },
                { publicToken: 'pub-b', teacherToken: 'teach-b', title: 'Quiz B', at: 1 },
            ]),
        );
        mockFetchRoutes({
            features: ['assessments'],
            routes: [
                {
                    when: (url) => url.endsWith('/api/v1/assessments/pub-a/results'),
                    respond: () =>
                        resultsBody({ title: 'Quiz A', totalAttempts: 0, questions: [] }),
                },
                {
                    when: (url) => url.endsWith('/api/v1/assessments/pub-b/results'),
                    respond: () =>
                        resultsBody({ title: 'Quiz B', totalAttempts: 0, questions: [] }),
                },
                {
                    when: (url, init) =>
                        url.endsWith('/api/v1/assessments/pub-a') && init?.method === 'DELETE',
                    respond: () => new Response(null, { status: 204 }),
                },
            ],
        });

        renderAtWithLink(
            '/quiz/pub-a/results#teacherToken=teach-a',
            '/quiz/pub-b/results#teacherToken=teach-b',
        );
        await user.click(await screen.findByRole('button', { name: 'Delete this quiz' }));
        await screen.findByRole('dialog');
        await user.click(
            within(
                (screen.getByRole('dialog').querySelector('.dialog-actions') ??
                    undefined) as HTMLElement,
            ).getByRole('button', { name: 'Delete this quiz' }),
        );
        await screen.findByText('This quiz and every answer to it have been deleted.');

        await user.click(
            screen.getByRole('button', { name: 'go to /quiz/pub-b/results#teacherToken=teach-b' }),
        );
        expect(await screen.findByText('Quiz B')).toBeInTheDocument();
        expect(
            screen.queryByText('This quiz and every answer to it have been deleted.'),
        ).not.toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Delete this quiz' })).toBeInTheDocument();
    });
});
