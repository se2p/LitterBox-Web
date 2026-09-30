// SPDX-License-Identifier: EUPL-1.2
// SPDX-FileCopyrightText: 2026 LitterBox-Web contributors

import { expect, test, type Page } from '@playwright/test';

const token = 'synthetic-graph-token';
const graphDot =
    'digraph { rankdir=LR; start [label="Synthetic start"]; start -> finish; finish [label="Safe finish"]; }';

const completedSubmission = {
    schemaVersion: 1,
    submissionId: 71,
    token,
    status: 'completed',
    locale: 'en',
    sourceType: 'UPLOAD',
    analysis: {
        id: 17,
        status: 'completed',
        name: 'synthetic-graph-project.sb3',
        inputFormat: 'sb3',
        metrics: { block_count: 24, script_count: 3, synthetic_metric: 1.5 },
        issues: [],
        relationships: [],
        catalogue: [],
        quiz: [],
        assetRefs: [],
    },
    analyses: [],
    counts: { expected: 1, completed: 1, failed: 0 },
};

async function openGraphSection(page: Page) {
    const summary = page.locator('.fold-section-title', { hasText: 'Program graphs' });
    await expect(summary).toBeVisible();
    if (!(await page.getByRole('combobox', { name: 'Graph type' }).isVisible()))
        await summary.click();
    await expect(page.getByRole('combobox', { name: 'Graph type' })).toBeVisible();
}

test('requests and safely renders one selected graph on demand', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    let graphRequests = 0;
    await page.route('**/api/v1/capabilities', async (route) =>
        route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
                schemaVersion: 1,
                litterboxVersion: 'synthetic-graph',
                supportedLocales: ['de', 'en', 'es', 'nl'],
                enabledFeatures: ['single-project', 'metrics-graphs'],
            }),
        }),
    );
    await page.route(`**/api/v1/submissions/${token}`, async (route) =>
        route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify(completedSubmission),
        }),
    );
    await page.route(`**/api/v1/submissions/${token}/analyses/17/graphs/cfg`, async (route) => {
        graphRequests += 1;
        expect(route.request().method()).toBe('GET');
        expect(route.request().headers().authorization).toBe(`Bearer ${token}`);
        await route.fulfill({
            status: 200,
            headers: {
                'Content-Type': 'text/vnd.graphviz;charset=UTF-8',
                'X-LitterBox-Graph-Nodes': '2',
                'X-LitterBox-Graph-Edges': '1',
            },
            body: graphDot,
        });
    });

    await page.goto(`./submissions/${token}`);
    await expect(page.getByRole('link', { name: 'Open advanced analysis' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Persisted metrics' })).toHaveCount(0);
    await page.getByRole('link', { name: 'Open advanced analysis' }).click();
    await expect(page.getByRole('heading', { name: 'Advanced analysis' })).toBeVisible();
    await expect(
        page.getByRole('heading', { name: 'Persisted metrics', exact: true }),
    ).toBeVisible();
    await expect(page.getByText('24').first()).toBeVisible();
    await expect(page.getByText('block_count')).toBeVisible();
    expect(graphRequests).toBe(0);

    await openGraphSection(page);
    await page.getByRole('combobox', { name: 'Graph type' }).selectOption('cfg');
    await page.getByRole('button', { name: 'Render selected graph' }).click();

    await expect(page.getByRole('heading', { name: 'CFG result' })).toBeFocused();
    // Clipped away rather than removed: it is still spoken, and Playwright still counts a clipped node as visible.
    await expect(page.getByText('CFG is ready.')).toHaveClass('visually-hidden');
    await expect(page.getByRole('img', { name: 'CFG graph. Nodes: 2. Edges: 1.' })).toBeVisible();
    await expect(page.locator('.metrics-graph-viewport > svg')).toBeVisible();
    await expect(page.locator('.metrics-graph-viewport script')).toHaveCount(0);
    expect(graphRequests).toBe(1);

    await page.getByText('Show plain-text DOT alternative').click();
    await expect(page.getByText(graphDot)).toBeVisible();

    const zoomLevel = page.locator('.metrics-graph-zoom-level');
    const zoomBefore = await zoomLevel.textContent();
    await page.getByRole('button', { name: 'Expand graph' }).click();
    const dialog = page.getByRole('dialog', { name: 'Expanded graph' });
    await expect(dialog).toBeVisible();
    await expect(page.getByRole('button', { name: 'Close expanded graph' })).toBeFocused();
    expect(graphRequests).toBe(1);
    expect(await zoomLevel.textContent()).toBe(zoomBefore);

    await page.getByRole('button', { name: 'Zoom in' }).click();
    expect(await zoomLevel.textContent()).not.toBe(zoomBefore);
    await page.locator('.metrics-graph-canvas').focus();
    await page.keyboard.press('ArrowRight');

    const zoomExpanded = await zoomLevel.textContent();
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Expand graph' })).toBeFocused();
    expect(await zoomLevel.textContent()).toBe(zoomExpanded);
    expect(graphRequests).toBe(1);
    await expect(page.locator('.metrics-graph-viewport > svg')).toBeVisible();
});

test('the production CSP permits Graphviz WebAssembly', async ({ page }) => {
    test.skip(!process.env.PLAYWRIGHT_BASE_URL, 'requires the deployed production base URL');

    const response = await page.goto('./');
    const contentSecurityPolicy = response?.headers()['content-security-policy'] ?? '';
    expect(contentSecurityPolicy).toContain('wasm-unsafe-eval');
    await expect
        .poll(() =>
            page.evaluate(async () => {
                try {
                    await WebAssembly.compile(new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0]));
                    return true;
                } catch {
                    return false;
                }
            }),
        )
        .toBe(true);
});

test('the production deployment renders every supported graph type', async ({ page }) => {
    const deployedToken = process.env.PLAYWRIGHT_GRAPH_TOKEN;
    test.skip(
        !process.env.PLAYWRIGHT_BASE_URL ||
            process.env.PLAYWRIGHT_REAL_API !== 'true' ||
            !deployedToken,
        'requires a deployed synthetic analysis',
    );

    await page.goto(`./submissions/${encodeURIComponent(deployedToken as string)}`);
    await page.getByRole('link', { name: 'Open advanced analysis' }).click();
    await openGraphSection(page);

    const renderEveryGraphType = async () => {
        for (const graphType of ['ast', 'cfg', 'cdg', 'ddg', 'dt', 'pdt', 'tdg', 'pdg']) {
            const label = graphType.toUpperCase();
            await page.getByRole('combobox', { name: 'Graph type' }).selectOption(graphType);
            await page.getByRole('button', { name: 'Render selected graph' }).click();
            await expect(page.getByRole('heading', { name: `${label} result` })).toBeFocused({
                timeout: 30_000,
            });
            await expect(page.locator('.metrics-graph-viewport > svg')).toBeVisible();
            await expect(page.locator('.metrics-graph-viewport script')).toHaveCount(0);
            expect(
                await page.evaluate(
                    () =>
                        document.documentElement.scrollWidth <=
                        document.documentElement.clientWidth,
                ),
            ).toBe(true);
        }
    };

    await renderEveryGraphType();
    await page.setViewportSize({ width: 320, height: 900 });
    await renderEveryGraphType();
});
