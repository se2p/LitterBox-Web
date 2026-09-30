// SPDX-License-Identifier: EUPL-1.2
// SPDX-FileCopyrightText: 2025 LitterBox-Web contributors

import { expect, test } from '@playwright/test';
import JSZip from 'jszip';

const capabilities = (enabledFeatures: string[]) => ({
    schemaVersion: 1,
    litterboxVersion: 'synthetic-questions',
    supportedLocales: ['de', 'en', 'es', 'nl'],
    enabledFeatures,
});

const completedQuestions = (sourceType = 'QUESTION_SCRATCH_URL') => ({
    schemaVersion: 1,
    submissionId: 44,
    token: 'question-e2e-token',
    status: 'completed',
    locale: 'en',
    sourceType,
    analysis: {
        id: 88,
        status: 'completed',
        name: 'synthetic-question-project.sb3',
        quiz: [
            {
                questionId: 'question-e2e-1',
                question: 'Which answer is recorded?',
                options: ['A', 'B'],
            },
        ],
        issues: [],
    },
    analyses: [],
    counts: { expected: 1, completed: 1, failed: 0 },
});

const syntheticArchive = async (): Promise<Buffer> => {
    const zip = new JSZip();
    zip.file('project.json', '{}');
    zip.file('sprites/sprite.json', '{}');
    return Buffer.from(await zip.generateAsync({ type: 'nodebuffer' }));
};

test('qlc submits a canonical URL, renders questions, and records answers', async ({ page }) => {
    let idempotencyKey = '';
    await page.route('**/api/v1/capabilities', (route) =>
        route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify(capabilities(['qlc'])),
        }),
    );
    await page.route('**/api/v1/question-submissions', async (route) => {
        expect(route.request().method()).toBe('POST');
        expect(route.request().postDataJSON()).toEqual({
            projectUrl: 'https://scratch.mit.edu/projects/24680/',
        });
        idempotencyKey = route.request().headers()['idempotency-key'] ?? '';
        expect(idempotencyKey).not.toBe('');
        expect(route.request().headers()['accept-language']).toBe('en');
        await route.fulfill({
            status: 202,
            contentType: 'application/json',
            body: JSON.stringify({
                submissionId: 44,
                token: 'question-e2e-token',
                status: 'queued',
                location: '/questions/question-e2e-token',
            }),
        });
    });
    await page.route('**/api/v1/submissions/question-e2e-token/events', (route) => route.abort());
    await page.route('**/api/v1/submissions/question-e2e-token', (route) =>
        route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify(completedQuestions()),
        }),
    );
    await page.route('**/api/v1/analyses/88/quiz-answers', async (route) => {
        expect(route.request().method()).toBe('POST');
        expect(route.request().headers().authorization).toBe('Bearer question-e2e-token');
        expect(route.request().postDataJSON()).toEqual({
            questionId: 'question-e2e-1',
            answer: 'A',
        });
        await route.fulfill({ status: 204 });
    });

    await page.goto('./questions');
    await expect(page.getByRole('link', { name: 'Ask me' })).toBeVisible();
    await page.getByLabel('Project link or number').fill('https://scratch.mit.edu/projects/24680/');
    await page.getByRole('button', { name: 'Ask me about this project' }).click();
    await expect(page).toHaveURL(/\/questions\/question-e2e-token$/);
    await expect(page.getByText('Which answer is recorded?')).toBeVisible();
    await page.getByRole('radio', { name: 'A' }).click();
    await page.getByRole('button', { name: 'Send answer' }).click();
    await expect(page.getByText('Answer recorded.')).toBeVisible();
    await page.getByRole('button', { name: 'See summary' }).click();
    await expect(page.getByRole('heading', { name: 'Your score' })).toBeVisible();
    expect(idempotencyKey).not.toBe('');
});

test('a teacher curates, edits, adds, and exports a quiz', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 1000 });
    // `html`'s own smooth scrolling, unconditional outside this preference, stretches that scroll
    // across enough animation frames for Playwright to see the target as still moving and time the click out;
    // the same reduced-motion switch the app's own CSS already answers to is what a real reader with the
    // preference set would get for free, and it is what makes this click land on the first attempt here too.
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.route('**/api/v1/capabilities', (route) =>
        route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify(capabilities(['qlc', 'teacher-archive'])),
        }),
    );
    await page.route('**/api/v1/submissions/teacher-builder-token', (route) =>
        route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
                ...completedQuestions(),
                token: 'teacher-builder-token',
                analysis: {
                    ...completedQuestions().analysis,
                    quiz: [
                        {
                            questionId: 'builder-1',
                            question: 'What starts the script?',
                            options: ['The flag', 'A click'],
                            questionType: 'MULTIPLE_CHOICE',
                            programDimension: 'TEXT',
                            scopeOfFocus: 'ATOM',
                            expectedAnswers: 1,
                        },
                        {
                            questionId: 'builder-2',
                            question: 'Why does it repeat?',
                            options: [],
                            questionType: 'FREE_TEXT',
                            programDimension: 'PURPOSE',
                            scopeOfFocus: 'MACRO',
                            expectedAnswers: 1,
                        },
                    ],
                },
            }),
        }),
    );

    await page.goto('./teacher/questions/teacher-builder-token');
    await expect(
        page.getByRole('heading', { name: 'Build a quiz from these questions' }),
    ).toBeVisible();
    await expect(
        page.getByText('0 of 12 block-model cells covered by the selected questions.'),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Select shown questions', exact: true }).click();
    await expect(
        page.getByText('2 of 12 block-model cells covered by the selected questions.'),
    ).toBeVisible();

    await page.getByRole('button', { name: /^Question 2 details:/ }).click();
    await page.getByRole('button', { name: 'Edit question 2' }).click();
    await page.getByRole('textbox', { name: 'Question text' }).fill('Explain the repeat block.');
    await page
        .getByRole('textbox', { name: 'Answer or marking guidance' })
        .fill('Names the repeat count.');
    await page.getByRole('button', { name: 'Close editor' }).click();

    // Unchecking question 1 sends it back to the bank, and the quiz's one remaining question — the one just
    // edited — is renumbered to take its place. Scoped to the row that names it rather than found by "question
    // 1" alone: that label names a position, not this particular question, and the position it names is exactly
    // what this click is about to hand to the row being edited above — a locator re-read by number after the
    // click would find that row instead and undo the very thing this line means to do.
    const returnedToBank = page.locator('.assessment-question', {
        hasText: 'What starts the script?',
    });
    await returnedToBank.getByRole('checkbox').click();
    // A question in the quiz carries a checkbox that takes it out again; one sitting in the bank carries an
    // "Add to quiz" button instead, because putting a question in and taking it out are not the same act and
    // the bank has no position to check against. Waiting for that button is what proves the move happened —
    // and it is why this is a click plus an assertion rather than `uncheck`, which would go looking for the
    // very checkbox the move has just replaced.
    await expect(
        returnedToBank.getByRole('button', { name: /^Add ".*" to the quiz$/ }),
    ).toBeVisible();

    await page.getByRole('button', { name: 'Add your own question' }).click();
    await expect(page.getByText('Added by teacher — not marked automatically')).toBeVisible();
    await page.getByRole('textbox', { name: 'Question text' }).fill('What would you change?');
    await page.getByRole('textbox', { name: 'Accepted answers' }).fill('the backdrop\nthe colours');
    await page.getByRole('textbox', { name: 'Question text' }).click();
    await expect(page.getByText('Added by teacher', { exact: true })).toBeVisible();

    const downloadReady = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Download editable JSON' }).click();
    const download = await downloadReady;
    expect(download.suggestedFilename()).toBe('synthetic-question-project-sb3-quiz.json');

    const noOverflow = await page.evaluate(
        () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
    );
    expect(noOverflow).toBe(true);
});

test('qlc accepts a preflighted local project and keeps invalid input local', async ({ page }) => {
    let submissions = 0;
    await page.route('**/api/v1/capabilities', (route) =>
        route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify(capabilities(['qlc'])),
        }),
    );
    await page.route('**/api/v1/question-submissions', async (route) => {
        submissions += 1;
        expect(route.request().method()).toBe('POST');
        expect(route.request().headers()['idempotency-key']).not.toBe('');
        await route.fulfill({
            status: 202,
            contentType: 'application/json',
            body: JSON.stringify({
                submissionId: 45,
                token: 'question-file-token',
                status: 'queued',
                location: '/questions/question-file-token',
            }),
        });
    });
    await page.route('**/api/v1/submissions/question-file-token/events', (route) => route.abort());
    await page.route('**/api/v1/submissions/question-file-token', (route) =>
        route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify(completedQuestions('QUESTION_UPLOAD')),
        }),
    );

    await page.goto('./questions');
    await page.locator('#questions-project-file').setInputFiles({
        name: 'synthetic.txt',
        mimeType: 'text/plain',
        buffer: Buffer.from('not a project archive'),
    });
    await expect(page.getByRole('alert')).toContainText('Use a .sb3 or .mblock archive.');
    await expect(page.getByRole('button', { name: 'Ask me about this project' })).toBeDisabled();
    expect(submissions).toBe(0);
    await page.locator('#questions-project-file').setInputFiles({
        name: 'synthetic.sb3',
        mimeType: 'application/zip',
        buffer: await syntheticArchive(),
    });
    await expect(page.getByRole('status')).toContainText('Your file looks good');
    await page.getByRole('button', { name: 'Ask me about this project' }).click();
    await expect(page).toHaveURL(/\/questions\/question-file-token$/);
    await expect(page.getByText('Which answer is recorded?')).toBeVisible();
    expect(submissions).toBe(1);
});

test('missing qlc and aliases keep direct Questions access unavailable', async ({ page }) => {
    for (const feature of [undefined, 'question-generation']) {
        await page.route('**/api/v1/capabilities', (route) =>
            route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify(capabilities(feature ? [feature] : [])),
            }),
        );
        await page.goto('./questions');
        await expect(page.getByText('This service cannot ask you about a project.')).toBeVisible();
        await expect(page.getByRole('link', { name: 'Ask me' })).toHaveCount(0);
        await page.unroute('**/api/v1/capabilities');
    }
});

test('reloading a Questions token restores processing and completed state', async ({ page }) => {
    let statusCalls = 0;
    let returnCompleted = false;
    await page.route('**/api/v1/capabilities', (route) =>
        route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify(capabilities(['qlc'])),
        }),
    );
    await page.route('**/api/v1/submissions/reload-question-token/events', (route) =>
        route.abort(),
    );
    await page.route('**/api/v1/submissions/reload-question-token', (route) => {
        statusCalls += 1;
        if (!returnCompleted)
            return route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({
                    token: 'reload-question-token',
                    status: 'processing',
                    sourceType: 'QUESTION_UPLOAD',
                    analyses: [],
                    counts: { expected: 1, completed: 0, failed: 0 },
                }),
            });
        return route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
                ...completedQuestions('QUESTION_UPLOAD'),
                token: 'reload-question-token',
            }),
        });
    });

    await page.goto('./questions/reload-question-token');
    await expect(page.getByText('Analysis in progress')).toBeVisible();
    returnCompleted = true;
    await page.reload();
    await expect(page.getByText('Which answer is recorded?')).toBeVisible();
    expect(statusCalls).toBeGreaterThanOrEqual(2);
});

test('rich questions use native radios and stay contained at narrow and zoom-equivalent widths', async ({
    page,
}) => {
    const exactOption =
        '[i]First answer[/i] [sbi]move (10) steps[/sbi] <img src=x onerror=alert(1)>';
    await page.setViewportSize({ width: 320, height: 900 });
    await page.route('**/api/v1/capabilities', (route) =>
        route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify(capabilities(['qlc'])),
        }),
    );
    await page.route('**/api/v1/submissions/rich-question-token', (route) =>
        route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
                ...completedQuestions(),
                token: 'rich-question-token',
                analysis: {
                    ...completedQuestions().analysis,
                    quiz: [
                        {
                            questionId: 'rich-question',
                            question:
                                '[b]What happens?[/b][newLine][var]score[/var] [TRUE] [sbi]when green flag clicked[/sbi] [unknown] [b]unclosed <script>alert(1)</script>',
                            options: [exactOption, '[c=red]Second answer[/c]'],
                        },
                    ],
                },
            }),
        }),
    );
    await page.route('**/api/v1/analyses/88/quiz-answers', async (route) => {
        expect(route.request().postDataJSON()).toEqual({
            questionId: 'rich-question',
            answer: exactOption,
        });
        await route.fulfill({ status: 204 });
    });

    await page.goto('./questions/rich-question-token');
    await expect(page.getByRole('heading', { name: /Question 1/ })).toBeVisible();
    await expect(page.getByRole('radio', { name: /First answer/ })).toBeVisible();
    await expect(page.locator('.quiz-card script')).toHaveCount(0);
    await expect(page.locator('.quiz-card img')).toHaveCount(0);

    const first = page.getByRole('radio').first();
    const second = page.getByRole('radio').nth(1);
    await first.focus();
    await first.press('Space');
    await expect(first).toBeChecked();
    await first.press('ArrowDown');
    await expect(second).toBeChecked();
    await second.press('ArrowUp');
    await expect(first).toBeChecked();
    await page.getByRole('button', { name: 'Send answer' }).click();
    await expect(page.getByText('Answer recorded.')).toBeVisible();

    const noOverflow = await page.evaluate(
        () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
    );
    expect(noOverflow).toBe(true);

    await page.setViewportSize({ width: 160, height: 900 });
    const noOverflowAtZoomEquivalent = await page.evaluate(
        () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
    );
    expect(noOverflowAtZoomEquivalent).toBe(true);
});

test('lays four answer options across one row, or under each other, never three and a stray', async ({
    page,
}) => {
    await page.route('**/api/v1/capabilities', (route) =>
        route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify(capabilities(['qlc'])),
        }),
    );
    await page.route('**/api/v1/submissions/four-option-token/events', (route) => route.abort());
    await page.route('**/api/v1/submissions/four-option-token', (route) =>
        route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
                ...completedQuestions(),
                token: 'four-option-token',
                analysis: {
                    id: 88,
                    status: 'completed',
                    name: 'synthetic-question-project.sb3',
                    issues: [],
                    quiz: [
                        {
                            questionId: 'four-option-question',
                            question: 'Which of the four is recorded?',
                            options: ['First', 'Second', 'Third', 'Fourth'],
                        },
                    ],
                },
            }),
        }),
    );

    const optionTops = () =>
        page
            .locator('.quiz-choice-card')
            .evaluateAll((cards) =>
                cards.map((card) => Math.round(card.getBoundingClientRect().top)),
            );

    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto('./questions/four-option-token');
    await expect(page.getByRole('radio', { name: 'Fourth' })).toBeVisible();
    const wide = await optionTops();
    expect(wide).toHaveLength(4);
    expect(new Set(wide).size).toBe(1);

    await page.setViewportSize({ width: 700, height: 1000 });
    const narrow = await optionTops();
    expect(new Set(narrow).size).toBe(4);
});

test('a learner answers one question at a time, and free text is never one of them', async ({
    page,
}) => {
    await page.route('**/api/v1/capabilities', (route) =>
        route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify(capabilities(['qlc'])),
        }),
    );
    await page.route('**/api/v1/submissions/guided-token', (route) =>
        route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
                schemaVersion: 1,
                submissionId: 45,
                token: 'guided-token',
                status: 'completed',
                locale: 'en',
                sourceType: 'QUESTION_SCRATCH_URL',
                analysis: {
                    id: 88,
                    status: 'completed',
                    name: 'synthetic-guided-project.sb3',
                    quiz: [
                        {
                            questionId: 'guided-1',
                            question: 'Which answer is right?',
                            options: ['A', 'B'],
                            questionType: 'MULTIPLE_CHOICE',
                            expectedAnswers: 1,
                        },
                        {
                            questionId: 'guided-free',
                            question: 'Explain the script in your own words.',
                            options: [],
                            questionType: 'FREE_TEXT',
                            expectedAnswers: 1,
                        },
                        {
                            questionId: 'guided-2',
                            question: 'How many sprites?',
                            options: [],
                            questionType: 'NUMBER',
                            expectedAnswers: 1,
                        },
                    ],
                    issues: [],
                },
                analyses: [],
                counts: { expected: 1, completed: 1, failed: 0 },
            }),
        }),
    );
    let answers = 0;
    await page.route('**/api/v1/analyses/88/quiz-answers', async (route) => {
        answers += 1;
        await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
                questionId: route.request().postDataJSON().questionId,
                correct: true,
                correctAnswers: ['A'],
            }),
        });
    });

    await page.goto('./questions/guided-token');

    // Free text is marked by matching words against the answer, which fails by calling a right answer wrong.
    // It is left out, so the reader is asked two questions rather than three.
    await expect(page.getByRole('heading', { name: 'Question 1 of 2' })).toBeVisible();
    await expect(page.getByText('Explain the script in your own words.')).toBeHidden();
    await expect(page.getByRole('button', { name: 'See summary' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Next question' })).toBeDisabled();

    await page.getByRole('radio', { name: 'A' }).click();
    await page.getByRole('button', { name: 'Send answer' }).click();
    await expect(page.getByText('Correct!')).toBeVisible();
    await page.getByRole('button', { name: 'Next question' }).click();

    await expect(page.getByRole('heading', { name: 'Question 2 of 2' })).toBeFocused();
    await page.getByRole('spinbutton').fill('4');
    await page.getByRole('button', { name: 'Send answer' }).click();
    await page.getByRole('button', { name: 'See summary' }).click();

    await expect(page.getByRole('heading', { name: 'Your score' })).toBeVisible();
    await expect(page.getByText('2 of 2 correct.')).toBeVisible();
    expect(answers).toBe(2);

    await page.getByRole('button', { name: 'Question 1' }).click();
    await expect(page.getByRole('radio', { name: 'A' })).toBeChecked();
    await expect(page.getByRole('radio', { name: 'A' })).toBeDisabled();
});
