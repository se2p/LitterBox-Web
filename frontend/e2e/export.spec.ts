// SPDX-License-Identifier: EUPL-1.2
// SPDX-FileCopyrightText: 2026 LitterBox-Web contributors

import { readFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';

const token = 'synthetic-export';
const analysisId = 7;

const formats = [
    {
        value: 'scratchblocks',
        mediaType: 'text/plain;charset=UTF-8',
        filename: 'litterbox-export.txt',
        body: 'when green flag clicked\nsay [synthetic scratchblocks]',
    },
    {
        value: 'goboscript',
        mediaType: 'text/plain;charset=UTF-8',
        filename: 'litterbox-export.gs',
        body: 'when green flag clicked\nsay "synthetic goboscript"',
    },
    {
        value: 'pystage',
        mediaType: 'text/x-python;charset=UTF-8',
        filename: 'litterbox-export.py',
        body: 'say("synthetic pystage")',
    },
] as const;

const submission = {
    schemaVersion: 1,
    submissionId: 71,
    token,
    status: 'completed',
    locale: 'en',
    sourceType: 'UPLOAD',
    analysis: {
        id: analysisId,
        status: 'completed',
        name: 'synthetic-export.sb3',
        inputFormat: 'sb3',
        metrics: {},
        issues: [],
        relationships: [],
        catalogue: [],
        quiz: [],
        assetRefs: [],
    },
    analyses: [],
    counts: { expected: 1, completed: 1, failed: 0 },
};

const localRequests = (page: Page): string[] => {
    const external: string[] = [];
    page.on('request', (request) => {
        const url = new URL(request.url());
        if (
            ['http:', 'https:'].includes(url.protocol) &&
            !['127.0.0.1', 'localhost'].includes(url.hostname)
        )
            external.push(request.url());
    });
    return external;
};

async function preparePage(page: Page) {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.route('**/api/v1/capabilities', async (route) =>
        route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
                schemaVersion: 1,
                litterboxVersion: 'synthetic-export',
                supportedLocales: ['de', 'en', 'es', 'nl'],
                enabledFeatures: ['single-project', 'program-export'],
            }),
        }),
    );
    await page.route('**/api/v1/submissions/*/events', async (route) => route.abort('failed'));
    await page.route(`**/api/v1/submissions/${token}`, async (route) =>
        route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify(submission),
        }),
    );
    await page.goto(`./submissions/${token}`);
    await page.getByRole('link', { name: 'Open advanced analysis' }).click();
    await expect(page.getByRole('heading', { name: 'Export program' })).toBeVisible();
}

for (const format of formats) {
    test(`downloads synthetic ${format.value} output only after explicit preparation`, async ({
        page,
    }) => {
        const external = localRequests(page);
        let requests = 0;
        let downloads = 0;
        page.on('download', () => {
            downloads += 1;
        });
        await page.route(
            `**/api/v1/submissions/${token}/analyses/${analysisId}/exports`,
            async (route) => {
                requests += 1;
                expect(route.request().method()).toBe('POST');
                expect(route.request().headers().authorization).toBe(`Bearer ${token}`);
                expect(route.request().headers().accept).toBe(format.mediaType);
                expect(JSON.parse(route.request().postData() ?? '')).toEqual({
                    format: format.value,
                    target: { kind: 'program', spriteName: null, scriptId: null },
                });
                await route.fulfill({
                    status: 200,
                    headers: {
                        'Content-Type': format.mediaType,
                        'Content-Disposition': `attachment; filename="${format.filename}"`,
                        'Content-Length': String(new TextEncoder().encode(format.body).byteLength),
                        'Cache-Control': 'no-store',
                        'X-Content-Type-Options': 'nosniff',
                    },
                    body: format.body,
                });
            },
        );
        await preparePage(page);
        await page.getByLabel('Output format').selectOption(format.value);
        await page.getByRole('button', { name: 'Prepare export' }).click();
        await expect(page.getByRole('heading', { name: 'Export prepared' })).toBeFocused();
        expect(requests).toBe(1);
        expect(downloads).toBe(0);

        const downloadPromise = page.waitForEvent('download');
        await page.getByRole('button', { name: 'Download prepared export' }).click();
        const download = await downloadPromise;
        expect(download.suggestedFilename()).toBe(format.filename);
        const downloadPath = await download.path();
        expect(downloadPath).not.toBeNull();
        expect(await readFile(downloadPath!)).toEqual(Buffer.from(format.body));
        expect(external).toEqual([]);
    });
}

test('keeps the export card responsive on desktop and mobile', async ({ page }) => {
    const external = localRequests(page);
    await preparePage(page);
    const fieldColumns = async () =>
        (
            await page
                .locator('.export-field-grid')
                .evaluate((element) => getComputedStyle(element).gridTemplateColumns)
        ).split(' ').length;
    // Two fields abreast where there is room for them, one under the other where there is not.
    expect(await fieldColumns()).toBe(2);
    await page.setViewportSize({ width: 320, height: 844 });
    const dimensions = await page.evaluate(() => ({
        clientWidth: document.documentElement.clientWidth,
        scrollWidth: document.documentElement.scrollWidth,
    }));
    expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth + 1);
    expect(await fieldColumns()).toBe(1);
    expect(external).toEqual([]);
});

test('browses export targets and posts the selected opaque script ID', async ({ page }) => {
    let postedTarget: unknown;
    await page.route(
        `**/api/v1/submissions/${token}/analyses/${analysisId}/export-targets`,
        async (route) => {
            expect(route.request().method()).toBe('GET');
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                headers: {
                    'Cache-Control': 'no-store',
                    'X-Content-Type-Options': 'nosniff',
                },
                body: JSON.stringify({
                    sprites: [
                        { name: 'Stage', stage: true },
                        { name: 'Sprite 1', stage: false },
                    ],
                    scripts: [
                        {
                            scriptId: 'opaque-first',
                            spriteName: 'Sprite 1',
                            ordinal: 1,
                            scratchblocks: 'when green flag clicked',
                        },
                        {
                            scriptId: 'opaque-second',
                            spriteName: 'Stage',
                            ordinal: 2,
                            scratchblocks: 'say [second]',
                        },
                    ],
                }),
            });
        },
    );
    await page.route(
        `**/api/v1/submissions/${token}/analyses/${analysisId}/exports`,
        async (route) => {
            postedTarget = JSON.parse(route.request().postData() ?? '{}').target;
            await route.fulfill({
                status: 200,
                headers: {
                    'Content-Type': formats[0].mediaType,
                    'Content-Disposition': `attachment; filename="${formats[0].filename}"`,
                    'Content-Length': String(new TextEncoder().encode(formats[0].body).byteLength),
                    'Cache-Control': 'no-store',
                    'X-Content-Type-Options': 'nosniff',
                },
                body: formats[0].body,
            });
        },
    );
    await preparePage(page);
    await page.getByLabel('Export target').selectOption('script');
    await expect(page.getByRole('option', { name: 'Sprite 1, script 1' })).toBeAttached();
    await expect(page.getByRole('option', { name: 'Stage, script 2' })).toBeAttached();
    await expect(page.locator('body')).not.toContainText('opaque-first');
    await page.getByRole('button', { name: 'Next script' }).click();
    await expect(page.getByText('Stage, script 2').last()).toBeVisible();
    await page.setViewportSize({ width: 320, height: 844 });
    const dimensions = await page.evaluate(() => ({
        clientWidth: document.documentElement.clientWidth,
        scrollWidth: document.documentElement.scrollWidth,
    }));
    expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth + 1);
    await page.getByRole('button', { name: 'Prepare export' }).click();
    await expect(page.getByRole('heading', { name: 'Export prepared' })).toBeFocused();
    expect(postedTarget).toEqual({ kind: 'script', spriteName: null, scriptId: 'opaque-second' });
});
