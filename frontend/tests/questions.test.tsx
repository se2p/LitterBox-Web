// SPDX-License-Identifier: EUPL-1.2
// SPDX-FileCopyrightText: 2025 LitterBox-Web contributors

import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { QuizCard } from '../src/components/single-project/QuizCard';
import i18n from '../src/i18n';
import { response, capabilitiesResponse } from './helpers';
import { renderAt } from './render';

vi.mock('../src/components/single-project/ScratchblocksPreview', () => ({
    ScratchblocksPreview: ({
        source,
        inline,
    }: {
        source: string | null | undefined;
        inline?: boolean;
    }) =>
        inline ? (
            <span aria-label={`Scratchblocks: ${source ?? ''}`} data-inline-source={source ?? ''}>
                {source}
            </span>
        ) : (
            <pre>{source}</pre>
        ),
}));

const result = ({
    sourceType = 'QUESTION_SCRATCH_URL',
    locale = 'en',
    inputFormat = '.sb3',
    quiz = [{ questionId: 'question-1', question: 'What is the answer?', options: ['A', 'B'] }],
}: {
    sourceType?: string;
    locale?: string;
    inputFormat?: string | null;
    quiz?: unknown[];
} = {}) =>
    response({
        schemaVersion: 1,
        submissionId: 44,
        token: 'question-token',
        status: 'completed',
        locale,
        sourceType,
        analysis: {
            id: 88,
            status: 'completed',
            name: 'synthetic-question-project.sb3',
            inputFormat,
            quiz,
            issues: [],
        },
        analyses: [],
        counts: { expected: 1, completed: 1, failed: 0 },
    });

describe('Questions workflow', () => {
    beforeEach(async () => {
        await i18n.changeLanguage('en');
        vi.restoreAllMocks();
        vi.stubGlobal('EventSource', undefined);
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('advertises exact qlc, submits a canonical URL, and records an answer without correctness', async () => {
        const user = userEvent.setup();
        const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
            const url = String(input);
            if (url.includes('/capabilities'))
                return Promise.resolve(capabilitiesResponse(['qlc']));
            if (url.includes('/question-submissions'))
                return Promise.resolve(
                    response(
                        {
                            submissionId: 44,
                            token: 'question-token',
                            status: 'queued',
                            location: '/questions/question-token',
                        },
                        202,
                    ),
                );
            if (url.includes('/quiz-answers')) return Promise.resolve(response(undefined, 204));
            if (url.includes('/submissions/question-token')) return Promise.resolve(result());
            return Promise.resolve(response({}, 404));
        });

        renderAt('/questions');
        expect(await screen.findByRole('link', { name: 'Ask me' })).toBeInTheDocument();
        // The Questions route is fetched when it is first asked for, so the form arrives a tick after the shell.
        const url = await screen.findByLabelText('Project link or number');
        await user.type(url, 'https://scratch.mit.edu/projects/12345/');
        await user.click(screen.getByRole('button', { name: 'Ask me about this project' }));

        await waitFor(() => expect(screen.getByText('What is the answer?')).toBeInTheDocument());
        const submissionCall = fetchMock.mock.calls.find(([input]) =>
            String(input).includes('/question-submissions'),
        );
        expect(submissionCall?.[1]).toEqual(
            expect.objectContaining({
                headers: expect.objectContaining({
                    'Accept-Language': 'en',
                    'Idempotency-Key': expect.any(String),
                }),
                body: JSON.stringify({ projectUrl: 'https://scratch.mit.edu/projects/12345/' }),
            }),
        );
        // One question at a time, and its own button. Nothing can be sent until something has been answered.
        expect(screen.getByRole('heading', { name: 'Question 1 of 1' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Send answer' })).toBeDisabled();
        expect(screen.getByRole('button', { name: 'See summary' })).toBeDisabled();

        await user.click(screen.getByRole('radio', { name: 'A' }));
        await user.click(screen.getByRole('button', { name: 'Send answer' }));
        await waitFor(() => expect(screen.getByText('Answer recorded.')).toBeInTheDocument());

        // This deployment records answers without saying which were right, so there is nothing to score.
        await user.click(screen.getByRole('button', { name: 'See summary' }));
        expect(screen.getByRole('heading', { name: 'Your score' })).toBeInTheDocument();
        expect(screen.getByText('Your answers were recorded.')).toBeInTheDocument();
        expect(screen.getByText('1 answer was recorded without being marked.')).toBeInTheDocument();
        const answerCall = fetchMock.mock.calls.find(([input]) =>
            String(input).includes('/quiz-answers'),
        );
        expect(answerCall?.[1]).toEqual(
            expect.objectContaining({
                method: 'POST',
                headers: expect.objectContaining({ Authorization: 'Bearer question-token' }),
                body: JSON.stringify({ questionId: 'question-1', answer: 'A' }),
            }),
        );
        expect(JSON.stringify(answerCall?.[1]?.body)).not.toContain('correct');
    });

    it.each([{ enabledFeatures: [] as string[] }, { enabledFeatures: ['question-generation'] }])(
        'shows an honest unavailable state and no Questions navigation for capabilities $enabledFeatures',
        async ({ enabledFeatures }) => {
            vi.spyOn(globalThis, 'fetch').mockResolvedValue(capabilitiesResponse(enabledFeatures));
            renderAt('/questions');
            expect(
                await screen.findByText('This service cannot ask you about a project.'),
            ).toBeInTheDocument();
            expect(screen.queryByRole('link', { name: 'Ask me' })).not.toBeInTheDocument();
        },
    );

    it('does not submit an invalid URL', async () => {
        const user = userEvent.setup();
        const fetchMock = vi
            .spyOn(globalThis, 'fetch')
            .mockResolvedValue(capabilitiesResponse(['qlc']));
        renderAt('/questions');
        const url = await screen.findByLabelText('Project link or number');
        await user.type(url, 'https://scratch.mit.edu/projects/not-a-number/');
        expect(screen.getByRole('button', { name: 'Ask me about this project' })).toBeDisabled();
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('does not present quiz data from an ordinary or empty result as Questions content', async () => {
        const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
            const url = String(input);
            if (url.includes('/capabilities'))
                return Promise.resolve(capabilitiesResponse(['qlc']));
            if (url.includes('/submissions/wrong-source'))
                return Promise.resolve(result({ sourceType: 'UPLOAD' }));
            return Promise.resolve(response({}, 404));
        });
        renderAt('/questions/wrong-source');
        expect(
            await screen.findByText('This link does not lead to a set of questions.'),
        ).toBeInTheDocument();
        expect(screen.queryByText('What is the answer?')).not.toBeInTheDocument();
        expect(fetchMock).toHaveBeenCalled();

        vi.restoreAllMocks();
        vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
            const url = String(input);
            if (url.includes('/capabilities'))
                return Promise.resolve(capabilitiesResponse(['qlc']));
            if (url.includes('/submissions/question-token'))
                return Promise.resolve(result({ quiz: [] }));
            return Promise.resolve(response({}, 404));
        });
        renderAt('/questions/question-token');
        expect(await screen.findByText('No questions for this project')).toBeInTheDocument();
    });

    it('stops polling and hides question content when a token is no longer valid', async () => {
        const eventSources: Array<{ onopen: (() => void) | null }> = [];
        class SyntheticEventSource {
            public onopen: (() => void) | null = null;
            public onmessage: (() => void) | null = null;
            public onerror: (() => void) | null = null;

            public constructor() {
                eventSources.push(this);
            }

            public addEventListener() {}
            public close() {}
        }
        vi.stubGlobal('EventSource', SyntheticEventSource);
        let statusCalls = 0;
        vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
            const url = String(input);
            if (url.includes('/capabilities'))
                return Promise.resolve(capabilitiesResponse(['qlc']));
            if (url.includes('/submissions/question-token')) {
                statusCalls += 1;
                return Promise.resolve(
                    statusCalls === 1
                        ? response({
                              token: 'question-token',
                              status: 'processing',
                              sourceType: 'QUESTION_UPLOAD',
                              analysis: null,
                              analyses: [],
                              counts: { expected: 1, completed: 0, failed: 0 },
                          })
                        : response({}, 410),
                );
            }
            return Promise.resolve(response({}, 404));
        });

        renderAt('/questions/question-token');
        expect(
            await screen.findByRole('heading', { name: 'Making your questions' }),
        ).toBeInTheDocument();
        await waitFor(() => expect(eventSources).toHaveLength(1));
        await act(async () => eventSources[0]?.onopen?.());

        expect(await screen.findByText('Invalid or expired submission token.')).toBeInTheDocument();
        expect(screen.queryByText('What is the answer?')).not.toBeInTheDocument();
    });

    it('renders rich question and choice text safely while submitting the exact option string', async () => {
        const user = userEvent.setup();
        const exactOption =
            '[i]Exact choice[/i] [sbi]move (10) steps[/sbi] <img src=x onerror=alert(1)>';
        const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
            const url = String(input);
            if (url.includes('/capabilities'))
                return Promise.resolve(capabilitiesResponse(['qlc']));
            if (url.includes('/submissions/question-token'))
                return Promise.resolve(
                    result({
                        quiz: [
                            {
                                questionId: 'rich-question',
                                question:
                                    '[b]What happens?[/b][newLine][var]score[/var] [TRUE] [sbi]when green flag clicked[/sbi] [unknown] [b]unclosed <script>alert(1)</script>',
                                options: [exactOption, exactOption, '[b]Second[/b]'],
                            },
                        ],
                    }),
                );
            if (url.includes('/quiz-answers')) return Promise.resolve(response(undefined, 204));
            return Promise.resolve(response({}, 404));
        });

        renderAt('/questions/question-token');
        expect(await screen.findByText('What happens?')).toBeInTheDocument();
        expect(document.querySelector('[data-inline-source="(score)"]')).toBeInTheDocument();
        expect(screen.getByText('TRUE')).toBeInTheDocument();
        expect(document.body.textContent).toContain('[b]unclosed <script>alert(1)</script>');
        const exactChoices = screen.getAllByRole('radio', { name: /Exact choice/ });
        expect(exactChoices).toHaveLength(2);
        expect(document.querySelector('.quiz-card select')).not.toBeInTheDocument();
        expect(document.querySelector('.quiz-card img, .quiz-card script')).not.toBeInTheDocument();

        await user.click(exactChoices[0]!);
        expect(exactChoices[0]).toBeChecked();
        expect(exactChoices[1]).not.toBeChecked();
        await user.click(screen.getByRole('button', { name: 'Send answer' }));
        await waitFor(() => expect(screen.getByText('Answer recorded.')).toBeInTheDocument());

        const answerCall = fetchMock.mock.calls.find(([input]) =>
            String(input).includes('/quiz-answers'),
        );
        expect(answerCall?.[1]).toEqual(
            expect.objectContaining({
                body: JSON.stringify({ questionId: 'rich-question', answer: exactOption }),
            }),
        );
        expect(screen.queryByText(/correct answer/i)).not.toBeInTheDocument();
    });

    it('keeps the answer and shows saving, recorded, and error feedback', async () => {
        const user = userEvent.setup();
        const fetchMock = vi.spyOn(globalThis, 'fetch');
        let resolveAnswer: ((value: Response) => void) | undefined;
        const answerPending = new Promise<Response>((resolve) => {
            resolveAnswer = resolve;
        });
        fetchMock.mockImplementation((input) => {
            const url = String(input);
            if (url.includes('/quiz-answers')) return answerPending;
            return Promise.resolve(
                url.includes('/submissions/question-token')
                    ? result({
                          quiz: [{ questionId: 'free-text', question: 'Explain it.', options: [] }],
                      })
                    : capabilitiesResponse(['qlc']),
            );
        });

        const firstRender = renderAt('/questions/question-token');
        const answer = await screen.findByRole('textbox', { name: 'Choose an answer' });
        await user.type(answer, 'A written answer');
        await user.click(screen.getByRole('button', { name: 'Send answer' }));
        expect(screen.getByRole('button', { name: 'Saving answer…' })).toBeInTheDocument();

        resolveAnswer?.(response(undefined, 204));
        await waitFor(() => expect(screen.getByText('Answer recorded.')).toBeInTheDocument());
        const answerCall = fetchMock.mock.calls.find(([input]) =>
            String(input).includes('/quiz-answers'),
        );
        expect(answerCall?.[1]).toEqual(
            expect.objectContaining({
                body: JSON.stringify({ questionId: 'free-text', answer: 'A written answer' }),
            }),
        );

        firstRender.unmount();
        vi.restoreAllMocks();
        vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
            const url = String(input);
            if (url.includes('/quiz-answers')) return Promise.resolve(response({}, 500));
            return Promise.resolve(
                url.includes('/submissions/question-token')
                    ? result({
                          quiz: [{ questionId: 'error', question: 'Try again.', options: ['A'] }],
                      })
                    : capabilitiesResponse(['qlc']),
            );
        });
        renderAt('/questions/question-token');
        await user.click(await screen.findByRole('radio', { name: 'A' }));
        await user.click(screen.getByRole('button', { name: 'Send answer' }));
        expect(await screen.findByRole('alert')).toHaveTextContent('Could not record the answer.');
        // The draft survives, so the same answer can be sent again once the reason has passed — and the reader
        // cannot walk past a question whose answer was never taken.
        expect(screen.getByRole('radio', { name: 'A' })).toBeChecked();
        expect(screen.getByRole('button', { name: 'Send answer' })).toBeEnabled();
        expect(screen.getByRole('button', { name: 'See summary' })).toBeDisabled();
    });

    it('supports native radio keyboard selection and all supported locales', async () => {
        const user = userEvent.setup();
        const keyboardRender = render(
            <QuizCard
                analysisId={88}
                token="question-token"
                question={{
                    questionId: 'keyboard',
                    question: '[TRUE] [FALSE]',
                    options: ['A', 'B'],
                    questionType: 'MULTIPLE_CHOICE',
                    typeDeclared: true,
                    expectedAnswers: 1,
                }}
                questionNumber={2}
                locale="en"
            />,
        );

        const radios = screen.getAllByRole('radio');
        expect(radios[0]).toHaveAttribute('type', 'radio');
        expect(radios[0]).toHaveAttribute('name', radios[1]?.getAttribute('name'));
        await user.tab();
        expect(radios[0]).toHaveFocus();
        await user.keyboard('{Space}');
        expect(radios[0]).toHaveFocus();
        keyboardRender.unmount();

        const terms = {
            en: ['TRUE', 'FALSE', 'Question 2'],
            de: ['WAHR', 'FALSCH', 'Frage 2'],
            es: ['VERDADERO', 'FALSO', 'Pregunta 2'],
            nl: ['WAAR', 'ONWAAR', 'Vraag 2'],
        } as const;
        for (const [locale, expected] of Object.entries(terms)) {
            await i18n.changeLanguage(locale);
            const { unmount } = render(
                <QuizCard
                    analysisId={88}
                    token="question-token"
                    question={{
                        questionId: `locale-${locale}`,
                        question: '[TRUE] [FALSE]',
                        options: [],
                        questionType: 'FREE_TEXT',
                        typeDeclared: true,
                        expectedAnswers: 1,
                    }}
                    questionNumber={2}
                    locale={locale}
                />,
            );
            expected.forEach((text) => expect(screen.getByText(text)).toBeInTheDocument());
            unmount();
        }
    });

    it('tells the reader whether the answer was right and what was expected', async () => {
        const user = userEvent.setup();
        vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
            const url = String(input);
            if (url.includes('/capabilities'))
                return Promise.resolve(capabilitiesResponse(['qlc']));
            if (url.includes('/quiz-answers'))
                return Promise.resolve(
                    response({ questionId: 'graded', correct: false, correctAnswers: ['B'] }),
                );
            return Promise.resolve(
                result({
                    quiz: [
                        {
                            questionId: 'graded',
                            question: 'Which one?',
                            options: ['A', 'B'],
                            questionType: 'MULTIPLE_CHOICE',
                            expectedAnswers: 1,
                        },
                    ],
                }),
            );
        });

        renderAt('/questions/question-token');
        await user.click(await screen.findByRole('radio', { name: 'A' }));
        await user.click(screen.getByRole('button', { name: 'Send answer' }));

        // The verdict arrives against this question, before there is any next question to read.
        expect(await screen.findByText('Not quite.')).toBeInTheDocument();
        const expected = screen.getByText('The expected answer was:').parentElement!;
        expect(expected).toHaveTextContent('B');
        // Answering it is over, so the answer key cannot be probed by guessing again.
        expect(screen.queryByRole('button', { name: 'Send answer' })).not.toBeInTheDocument();
        expect(screen.getByRole('radio', { name: 'A' })).toBeDisabled();

        await user.click(screen.getByRole('button', { name: 'See summary' }));
        expect(document.querySelector('.questions-score-value')?.textContent).toBe('0/1');
        expect(screen.getByText('0 of 1 correct.')).toBeInTheDocument();
        expect(screen.queryByText(/recorded without being marked/)).not.toBeInTheDocument();
    });

    it('lets a reader look at the project code, sprite by sprite, while answering', async () => {
        const user = userEvent.setup();
        let targetRequests = 0;
        vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
            const url = String(input);
            if (url.includes('/capabilities'))
                return Promise.resolve(capabilitiesResponse(['qlc', 'program-export']));
            if (url.includes('/export-targets')) {
                targetRequests += 1;
                return Promise.resolve(
                    new Response(
                        JSON.stringify({
                            sprites: [
                                { name: 'Stage', stage: true },
                                { name: 'Cat', stage: false },
                            ],
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
            return Promise.resolve(
                result({
                    quiz: [
                        {
                            questionId: 'scripts',
                            question: 'How many scripts does Stage have?',
                            options: [],
                            questionType: 'NUMBER',
                            sprite: 'Cat',
                            expectedAnswers: 1,
                        },
                    ],
                }),
            );
        });

        renderAt('/questions/question-token');
        // Nothing is fetched until the reader asks: most questions carry the script they are about.
        const code = await screen.findByText('Look at the code');
        expect(targetRequests).toBe(0);

        await user.click(code);
        // The Stage comes first, and it is not this question's sprite: several of the questions ask which
        // sprite a script belongs to, and opening on the answer would give it away.
        expect(await screen.findByRole('combobox', { name: 'Sprite' })).toHaveValue('Stage');
        expect(screen.getByText('Stage has no scripts.')).toBeInTheDocument();
        expect(targetRequests).toBe(1);

        await user.selectOptions(screen.getByRole('combobox', { name: 'Sprite' }), 'Cat');
        expect(screen.getByText(/move \(10\) steps/)).toBeInTheDocument();
        expect(screen.queryByText('Stage has no scripts.')).not.toBeInTheDocument();
        // Read once and kept: switching sprites is a question about what already arrived.
        expect(targetRequests).toBe(1);
    });

    it('asks the service again when a reader retries the project code', async () => {
        const user = userEvent.setup();
        let targetRequests = 0;
        vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
            const url = String(input);
            if (url.includes('/capabilities'))
                return Promise.resolve(capabilitiesResponse(['qlc', 'program-export']));
            if (url.includes('/export-targets')) {
                targetRequests += 1;
                // The first attempt fails, so the reader is offered the retry that this is about.
                if (targetRequests === 1)
                    return Promise.resolve(new Response(null, { status: 503 }));
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
            return Promise.resolve(result());
        });

        renderAt('/questions/question-token');
        await user.click(await screen.findByText('Look at the code'));
        await screen.findByRole('button', { name: 'Retry' });
        expect(targetRequests).toBe(1);

        // The fold is already open and stays open, so a retry that only resets the state would sit there
        // waiting for a toggle that is never coming.
        await user.click(screen.getByRole('button', { name: 'Retry' }));
        expect(await screen.findByRole('combobox', { name: 'Sprite' })).toHaveValue('Cat');
        expect(targetRequests).toBe(2);
    });

    it('offers no project code when the service cannot hand any back', async () => {
        vi.spyOn(globalThis, 'fetch').mockImplementation((input) =>
            Promise.resolve(
                String(input).includes('/capabilities') ? capabilitiesResponse(['qlc']) : result(),
            ),
        );

        renderAt('/questions/question-token');
        await screen.findByText('What is the answer?');
        expect(screen.queryByText('Look at the code')).not.toBeInTheDocument();
    });

    it('marks each question on the summary and goes straight back to it', async () => {
        const user = userEvent.setup();
        vi.spyOn(globalThis, 'fetch').mockImplementation((input, init) => {
            const url = String(input);
            if (url.includes('/capabilities'))
                return Promise.resolve(capabilitiesResponse(['qlc']));
            if (url.includes('/quiz-answers')) {
                const body = String((init as RequestInit | undefined)?.body ?? '');
                return Promise.resolve(
                    body.includes('"right"')
                        ? response({ questionId: 'right', correct: true, correctAnswers: ['A'] })
                        : response({ questionId: 'wrong', correct: false, correctAnswers: ['D'] }),
                );
            }
            return Promise.resolve(
                result({
                    quiz: [
                        {
                            questionId: 'right',
                            question: 'Which one?',
                            options: ['A', 'B'],
                            questionType: 'MULTIPLE_CHOICE',
                            expectedAnswers: 1,
                        },
                        {
                            questionId: 'wrong',
                            question: 'Which other?',
                            options: ['C', 'D'],
                            questionType: 'MULTIPLE_CHOICE',
                            expectedAnswers: 1,
                        },
                    ],
                }),
            );
        });

        renderAt('/questions/question-token');
        await user.click(await screen.findByRole('radio', { name: 'A' }));
        await user.click(screen.getByRole('button', { name: 'Send answer' }));
        await screen.findByText('Correct!');
        await user.click(screen.getByRole('button', { name: 'Next question' }));
        await user.click(await screen.findByRole('radio', { name: 'C' }));
        await user.click(screen.getByRole('button', { name: 'Send answer' }));
        await screen.findByText('Not quite.');
        await user.click(screen.getByRole('button', { name: 'See summary' }));

        // The list says how each question went, so the reader can see which one to reread without opening any.
        const review = document.querySelectorAll('.learner-quiz-review li');
        expect(review).toHaveLength(2);
        expect(review[0]).toHaveClass('learner-quiz-review-correct');
        expect(review[0]?.textContent).toContain('Correct!');
        expect(review[1]).toHaveClass('learner-quiz-review-incorrect');
        expect(review[1]?.textContent).toContain('Not quite.');

        // Opening one from the list offers the way back, which used to be as many presses as questions left.
        await user.click(screen.getByRole('button', { name: /Question 1/ }));
        await waitFor(() =>
            expect(screen.getByRole('heading', { name: 'Question 1 of 2' })).toHaveFocus(),
        );
        await user.click(screen.getByRole('button', { name: 'Back to summary' }));
        expect(screen.getByRole('heading', { name: 'Your score' })).toBeInTheDocument();
    });

    it('moves through a set one question at a time, and back again', async () => {
        const user = userEvent.setup();
        vi.spyOn(globalThis, 'fetch').mockImplementation((input, init) => {
            const url = String(input);
            if (url.includes('/capabilities'))
                return Promise.resolve(capabilitiesResponse(['qlc']));
            if (url.includes('/quiz-answers')) {
                // The generated options include whole scripts, and one of them is longer than an answer may be.
                const body = String((init as RequestInit | undefined)?.body ?? '');
                return Promise.resolve(
                    body.includes('"too-long"')
                        ? response({}, 400)
                        : response({ questionId: 'short', correct: true, correctAnswers: ['A'] }),
                );
            }
            return Promise.resolve(
                result({
                    quiz: [
                        {
                            questionId: 'short',
                            question: 'Which one?',
                            options: ['A', 'B'],
                            questionType: 'MULTIPLE_CHOICE',
                            expectedAnswers: 1,
                        },
                        {
                            questionId: 'too-long',
                            question: 'Which script?',
                            options: ['C', 'D'],
                            questionType: 'MULTIPLE_CHOICE',
                            expectedAnswers: 1,
                        },
                    ],
                }),
            );
        });

        renderAt('/questions/question-token');
        await screen.findByRole('heading', { name: 'Question 1 of 2' });
        // Only the current question is exposed; the second one is out of the accessibility tree entirely.
        expect(screen.queryByRole('radio', { name: 'C' })).not.toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Previous question' })).toBeDisabled();

        await user.click(screen.getByRole('radio', { name: 'A' }));
        await user.click(screen.getByRole('button', { name: 'Send answer' }));
        await screen.findByText('Correct!');
        await user.click(screen.getByRole('button', { name: 'Next question' }));

        // Moving lands the reader on the heading that says where they now are.
        const second = screen.getByRole('heading', { name: 'Question 2 of 2' });
        await waitFor(() => expect(second).toHaveFocus());
        expect(screen.queryByRole('radio', { name: 'A' })).not.toBeInTheDocument();

        // The service refuses this one. The reader cannot move past it, and the draft survives.
        await user.click(screen.getByRole('radio', { name: 'C' }));
        await user.click(screen.getByRole('button', { name: 'Send answer' }));
        expect(await screen.findByRole('alert')).toHaveTextContent('Could not record the answer.');
        expect(screen.getByRole('button', { name: 'See summary' })).toBeDisabled();

        // Back to the first question, which still shows the answer that was given and its verdict.
        await user.click(screen.getByRole('button', { name: 'Previous question' }));
        await waitFor(() =>
            expect(screen.getByRole('heading', { name: 'Question 1 of 2' })).toHaveFocus(),
        );
        expect(screen.getByRole('radio', { name: 'A' })).toBeChecked();
        expect(screen.getByText('Correct!')).toBeInTheDocument();
    });

    it('offers a control that matches each question type', async () => {
        const user = userEvent.setup();
        const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
            const url = String(input);
            if (url.includes('/capabilities'))
                return Promise.resolve(capabilitiesResponse(['qlc']));
            if (url.includes('/quiz-answers'))
                return Promise.resolve(
                    response({ questionId: 'many', correct: true, correctAnswers: [] }),
                );
            return Promise.resolve(
                result({
                    quiz: [
                        {
                            questionId: 'many',
                            question: 'Which of these?',
                            options: ['A', 'B', 'C'],
                            questionType: 'MULTIPLE_CHOICE',
                            expectedAnswers: 2,
                        },
                        {
                            questionId: 'yesno',
                            question: 'Is it so?',
                            options: [],
                            questionType: 'YES_NO',
                            expectedAnswers: 1,
                        },
                        {
                            questionId: 'number',
                            question: 'How many?',
                            options: [],
                            questionType: 'NUMBER',
                            expectedAnswers: 1,
                        },
                    ],
                }),
            );
        });

        renderAt('/questions/question-token');
        // Several correct answers means several boxes to tick, not a single choice.
        const boxes = await screen.findAllByRole('checkbox');
        expect(boxes).toHaveLength(3);
        expect(screen.getByText('Choose 2 answers')).toBeInTheDocument();

        await user.click(boxes[0]!);
        await user.click(boxes[2]!);
        await user.click(screen.getByRole('button', { name: 'Send answer' }));
        // One verdict region, belonging to the question being answered: the cards that are not current are
        // hidden, so no earlier result is announced again alongside this one.
        await waitFor(() => expect(document.querySelectorAll('.quiz-feedback')).toHaveLength(1));
        expect(document.querySelector('.quiz-feedback')?.textContent).toContain('Correct!');

        // Exactly one request per answer taken, and the backend reads a multiple selection as a pipe-separated list.
        const answerCalls = fetchMock.mock.calls.filter(([target]) =>
            String(target).includes('/quiz-answers'),
        );
        expect(answerCalls).toHaveLength(1);
        expect(answerCalls[0]?.[1]).toEqual(
            expect.objectContaining({
                body: JSON.stringify({ questionId: 'many', answer: 'A|C' }),
            }),
        );

        // Yes and no arrive without options; the page has to offer them itself.
        await user.click(screen.getByRole('button', { name: 'Next question' }));
        expect(screen.getByRole('radio', { name: 'yes' })).toBeInTheDocument();
        expect(screen.getByRole('radio', { name: 'no' })).toBeInTheDocument();
        await user.click(screen.getByRole('radio', { name: 'yes' }));
        await user.click(screen.getByRole('button', { name: 'Send answer' }));
        // Still one verdict region on the page, now the second question's.
        await waitFor(() => expect(document.querySelectorAll('.quiz-feedback')).toHaveLength(2));
        expect(screen.getAllByRole('status')).toHaveLength(2);

        await user.click(screen.getByRole('button', { name: 'Next question' }));
        expect(screen.getByRole('spinbutton')).toBeInTheDocument();
    });

    it("does not name the sprite on the reader's own card", async () => {
        vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
            const url = String(input);
            if (url.includes('/capabilities'))
                return Promise.resolve(capabilitiesResponse(['qlc']));
            return Promise.resolve(
                result({
                    quiz: [
                        {
                            questionId: 'whose',
                            question: 'Which sprite does this script belong to?',
                            options: ['Papagei', 'Milch'],
                            questionType: 'MULTIPLE_CHOICE',
                            sprite: 'Papagei',
                            expectedAnswers: 1,
                        },
                    ],
                }),
            );
        });

        renderAt('/questions/question-token');
        await screen.findByText('Which sprite does this script belong to?');
        // The sprite is the answer to this very question, so it must not be printed above it.
        expect(document.querySelector('.quiz-sprite')).not.toBeInTheDocument();
    });

    it('shows a teacher every question against the block model', async () => {
        vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
            const url = String(input);
            if (url.includes('/capabilities'))
                return Promise.resolve(capabilitiesResponse(['qlc', 'teacher-archive']));
            return Promise.resolve(
                result({
                    quiz: Array.from({ length: 14 }, (_, index) => ({
                        questionId: `q-${index}`,
                        question: `Question ${index}`,
                        options: [],
                        questionType: index % 2 === 0 ? 'FREE_TEXT' : 'NUMBER',
                        programDimension: 'PURPOSE',
                        scopeOfFocus: 'MACRO',
                        expectedAnswers: 1,
                    })),
                }),
            );
        });

        renderAt('/teacher/questions/question-token');

        expect(await screen.findByText('Block model coverage')).toBeInTheDocument();
        // The learner's page caps at ten; a teacher sees the whole set.
        expect(screen.getAllByRole('heading', { name: /^Question \d+$/ })).toHaveLength(14);
        expect(
            screen.getByRole('heading', { name: 'Purpose / Macro 14 questions' }),
        ).toBeInTheDocument();
        expect(screen.getByRole('radio', { name: 'Free text (7)' })).toBeInTheDocument();
    });

    it('puts no free-text question to a learner and every one to a teacher', async () => {
        const mixed = () =>
            result({
                quiz: [
                    {
                        questionId: 'q-text',
                        question: 'What is this script for?',
                        options: [],
                        questionType: 'FREE_TEXT',
                        expectedAnswers: 1,
                    },
                    {
                        questionId: 'q-number',
                        question: 'How many sprites?',
                        options: [],
                        questionType: 'NUMBER',
                        expectedAnswers: 1,
                    },
                ],
            });
        vi.spyOn(globalThis, 'fetch').mockImplementation((input) =>
            Promise.resolve(
                String(input).includes('/capabilities')
                    ? capabilitiesResponse(['qlc', 'teacher-archive'])
                    : mixed(),
            ),
        );

        // Marking free text reads a child's phrasing rather than their understanding, and fails by telling
        // someone who was right that they were wrong.
        const learner = renderAt('/questions/question-token');
        expect(await screen.findByText('How many sprites?')).toBeInTheDocument();
        expect(screen.queryByText('What is this script for?')).not.toBeInTheDocument();
        learner.unmount();

        // A teacher is reading the questions, not being marked on them, so nothing is withheld.
        renderAt('/teacher/questions/question-token');
        expect(await screen.findByText('What is this script for?')).toBeInTheDocument();
        expect(screen.getByText('How many sprites?')).toBeInTheDocument();
    });

    it('says what is missing when every generated question is free text', async () => {
        vi.spyOn(globalThis, 'fetch').mockImplementation((input) =>
            Promise.resolve(
                String(input).includes('/capabilities')
                    ? capabilitiesResponse(['qlc'])
                    : result({
                          quiz: [
                              {
                                  questionId: 'q-text',
                                  question: 'What is this script for?',
                                  options: [],
                                  questionType: 'FREE_TEXT',
                                  expectedAnswers: 1,
                              },
                          ],
                      }),
            ),
        );

        renderAt('/questions/question-token');

        // Questions were generated. Saying none were would be untrue, and no answer request is made.
        expect(await screen.findByText('No questions to answer here')).toBeInTheDocument();
        expect(screen.queryByText('No questions for this project')).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: /Check/ })).not.toBeInTheDocument();
    });

    it('narrows the question set from the block model grid it is reported in', async () => {
        const user = userEvent.setup();
        const cells = [
            { dimension: 'TEXT', scope: 'ATOM' },
            { dimension: 'TEXT', scope: 'BLOCK' },
            { dimension: 'PURPOSE', scope: 'MACRO' },
        ] as const;
        vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
            const url = String(input);
            if (url.includes('/capabilities'))
                return Promise.resolve(capabilitiesResponse(['qlc', 'teacher-archive']));
            return Promise.resolve(
                result({
                    quiz: cells.flatMap((cell, cellIndex) =>
                        Array.from({ length: cellIndex + 1 }, (_, index) => ({
                            questionId: `q-${cellIndex}-${index}`,
                            question: `Question ${cellIndex}-${index}`,
                            options: [],
                            questionType: 'FREE_TEXT',
                            programDimension: cell.dimension,
                            scopeOfFocus: cell.scope,
                            expectedAnswers: 1,
                        })),
                    ),
                }),
            );
        });

        renderAt('/teacher/questions/question-token');
        await screen.findByText('Block model coverage');
        expect(screen.getByText('Showing 6 of 6 questions.')).toBeInTheDocument();

        // A single cell: the one place a dimension and a scope meet.
        await user.click(screen.getByRole('button', { name: 'Text and Block, 2 questions' }));
        expect(screen.getByText('Showing 2 of 6 questions.')).toBeInTheDocument();
        expect(screen.getAllByRole('heading', { name: /^Question \d+$/ })).toHaveLength(2);
        expect(screen.getByText('Question 1-0')).toBeInTheDocument();
        expect(screen.queryByText('Question 0-0')).not.toBeInTheDocument();

        // A whole row: one dimension across every scope.
        await user.click(screen.getByRole('button', { name: 'Text, every scope, 3 questions' }));
        expect(screen.getByText('Showing 3 of 6 questions.')).toBeInTheDocument();

        // A whole column, and then the same column again, which is how a reader puts the set back.
        await user.click(
            screen.getByRole('button', { name: 'Macro, every dimension, 3 questions' }),
        );
        expect(screen.getByText('Showing 3 of 6 questions.')).toBeInTheDocument();
        expect(screen.getByText('Question 2-2')).toBeInTheDocument();
        expect(screen.queryByText('Question 0-0')).not.toBeInTheDocument();
        await user.click(
            screen.getByRole('button', { name: 'Macro, every dimension, 3 questions' }),
        );
        expect(screen.getByText('Showing 6 of 6 questions.')).toBeInTheDocument();

        // A cell no question falls into cannot be chosen, so no filter can empty the page by accident.
        expect(
            screen.getByRole('button', { name: 'Execution and Atom, 0 questions' }),
        ).toBeDisabled();
    });
});
