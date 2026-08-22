// SPDX-License-Identifier: EUPL-1.2
// SPDX-FileCopyrightText: 2025 LitterBox-Web contributors

import { expect, test } from '@playwright/test';
import JSZip from 'jszip';

const syntheticArchive = async (): Promise<Buffer> => {
    const zip = new JSZip();
    zip.file('project.json', '{}');
    zip.file('sprites/sprite.json', '{}');
    return Buffer.from(await zip.generateAsync({ type: 'nodebuffer' }));
};

const completedStatus = (token: string, issue = false) => ({
    schemaVersion: 1,
    submissionId: 1,
    token,
    status: 'completed',
    locale: 'en',
    sourceType: 'UPLOAD',
    analysis: {
        id: 1,
        status: 'completed',
        name: 'synthetic.sb3',
        failureType: null,
        failureMessage: null,
        reportSchemaVersion: '1',
        litterboxVersion: 'synthetic',
        locale: 'en',
        provenance: 'synthetic',
        detectors: ['all'],
        configuration: {},
        sourceSha256: null,
        inputFormat: '.sb3',
        metrics: {},
        issues: issue
            ? [
                  {
                      id: 1,
                      finderId: 'synthetic-finder',
                      finderName: 'Synthetic finding',
                      type: 'smell',
                      hint: 'Synthetic hint',
                      sprite: 'Cat',
                      blockId: 'block-e2e-raw',
                      costume: 'costume-e2e-raw.png',
                      scratchblocks: 'move (10) steps',
                      duplicates: [20202],
                      subsumedBy: [],
                      coupledWith: [],
                      severity: 1,
                      costumes: [],
                      currentCostume: -1,
                      refactoringScratchblocks: null,
                      similarTo: [],
                  },
              ]
            : [],
        relationships: [{ source: 10101, target: 20202, type: 'duplicate' }],
        catalogue: [
            {
                id: 'synthetic-catalogue',
                title: 'Synthetic result catalogue entry',
                description: 'Synthetic catalogue content',
                locale: 'en',
                fallback: false,
                instruction: '',
                examples: [],
                provenance: 'synthetic',
                licence: 'local',
                issueType: 'smell',
                severity: 1,
                fallbackFields: [],
            },
        ],
        quiz: [
            { questionId: 'synthetic-question', question: 'Synthetic question', options: ['A'] },
        ],
        assetRefs: [
            '/api/v1/submissions/late-token/assets/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
        ],
    },
    analyses: [],
    counts: { expected: 1, completed: 1, failed: 0 },
});

for (const extension of ['sb3', 'mblock']) {
    test(`submits a synthetic .${extension} archive`, async ({ page }) => {
        let idempotencyKey = '';
        await page.route('**/api/v1/capabilities', async (route) =>
            route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({
                    schemaVersion: 1,
                    litterboxVersion: 'synthetic-submit',
                    supportedLocales: ['de', 'en', 'es', 'nl'],
                    enabledFeatures: ['single-project'],
                }),
            }),
        );
        await page.route('**/api/v1/submissions', async (route) => {
            expect(route.request().method()).toBe('POST');
            idempotencyKey = route.request().headers()['idempotency-key'] ?? '';
            expect(idempotencyKey).not.toBe('');
            await route.fulfill({
                status: 202,
                contentType: 'application/json',
                body: JSON.stringify({
                    submissionId: 1,
                    token: `e2e-${extension}`,
                    status: 'queued',
                    location: `/submissions/e2e-${extension}`,
                }),
            });
        });
        await page.route(`**/api/v1/submissions/e2e-${extension}`, async (route) =>
            route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify(completedStatus(`e2e-${extension}`)),
            }),
        );

        await page.goto('./submit');
        await page.locator('#project-file').setInputFiles({
            name: `synthetic.${extension}`,
            mimeType: 'application/zip',
            buffer: await syntheticArchive(),
        });
        await expect(page.getByRole('status')).toContainText('Your file looks good');
        await page.getByRole('button', { name: 'Check my project' }).click();
        await expect(page).toHaveURL(new RegExp(`/submissions/e2e-${extension}$`));
        await expect(page.getByText('No findings were reported for this project.')).toBeVisible();
        expect(idempotencyKey).not.toBe('');
    });
}

test('reload uses persisted completion and the result keeps the accessible code alternative', async ({
    page,
}) => {
    let statusCalls = 0;
    await page.route('**/api/v1/submissions/late-token/events', (route) => route.abort());
    await page.route('**/api/v1/submissions/late-token', async (route) => {
        statusCalls += 1;
        const body =
            statusCalls === 1
                ? {
                      status: 'processing',
                      token: 'late-token',
                      sourceType: 'UPLOAD',
                      analyses: [],
                      counts: { expected: 1, completed: 0, failed: 0 },
                  }
                : completedStatus('late-token', true);
        await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify(body),
        });
    });
    const initialStatus = page.waitForResponse('**/api/v1/submissions/late-token');
    await page.goto('./submissions/late-token');
    await initialStatus;
    expect(statusCalls).toBeGreaterThanOrEqual(1);
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Synthetic finding' })).toBeVisible();
    await expect(page.getByText('Synthetic hint')).toBeVisible();
    await expect(page.getByRole('img', { name: 'Current costume for Cat' })).toBeVisible();
    // Identifiers are folded away, not deleted: whoever is checking the analysis against the tool needs them,
    // and a child reading their own result does not.
    await expect(page.getByText('block-e2e-raw')).not.toBeVisible();
    await expect(page.getByText('costume-e2e-raw.png')).not.toBeVisible();
    await expect(page.getByText('10101')).not.toBeVisible();
    await expect(page.getByText('Finding 20202')).not.toBeVisible();
    const cardMarkup = await page
        .locator('.issue-card')
        .first()
        .evaluate((element) => element.outerHTML);
    expect(cardMarkup).not.toContain('costume-e2e-raw.png');
    expect(cardMarkup).not.toContain('10101');
    // Nowhere on a child's page at all: the severity number and the graph of findings this one sits in are for
    // whoever is checking the analysis, and the class-set view is where that happens.
    await expect(page.locator('.issue-technical')).toHaveCount(0);
    await expect(page.getByText('Finding 20202')).toHaveCount(0);
    // The block identifier likewise: the block it names is drawn right there.
    await expect(page.getByText('block-e2e-raw')).toHaveCount(0);

    // The analysis carries a catalogue entry, but its id is not this finder's and its title is not matched on.
    // An explanation of the wrong pattern is worse than none.
    await expect(page.getByText('Synthetic result catalogue entry')).not.toBeVisible();
    await expect(page.getByText('Synthetic question')).not.toBeVisible();
    await expect(page.getByRole('heading', { name: 'Relationships' })).not.toBeVisible();
    await expect(page.getByRole('heading', { name: 'Project assets' })).not.toBeVisible();
    await expect(page.getByRole('heading', { name: 'Catalogue' })).not.toBeVisible();
    await expect(page.getByRole('heading', { name: 'Check your understanding' })).not.toBeVisible();
    await expect(page.getByText('Text alternative')).toBeVisible();
    await expect(
        page.locator('.scratchblocks-rendered[data-render-state="ready"] svg'),
    ).toBeVisible();
    await page.getByText('Text alternative').click();
    await expect(page.getByText('move (10) steps')).toBeVisible();
    expect(statusCalls).toBeGreaterThanOrEqual(2);
});

test('renders authorized PNG and SVG thumbnails and falls back once for unsafe asset responses', async ({
    page,
}) => {
    const pngHash = 'c'.repeat(64);
    const svgHash = 'd'.repeat(64);
    const missingHash = 'e'.repeat(64);
    const malformedHash = 'f'.repeat(64);
    const unauthorizedHash = '1'.repeat(64);
    const validPng = Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
        'base64',
    );
    const validSvg =
        '<svg xmlns="http://www.w3.org/2000/svg" width="8" height="8" viewBox="0 0 8 8"><rect width="8" height="8" fill="#00a9c7"/></svg>';
    const value = completedStatus('thumbnail-token', true);
    const seedIssue = value.analysis.issues[0]!;
    value.analysis.issues = [
        {
            ...seedIssue,
            id: 1,
            finderName: 'PNG finding',
            sprite: 'PNG sprite',
            thumbnailRef: `/litterbox/api/v1/submissions/thumbnail-token/assets/${pngHash}`,
        },
        {
            ...seedIssue,
            id: 2,
            finderName: 'SVG finding',
            sprite: 'SVG sprite',
            thumbnailRef: `/litterbox/api/v1/submissions/thumbnail-token/assets/${svgHash}`,
        },
        {
            ...seedIssue,
            id: 3,
            finderName: 'Missing finding',
            sprite: 'Missing sprite',
            thumbnailRef: `/litterbox/api/v1/submissions/thumbnail-token/assets/${missingHash}`,
        },
        {
            ...seedIssue,
            id: 4,
            finderName: 'Malformed finding',
            sprite: 'Malformed sprite',
            thumbnailRef: `/litterbox/api/v1/submissions/thumbnail-token/assets/${malformedHash}`,
        },
        {
            ...seedIssue,
            id: 5,
            finderName: 'Unauthorized finding',
            sprite: 'Unauthorized sprite',
            thumbnailRef: `/litterbox/api/v1/submissions/thumbnail-token/assets/${unauthorizedHash}`,
        },
        {
            ...seedIssue,
            id: 6,
            finderName: 'Unsafe finding',
            sprite: 'Unsafe sprite',
            thumbnailRef: `https://example.invalid/assets/${'2'.repeat(64)}`,
        },
    ];
    const requestCounts = new Map<string, number>();
    page.on('request', (request) => {
        for (const hash of [pngHash, svgHash, missingHash, malformedHash, unauthorizedHash]) {
            if (request.url().includes(`/assets/${hash}`))
                requestCounts.set(hash, (requestCounts.get(hash) ?? 0) + 1);
        }
    });
    await page.route('**/api/v1/submissions/thumbnail-token/events', (route) => route.abort());
    await page.route('**/api/v1/submissions/thumbnail-token', (route) =>
        route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify(value),
        }),
    );
    await page.route(`**/assets/${pngHash}`, (route) =>
        route.fulfill({ status: 200, contentType: 'image/png', body: validPng }),
    );
    await page.route(`**/assets/${svgHash}`, (route) =>
        route.fulfill({ status: 200, contentType: 'image/svg+xml', body: validSvg }),
    );
    await page.route(`**/assets/${missingHash}`, (route) =>
        route.fulfill({ status: 404, contentType: 'text/plain', body: 'missing synthetic asset' }),
    );
    await page.route(`**/assets/${malformedHash}`, (route) =>
        route.fulfill({ status: 200, contentType: 'image/png', body: 'not a PNG' }),
    );
    await page.route(`**/assets/${unauthorizedHash}`, (route) =>
        route.fulfill({ status: 403, contentType: 'image/png', body: 'forbidden synthetic asset' }),
    );

    const responsePromises = [
        page.waitForResponse(`**/assets/${pngHash}`),
        page.waitForResponse(`**/assets/${svgHash}`),
        page.waitForResponse(`**/assets/${missingHash}`),
        page.waitForResponse(`**/assets/${malformedHash}`),
        page.waitForResponse(`**/assets/${unauthorizedHash}`),
    ];
    await page.goto('./submissions/thumbnail-token');
    const assetResponses = await Promise.all(responsePromises);
    expect(assetResponses.map((response) => response.status())).toEqual([200, 200, 404, 200, 403]);
    expect(assetResponses[0]?.headers()['content-type']).toContain('image/png');
    expect(assetResponses[1]?.headers()['content-type']).toContain('image/svg+xml');
    const pngBody = await assetResponses[0]!.body();
    const svgBody = await assetResponses[1]!.body();
    expect(pngBody.byteLength).toBeGreaterThan(0);
    expect(svgBody.byteLength).toBeGreaterThan(0);
    // Scoped to the findings: the sprite filter shows the same costumes again.
    await expect(page.locator('.issue-card .costume-thumbnail')).toHaveCount(2);
    await expect(page.getByRole('img', { name: 'Current costume for PNG sprite' })).toBeVisible();
    await expect(page.getByRole('img', { name: 'Current costume for SVG sprite' })).toBeVisible();
    await expect(
        page.getByRole('img', { name: 'Current costume for Missing sprite' }),
    ).toBeVisible();
    await expect(
        page.getByRole('img', { name: 'Current costume for Malformed sprite' }),
    ).toBeVisible();
    await expect(
        page.getByRole('img', { name: 'Current costume for Unauthorized sprite' }),
    ).toBeVisible();
    await expect(
        page.getByRole('img', { name: 'Current costume for Unsafe sprite' }),
    ).toBeVisible();
    expect(
        await page
            .locator('.issue-card .costume-thumbnail')
            .evaluateAll((images) =>
                images.map((image) => ({ complete: image.complete, width: image.naturalWidth })),
            ),
    ).toEqual([
        { complete: true, width: 1 },
        { complete: true, width: 8 },
    ]);
    await page.waitForTimeout(100);
    expect(Object.fromEntries(requestCounts)).toEqual({
        [pngHash]: 1,
        [svgHash]: 1,
        [missingHash]: 1,
        [malformedHash]: 1,
        [unauthorizedHash]: 1,
    });
    expect(requestCounts.has('2'.repeat(64))).toBe(false);
});

test('finding cards use two columns on desktop and one readable column at 320px and 200% zoom', async ({
    page,
}) => {
    await page.route('**/api/v1/submissions/layout-token/events', (route) => route.abort());
    await page.route('**/api/v1/submissions/layout-token', async (route) =>
        route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify(completedStatus('layout-token', true)),
        }),
    );

    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto('./submissions/layout-token');
    const card = page.locator('.issue-card').first();
    await expect(card).toBeVisible();
    const desktopLayout = await card.locator('.issue-card-body').evaluate((element) => {
        const style = getComputedStyle(element);
        const explanation = element.querySelector('.issue-explanation')?.getBoundingClientRect();
        const code = element.querySelector('.issue-code')?.getBoundingClientRect();
        return {
            columns: style.gridTemplateColumns.split(' ').filter(Boolean).length,
            explanationLeft: explanation?.left ?? 0,
            codeLeft: code?.left ?? 0,
        };
    });
    expect(desktopLayout.columns).toBe(2);
    expect(desktopLayout.codeLeft).toBeGreaterThan(desktopLayout.explanationLeft);

    for (const zoom of [1, 2]) {
        await page.setViewportSize({ width: 320, height: 844 });
        if (zoom === 2) await page.evaluate(() => (document.documentElement.style.zoom = '2'));
        const narrowLayout = await card.locator('.issue-card-body').evaluate((element) => {
            const style = getComputedStyle(element);
            const explanation = element
                .querySelector('.issue-explanation')
                ?.getBoundingClientRect();
            const code = element.querySelector('.issue-code')?.getBoundingClientRect();
            const mainRegion = document.querySelector<HTMLElement>('.main-region');
            return {
                columns: style.gridTemplateColumns.split(' ').filter(Boolean).length,
                explanationBottom: explanation?.bottom ?? 0,
                codeTop: code?.top ?? 0,
                cardOverflow: element.parentElement
                    ? element.parentElement.scrollWidth > element.parentElement.clientWidth
                    : true,
                mainRegionOverflow: mainRegion
                    ? mainRegion.scrollWidth > mainRegion.clientWidth
                    : true,
            };
        });
        expect(narrowLayout.columns).toBe(1);
        expect(narrowLayout.codeTop).toBeGreaterThanOrEqual(narrowLayout.explanationBottom - 1);
        expect(narrowLayout.cardOverflow).toBe(false);
        expect(narrowLayout.mainRegionOverflow).toBe(false);
        if (zoom === 2) await page.evaluate(() => (document.documentElement.style.zoom = ''));
    }
});

test('canonical Scratch URL stays behind the local API boundary', async ({ page }) => {
    const unexpectedScratchRequest: string[] = [];
    page.on('request', (request) => {
        if (request.url().includes('scratch.mit.edu')) unexpectedScratchRequest.push(request.url());
    });
    await page.route('**/api/v1/capabilities', async (route) =>
        route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
                schemaVersion: 1,
                litterboxVersion: 'synthetic-url',
                supportedLocales: ['de', 'en', 'es', 'nl'],
                enabledFeatures: ['single-project'],
            }),
        }),
    );
    await page.route('**/api/v1/submissions', async (route) => {
        expect(JSON.parse(route.request().postData() ?? '{}')).toEqual({
            projectUrl: 'https://scratch.mit.edu/projects/24680/',
        });
        await route.fulfill({
            status: 202,
            contentType: 'application/json',
            body: JSON.stringify({
                submissionId: 2,
                token: 'synthetic-url-token',
                status: 'queued',
                location: '/submissions/synthetic-url-token',
            }),
        });
    });
    await page.route('**/api/v1/submissions/synthetic-url-token', async (route) =>
        route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
                status: 'completed',
                token: 'synthetic-url-token',
                locale: 'en',
                sourceType: 'SCRATCH_URL',
                analysis: { id: 2, status: 'completed', issues: [] },
                analyses: [],
                counts: { expected: 1, completed: 1, failed: 0 },
            }),
        }),
    );

    await page.goto('./submit');
    await page.locator('#project-url').fill('https://scratch.mit.edu/projects/24680/');
    await page.locator('form button[type="submit"]').click();
    await expect(page).toHaveURL(/\/submissions\/synthetic-url-token$/);
    await expect(page.getByText('No findings were reported for this project.')).toBeVisible();
    expect(unexpectedScratchRequest).toEqual([]);
});
