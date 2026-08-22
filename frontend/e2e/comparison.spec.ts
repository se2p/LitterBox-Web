// SPDX-License-Identifier: EUPL-1.2
// SPDX-FileCopyrightText: 2026 LitterBox-Web contributors

import { expect, test } from '@playwright/test';

const capabilities = {
    schemaVersion: 1,
    litterboxVersion: 'synthetic-playwright',
    supportedLocales: ['de', 'en', 'es', 'nl'],
    enabledFeatures: ['semantic-diff', 'single-project'],
};

const comparisonResult = {
    schemaVersion: 1,
    before: { analysisId: 11, name: '<before-project>.sb3' },
    after: { analysisId: 22, name: '<after-project>.sb3' },
    // As the service counts them: a repaired finding is not part of the total after.
    counts: { beforeTotal: 3, afterTotal: 2, fixed: 1, newIssues: 1, persisting: 1, removed: 1 },
    fixed: [
        {
            finderId: 'synthetic-fixed-finder',
            finderName: '<fixed-finder>',
            issueType: 'fixed-type',
            severity: 3,
            sprite: '<fixed-sprite>',
            blockId: '<fixed-block>',
            scratchblocks: 'when green flag clicked\nsay [fixed]',
        },
    ],
    newIssues: [
        {
            finderId: 'synthetic-new-finder',
            finderName: '<new-finder>',
            issueType: 'new-type',
            severity: 2,
            sprite: '<new-sprite>',
            blockId: null,
            scratchblocks: 'when green flag clicked\nmove (10) steps',
        },
    ],
    persisting: [
        {
            finderId: 'synthetic-persisting-finder',
            finderName: '<persisting-finder>',
            issueType: 'persisting-type',
            severity: 1,
            sprite: '<persisting-sprite>',
            blockId: '<persisting-block>',
            scratchblocks: 'when green flag clicked\nthink [persisting]',
        },
    ],
    removed: [
        {
            finderId: 'synthetic-removed-finder',
            finderName: '<removed-finder>',
            issueType: 'removed-type',
            severity: 1,
            sprite: '<removed-sprite>',
            blockId: '<removed-block>',
            scratchblocks: 'when green flag clicked\nsay [removed]',
        },
    ],
    actors: [
        {
            actorName: '<synthetic-sprite>',
            stage: false,
            scripts: [
                {
                    changeType: 'added',
                    beforeScratchblocks: null,
                    afterScratchblocks: 'when green flag clicked\nmove (10) steps',
                    annotatedBeforeScratchblocks: null,
                    annotatedAfterScratchblocks: 'when green flag clicked\nmove (10) steps',
                },
            ],
        },
    ],
};

test.describe('semantic comparison workflow', () => {
    test('compares two independently authorized synthetic references without leaking tokens', async ({
        page,
    }) => {
        const diffRequests: Array<{ body: unknown; authorization: string | null }> = [];
        const unexpectedRequests: string[] = [];
        page.on('request', (request) => {
            const url = request.url();
            if (
                !url.startsWith('http://127.0.0.1') &&
                !url.startsWith('http://localhost') &&
                !url.startsWith('data:') &&
                !url.startsWith('blob:')
            ) {
                unexpectedRequests.push(url);
            }
        });
        await page.route('**/api/v1/capabilities', (route) =>
            route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify(capabilities),
            }),
        );
        await page.route('**/api/v1/diffs', async (route) => {
            const request = route.request();
            diffRequests.push({
                body: request.postDataJSON(),
                authorization: request.headers().authorization ?? null,
            });
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify(comparisonResult),
            });
        });

        await page.goto('compare');
        await expect(page.getByRole('heading', { name: 'Compare analyses' })).toBeVisible();
        expect(diffRequests).toHaveLength(0);
        // The references are typed by hand in the expert form, which is folded away now that the sources above
        // cover arriving from a result or from a file.
        await page.locator('.diff-expert-disclosure > summary').click();
        await page.locator('#diff-before-token').fill('synthetic-before-authorized');
        await page.locator('#diff-before-analysis-id').fill('11');
        await page.locator('#diff-after-token').fill('synthetic-after-authorized');
        await page.locator('#diff-after-analysis-id').fill('22');
        await page.getByRole('button', { name: 'Compare these analyses' }).click();
        await expect(page.getByRole('heading', { name: 'Comparison result' })).toBeFocused();
        expect(diffRequests).toEqual([
            {
                body: {
                    before: { submissionToken: 'synthetic-before-authorized', analysisId: 11 },
                    after: { submissionToken: 'synthetic-after-authorized', analysisId: 22 },
                },
                authorization: null,
            },
        ]);
        expect(page.url()).toMatch(/\/compare$/);
        await expect(page.getByRole('heading', { name: 'Fixed', exact: true })).toBeVisible();
        await expect(
            page.getByRole('heading', { name: 'New findings', exact: true }),
        ).toBeVisible();
        await expect(page.getByRole('heading', { name: 'Still there', exact: true })).toBeVisible();
        await expect(page.getByRole('heading', { name: 'Gone', exact: true })).toBeVisible();
        // Opening a fold is a browser behaviour jsdom does not carry, so it is checked here: the findings that
        // are in both versions start rolled up, and the navigation at the top unrolls them.
        const persisting = page.locator('#diff-section-persisting');
        expect(await persisting.evaluate((element: HTMLDetailsElement) => element.open)).toBe(
            false,
        );
        await page
            .getByRole('navigation', { name: 'Parts of this comparison' })
            .getByRole('button', { name: /Still there/ })
            .click();
        expect(await persisting.evaluate((element: HTMLDetailsElement) => element.open)).toBe(true);
        await page.locator('#diff-section-persisting > summary').click();
        expect(await persisting.evaluate((element: HTMLDetailsElement) => element.open)).toBe(
            false,
        );
        await expect(page.getByText('<before-project>.sb3')).toBeVisible();
        await expect(page.getByText('<synthetic-sprite>')).toBeVisible();
        expect(await page.locator('.diff-result script').count()).toBe(0);
        expect(await page.locator('main img').count()).toBe(0);
        expect(unexpectedRequests).toEqual([]);
    });

    test('reflows at 320 CSS pixels and honors reduced motion', async ({ page }) => {
        await page.setViewportSize({ width: 320, height: 900 });
        await page.emulateMedia({ reducedMotion: 'reduce' });
        await page.route('**/api/v1/capabilities', (route) =>
            route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify(capabilities),
            }),
        );
        await page.route('**/api/v1/diffs', (route) =>
            route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify(comparisonResult),
            }),
        );
        await page.goto('compare');
        await page.locator('.diff-expert-disclosure > summary').click();
        await page.locator('#diff-before-token').fill('before');
        await page.locator('#diff-before-analysis-id').fill('11');
        await page.locator('#diff-after-token').fill('after');
        await page.locator('#diff-after-analysis-id').fill('22');
        await page.getByRole('button', { name: 'Compare these analyses' }).click();
        await expect(page.getByRole('heading', { name: 'Comparison result' })).toBeVisible();
        expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
            320,
        );
        expect(
            await page.evaluate(() => getComputedStyle(document.documentElement).scrollBehavior),
        ).toBe('auto');
    });
});
