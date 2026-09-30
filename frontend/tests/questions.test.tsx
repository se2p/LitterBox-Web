// SPDX-License-Identifier: EUPL-1.2
// SPDX-FileCopyrightText: 2025 LitterBox-Web contributors

import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { cwd } from 'node:process';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { QuizCard } from '../src/components/single-project/QuizCard';
import { questionSummaryText } from '../src/components/questions/question-summary';
import i18n from '../src/i18n';
import { response, capabilitiesResponse, mockFetchRoutes } from './helpers';
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

/**
 * What a download button hands the browser, captured the way jsdom's own Blob cannot be read back: a synthetic
 * Blob records exactly what it was built from, and the anchor click that would otherwise try to navigate the
 * whole document to a `blob:` URL is stubbed instead of followed.
 */
const captureDownloads = (): { written: string[]; clicks: ReturnType<typeof vi.spyOn> } => {
    const written: string[] = [];
    class CapturingBlob {
        public constructor(parts: string[]) {
            written.push(parts.join(''));
        }
    }
    vi.stubGlobal('Blob', CapturingBlob);
    URL.createObjectURL = () => 'blob:synthetic-assessment';
    URL.revokeObjectURL = () => undefined;
    const clicks = vi
        .spyOn(HTMLAnchorElement.prototype, 'click')
        .mockImplementation(() => undefined);
    return { written, clicks };
};

describe('shared field styling', () => {
    // Computed layout is not meaningful here: jsdom never runs layout, so nothing gives a `<textarea>` a real
    // height or border to inspect. The rule itself is what every field in the quiz editor — and every other
    // `.form-field` textarea the app has, the contact-style ones included — depends on, so this reads the
    // stylesheet directly rather than asserting on a computed style jsdom would only ever fake.
    it('styles every textarea inside a .form-field the same way as its inputs and selects', () => {
        const css = readFileSync(resolve(cwd(), 'src', 'styles', 'components.css'), 'utf8');

        expect(css).toMatch(
            /\.form-field input,\s*\n\s*\.form-field select,\s*\n\s*\.form-field textarea,/,
        );
        expect(css).toMatch(/\.form-field textarea\s*{[^}]*min-height:\s*5\.5rem/);
        expect(css).toMatch(/\.form-field textarea\s*{[^}]*resize:\s*vertical/);
    });
});

describe('Questions workflow', () => {
    beforeEach(async () => {
        await i18n.changeLanguage('en');
        vi.restoreAllMocks();
        vi.stubGlobal('EventSource', undefined);
        // jsdom has no layout, so it never implements scrolling; a fresh spy each test is what lets a test
        // that adds a question assert it was carried into view rather than merely not crashing.
        Element.prototype.scrollIntoView = vi.fn();
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('advertises exact qlc, submits a canonical URL, and records an answer without correctness', async () => {
        const user = userEvent.setup();
        const fetchMock = mockFetchRoutes({
            features: ['qlc'],
            routes: [
                {
                    when: (url) => url.includes('/question-submissions'),
                    respond: () =>
                        response(
                            {
                                submissionId: 44,
                                token: 'question-token',
                                status: 'queued',
                                location: '/questions/question-token',
                            },
                            202,
                        ),
                },
                {
                    when: (url) => url.includes('/quiz-answers'),
                    respond: () => response(undefined, 204),
                },
                {
                    when: (url) => url.includes('/submissions/question-token'),
                    respond: () => result(),
                },
            ],
        });

        renderAt('/questions');
        expect(await screen.findByRole('link', { name: 'Ask me' })).toBeInTheDocument();
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
        expect(screen.getByRole('heading', { name: 'Question 1 of 1' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Send answer' })).toBeDisabled();
        expect(screen.getByRole('button', { name: 'See summary' })).toBeDisabled();

        await user.click(screen.getByRole('radio', { name: 'A' }));
        await user.click(screen.getByRole('button', { name: 'Send answer' }));
        await waitFor(() => expect(screen.getByText('Answer recorded.')).toBeInTheDocument());

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
        const fetchMock = mockFetchRoutes({
            features: ['qlc'],
            routes: [
                {
                    when: (url) => url.includes('/submissions/wrong-source'),
                    respond: () => result({ sourceType: 'UPLOAD' }),
                },
            ],
        });
        renderAt('/questions/wrong-source');
        expect(
            await screen.findByText('This link does not lead to a set of questions.'),
        ).toBeInTheDocument();
        expect(screen.queryByText('What is the answer?')).not.toBeInTheDocument();
        expect(fetchMock).toHaveBeenCalled();

        vi.restoreAllMocks();
        mockFetchRoutes({
            features: ['qlc'],
            routes: [
                {
                    when: (url) => url.includes('/submissions/question-token'),
                    respond: () => result({ quiz: [] }),
                },
            ],
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
        const fetchMock = mockFetchRoutes({
            features: ['qlc'],
            routes: [
                {
                    when: (url) => url.includes('/submissions/question-token'),
                    respond: () =>
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
                },
                {
                    when: (url) => url.includes('/quiz-answers'),
                    respond: () => response(undefined, 204),
                },
            ],
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
        expect(screen.getByRole('radio', { name: 'A' })).toBeChecked();
        expect(screen.getByRole('button', { name: 'Send answer' })).toBeEnabled();
        expect(screen.getByRole('button', { name: 'See summary' })).toBeDisabled();
    });

    it('supports native radio keyboard selection and all supported locales', async () => {
        const user = userEvent.setup();
        const keyboardRender = render(
            <QuizCard
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
                submitAnswer={() => Promise.resolve(undefined)}
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
                    submitAnswer={() => Promise.resolve(undefined)}
                />,
            );
            expected.forEach((text) => expect(screen.getByText(text)).toBeInTheDocument());
            unmount();
        }
    });

    it('tells the reader whether the answer was right and what was expected', async () => {
        const user = userEvent.setup();
        mockFetchRoutes({
            features: ['qlc'],
            routes: [
                {
                    when: (url) => url.includes('/quiz-answers'),
                    respond: () =>
                        response({ questionId: 'graded', correct: false, correctAnswers: ['B'] }),
                },
            ],
            fallback: () =>
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
        });

        renderAt('/questions/question-token');
        await user.click(await screen.findByRole('radio', { name: 'A' }));
        await user.click(screen.getByRole('button', { name: 'Send answer' }));

        expect(await screen.findByText('Not quite.')).toBeInTheDocument();
        const expected = screen.getByText('The expected answer was:').parentElement!;
        expect(expected).toHaveTextContent('B');
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

        await user.click(screen.getByRole('button', { name: 'Retry' }));
        expect(await screen.findByRole('combobox', { name: 'Sprite' })).toHaveValue('Cat');
        expect(targetRequests).toBe(2);
    });

    it('offers no project code when the service cannot hand any back', async () => {
        mockFetchRoutes({
            features: ['qlc'],
            fallback: () => result(),
        });

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

        const review = document.querySelectorAll('.learner-quiz-review li');
        expect(review).toHaveLength(2);
        expect(review[0]).toHaveClass('learner-quiz-review-correct');
        expect(review[0]?.textContent).toContain('Correct!');
        expect(review[1]).toHaveClass('learner-quiz-review-incorrect');
        expect(review[1]?.textContent).toContain('Not quite.');

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
        expect(screen.queryByRole('radio', { name: 'C' })).not.toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Previous question' })).toBeDisabled();

        await user.click(screen.getByRole('radio', { name: 'A' }));
        await user.click(screen.getByRole('button', { name: 'Send answer' }));
        await screen.findByText('Correct!');
        await user.click(screen.getByRole('button', { name: 'Next question' }));

        const second = screen.getByRole('heading', { name: 'Question 2 of 2' });
        await waitFor(() => expect(second).toHaveFocus());
        expect(screen.queryByRole('radio', { name: 'A' })).not.toBeInTheDocument();

        await user.click(screen.getByRole('radio', { name: 'C' }));
        await user.click(screen.getByRole('button', { name: 'Send answer' }));
        expect(await screen.findByRole('alert')).toHaveTextContent('Could not record the answer.');
        expect(screen.getByRole('button', { name: 'See summary' })).toBeDisabled();

        await user.click(screen.getByRole('button', { name: 'Previous question' }));
        await waitFor(() =>
            expect(screen.getByRole('heading', { name: 'Question 1 of 2' })).toHaveFocus(),
        );
        expect(screen.getByRole('radio', { name: 'A' })).toBeChecked();
        expect(screen.getByText('Correct!')).toBeInTheDocument();
    });

    it('offers a control that matches each question type', async () => {
        const user = userEvent.setup();
        const fetchMock = mockFetchRoutes({
            features: ['qlc'],
            routes: [
                {
                    when: (url) => url.includes('/quiz-answers'),
                    respond: () =>
                        response({ questionId: 'many', correct: true, correctAnswers: [] }),
                },
            ],
            fallback: () =>
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
        });

        renderAt('/questions/question-token');
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
        await waitFor(() => expect(document.querySelectorAll('.quiz-feedback')).toHaveLength(2));
        expect(screen.getAllByRole('status')).toHaveLength(2);

        await user.click(screen.getByRole('button', { name: 'Next question' }));
        expect(screen.getByRole('spinbutton')).toBeInTheDocument();
    });

    it("does not name the sprite on the reader's own card", async () => {
        mockFetchRoutes({
            features: ['qlc'],
            fallback: () =>
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
        });

        renderAt('/questions/question-token');
        await screen.findByText('Which sprite does this script belong to?');
        expect(document.querySelector('.quiz-sprite')).not.toBeInTheDocument();
    });

    it('shows a teacher every question against the block model', async () => {
        mockFetchRoutes({
            features: ['qlc', 'teacher-archive'],
            fallback: () =>
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
        });

        const user = userEvent.setup();
        renderAt('/teacher/questions/question-token');

        expect(await screen.findByText('Filter by block model')).toBeInTheDocument();
        expect(
            screen.getByRole('button', { name: 'Purpose and Macro, 14 questions' }),
        ).toBeInTheDocument();
        expect(screen.getByRole('radio', { name: 'Free text (7)' })).toBeInTheDocument();

        await user.click(screen.getByRole('button', { name: 'Select shown questions' }));
        expect(screen.getAllByRole('heading', { name: /^Question \d+$/ })).toHaveLength(14);
    });

    it('lets a teacher curate, edit, and extend an assessment without changing the generated bank', async () => {
        const user = userEvent.setup();
        mockFetchRoutes({
            features: ['qlc', 'teacher-archive'],
            fallback: () =>
                result({
                    quiz: [
                        {
                            questionId: 'q-first',
                            question: 'What starts the script?',
                            options: ['The flag', 'A click'],
                            questionType: 'MULTIPLE_CHOICE',
                            programDimension: 'TEXT',
                            scopeOfFocus: 'ATOM',
                            expectedAnswers: 1,
                        },
                        {
                            questionId: 'q-second',
                            question: 'Why does it repeat?',
                            options: [],
                            questionType: 'FREE_TEXT',
                            programDimension: 'PURPOSE',
                            scopeOfFocus: 'MACRO',
                            expectedAnswers: 1,
                        },
                    ],
                }),
        });

        renderAt('/teacher/questions/question-token');
        expect(await screen.findByText('Build a quiz from these questions')).toBeInTheDocument();
        expect(
            screen.getByText('0 of 12 block-model cells covered by the selected questions.'),
        ).toBeInTheDocument();
        const bankSelection = screen.getByText('0 of 2 selected.');
        expect(bankSelection).toBeInTheDocument();
        expect(bankSelection).toHaveClass('assessment-bank-selection-summary');
        expect(bankSelection.nextElementSibling).toHaveClass('teacher-questions-coverage');

        await user.click(screen.getByRole('button', { name: 'Select shown questions' }));
        expect(screen.getByText(/2 of 2 selected/)).toBeInTheDocument();
        const coveredCells = screen.getByText('Covered cells:').closest('div') as HTMLElement;
        expect(within(coveredCells).getByText('Text / Atom')).toBeInTheDocument();
        expect(within(coveredCells).getByText('Purpose / Macro')).toBeInTheDocument();

        await user.click(screen.getByRole('button', { name: /Question 2 details/ }));
        await user.click(screen.getByRole('button', { name: 'Edit question 2' }));
        const questionText = screen.getByRole('textbox', { name: 'Question text' });
        await user.clear(questionText);
        await user.type(questionText, 'Explain why this loop repeats.');
        await user.type(
            screen.getByRole('textbox', { name: 'Answer or marking guidance' }),
            'Names the repeat block and its count.',
        );
        expect(questionText).toHaveValue('Explain why this loop repeats.');
        await user.click(screen.getByRole('button', { name: 'Close editor' }));

        await user.click(screen.getByRole('checkbox', { name: 'Include question 1 in quiz' }));
        expect(
            screen.getByText('1 of 12 block-model cells covered by the selected questions.'),
        ).toBeInTheDocument();
        expect(screen.getByText('1 of 2 selected.')).toBeInTheDocument();
        expect(screen.getByRole('heading', { name: 'Question 1' })).toBeInTheDocument();
        expect(screen.queryByRole('heading', { name: 'Question 2' })).not.toBeInTheDocument();

        expect(screen.getByRole('heading', { name: 'Text / Atom 1 question' })).toBeInTheDocument();

        const addButton = screen.getByRole('button', { name: 'Add your own question' });
        await user.click(addButton);

        expect(
            screen.getByText('1 of 12 block-model cells covered by the selected questions.'),
        ).toBeInTheDocument();
        expect(screen.getByText('2 of 3 selected.')).toBeInTheDocument();
        expect(screen.getByText('Added by teacher — not marked automatically')).toBeInTheDocument();
        const newQuestionText = screen.getByRole('textbox', { name: 'Question text' });
        expect(newQuestionText).toHaveValue('Write your question here.');
        // A question added at the bottom of the quiz is otherwise indistinguishable from one that was always
        // there: it has to be carried into view and focused to be unmistakable, and announced for a reader who
        // cannot see either happen — naming the position it actually landed in, not the length of every draft
        // this analysis ever generated.
        expect(newQuestionText).toHaveFocus();
        expect(Element.prototype.scrollIntoView).toHaveBeenCalled();
        expect(await screen.findByText('Question 2 added. Editing it below.')).toBeInTheDocument();
        expect(screen.getByRole('heading', { name: 'Question 2' })).toBeInTheDocument();

        expect(screen.getByRole('button', { name: 'Download printable quiz' })).toBeEnabled();
        expect(screen.getByRole('button', { name: 'Download teacher copy' })).toBeEnabled();
        expect(screen.getByRole('button', { name: 'Download editable JSON' })).toBeEnabled();

        await user.click(screen.getByRole('button', { name: /Question details/ }));
        expect(screen.getAllByRole('button', { name: 'Restore generated question' })).toHaveLength(
            2,
        );
    });

    it('numbers the three section cards 1, 2 and 3', async () => {
        mockFetchRoutes({
            features: ['qlc', 'teacher-archive'],
            fallback: () =>
                result({
                    quiz: [
                        {
                            questionId: 'q-first',
                            question: 'What starts the script?',
                            options: ['The flag', 'A click'],
                            questionType: 'MULTIPLE_CHOICE',
                            expectedAnswers: 1,
                        },
                    ],
                }),
        });

        renderAt('/teacher/questions/question-token');
        await screen.findByText('Build a quiz from these questions');

        const badges = Array.from(
            document.querySelectorAll('.section-card > .section-card-heading'),
        ).map((heading) => heading.getAttribute('data-section-number'));
        expect(badges).toEqual(['1', '2', '3']);
        expect(screen.getByRole('heading', { name: 'Your quiz' })).toBeInTheDocument();
        expect(screen.getByRole('heading', { name: 'Question bank' })).toBeInTheDocument();
        expect(screen.getByRole('heading', { name: 'Name and publish' })).toBeInTheDocument();
    });

    it('opens with an empty quiz and every generated question waiting in the bank', async () => {
        mockFetchRoutes({
            features: ['qlc', 'teacher-archive'],
            fallback: () =>
                result({
                    quiz: [
                        {
                            questionId: 'q-first',
                            question: 'What starts the script?',
                            options: ['The flag', 'A click'],
                            questionType: 'MULTIPLE_CHOICE',
                            programDimension: 'TEXT',
                            scopeOfFocus: 'ATOM',
                            expectedAnswers: 1,
                        },
                        {
                            questionId: 'q-second',
                            question: 'Why does it repeat?',
                            options: [],
                            questionType: 'FREE_TEXT',
                            programDimension: 'PURPOSE',
                            scopeOfFocus: 'MACRO',
                            expectedAnswers: 1,
                        },
                    ],
                }),
        });

        renderAt('/teacher/questions/question-token');
        await screen.findByText('Build a quiz from these questions');

        expect(
            screen.getByText('0 of 12 block-model cells covered by the selected questions.'),
        ).toBeInTheDocument();
        expect(screen.getByText('0 of 2 selected.')).toBeInTheDocument();
        expect(
            screen.getByText(
                'Your quiz is empty. Add questions from the bank below, or write your own.',
            ),
        ).toBeInTheDocument();
        expect(screen.queryByRole('heading', { name: /^Question \d+$/ })).not.toBeInTheDocument();

        expect(screen.getByRole('heading', { name: 'Text / Atom 1 question' })).toBeInTheDocument();
        expect(
            screen.getByRole('heading', { name: 'Purpose / Macro 1 question' }),
        ).toBeInTheDocument();
        expect(
            screen.getByRole('button', { name: 'Add "What starts the script?" to the quiz' }),
        ).toBeInTheDocument();
        expect(
            screen.queryByRole('checkbox', { name: 'Add "What starts the script?" to the quiz' }),
        ).not.toBeInTheDocument();

        expect(
            screen.getByText('Select at least one question before you can export or publish.'),
        ).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Download printable quiz' })).toBeDisabled();
        expect(screen.getByRole('button', { name: 'Download teacher copy' })).toBeDisabled();
        expect(screen.getByRole('button', { name: 'Download editable JSON' })).toBeDisabled();
        expect(screen.getByRole('group', { name: 'Export quiz' })).toBeInTheDocument();
    });

    it('does not deselect quiz questions when the bank has no visible questions', async () => {
        const user = userEvent.setup();
        mockFetchRoutes({
            features: ['qlc', 'teacher-archive'],
            fallback: () =>
                result({
                    quiz: [
                        {
                            questionId: 'q-first',
                            question: 'What starts the script?',
                            options: ['The flag', 'A click'],
                            questionType: 'MULTIPLE_CHOICE',
                            expectedAnswers: 1,
                        },
                        {
                            questionId: 'q-second',
                            question: 'Why does it repeat?',
                            options: [],
                            questionType: 'FREE_TEXT',
                            expectedAnswers: 1,
                        },
                    ],
                }),
        });

        renderAt('/teacher/questions/question-token');
        await screen.findByText('Build a quiz from these questions');
        await user.click(screen.getByRole('button', { name: 'Select shown questions' }));
        await user.click(screen.getByRole('button', { name: 'Deselect shown questions' }));

        expect(screen.getByText(/2 of 2 selected/)).toBeInTheDocument();
        expect(screen.getByRole('heading', { name: 'Question 1' })).toBeInTheDocument();
        expect(screen.getByRole('heading', { name: 'Question 2' })).toBeInTheDocument();
    });

    it('moves a question earlier or later in the quiz, renumbering it and reordering the exported payload', async () => {
        const user = userEvent.setup();
        mockFetchRoutes({
            features: ['qlc', 'teacher-archive'],
            fallback: () =>
                result({
                    quiz: [
                        {
                            questionId: 'q-a',
                            question: 'Question A',
                            options: [],
                            questionType: 'FREE_TEXT',
                            expectedAnswers: 1,
                        },
                        {
                            questionId: 'q-b',
                            question: 'Question B',
                            options: [],
                            questionType: 'FREE_TEXT',
                            expectedAnswers: 1,
                        },
                        {
                            questionId: 'q-c',
                            question: 'Question C',
                            options: [],
                            questionType: 'FREE_TEXT',
                            expectedAnswers: 1,
                        },
                    ],
                }),
        });
        const { written } = captureDownloads();
        const quizOrder = () =>
            Array.from(document.querySelectorAll('.assessment-question-summary')).map(
                (element) => element.textContent,
            );

        renderAt('/teacher/questions/question-token');
        await screen.findByText('Build a quiz from these questions');
        await user.click(screen.getByRole('button', { name: 'Select shown questions' }));
        expect(quizOrder()).toEqual(['Question A', 'Question B', 'Question C']);
        expect(screen.getByRole('button', { name: 'Move question 1 earlier' })).toBeDisabled();

        await user.click(screen.getByRole('button', { name: 'Move question 2 earlier' }));
        expect(
            await screen.findByText('Question moved earlier. Now question 1.'),
        ).toBeInTheDocument();
        expect(quizOrder()).toEqual(['Question B', 'Question A', 'Question C']);

        expect(screen.getByRole('button', { name: 'Move question 3 later' })).toBeDisabled();

        await user.click(screen.getByRole('button', { name: 'Move question 2 later' }));
        expect(
            await screen.findByText('Question moved later. Now question 3.'),
        ).toBeInTheDocument();
        expect(quizOrder()).toEqual(['Question B', 'Question C', 'Question A']);

        await user.click(screen.getByRole('button', { name: 'Download editable JSON' }));
        await waitFor(() => expect(written).toHaveLength(1));
        const exported = JSON.parse(written[0]!) as { questions: { question: string }[] };
        expect(exported.questions.map((question) => question.question)).toEqual([
            'Question B',
            'Question C',
            'Question A',
        ]);
    });

    it('adds a bank question to the end of the quiz, and removes it from the bank', async () => {
        const user = userEvent.setup();
        mockFetchRoutes({
            features: ['qlc', 'teacher-archive'],
            fallback: () =>
                result({
                    quiz: [
                        {
                            questionId: 'q-first',
                            question: 'Kept in the quiz',
                            options: [],
                            questionType: 'FREE_TEXT',
                            programDimension: 'TEXT',
                            scopeOfFocus: 'ATOM',
                            expectedAnswers: 1,
                        },
                        {
                            questionId: 'q-second',
                            question: 'Starts in the bank',
                            options: [],
                            questionType: 'FREE_TEXT',
                            programDimension: 'PURPOSE',
                            scopeOfFocus: 'MACRO',
                            expectedAnswers: 1,
                        },
                    ],
                }),
        });

        renderAt('/teacher/questions/question-token');
        await screen.findByText('Build a quiz from these questions');

        await user.click(
            screen.getByRole('button', { name: 'Add "Kept in the quiz" to the quiz' }),
        );
        expect(
            screen.getByRole('heading', { name: 'Purpose / Macro 1 question' }),
        ).toBeInTheDocument();

        await user.click(
            screen.getByRole('button', { name: 'Add "Starts in the bank" to the quiz' }),
        );

        expect(
            screen.getByText('2 of 12 block-model cells covered by the selected questions.'),
        ).toBeInTheDocument();
        expect(screen.getByText('2 of 2 selected.')).toBeInTheDocument();
        expect(
            screen.queryByRole('heading', { name: 'Purpose / Macro 1 question' }),
        ).not.toBeInTheDocument();
        expect(
            screen.getByText('Every generated question is already in your quiz.'),
        ).toBeInTheDocument();
        expect(screen.getByRole('heading', { name: 'Question 2' })).toBeInTheDocument();
        const quizSummaries = document.querySelectorAll('.assessment-question-summary');
        expect(quizSummaries[quizSummaries.length - 1]?.textContent).toBe('Starts in the bank');
    });

    it('returns an unticked quiz question to the bank, grouped by its block-model cell', async () => {
        const user = userEvent.setup();
        mockFetchRoutes({
            features: ['qlc', 'teacher-archive'],
            fallback: () =>
                result({
                    quiz: [
                        {
                            questionId: 'q-first',
                            question: 'Stays selected',
                            options: [],
                            questionType: 'FREE_TEXT',
                            programDimension: 'TEXT',
                            scopeOfFocus: 'ATOM',
                            expectedAnswers: 1,
                        },
                        {
                            questionId: 'q-second',
                            question: 'Goes to the bank',
                            options: [],
                            questionType: 'FREE_TEXT',
                            programDimension: 'PURPOSE',
                            scopeOfFocus: 'MACRO',
                            expectedAnswers: 1,
                        },
                    ],
                }),
        });

        renderAt('/teacher/questions/question-token');
        await screen.findByText('Build a quiz from these questions');

        await user.click(screen.getByRole('button', { name: 'Select shown questions' }));
        expect(
            screen.getByText('Every generated question is already in your quiz.'),
        ).toBeInTheDocument();

        await user.click(screen.getByRole('checkbox', { name: 'Include question 2 in quiz' }));

        expect(
            screen.getByText('1 of 12 block-model cells covered by the selected questions.'),
        ).toBeInTheDocument();
        expect(screen.getByText('1 of 2 selected.')).toBeInTheDocument();
        expect(
            screen.queryByText('Every generated question is already in your quiz.'),
        ).not.toBeInTheDocument();
        expect(screen.queryByRole('heading', { name: 'Question 2' })).not.toBeInTheDocument();
        expect(
            screen.getByRole('heading', { name: 'Purpose / Macro 1 question' }),
        ).toBeInTheDocument();
        expect(
            screen.getByRole('button', { name: 'Add "Goes to the bank" to the quiz' }),
        ).toBeInTheDocument();
    });

    it('fetches the correct answer for the teacher copy only, and prints it beside the generated question', async () => {
        const user = userEvent.setup();
        const answerKeyRequests: string[] = [];
        vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
            const url = String(input);
            if (url.includes('/capabilities'))
                return Promise.resolve(capabilitiesResponse(['qlc', 'teacher-archive']));
            if (url.includes('/quiz-answer-key')) {
                answerKeyRequests.push(url);
                return Promise.resolve(
                    response({
                        schemaVersion: 1,
                        questions: [{ questionId: 'q-first', correctAnswers: ['The flag'] }],
                    }),
                );
            }
            return Promise.resolve(
                result({
                    quiz: [
                        {
                            questionId: 'q-first',
                            question: 'What starts the script?',
                            options: ['The flag', 'A click'],
                            questionType: 'MULTIPLE_CHOICE',
                            expectedAnswers: 1,
                        },
                    ],
                }),
            );
        });
        const { written } = captureDownloads();

        renderAt('/teacher/questions/question-token');
        expect(await screen.findByText('Build a quiz from these questions')).toBeInTheDocument();
        await user.click(screen.getByRole('button', { name: 'Select shown questions' }));

        // A learner's page never receives a correct answer, and neither does the request for one: the printable
        // student quiz is built and downloaded without ever asking the service for the answer key.
        await user.click(screen.getByRole('button', { name: 'Download printable quiz' }));
        await waitFor(() => expect(written).toHaveLength(1));
        expect(answerKeyRequests).toHaveLength(0);
        expect(written[0]).not.toContain('Correct answer');

        await user.click(screen.getByRole('button', { name: 'Download teacher copy' }));
        await waitFor(() => expect(written).toHaveLength(2));
        expect(answerKeyRequests).toHaveLength(1);
        expect(written[1]).toContain('<strong>Correct answer</strong>');
        expect(written[1]).toContain('<li>The flag</li>');
        expect(screen.queryByText(/could not be loaded/)).not.toBeInTheDocument();
    });

    /**
     * A browser that cannot make an object URL — an embedded webview, mostly — used to throw here while the
     * three other download sites in this application degraded politely. The teacher is told, the same way they
     * are told about a file that failed to build: either way no file arrived.
     */
    it('says the download could not be prepared when the browser cannot hand a file over at all', async () => {
        const user = userEvent.setup();
        mockFetchRoutes({
            features: ['qlc', 'teacher-archive'],
            fallback: () =>
                result({
                    quiz: [
                        {
                            questionId: 'q-first',
                            question: 'What starts the script?',
                            options: ['The flag', 'A click'],
                            questionType: 'MULTIPLE_CHOICE',
                            expectedAnswers: 1,
                        },
                    ],
                }),
        });
        const clicks = vi
            .spyOn(HTMLAnchorElement.prototype, 'click')
            .mockImplementation(() => undefined);
        // Absent rather than failing, which is what an embedded webview without blob URLs actually looks like.
        // Only this one method is taken away: replacing `URL` wholesale would take the constructor the locale
        // packs are fetched through with it.
        const made = Object.getOwnPropertyDescriptor(URL, 'createObjectURL');
        Reflect.deleteProperty(URL, 'createObjectURL');
        try {
            renderAt('/teacher/questions/question-token');
            expect(
                await screen.findByText('Build a quiz from these questions'),
            ).toBeInTheDocument();
            await user.click(screen.getByRole('button', { name: 'Select shown questions' }));
            await user.click(screen.getByRole('button', { name: 'Download editable JSON' }));

            expect(
                await screen.findByText('The quiz download could not be prepared. Try again.'),
            ).toBeInTheDocument();
            expect(clicks).not.toHaveBeenCalled();
        } finally {
            if (made) Object.defineProperty(URL, 'createObjectURL', made);
        }
    });

    it('still downloads a guidance-only teacher copy, and says so, when the answer key cannot be fetched', async () => {
        const user = userEvent.setup();
        vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
            const url = String(input);
            if (url.includes('/capabilities'))
                return Promise.resolve(capabilitiesResponse(['qlc', 'teacher-archive']));
            // The same 404 the service gives for an analysis this token no longer owns — deliberately
            // indistinguishable from one that never existed, and either way not a reason to lose the download.
            if (url.includes('/quiz-answer-key')) return Promise.resolve(response({}, 404));
            return Promise.resolve(
                result({
                    quiz: [
                        {
                            questionId: 'q-first',
                            question: 'What starts the script?',
                            options: ['The flag', 'A click'],
                            questionType: 'MULTIPLE_CHOICE',
                            expectedAnswers: 1,
                        },
                    ],
                }),
            );
        });
        const { written } = captureDownloads();

        renderAt('/teacher/questions/question-token');
        expect(await screen.findByText('Build a quiz from these questions')).toBeInTheDocument();
        await user.click(screen.getByRole('button', { name: 'Select shown questions' }));
        await user.click(screen.getByRole('button', { name: 'Download teacher copy' }));

        await waitFor(() => expect(written).toHaveLength(1));
        expect(written[0]).not.toContain('Correct answer');
        expect(written[0]).toContain('No answer or marking guidance was added.');
        expect(
            await screen.findByText(
                'The correct answers could not be loaded for this download. The teacher copy still downloaded, with your own guidance only.',
            ),
        ).toBeInTheDocument();
    });

    it('still downloads a guidance-only teacher copy, and says so, when the answer key does not match its contract', async () => {
        const user = userEvent.setup();
        mockFetchRoutes({
            features: ['qlc', 'teacher-archive'],
            routes: [
                {
                    when: (url) => url.includes('/quiz-answer-key'),
                    respond: () =>
                        response({
                            schemaVersion: 1,
                            questions: [{ questionId: 'q-first', correctAnswers: 'The flag' }],
                        }),
                },
            ],
            fallback: () =>
                result({
                    quiz: [
                        {
                            questionId: 'q-first',
                            question: 'What starts the script?',
                            options: ['The flag', 'A click'],
                            questionType: 'MULTIPLE_CHOICE',
                            expectedAnswers: 1,
                        },
                    ],
                }),
        });
        const { written } = captureDownloads();

        renderAt('/teacher/questions/question-token');
        expect(await screen.findByText('Build a quiz from these questions')).toBeInTheDocument();
        await user.click(screen.getByRole('button', { name: 'Select shown questions' }));
        await user.click(screen.getByRole('button', { name: 'Download teacher copy' }));

        await waitFor(() => expect(written).toHaveLength(1));
        expect(written[0]).not.toContain('The flag');
        expect(written[0]).not.toContain('Correct answer');
        expect(
            await screen.findByText(
                'The correct answers could not be loaded for this download. The teacher copy still downloaded, with your own guidance only.',
            ),
        ).toBeInTheDocument();
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
        mockFetchRoutes({
            features: ['qlc', 'teacher-archive'],
            fallback: () => mixed(),
        });

        const learner = renderAt('/questions/question-token');
        expect(await screen.findByText('How many sprites?')).toBeInTheDocument();
        expect(screen.queryByText('What is this script for?')).not.toBeInTheDocument();
        learner.unmount();

        renderAt('/teacher/questions/question-token');
        expect(await screen.findByText('What is this script for?')).toBeInTheDocument();
        expect(screen.getByText('How many sprites?')).toBeInTheDocument();
    });

    it('says what is missing when every generated question is free text', async () => {
        mockFetchRoutes({
            features: ['qlc'],
            fallback: () =>
                result({
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
        });

        renderAt('/questions/question-token');

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
        mockFetchRoutes({
            features: ['qlc', 'teacher-archive'],
            fallback: () =>
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
        });

        renderAt('/teacher/questions/question-token');
        await screen.findByText('Filter by block model');
        expect(screen.getByText('Showing 6 of 6 questions.')).toBeInTheDocument();

        expect(
            screen.getByText('0 of 12 block-model cells covered by the selected questions.'),
        ).toBeInTheDocument();
        expect(screen.getByText('0 of 6 selected.')).toBeInTheDocument();

        await user.click(screen.getByRole('button', { name: 'Text and Block, 2 questions' }));
        expect(screen.getByText('Showing 2 of 6 questions.')).toBeInTheDocument();
        expect(document.querySelectorAll('.assessment-question')).toHaveLength(2);
        expect(screen.getByText('Question 1-0')).toBeInTheDocument();
        expect(screen.queryByText('Question 0-0')).not.toBeInTheDocument();

        await user.click(screen.getByRole('button', { name: 'Text, every scope, 3 questions' }));
        expect(screen.getByText('Showing 3 of 6 questions.')).toBeInTheDocument();

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

        expect(
            screen.getByRole('button', { name: 'Execution and Atom, 0 questions' }),
        ).toBeDisabled();
    });

    it("previews a generated question with the platform's own inline markup, and keeps raw HTML inert", async () => {
        const user = userEvent.setup();
        const richHintQuestion =
            '[b]A loop[/b] runs [i]twice[/i] with [bc]repeat[/bc]. ' +
            '[sbi]move (10) steps[/sbi] and <img src=x onerror=alert(1)>';
        mockFetchRoutes({
            features: ['qlc', 'teacher-archive'],
            fallback: () =>
                result({
                    quiz: [
                        {
                            questionId: 'q-first',
                            question: richHintQuestion,
                            options: ['A'],
                            questionType: 'FREE_TEXT',
                            expectedAnswers: 1,
                        },
                    ],
                }),
        });

        renderAt('/teacher/questions/question-token');
        await user.click(await screen.findByRole('button', { name: 'Select shown questions' }));
        await user.click(screen.getByRole('button', { name: /Question 1 details/ }));
        await user.click(screen.getByRole('button', { name: 'Edit question 1' }));

        expect(
            screen.getAllByText(
                'Formatting is written the way it is everywhere on this site: [b]bold[/b], [i]italic[/i], [bc]code[/bc]. The preview below is what this turns into.',
            ).length,
        ).toBeGreaterThan(0);
        const preview = document.querySelector('.assessment-preview');
        expect(preview).not.toBeNull();
        expect(preview!.querySelector('strong')?.textContent).toBe('A loop');
        expect(preview!.querySelector('em')?.textContent).toBe('twice');
        expect(preview!.querySelector('code')?.textContent).toBe('repeat');
        expect(preview!.querySelector('[data-inline-source="move (10) steps"]')).not.toBeNull();
        expect(preview!.querySelector('img')).toBeNull();
        expect(preview!.textContent).toContain('<img src=x onerror=alert(1)>');
    });

    /**
     * The class reads every question through the same renderer, whoever wrote it. Previewing a teacher's own
     * words through a second syntax showed them bold where the class would meet asterisks, and asterisks where
     * the class would meet bold.
     */
    it('previews an authored question with the same markup the class will read it in, and never turns raw HTML into markup', async () => {
        const user = userEvent.setup();
        mockFetchRoutes({
            features: ['qlc', 'teacher-archive'],
            fallback: () =>
                result({
                    quiz: [
                        {
                            questionId: 'q-first',
                            question: 'What starts the script?',
                            options: ['The flag', 'A click'],
                            questionType: 'MULTIPLE_CHOICE',
                            expectedAnswers: 1,
                        },
                    ],
                }),
        });

        renderAt('/teacher/questions/question-token');
        await user.click(await screen.findByRole('button', { name: 'Add your own question' }));

        const questionText = screen.getByRole('textbox', { name: 'Question text' });
        const authoredQuestion =
            'A [i]loop[/i] runs [b]twice[/b] with [bc]repeat[/bc]. ' +
            '**Not bold** and <img src=x onerror=alert(1)>';
        // Typed via a change event rather than `user.type`: the source itself uses the square brackets
        // `user.type` would otherwise read as its own key syntax.
        fireEvent.change(questionText, { target: { value: authoredQuestion } });

        // The same hint sits under the answer guide too, so this checks the field it actually belongs to — the
        // one holding the question text just typed — rather than assuming there is only one.
        expect(
            screen.getAllByText(
                'Formatting is written the way it is everywhere on this site: [b]bold[/b], [i]italic[/i], [bc]code[/bc]. The preview below is what this turns into.',
            ).length,
        ).toBeGreaterThan(0);
        const preview = document.querySelector('.assessment-preview');
        expect(preview).not.toBeNull();
        expect(preview!.querySelector('em')?.textContent).toBe('loop');
        expect(preview!.querySelector('strong')?.textContent).toBe('twice');
        expect(preview!.querySelector('code')?.textContent).toBe('repeat');
        // Markdown is not a second syntax here any more: its markers are characters, exactly as the class sees
        // them. HTML in the source is text too, never parsed markup.
        expect(preview!.textContent).toContain('**Not bold**');
        expect(preview!.querySelector('img')).toBeNull();
        expect(preview!.textContent).toContain('<img src=x onerror=alert(1)>');
    });

    /**
     * Pressing Enter is the plainest formatting a teacher has, and it used to be the one the preview dropped:
     * a raw newline reached the renderer as text and was folded away by ordinary HTML whitespace rules. It is a
     * line break in the preview now, which is the same break the printed sheet and the class's screen draw.
     */
    it('keeps the line breaks a teacher typed in the question and answer-guide previews', async () => {
        const user = userEvent.setup();
        mockFetchRoutes({
            features: ['qlc', 'teacher-archive'],
            fallback: () =>
                result({
                    quiz: [
                        {
                            questionId: 'q-first',
                            question: 'What starts the script?',
                            options: ['The flag', 'A click'],
                            questionType: 'MULTIPLE_CHOICE',
                            expectedAnswers: 1,
                        },
                    ],
                }),
        });

        renderAt('/teacher/questions/question-token');
        await user.click(await screen.findByRole('button', { name: 'Add your own question' }));

        // Change events rather than `user.type`, whose own key syntax would read the newlines as commands.
        fireEvent.change(screen.getByRole('textbox', { name: 'Question text' }), {
            target: { value: 'Read the script.\nThen say what it does.' },
        });
        fireEvent.change(screen.getByRole('textbox', { name: 'Answer or marking guidance' }), {
            target: { value: 'Look for the repeat.\n\nOne mark for naming the counter.' },
        });

        // Two previews, in the order the fields appear: the question text, then the guidance under it.
        const [questionPreview, guidePreview] = Array.from(
            document.querySelectorAll('.assessment-preview'),
        );
        expect(questionPreview!.querySelectorAll('br')).toHaveLength(1);
        expect(questionPreview!.textContent).toContain('Read the script.');
        expect(questionPreview!.textContent).toContain('Then say what it does.');
        // A blank line is two breaks, the same reading the exported sheet gives it.
        expect(guidePreview!.querySelectorAll('br')).toHaveLength(2);
        expect(guidePreview!.textContent).toContain('One mark for naming the counter.');
    });

    it('imports a previously exported JSON file, replacing the current draft and keeping restore where the source still matches', async () => {
        const user = userEvent.setup();
        mockFetchRoutes({
            features: ['qlc', 'teacher-archive'],
            fallback: () =>
                result({
                    quiz: [
                        {
                            questionId: 'q-first',
                            question: 'What starts the script?',
                            options: ['The flag', 'A click'],
                            questionType: 'MULTIPLE_CHOICE',
                            programDimension: 'TEXT',
                            scopeOfFocus: 'ATOM',
                            expectedAnswers: 1,
                        },
                    ],
                }),
        });

        renderAt('/teacher/questions/question-token');
        await screen.findByText('Build a quiz from these questions');

        const payload = JSON.stringify({
            kind: 'litterbox-assessment',
            schemaVersion: 1,
            title: 'Imported title',
            instructions: 'Imported instructions',
            questions: [
                {
                    id: 'generated-0-q-first',
                    sourceQuestionId: 'q-first',
                    source: 'generated',
                    question: 'What starts the script (edited)?',
                    questionType: 'MULTIPLE_CHOICE',
                    options: ['The flag', 'A click'],
                    expectedAnswers: 1,
                    answerGuide: 'The flag',
                },
                {
                    id: 'teacher-9',
                    source: 'teacher',
                    question: 'A brand new teacher question.',
                    questionType: 'FREE_TEXT',
                    options: [],
                    expectedAnswers: 1,
                },
            ],
        });
        const file = new File([payload], 'assessment.json', { type: 'application/json' });

        await user.upload(screen.getByLabelText('Import from JSON'), file);

        expect(
            await screen.findByText(
                'Loaded 2 questions from the file. This replaced the current draft.',
            ),
        ).toBeInTheDocument();
        expect(screen.getByDisplayValue('Imported title')).toBeInTheDocument();
        expect(screen.getByText('What starts the script (edited)?')).toBeInTheDocument();
        expect(screen.getByText('A brand new teacher question.')).toBeInTheDocument();
        await user.click(screen.getByRole('button', { name: /Question 1 details/ }));
        await user.click(screen.getByRole('button', { name: /Question 2 details/ }));
        expect(screen.getAllByRole('button', { name: 'Restore generated question' })).toHaveLength(
            1,
        );
    });

    it('imports a file with every one of its questions already selected, unlike a freshly generated bank', async () => {
        const user = userEvent.setup();
        mockFetchRoutes({
            features: ['qlc', 'teacher-archive'],
            fallback: () =>
                result({
                    quiz: [
                        {
                            questionId: 'q-first',
                            question: 'What starts the script?',
                            options: ['The flag', 'A click'],
                            questionType: 'MULTIPLE_CHOICE',
                            expectedAnswers: 1,
                        },
                    ],
                }),
        });

        renderAt('/teacher/questions/question-token');
        await screen.findByText('Build a quiz from these questions');
        expect(
            screen.getByText('0 of 12 block-model cells covered by the selected questions.'),
        ).toBeInTheDocument();
        expect(screen.getByText('0 of 1 selected.')).toBeInTheDocument();

        const payload = JSON.stringify({
            kind: 'litterbox-assessment',
            schemaVersion: 1,
            title: 'Imported title',
            instructions: 'Imported instructions',
            questions: [
                {
                    id: 'teacher-1',
                    source: 'teacher',
                    question: 'A file already carries a quiz.',
                    questionType: 'FREE_TEXT',
                    options: [],
                    expectedAnswers: 1,
                },
                {
                    id: 'teacher-2',
                    source: 'teacher',
                    question: 'A second question from the same file.',
                    questionType: 'FREE_TEXT',
                    options: [],
                    expectedAnswers: 1,
                },
            ],
        });
        const file = new File([payload], 'assessment.json', { type: 'application/json' });
        await user.upload(screen.getByLabelText('Import from JSON'), file);

        expect(
            await screen.findByText(
                'Loaded 2 questions from the file. This replaced the current draft.',
            ),
        ).toBeInTheDocument();
        expect(
            screen.getByText('0 of 12 block-model cells covered by the selected questions.'),
        ).toBeInTheDocument();
        expect(screen.getByText('2 of 2 selected.')).toBeInTheDocument();
        expect(screen.getByRole('heading', { name: 'Question 1' })).toBeInTheDocument();
        expect(screen.getByRole('heading', { name: 'Question 2' })).toBeInTheDocument();
    });

    it('shows a clear message and leaves the draft untouched when an imported file is not a LitterBox assessment', async () => {
        const user = userEvent.setup();
        mockFetchRoutes({
            features: ['qlc', 'teacher-archive'],
            fallback: () =>
                result({
                    quiz: [
                        {
                            questionId: 'q-first',
                            question: 'What starts the script?',
                            options: [],
                            questionType: 'FREE_TEXT',
                            expectedAnswers: 1,
                        },
                    ],
                }),
        });
        renderAt('/teacher/questions/question-token');
        await screen.findByText('Build a quiz from these questions');

        const file = new File(['not json at all'], 'broken.json', { type: 'application/json' });
        await user.upload(screen.getByLabelText('Import from JSON'), file);

        expect(
            await screen.findByText(
                'This file could not be read as a LitterBox quiz. Choose a JSON file exported from here.',
            ),
        ).toBeInTheDocument();
        expect(screen.getByText('What starts the script?')).toBeInTheDocument();
    });

    it('refuses an oversized assessment file before reading it', async () => {
        const user = userEvent.setup();
        mockFetchRoutes({
            features: ['qlc', 'teacher-archive'],
            fallback: () =>
                result({
                    quiz: [
                        {
                            questionId: 'q-first',
                            question: 'What starts the script?',
                            options: [],
                            questionType: 'FREE_TEXT',
                            expectedAnswers: 1,
                        },
                    ],
                }),
        });

        renderAt('/teacher/questions/question-token');
        await screen.findByText('Build a quiz from these questions');
        const file = new File(['x'.repeat(4_000_001)], 'too-large.json', {
            type: 'application/json',
        });
        await user.upload(screen.getByLabelText('Import from JSON'), file);

        expect(
            await screen.findByText(
                'This file is too big to be a LitterBox quiz. Choose a JSON file exported from here.',
            ),
        ).toBeInTheDocument();
        expect(screen.getByText('What starts the script?')).toBeInTheDocument();
    });

    it('keeps a question collapsed until its row is opened, unmounting its blocks and options along the way', async () => {
        const user = userEvent.setup();
        mockFetchRoutes({
            features: ['qlc', 'teacher-archive'],
            fallback: () =>
                result({
                    quiz: [
                        {
                            questionId: 'q-first',
                            question: 'What starts the script?',
                            options: ['The flag', 'A click'],
                            questionType: 'MULTIPLE_CHOICE',
                            scratchBlocks: 'when green flag clicked\nmove (10) steps\n',
                            hint: 'Look at the top block.',
                            programDimension: 'TEXT',
                            scopeOfFocus: 'ATOM',
                            expectedAnswers: 1,
                        },
                    ],
                }),
        });

        renderAt('/teacher/questions/question-token');
        await screen.findByText('Build a quiz from these questions');
        await user.click(screen.getByRole('button', { name: 'Select shown questions' }));

        expect(screen.getByText('What starts the script?')).toBeInTheDocument();
        expect(screen.queryByText('Look at the top block.')).not.toBeInTheDocument();
        expect(screen.queryByText('The flag')).not.toBeInTheDocument();
        expect(document.querySelector('.quiz-question-code')).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'Edit question 1' })).not.toBeInTheDocument();

        const toggle = screen.getByRole('button', { name: /Question 1 details/ });
        expect(toggle).toHaveAttribute('aria-expanded', 'false');

        await user.click(toggle);

        expect(toggle).toHaveAttribute('aria-expanded', 'true');
        expect(screen.getByText('Look at the top block.')).toBeInTheDocument();
        expect(screen.getByText('The flag')).toBeInTheDocument();
        expect(document.querySelector('.quiz-question-code pre')).toHaveTextContent(
            'when green flag clicked',
        );
        expect(screen.getByRole('button', { name: 'Edit question 1' })).toBeInTheDocument();

        await user.click(toggle);
        expect(screen.queryByText('The flag')).not.toBeInTheDocument();
        expect(document.querySelector('.quiz-question-code')).not.toBeInTheDocument();

        await user.click(toggle);
        expect(document.querySelector('.quiz-question-code pre')).toHaveTextContent(
            'when green flag clicked',
        );
    });

    it('keeps the row labelled by its question once opened, instead of only while collapsed', async () => {
        const user = userEvent.setup();
        const longQuestion =
            'Explain what happens when the green flag is clicked and the cat sprite moves ten steps to the right before turning fifteen degrees clockwise and stopping.';
        mockFetchRoutes({
            features: ['qlc', 'teacher-archive'],
            fallback: () =>
                result({
                    quiz: [
                        {
                            questionId: 'q-first',
                            question: longQuestion,
                            options: [],
                            questionType: 'FREE_TEXT',
                            expectedAnswers: 1,
                        },
                    ],
                }),
        });

        renderAt('/teacher/questions/question-token');
        await screen.findByText('Build a quiz from these questions');
        await user.click(screen.getByRole('button', { name: 'Select shown questions' }));

        const label = document.querySelector('.assessment-question-summary');
        expect(label).not.toBeNull();
        expect(label!.textContent).not.toBe(longQuestion);
        expect(label!.textContent!.length).toBeLessThan(longQuestion.length);
        expect(label!.textContent).toMatch(/…$/);
        const collapsedLabelText = label!.textContent;

        const toggle = screen.getByRole('button', { name: /Question 1 details/ });
        await user.click(toggle);

        expect(document.querySelector('.assessment-question-summary')?.textContent).toBe(
            collapsedLabelText,
        );
        expect(screen.getByText(longQuestion)).toBeInTheDocument();
    });

    it('adds from a bank action button, then toggles quiz inclusion without expanding its row', async () => {
        const user = userEvent.setup();
        mockFetchRoutes({
            features: ['qlc', 'teacher-archive'],
            fallback: () =>
                result({
                    quiz: [
                        {
                            questionId: 'q-first',
                            question: 'What starts the script?',
                            options: ['The flag', 'A click'],
                            questionType: 'MULTIPLE_CHOICE',
                            expectedAnswers: 1,
                        },
                    ],
                }),
        });

        renderAt('/teacher/questions/question-token');
        await screen.findByText('Build a quiz from these questions');

        await user.click(
            screen.getByRole('button', { name: 'Add "What starts the script?" to the quiz' }),
        );

        const checkbox = screen.getByRole('checkbox', { name: 'Include question 1 in quiz' });
        const toggle = screen.getByRole('button', { name: /Question 1 details/ });
        expect(checkbox).toBeChecked();
        expect(toggle).toHaveAttribute('aria-expanded', 'false');

        await user.click(checkbox);

        expect(
            screen.getByRole('button', { name: 'Add "What starts the script?" to the quiz' }),
        ).toBeInTheDocument();
        // A checkbox nested inside the disclosure would fight it; this one sits beside it instead, and unchecking
        // it must never open or close the row it lives in.
        expect(screen.getByRole('button', { name: /Question details/ })).toHaveAttribute(
            'aria-expanded',
            'false',
        );
        expect(screen.queryByText('The flag')).not.toBeInTheDocument();
    });

    it("keeps the unmarked-question marker visible while an edited question's row is collapsed", async () => {
        const user = userEvent.setup();
        mockFetchRoutes({
            features: ['qlc', 'teacher-archive'],
            fallback: () =>
                result({
                    quiz: [
                        {
                            questionId: 'q-first',
                            question: 'What starts the script?',
                            options: ['The flag', 'A click'],
                            questionType: 'MULTIPLE_CHOICE',
                            expectedAnswers: 1,
                        },
                    ],
                }),
        });

        renderAt('/teacher/questions/question-token');
        await screen.findByText('Build a quiz from these questions');
        await user.click(screen.getByRole('button', { name: 'Select shown questions' }));

        const toggle = screen.getByRole('button', { name: /Question 1 details/ });
        await user.click(toggle);
        await user.click(screen.getByRole('button', { name: 'Edit question 1' }));
        await user.type(screen.getByRole('textbox', { name: 'Question text' }), ' extra');
        await user.click(screen.getByRole('button', { name: 'Close editor' }));

        await user.click(toggle);
        expect(screen.getByText('Edited — no longer marked automatically')).toBeInTheDocument();
    });
});

describe('collapsed question summary text', () => {
    it('flattens rich-hint markup, inline blocks included, to plain words', () => {
        const source =
            '[b]A loop[/b] runs [i]twice[/i] with [sbi]move (10) steps[/sbi] and [TRUE].';
        expect(questionSummaryText(source, 'en')).toBe(
            'A loop runs twice with move (10) steps and TRUE.',
        );
    });

    /** One parser for every row: a teacher's own question is written in the same markup a generated one is. */
    it("flattens a teacher's own question through the same parser, not a second one", () => {
        const source = 'A [i]loop[/i] runs [b]twice[/b] with [bc]repeat[/bc].';
        expect(questionSummaryText(source, 'en')).toBe('A loop runs twice with repeat.');
    });

    it('truncates a long line on a word boundary and marks the cut with an ellipsis', () => {
        const long =
            'Explain what happens when the green flag is clicked and the cat sprite moves ten steps to the right before turning fifteen degrees clockwise.';
        const summary = questionSummaryText(long, 'en', 60);
        expect(summary.length).toBeLessThanOrEqual(61);
        expect(summary.endsWith('…')).toBe(true);
        expect(summary.endsWith(' …')).toBe(false);
        expect(long.startsWith(summary.slice(0, -1))).toBe(true);
    });

    it('still produces a bounded line when a single word has nowhere earlier to break', () => {
        const long = 'supercalifragilisticexpialidocioussupercalifragilisticexpialidocious';
        const summary = questionSummaryText(long, 'en', 20);
        expect(summary.length).toBeLessThanOrEqual(21);
        expect(summary.length).toBeGreaterThan(0);
        expect(summary.endsWith('…')).toBe(true);
    });

    it('leaves a short question exactly as written, with no ellipsis added', () => {
        expect(questionSummaryText('Which sprite moves first?', 'en')).toBe(
            'Which sprite moves first?',
        );
    });
});
