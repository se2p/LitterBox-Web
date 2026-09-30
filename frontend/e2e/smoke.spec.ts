// SPDX-License-Identifier: EUPL-1.2
// SPDX-FileCopyrightText: 2025 LitterBox-Web contributors
import { expect, test } from '@playwright/test';

test('home leads with Scratch analysis and the footer names the analysis version', async ({
    page,
}) => {
    const usesRealApi = process.env.PLAYWRIGHT_REAL_API === 'true';
    let syntheticCapabilityRequests = 0;

    if (!usesRealApi) {
        await page.route('**/api/v1/capabilities', async (route) => {
            syntheticCapabilityRequests += 1;
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({
                    schemaVersion: 1,
                    litterboxVersion: 'synthetic-e2e',
                    supportedLocales: ['de', 'en', 'es', 'nl'],
                    enabledFeatures: ['single-project'],
                }),
            });
        });
    }
    const capabilitiesResponse = usesRealApi
        ? page.waitForResponse(
              (response) => response.url().endsWith('/api/v1/capabilities') && response.ok(),
          )
        : undefined;
    await page.goto('./');
    await expect(page.getByRole('heading', { name: 'LitterBox', level: 1 })).toBeVisible();
    // Drawn ahead of time and shipped as a picture: the home page fetches no block renderer for it.
    const illustration = page.getByRole('img', { name: 'A small Scratch program' });
    await expect(illustration).toBeVisible();
    // Decoded, not merely present: a picture that failed to load is still a visible <img> of nothing.
    // Polled, because being laid out and being decoded are not the same moment.
    await expect
        .poll(() => illustration.evaluate((image: HTMLImageElement) => image.naturalWidth))
        .toBeGreaterThan(0);
    await expect(page.locator('#project-file')).toBeVisible();
    if (!usesRealApi) expect(syntheticCapabilityRequests).toBeGreaterThanOrEqual(1);
    // Read while the response is still the current page's. Navigating away discards the body, and the
    // second visit below is a navigation.
    const capabilities = capabilitiesResponse
        ? await (await capabilitiesResponse).json()
        : undefined;
    // The readiness page is gone; a bookmark of it lands on the analyser rather than on nothing.
    await page.goto('./status');
    await expect(page.locator('#project-file')).toBeVisible();

    if (capabilities) {
        expect(capabilities).toMatchObject({
            schemaVersion: 1,
            supportedLocales: ['de', 'en', 'es', 'nl'],
        });
    } else {
        expect(syntheticCapabilityRequests).toBeGreaterThan(0);
        await expect(page.getByText('LitterBox synthetic-e2e')).toBeVisible();
    }
});

const localeExpectations = {
    de: {
        title: 'Projektanalyse',
        empty: 'Für dieses Projekt wurden keine Befunde gemeldet.',
        failed: 'Analyse fehlgeschlagen',
    },
    en: {
        title: 'Project analysis',
        empty: 'No findings were reported for this project.',
        failed: 'Analysis failed',
    },
    es: {
        title: 'Análisis del proyecto',
        empty: 'No se han encontrado resultados.',
        failed: 'Análisis fallido',
    },
    nl: {
        title: 'Projectanalyse',
        empty: 'Voor dit project zijn geen bevindingen gemeld.',
        failed: 'Analyse mislukt',
    },
} as const;

for (const [locale, expected] of Object.entries(localeExpectations)) {
    test(`single-project URL submission works in ${locale}`, async ({ page }) => {
        await page.route('**/api/v1/capabilities', async (route) =>
            route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({
                    schemaVersion: 1,
                    litterboxVersion: 'synthetic-e2e',
                    supportedLocales: ['de', 'en', 'es', 'nl'],
                    enabledFeatures: ['single-project', 'feedback', 'qlc', 'catalogue'],
                }),
            }),
        );
        await page.route('**/api/v1/submissions', async (route) =>
            route.fulfill({
                status: 202,
                contentType: 'application/json',
                body: JSON.stringify({
                    submissionId: 'synthetic-submission',
                    token: 'synthetic-token',
                    status: 'queued',
                }),
            }),
        );
        await page.route('**/api/v1/submissions/synthetic-token', async (route) =>
            route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({ status: 'completed', analysis: { issues: [] } }),
            }),
        );
        await page.goto('./');
        await page.locator('#language-select').selectOption(locale);
        await expect(page.locator('html')).toHaveAttribute('lang', locale);
        await page.locator('#project-url').fill('https://scratch.mit.edu/projects/12345/');
        await page.locator('form button[type="submit"]').click();
        await expect(page).toHaveURL(/\/submissions\/synthetic-token$/);
        await expect(page.getByRole('heading', { name: expected.title })).toBeVisible();
        await expect(page.getByText(expected.empty)).toBeVisible();
    });

    test(`studio batch submission works in ${locale}`, async ({ page }) => {
        await page.route('**/api/v1/capabilities', async (route) =>
            route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({
                    schemaVersion: 1,
                    litterboxVersion: 'synthetic-e2e',
                    supportedLocales: ['de', 'en', 'es', 'nl'],
                    enabledFeatures: ['studio'],
                }),
            }),
        );
        await page.route('**/api/v1/studios/12345', async (route) =>
            route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({
                    studioId: '12345',
                    title: 'Synthetic studio',
                    readable: true,
                    projects: 240,
                }),
            }),
        );
        await page.route('**/api/v1/submissions', async (route) => {
            expect(JSON.parse(route.request().postData() ?? '{}')).toEqual({ studioId: '12345' });
            await route.fulfill({
                status: 202,
                contentType: 'application/json',
                body: JSON.stringify({
                    submissionId: 'synthetic-studio',
                    token: 'synthetic-studio-token',
                    status: 'queued',
                }),
            });
        });
        await page.route('**/api/v1/submissions/synthetic-studio-token', async (route) =>
            route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({
                    status: 'partial',
                    sourceType: 'studio',
                    counts: { expected: 2, completed: 1, failed: 1 },
                    analyses: [
                        { name: 'Synthetic success', status: 'completed', issues: [] },
                        {
                            name: 'Synthetic failure',
                            status: 'failed',
                        },
                    ],
                }),
            }),
        );
        await page.goto('./teacher');
        await page.locator('#language-select').selectOption(locale);
        await page.locator('#studio-id').fill('https://scratch.mit.edu/studios/12345/');
        // The studio is read first, which is also what releases the button. Waiting on the button rather than on
        // the wording, because this test runs in four languages.
        await expect(page.locator('form button[type="submit"]')).toBeEnabled();
        await page.locator('form button[type="submit"]').click();
        // Two hundred and forty projects is a long run to start by accident, so the send is confirmed first. Taken
        // by position rather than by name, for the same four languages.
        await page.getByRole('dialog').locator('.dialog-actions button').nth(1).click();
        await expect(page).toHaveURL(/\/submissions\/synthetic-studio-token$/);
        // The class set opens on its overview, with the project reports folded away until asked for.
        await page.locator('#batch-all-projects > summary').click();
        await expect(
            page.locator('.batch-result-select', { hasText: 'Synthetic success' }),
        ).toBeVisible();
        // What went wrong is gathered above the table rather than carried in a cell, so the reason has the width
        // of the card and the project names keep theirs.
        await expect(page.locator('.batch-failure-list')).toContainText('Synthetic failure');
        await expect(page.locator('.batch-failure-list')).toContainText(expected.failed);
    });
}
