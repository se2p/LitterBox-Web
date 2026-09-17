// SPDX-License-Identifier: EUPL-1.2
// SPDX-FileCopyrightText: 2026 LitterBox-Web contributors

import { expect, test, type Page } from '@playwright/test';

const TOKEN = 'ask-ai-e2e-token';
const ANALYSIS_ID = 1;

const json = (body: unknown) => ({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify(body),
});

const completedStatus = () => ({
    schemaVersion: 1,
    submissionId: 1,
    token: TOKEN,
    status: 'completed',
    locale: 'en',
    sourceType: 'UPLOAD',
    analysis: {
        id: ANALYSIS_ID,
        status: 'completed',
        name: 'cat-chase.sb3',
        locale: 'en',
        issues: [],
        metrics: { blocks: 4 },
    },
    analyses: [],
    counts: { expected: 1, completed: 1, failed: 0 },
});

const questions = () => ({
    schemaVersion: 1,
    inquiries: [
        {
            selector: 'inquiry:v1-click',
            kind: 'event',
            label: 'What happens when clicked?',
            target: 'target:v1-program',
        },
    ],
    findings: [
        {
            selector: 'finding:v1-endless',
            label: '[b]Problem:[/b] this loop never ends.',
            family: 'bug',
            target: 'target:v1-program',
            finder: 'EndlessLoop',
            scratchblocks: 'when green flag clicked\nforever :: #ff0000\nmove (10) steps\nend',
        },
        {
            selector: 'finding:v1-long',
            label: '[b]Problem:[/b] this project is one long script.',
            family: 'smell',
            target: 'target:v1-program',
            finder: 'LongScript',
            scratchblocks: '',
        },
    ],
    targets: [
        {
            key: 'target:v1-program',
            kind: 'program',
            label: '',
            parent: '',
            scratchblocks: '',
            thumbnail: null,
            intents: ['SUMMARISE'],
        },
    ],
    truncated: false,
    previewsTruncated: false,
});

const answer = () => ({
    schemaVersion: 1,
    messageId: 'm-1',
    status: 'answer',
    blocks: [
        { kind: 'text', text: 'When the flag is clicked the sprite moves.' },
        {
            kind: 'scratchblocks',
            role: 'existing',
            code: 'when green flag clicked\nmove (10) steps',
        },
    ],
    references: [{ kind: 'actor', label: 'Cat' }],
    followUps: ['EXPLAIN_SIMPLY'],
    repliesRemaining: 7,
});

const stubService = async (page: Page) => {
    await page.route('**/api/v1/capabilities', (route) =>
        route.fulfill(
            json({
                schemaVersion: 1,
                litterboxVersion: 'synthetic',
                supportedLocales: ['de', 'en', 'es', 'nl'],
                enabledFeatures: ['single-project', 'ask-ai'],
            }),
        ),
    );
    await page.route('**/api/v1/ask-ai/eligibility', (route) =>
        route.fulfill(json({ schemaVersion: 1, available: true })),
    );
    await page.route(`**/api/v1/submissions/${TOKEN}/events`, (route) => route.abort());
    await page.route(`**/api/v1/submissions/${TOKEN}`, (route) =>
        route.fulfill(json(completedStatus())),
    );
    await page.route(/\/ask-ai\/questions\?/, (route) => route.fulfill(json(questions())));
    await page.route(/\/ask-ai\/conversations$/, (route) =>
        route.fulfill(
            json({
                schemaVersion: 1,
                conversationId: 'conv-1',
                scope: { kind: 'inquiry', label: 'What happens when clicked?' },
                repliesRemaining: 8,
            }),
        ),
    );
    await page.route(/\/conversations\/conv-1\/messages$/, (route) =>
        route.fulfill(json(answer())),
    );
    await page.route(/\/conversations\/conv-1\/close$/, (route) =>
        route.fulfill({ status: 204, body: '' }),
    );
};

test('a question is answered with blocks a browser actually draws', async ({ page }) => {
    await stubService(page);

    await page.goto(`./ask-ai/submissions/${TOKEN}`);

    await expect(
        page.getByText('The answers are written by an AI helper, and can be wrong.'),
    ).toBeVisible({ timeout: 20_000 });
    await expect(
        page.getByText('The AI helper answers from what LitterBox read in cat chase.'),
    ).toBeVisible();

    await page.getByRole('button', { name: /^Understand how it works/ }).click();
    await page.getByRole('button', { name: 'What happens when clicked?' }).click();

    await expect(page.getByText('When the flag is clicked the sprite moves.')).toBeVisible();

    const drawn = page.locator('.scratchblocks-rendered[data-render-state="ready"] svg').first();
    await expect(drawn).toBeVisible();
    expect(await drawn.evaluate((svg) => svg.getBoundingClientRect().width)).toBeGreaterThan(0);

    await expect(
        page.getByRole('button', { name: 'Can you explain that more simply?' }),
    ).toBeVisible();
});

test('a problem is offered with the blocks it was reported in, drawn and marked', async ({
    page,
}) => {
    await stubService(page);

    await page.goto(`./ask-ai/submissions/${TOKEN}`);
    await expect(page.getByRole('button', { name: /^Check for problems/ })).toBeVisible({
        timeout: 20_000,
    });
    await page.getByRole('button', { name: /^Check for problems/ }).click();

    const problem = page.getByRole('button', { name: /this loop never ends/i });
    await expect(problem).toBeVisible();
    await expect(
        problem.locator('.ask-ai-question-code .scratchblocks-rendered svg'),
    ).toBeVisible();

    // The preview must not overflow its button.
    const room = await problem.evaluate((button) => {
        const code = button.querySelector('.ask-ai-question-code') as HTMLElement;
        return {
            drawn: code.getBoundingClientRect().width,
            spare: button.getBoundingClientRect().width - code.getBoundingClientRect().width,
        };
    });
    expect(room.drawn).toBeGreaterThan(0);
    expect(room.spare).toBeGreaterThanOrEqual(0);

    const pattern = page.getByRole('button', { name: /one long script/i });
    await expect(pattern).toBeVisible();
    await expect(pattern.locator('.ask-ai-question-code')).toHaveCount(0);
});
