// SPDX-License-Identifier: EUPL-1.2
// SPDX-FileCopyrightText: 2026 LitterBox-Web contributors

import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';

const token = 'synthetic-injection-token';
const analysisId = 7;
const archiveBytes = Buffer.from('synthetic derived project archive bytes');

const submission = {
    status: 'completed',
    token,
    analysis: {
        id: analysisId,
        status: 'completed',
        name: 'synthetic-retained-original.sb3',
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

const injectors = [
    {
        injectorId: 'injector-first',
        finderId: 'finder-first',
        name: 'First synthetic injector',
        description: 'A bounded educational description for the first injector.',
    },
    {
        injectorId: 'injector-second',
        finderId: 'finder-second',
        name: 'Second synthetic injector',
        description: 'A bounded educational description for the second injector.',
    },
];

const preview = {
    schemaVersion: 1,
    source: { analysisId, name: 'synthetic-retained-original.sb3' },
    results: [
        {
            injectorId: 'injector-first',
            finderId: 'finder-first',
            resultIndex: 0,
            spriteName: 'Synthetic sprite',
            originalScriptId: 'original-script',
            mutatedScriptId: 'mutated-script',
            originalScratchblocks: 'when green flag clicked\nsay [original]',
            mutatedScratchblocks: 'when green flag clicked\nsay [mutated]',
        },
        {
            injectorId: 'injector-second',
            finderId: 'finder-second',
            resultIndex: 0,
            spriteName: 'Synthetic sprite',
            originalScriptId: 'original-script-2',
            mutatedScriptId: 'mutated-script-2',
            originalScratchblocks: 'when green flag clicked\nmove (10) steps',
            mutatedScratchblocks: 'when green flag clicked\nmove (20) steps',
        },
    ],
    failures: [],
};

const localRequests = (page: import('@playwright/test').Page): string[] => {
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

test('previews and prepares a synthetic derived archive only after explicit actions', async ({
    page,
}) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const external = localRequests(page);
    let injectorRequests = 0;
    let previewRequests = 0;
    let downloadRequests = 0;
    let browserDownloads = 0;
    page.on('download', () => {
        browserDownloads += 1;
    });

    await page.route('**/api/v1/capabilities', async (route) =>
        route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
                schemaVersion: 1,
                litterboxVersion: 'synthetic-injection',
                supportedLocales: ['de', 'en', 'es', 'nl'],
                enabledFeatures: ['single-project', 'fault-injection'],
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
    await page.route(
        '**/api/v1/submissions/*/analyses/7/injector-catalogue?locale=en',
        async (route) => {
            injectorRequests += 1;
            expect(route.request().method()).toBe('GET');
            expect(route.request().headers().accept).toBe('application/json');
            expect(route.request().headers().authorization).toBe(`Bearer ${token}`);
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({
                    injectors,
                    maxSelectedInjectors: 8,
                    allSelectionSupported: true,
                }),
            });
        },
    );
    await page.route('**/api/v1/submissions/*/analyses/7/injections', async (route) => {
        previewRequests += 1;
        expect(route.request().method()).toBe('POST');
        expect(route.request().headers().accept).toBe('application/json');
        expect(route.request().headers().authorization).toBe(`Bearer ${token}`);
        expect(route.request().headers()['content-type']).toContain('application/json');
        expect(JSON.parse(route.request().postData() ?? '')).toEqual({
            injectorIds: ['injector-second', 'injector-first'],
        });
        await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify(preview),
        });
    });
    await page.route('**/api/v1/submissions/*/analyses/7/injections/download', async (route) => {
        downloadRequests += 1;
        expect(route.request().method()).toBe('POST');
        expect(route.request().headers().accept).toBe('application/zip');
        expect(route.request().headers().authorization).toBe(`Bearer ${token}`);
        expect(route.request().headers()['content-type']).toContain('application/json');
        expect(JSON.parse(route.request().postData() ?? '')).toEqual({
            injectorId: 'injector-first',
            resultIndex: 0,
        });
        await route.fulfill({
            status: 200,
            headers: {
                'Content-Type': 'application/zip',
                'Content-Disposition': 'attachment; filename="litterbox-derived.sb3"',
                'Content-Length': String(archiveBytes.byteLength),
                'Cache-Control': 'no-store',
                'X-Content-Type-Options': 'nosniff',
            },
            body: archiveBytes,
        });
    });

    // Making a modified project is another thing to do with an analysis already in hand, so it is a section of the
    // advanced workspace. The old address still leads there. The result page is opened first only so this device
    // remembers the analysed project, which is what the entry page offers to work from.
    await page.goto(`./submissions/${token}`);
    await expect(page.getByText('Analysis complete')).toBeVisible();
    await page.goto('./teacher/modify');
    await page
        .getByRole('link', { name: 'Open advanced analysis for synthetic-retained-original.sb3' })
        .click();
    await expect(page.locator('#advanced-injection')).toHaveAttribute('open', '');
    await expect(page.getByText('First synthetic injector')).toBeVisible();
    expect(injectorRequests).toBeGreaterThanOrEqual(1);
    expect(injectorRequests).toBeLessThanOrEqual(2);
    expect(previewRequests).toBe(0);
    expect(downloadRequests).toBe(0);
    expect(browserDownloads).toBe(0);

    await page.getByRole('checkbox', { name: /Second synthetic injector/ }).click();
    await page.getByRole('checkbox', { name: /First synthetic injector/ }).click();
    await page.getByRole('button', { name: 'Request mutation previews' }).click();
    await expect(page.getByRole('heading', { name: 'Mutation previews ready' })).toBeFocused();
    expect(previewRequests).toBe(1);
    expect(downloadRequests).toBe(0);
    expect(browserDownloads).toBe(0);

    const downloadPromise = page.waitForEvent('download');
    await page
        // The result names its injector the way the catalogue does, not by the id the preview answered with.
        .locator('.injection-result', { hasText: 'First synthetic injector' })
        .getByRole('button', { name: 'Download this project' })
        .click();
    const download = await downloadPromise;
    await expect(page.getByRole('heading', { name: 'Saved to your downloads' })).toBeFocused();
    expect(downloadRequests).toBe(1);
    expect(download.suggestedFilename()).toBe('litterbox-derived.sb3');
    expect(await readFile((await download.path()) ?? '')).toEqual(archiveBytes);
    expect(browserDownloads).toBe(1);
    expect(external).toEqual([]);

    await page.setViewportSize({ width: 320, height: 844 });
    const dimensions = await page.evaluate(() => ({
        clientWidth: document.documentElement.clientWidth,
        scrollWidth: document.documentElement.scrollWidth,
    }));
    expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth + 1);
    await expect(page.getByRole('heading', { name: 'Saved to your downloads' })).toBeVisible();
});
