// SPDX-License-Identifier: EUPL-1.2
// SPDX-FileCopyrightText: 2026 LitterBox-Web contributors

import JSZip from 'jszip';
import { expect, test, type Page } from '@playwright/test';

const locales = ['de', 'en', 'es', 'nl'] as const;
type Locale = (typeof locales)[number];

const viewports = {
    desktop: { width: 1440, height: 1000 },
    mobile: { width: 390, height: 844 },
} as const;

const partialLabels: Record<Locale, string> = {
    de: 'Analyse teilweise abgeschlossen',
    en: 'Analysis partly complete',
    es: 'Análisis parcialmente completado',
    nl: 'Analyse gedeeltelijk voltooid',
};

const batchHeadings: Record<Locale, string> = {
    de: 'Zusammenfassung des Klassensatzes',
    en: 'Class set summary',
    es: 'Resumen del conjunto de clase',
    nl: 'Overzicht van de klassenset',
};

const capabilities = (enabledFeatures: string[]) => ({
    schemaVersion: 1,
    litterboxVersion: 'synthetic-acceptance',
    supportedLocales: [...locales],
    enabledFeatures,
});

const partialResponse = (locale: Locale, status = 'partial') => ({
    token: 'synthetic-browser-batch',
    status,
    sourceType: 'TEACHER_BATCH',
    locale,
    counts: { expected: 5, completed: 2, failed: 1 },
    analyses: [
        {
            id: 1,
            name: 'successful.sb3',
            status: 'completed',
            issues: [],
        },
        {
            id: 2,
            name: `dense-${'synthetic-'.repeat(20)}.mblock`,
            status: 'completed',
            issues: [],
        },
        {
            id: 3,
            name: 'failed.sb3',
            status: 'failed',
            failureMessage: 'raw upstream error with private artifact manifest storageKey username',
        },
        { id: 4, name: 'running.sb3', status: 'running', issues: [] },
        { id: 5, name: 'queued.mblock', status: 'queued', issues: [] },
    ],
    author_username: 'synthetic-private-user',
    sourceManifest: 'synthetic-private-manifest',
    storageKey: 'synthetic-private-storage-key',
    privateArtifact: 'synthetic-private-artifact',
});

async function mockBatchStatus(page: Page, locale: Locale, status = 'partial') {
    await page.addInitScript((selectedLocale) => {
        window.localStorage.setItem('litterbox.locale', selectedLocale);
    }, locale);
    await page.route('**/api/v1/submissions/synthetic-browser-batch/events', (route) =>
        route.abort('failed'),
    );
    await page.route('**/api/v1/submissions/synthetic-browser-batch', (route) =>
        route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify(partialResponse(locale, status)),
        }),
    );
}

async function teacherArchive(): Promise<Buffer> {
    const project = new JSZip();
    project.file('project.json', JSON.stringify({ targets: [] }));
    const projectBytes = await project.generateAsync({ type: 'nodebuffer' });
    const outer = new JSZip();
    outer.file('successful.sb3', projectBytes);
    outer.file('successful.mblock', projectBytes);
    return outer.generateAsync({ type: 'nodebuffer' });
}

for (const [viewportName, viewport] of Object.entries(viewports)) {
    test.describe(`batch status acceptance on ${viewportName}`, () => {
        test.use({ viewport });

        for (const locale of locales) {
            test(`renders partial results safely in ${locale}`, async ({ page }) => {
                await mockBatchStatus(page, locale);
                await page.emulateMedia({ reducedMotion: 'reduce' });
                await page.goto('./submissions/synthetic-browser-batch');

                await expect(page.getByText(partialLabels[locale]).first()).toBeVisible();
                await expect(
                    page.getByRole('heading', { name: batchHeadings[locale] }),
                ).toBeVisible();
                await expect(page.getByRole('progressbar')).toHaveCount(0);
                await page.locator('#batch-all-projects > summary').click();
                await expect(page.getByText('successful.sb3').first()).toBeVisible();
                await expect(page.getByText(/dense-synthetic-.*\.mblock/)).toBeVisible();
                await expect(page.getByText(/raw upstream error|synthetic-private/)).toHaveCount(0);

                const select = page.locator('.batch-result-select').nth(1);
                await select.focus();
                await page.keyboard.press('Enter');
                const inspector = page.locator('#batch-project-inspector');
                await expect(inspector).toBeVisible();
                await expect(
                    inspector.locator('p').filter({ hasText: /dense-synthetic-.*\.mblock/ }),
                ).toBeVisible();
                await inspector.getByRole('button').first().click();
                await page.locator('#batch-all-projects > summary').click();
                await expect(page.locator('.batch-result-select').nth(1)).toBeVisible();

                const table = await page
                    .locator('#batch-all-projects .batch-table-scroll')
                    .evaluate((element) => {
                        const cell = element.querySelector('tbody th') as HTMLElement;
                        const button = cell.querySelector('button') as HTMLElement;
                        const padding = getComputedStyle(cell);
                        return {
                            scrollWidth: element.scrollWidth,
                            clientWidth: element.clientWidth,
                            nameWidth: button.getBoundingClientRect().width,
                            cellWidth:
                                cell.getBoundingClientRect().width -
                                parseFloat(padding.paddingLeft) -
                                parseFloat(padding.paddingRight),
                        };
                    });
                expect(table.nameWidth, JSON.stringify(table)).toBeGreaterThanOrEqual(
                    table.cellWidth - 1,
                );
                if (viewportName === 'desktop')
                    expect(table.scrollWidth, JSON.stringify(table)).toBeLessThanOrEqual(
                        table.clientWidth,
                    );

                const reducedMotionDuration = await page
                    .locator('.card')
                    .first()
                    .evaluate((element) => getComputedStyle(element).transitionDuration);
                expect(parseFloat(reducedMotionDuration)).toBeLessThanOrEqual(0.01);

                await page.setViewportSize({
                    width: Math.floor(viewport.width / 2),
                    height: viewport.height,
                });
                const reflowsWithoutHorizontalOverflow = await page.evaluate(
                    () =>
                        document.documentElement.scrollWidth <=
                        document.documentElement.clientWidth + 1,
                );
                expect(reflowsWithoutHorizontalOverflow).toBe(true);
            });
        }
    });
}

test('teacher archive submission retains one idempotency key and reaches a partial result', async ({
    page,
}) => {
    await page.route('**/api/v1/capabilities', (route) =>
        route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify(capabilities(['teacher-archive'])),
        }),
    );
    let idempotencyKey = '';
    await page.route('**/api/v1/submissions', async (route) => {
        idempotencyKey = route.request().headers()['idempotency-key'] ?? '';
        await route.fulfill({
            status: 202,
            contentType: 'application/json',
            body: JSON.stringify({
                submissionId: 91,
                token: 'synthetic-teacher-browser',
                status: 'queued',
            }),
        });
    });
    await page.route('**/api/v1/submissions/synthetic-teacher-browser/events', (route) =>
        route.abort('failed'),
    );
    await page.route('**/api/v1/submissions/synthetic-teacher-browser', (route) =>
        route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
                ...partialResponse('en'),
                token: 'synthetic-teacher-browser',
            }),
        }),
    );

    await page.goto('./teacher');
    await page.locator('#teacher-archive').setInputFiles({
        name: 'synthetic-teacher.zip',
        mimeType: 'application/zip',
        buffer: await teacherArchive(),
    });
    await expect(page.getByRole('status')).toContainText('2 projects are ready to analyse.');
    await page.locator('form button[type="submit"]').click();
    await expect(page).toHaveURL(/\/submissions\/synthetic-teacher-browser$/);
    await page.locator('#batch-all-projects > summary').click();
    const row = page.getByRole('button', { name: /successful\.sb3/ });
    await expect(row).toBeVisible();
    await row.click();
    await expect(
        page.locator('#batch-project-inspector p').filter({ hasText: 'successful.sb3' }),
    ).toBeVisible();
    expect(idempotencyKey).not.toBe('');
});

test('studio submission sends only the numeric id and terminal reload remains private', async ({
    page,
}) => {
    await page.route('**/api/v1/capabilities', (route) =>
        route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify(capabilities(['studio'])),
        }),
    );
    await page.route('**/api/v1/studios/12345', (route) =>
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
    let submittedBody = '';
    await page.route('**/api/v1/submissions', async (route) => {
        submittedBody = route.request().postData() ?? '';
        await route.fulfill({
            status: 202,
            contentType: 'application/json',
            body: JSON.stringify({
                submissionId: 92,
                token: 'synthetic-studio-browser',
                status: 'queued',
            }),
        });
    });
    await page.route('**/api/v1/submissions/synthetic-studio-browser/events', (route) =>
        route.abort('failed'),
    );
    await page.route('**/api/v1/submissions/synthetic-studio-browser', (route) =>
        route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
                ...partialResponse('en', 'completed'),
                token: 'synthetic-studio-browser',
            }),
        }),
    );

    await page.goto('./teacher');
    await page.locator('#studio-id').fill('12345');
    await expect(
        page.getByText('“Synthetic studio” holds 240 projects, ready to analyse.'),
    ).toBeVisible();
    await page.locator('form button[type="submit"]').click();
    const confirm = page.getByRole('dialog');
    await expect(confirm).toBeVisible();
    await expect(confirm).toContainText('240 projects are fetched from the studio');
    await confirm.getByRole('button', { name: 'Check the studio' }).click();
    await expect(page).toHaveURL(/\/submissions\/synthetic-studio-browser$/);
    await expect(page.getByText('Analysis complete').first()).toBeVisible();
    expect(JSON.parse(submittedBody)).toEqual({ studioId: '12345' });
    await page.reload();
    await expect(page.getByText('Analysis complete').first()).toBeVisible();
    await expect(page.getByText(/raw upstream error|synthetic-private/)).toHaveCount(0);
});

test('separates the three teacher sections even with earlier results listed between them', async ({
    page,
}) => {
    await page.route('**/api/v1/capabilities', (route) =>
        route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify(
                capabilities(['single-project', 'teacher-archive', 'studio', 'qlc']),
            ),
        }),
    );
    await page.addInitScript(() => {
        window.localStorage.setItem(
            'litterbox.recent-projects',
            JSON.stringify([
                { token: 'synthetic', name: 'synthetic-class.zip', kind: 'batch', projects: 24 },
            ]),
        );
    });
    await page.goto('./teacher');
    await expect(page.locator('.recent-results-forget')).toBeVisible();

    const spacing = await page.evaluate(() => {
        const sections = [...document.querySelectorAll('.teacher-workflow')];
        return {
            count: sections.length,
            following: sections.slice(1).map((section) => {
                const previous = section.previousElementSibling;
                if (!previous) return null;
                const style = getComputedStyle(section);
                return {
                    gap: Math.round(
                        section.getBoundingClientRect().top -
                            previous.getBoundingClientRect().bottom,
                    ),
                    border: parseFloat(style.borderTopWidth),
                };
            }),
        };
    });
    expect(spacing.count, JSON.stringify(spacing)).toBe(3);
    for (const section of spacing.following) {
        expect(section, JSON.stringify(spacing)).not.toBeNull();
        expect(section!.border, JSON.stringify(spacing)).toBeGreaterThan(0);
        expect(section!.gap, JSON.stringify(spacing)).toBeGreaterThanOrEqual(24);
    }
});

test('cancellation resumes from a disconnected event stream', async ({ page }) => {
    await mockBatchStatus(page, 'en', 'processing');
    let cancellationCalls = 0;
    await page.route('**/api/v1/submissions/synthetic-browser-batch/cancel', async (route) => {
        cancellationCalls += 1;
        await route.fulfill({ status: 204 });
    });
    await page.route('**/api/v1/submissions/synthetic-browser-batch', (route) =>
        route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify(
                partialResponse('en', cancellationCalls ? 'cancelled' : 'processing'),
            ),
        }),
    );
    await page.goto('./submissions/synthetic-browser-batch');
    await page.getByRole('button', { name: 'Cancel submission' }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await page.getByRole('button', { name: 'Cancel submission' }).click();
    await dialog.getByRole('button', { name: 'Cancel submission' }).click();
    await expect(page.getByText('Analysis cancelled')).toBeVisible();
    expect(cancellationCalls).toBe(1);
});
