// SPDX-License-Identifier: EUPL-1.2
// SPDX-FileCopyrightText: 2025 LitterBox-Web contributors

import { expect, test, type Locator, type Page, type Request } from '@playwright/test';

const locales = ['de', 'en', 'es', 'nl'] as const;
type Locale = (typeof locales)[number];

const viewports = {
    desktop: { width: 1440, height: 1000 },
    mobile: { width: 390, height: 844 },
} as const;
type ViewportName = keyof typeof viewports;

const headings = {
    home: { de: 'LitterBox', en: 'LitterBox', es: 'LitterBox', nl: 'LitterBox' },
    advanced: {
        de: 'Erweiterte Analyse',
        en: 'Advanced analysis',
        es: 'Análisis avanzado',
        nl: 'Geavanceerde analyse',
    },
    questions: { de: 'Frag mich', en: 'Ask me', es: 'Pregúntame', nl: 'Vraag me' },
    result: {
        de: 'Projektanalyse',
        en: 'Project analysis',
        es: 'Análisis del proyecto',
        nl: 'Projectanalyse',
    },
    catalogue: { de: 'Katalog', en: 'Catalogue', es: 'Catálogo', nl: 'Catalogus' },
    contact: { de: 'Kontakt', en: 'Contact', es: 'Contacto', nl: 'Contact' },
} as const;

const capabilities = {
    schemaVersion: 1,
    litterboxVersion: 'synthetic-visual',
    supportedLocales: ['de', 'en', 'es', 'nl'],
    enabledFeatures: ['single-project', 'feedback', 'qlc', 'catalogue'],
};

const batchCapabilities = {
    ...capabilities,
    enabledFeatures: ['single-project', 'teacher-archive', 'studio'],
};

const graphDot =
    'digraph { rankdir=LR; start [label="Synthetic start"]; start -> finish; finish [label="Safe finish"]; }';

const translatedFixtureText = (locale: Locale): string => {
    switch (locale) {
        case 'de':
            return 'Dieser vollständig synthetische Befund enthält absichtlich eine sehr lange deutsche Beschreibung, damit Umbruch, Lesbarkeit und dichte Ergebnisdarstellung geprüft werden können.';
        case 'es':
            return 'Este resultado completamente sintético contiene deliberadamente una descripción española muy larga para comprobar el ajuste de línea, la legibilidad y una presentación de resultados densa.';
        case 'nl':
            return 'Deze volledig synthetische bevinding bevat opzettelijk een zeer lange Nederlandse beschrijving om regelafbreking, leesbaarheid en een compacte resultaatweergave te controleren.';
        default:
            return 'This entirely synthetic finding deliberately contains a long description for checking wrapping, readability, and dense result presentation.';
    }
};

const catalogueEntry = (
    locale: Locale,
    id: string,
    issueType: string | undefined,
    severity: number,
) => ({
    id,
    title: `${translatedFixtureText(locale)} — ${id}`,
    description: translatedFixtureText(locale),
    locale,
    fallback: true,
    instruction: '',
    examples: [],
    provenance: 'synthetic-visual-fixture',
    licence: 'local synthetic fixture',
    issueType,
    severity,
    fallbackFields: ['instruction', 'examples'],
});

const catalogueEntries = (locale: Locale) => [
    { ...catalogueEntry(locale, 'synthetic-bug', 'bug', 3), blockSet: 'scratch' },
    { ...catalogueEntry(locale, 'synthetic-smell', 'smell', 2), blockSet: 'qscratch' },
    {
        ...catalogueEntry(locale, 'synthetic-perfume', 'perfume', 1),
        blockSet: 'mblock',
        examples: [
            {
                label: 'Synthetic mBlock device icons',
                scratchblocks:
                    '@codeyA move forward at power (50) % for (1) secs :: motion\n\n' +
                    '(@codeyB loudness :: sensing)\n\n' +
                    "@rocky set Rocky's light with color [red v] :: lighting\n\n" +
                    '@mBot move forward at power (50) % for (1) secs :: motion\n\n' +
                    '@codeyB show image @matrix :: looks',
            },
        ],
    },
    { ...catalogueEntry(locale, 'synthetic-unclassified', undefined, 1), blockSet: 'scratch' },
];

const issue = (
    id: number,
    family: 'bug' | 'smell' | 'perfume',
    severity: number,
    locale: Locale,
) => ({
    id,
    finderId: `synthetic-${family}-${id}`,
    finderName: `${family.toUpperCase()}: ${translatedFixtureText(locale)}`,
    type: family,
    hint: `[b]${translatedFixtureText(locale)}[/b][newLine] [sbi]move (10) steps[/sbi] [var]score[/var] [LEQ] [TRUE] [FALSE] [IF] [ELSE] [sbVariables] [c=#08718f]safe colour[/c]`,
    sprite: `Synthetic sprite ${id}`,
    blockId: `synthetic-block-${id}-with-a-long-identifier-for-reflow`,
    costume: `missing-synthetic-costume-${id}.png`,
    scratchblocks:
        '[scratchblocks]\nwhen green flag clicked\nrepeat (10)\nmove (10) steps\nturn cw (15) degrees\nsay [a deliberately wide synthetic Scratchblocks input for local overflow verification]\nend\n[/scratchblocks]',
    duplicates: family === 'smell' ? [1] : [],
    subsumedBy: [],
    coupledWith: family === 'bug' ? [2] : [],
    severity,
    costumes: [],
    currentCostume: -1,
    refactoringScratchblocks:
        family === 'smell'
            ? '[scratchblocks]\ndefine move safely\nmove (5) steps\nmove (5) steps\n[/scratchblocks]'
            : null,
    similarTo: family === 'perfume' ? [{ id: 2, similarity: 0.8 }] : [],
});

const completedResult = (
    locale: Locale,
    issues = [
        issue(1, 'bug', 3, locale),
        issue(2, 'smell', 2, locale),
        issue(3, 'perfume', 1, locale),
    ],
) => ({
    schemaVersion: 1,
    submissionId: 42,
    token: 'synthetic-result',
    status: 'completed',
    locale,
    sourceType: 'UPLOAD',
    expectedCount: 1,
    completedCount: 1,
    failedCount: 0,
    counts: { expected: 1, completed: 1, failed: 0 },
    analyses: [],
    analysis: {
        id: 7,
        status: 'completed',
        name: `synthetic-${locale}-project-with-a-long-name.sb3`,
        failureType: null,
        failureMessage: null,
        reportSchemaVersion: '1',
        litterboxVersion: 'synthetic',
        locale,
        provenance: 'synthetic-visual-fixture',
        detectors: ['synthetic-detector'],
        configuration: {},
        sourceSha256: null,
        inputFormat: 'sb3',
        metrics: { blocks: 128, sprites: 4, scripts: 17 },
        issues,
        relationships: [],
        catalogue: [],
        quiz: [],
        assetRefs: [],
    },
});

const failedResult = (locale: Locale) => ({
    schemaVersion: 1,
    submissionId: 43,
    token: 'synthetic-failed',
    status: 'failed',
    locale,
    sourceType: 'UPLOAD',
    counts: { expected: 1, completed: 0, failed: 1 },
    analysis: {
        id: 8,
        status: 'failed',
        name: 'synthetic-failed-project.sb3',
        failureType: 'SYNTHETIC_FAILURE',
        failureMessage: translatedFixtureText(locale),
        issues: [],
    },
    analyses: [],
});

const processingResult = (locale: Locale) => ({
    schemaVersion: 1,
    submissionId: 44,
    token: 'synthetic-processing',
    status: 'processing',
    locale,
    sourceType: 'UPLOAD',
    counts: { expected: 1, completed: 0, failed: 0 },
    analyses: [],
});

const partialResult = (locale: Locale) => {
    const completed = completedResult(locale);
    return {
        ...completed,
        token: 'synthetic-partial',
        status: 'partial',
        sourceType: 'TEACHER_BATCH',
        counts: { expected: 3, completed: 1, failed: 1 },
        analyses: [
            completed.analysis,
            {
                id: 9,
                status: 'failed',
                name: 'synthetic-failed-child.sb3',
                failureType: 'SYNTHETIC_FAILURE',
                failureMessage: translatedFixtureText(locale),
                issues: [],
            },
            {
                id: 10,
                status: 'processing',
                name: 'synthetic-processing-child.sb3',
                issues: [],
            },
        ],
    };
};

const completedBatchResult = (locale: Locale) => {
    const completed = completedResult(locale);
    return {
        ...completed,
        token: 'synthetic-batch-completed',
        sourceType: 'TEACHER_BATCH',
        counts: { expected: 2, completed: 2, failed: 0 },
        analysis: null,
        analyses: [
            completed.analysis,
            {
                ...completed.analysis,
                id: 11,
                name: `synthetic-${locale}-second-project.sb3`,
                issues: [],
            },
        ],
    };
};

interface SyntheticOptions {
    locale: Locale;
    submission?: 'completed' | 'batch-completed' | 'empty' | 'failed' | 'partial' | 'processing';
    features?: string[];
    missingBrandAssets?: boolean;
}

const trackedRequestTypes = new Set(['font', 'script', 'stylesheet', 'image']);

function externalRequestGate(page: Page): string[] {
    const unapproved: string[] = [];
    const inspect = (request: Request) => {
        if (!trackedRequestTypes.has(request.resourceType())) return;
        const url = new URL(request.url());
        if (!['http:', 'https:'].includes(url.protocol)) return;
        if (['127.0.0.1', 'localhost'].includes(url.hostname)) return;
        unapproved.push(`${request.resourceType()}: ${request.url()}`);
    };
    page.on('request', inspect);
    return unapproved;
}

async function mockSyntheticApis(page: Page, options: SyntheticOptions) {
    await page.addInitScript((locale) => {
        window.localStorage.setItem('litterbox.locale', locale);
    }, options.locale);
    if (options.missingBrandAssets)
        await page.route('**/brand/*', async (route) => route.abort('failed'));
    await page.route('**/api/v1/capabilities', async (route) =>
        route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify(
                options.features
                    ? { ...capabilities, enabledFeatures: options.features }
                    : capabilities,
            ),
        }),
    );
    await page.route('**/api/v1/catalogue**', async (route) =>
        route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify(catalogueEntries(options.locale)),
        }),
    );
    // What is usual across the projects analysed here. Without it the measurements render as bare numbers, so a
    // fixture that leaves it out never draws the qualifier beside them — which is the part long enough to decide
    // whether the line still fits a narrow window. The service answers this; a page test that does not is only
    // checking the half of the line that was never in question.
    await page.route('**/api/v1/metrics/reference', async (route) =>
        route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
                metrics: ['sprite_count', 'script_count', 'block_count'].map((name) => ({
                    name,
                    sampleSize: 1234,
                    lowerBound: 1,
                    upperBound: 2,
                })),
            }),
        }),
    );
    await page.route('**/api/v1/submissions/*/events', async (route) => route.abort('failed'));
    await page.route('**/api/v1/submissions/*', async (route) => {
        const state = options.submission ?? 'completed';
        const response =
            state === 'empty'
                ? completedResult(options.locale, [])
                : state === 'failed'
                  ? failedResult(options.locale)
                  : state === 'batch-completed'
                    ? completedBatchResult(options.locale)
                    : state === 'partial'
                      ? partialResult(options.locale)
                      : state === 'processing'
                        ? processingResult(options.locale)
                        : completedResult(options.locale);
        await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify(response),
        });
    });
}

async function preparePage(page: Page, viewportName: ViewportName, options: SyntheticOptions) {
    await page.setViewportSize(viewports[viewportName]);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const unapprovedRequests = externalRequestGate(page);
    await mockSyntheticApis(page, options);
    return unapprovedRequests;
}

async function expectLocale(page: Page, locale: Locale) {
    await expect(page.locator('html')).toHaveAttribute('lang', locale);
    await expect(page.locator('#language-select')).toHaveValue(locale);
}

async function expectVisibleFocus(locator: Locator) {
    await locator.focus();
    await expect(locator).toBeFocused();
    const focusAppearance = await locator.evaluate((element) => {
        const style = getComputedStyle(element);
        return {
            outlineStyle: style.outlineStyle,
            outlineWidth: style.outlineWidth,
            boxShadow: style.boxShadow,
        };
    });
    expect(
        focusAppearance.outlineStyle !== 'none' || focusAppearance.boxShadow !== 'none',
        JSON.stringify(focusAppearance),
    ).toBe(true);
}

async function expectNarrowReflow(page: Page, height: number) {
    for (const width of [320, 195]) {
        await page.setViewportSize({ width, height });
        const overflowDetails = await page.evaluate((auditWidth) => {
            const rootOverflowX = getComputedStyle(document.documentElement).overflowX;
            const bodyOverflowX = getComputedStyle(document.body).overflowX;
            const auditStyle = document.createElement('style');
            auditStyle.dataset.reflowAudit = 'true';
            auditStyle.textContent = 'html, body { overflow-x: visible !important; }';
            document.head.append(auditStyle);
            const viewportWidth = document.documentElement.clientWidth;
            const offenders = Array.from(document.querySelectorAll<HTMLElement>('body *'))
                .map((element) => {
                    const rect = element.getBoundingClientRect();
                    return {
                        element: element.tagName.toLowerCase(),
                        id: element.id,
                        className: String(element.className).slice(0, 160),
                        left: Math.round(rect.left),
                        right: Math.round(rect.right),
                        width: Math.round(rect.width),
                    };
                })
                .filter(
                    (element) =>
                        element.left < -1 ||
                        element.right > viewportWidth + 1 ||
                        element.width > viewportWidth + 1,
                )
                .slice(0, 12);
            const scrollOffenders = Array.from(document.querySelectorAll<HTMLElement>('body *'))
                .filter((element) => element.scrollWidth > element.clientWidth + 1)
                .map((element) => ({
                    element: element.tagName.toLowerCase(),
                    id: element.id,
                    className: String(element.className).slice(0, 160),
                    clientWidth: element.clientWidth,
                    scrollWidth: element.scrollWidth,
                    overflowX: getComputedStyle(element).overflowX,
                }))
                .slice(0, 12);
            return {
                width: auditWidth,
                clientWidth: viewportWidth,
                rootScrollWidth: document.documentElement.scrollWidth,
                bodyScrollWidth: document.body.scrollWidth,
                rootOverflowX,
                bodyOverflowX,
                offenders,
                scrollOffenders,
            };
        }, width);
        expect(
            [overflowDetails.rootOverflowX, overflowDetails.bodyOverflowX],
            JSON.stringify(overflowDetails, null, 2),
        ).not.toContain('clip');
        expect(
            [overflowDetails.rootOverflowX, overflowDetails.bodyOverflowX],
            JSON.stringify(overflowDetails, null, 2),
        ).not.toContain('hidden');
        expect(
            Math.max(overflowDetails.rootScrollWidth, overflowDetails.bodyScrollWidth),
            JSON.stringify(overflowDetails, null, 2),
        ).toBeLessThanOrEqual(overflowDetails.clientWidth + 1);
    }
}

async function waitForScratchblocks(page: Page) {
    const previews = page.locator('.scratchblocks-rendered');
    if ((await previews.count()) > 0)
        await expect(previews.first()).toHaveAttribute('data-render-state', 'ready');
}

const primaryPages = [
    { key: 'home', path: './' },
    { key: 'advanced', path: './advanced' },
    { key: 'questions', path: './questions' },
    { key: 'result', path: './submissions/synthetic-result' },
    { key: 'catalogue', path: './catalogue' },
    { key: 'contact', path: './contact' },
] as const;

for (const [viewportName, viewport] of Object.entries(viewports) as [
    ViewportName,
    (typeof viewports)[ViewportName],
][]) {
    for (const locale of locales) {
        for (const primaryPage of primaryPages) {
            test(`visual ${primaryPage.key} ${locale} ${viewportName}`, async ({ page }) => {
                const unapprovedRequests = await preparePage(page, viewportName, { locale });
                await page.goto(primaryPage.path);
                await expectLocale(page, locale);
                await expect(
                    page.getByRole('heading', {
                        name: headings[primaryPage.key][locale],
                        level: 1,
                    }),
                ).toBeVisible();
                if (primaryPage.key === 'result') {
                    await waitForScratchblocks(page);
                    const hints = page.locator('.issue-hint');
                    expect(await hints.count()).toBeGreaterThan(0);
                    await expect(hints.first()).not.toContainText('[b]');
                    await expect(hints.first()).not.toContainText('[sbi]');
                    const alternatives = page.locator('.code-alternative pre');
                    expect(await alternatives.count()).toBeGreaterThan(0);
                    await expect(alternatives.first()).not.toContainText('[scratchblocks]');
                }
                await expectVisibleFocus(page.locator('#language-select'));
                if (viewportName === 'mobile') {
                    await expectNarrowReflow(page, viewport.height);
                    await page.setViewportSize(viewport);
                }
                expect(unapprovedRequests).toEqual([]);
            });
        }
    }
}

test('focused header and keyboard navigation', async ({ page }) => {
    const unapprovedRequests = await preparePage(page, 'desktop', { locale: 'en' });
    await page.goto('./');
    const catalogueLink = page
        .getByRole('navigation', { name: 'Main navigation' })
        .getByRole('link', { name: 'Catalogue' });
    await expectVisibleFocus(catalogueLink);
    // One banner, and the focused link belongs to the navigation inside it rather than to a second header.
    await expect(page.locator('.site-header')).toHaveCount(1);
    await expect(page.getByRole('banner')).toHaveCount(1);
    await expect(page.locator('.site-header').getByRole('link', { name: 'Catalogue' })).toHaveCount(
        1,
    );
    expect(unapprovedRequests).toEqual([]);
});

test('result remains keyboard-visible and contained in forced colors with reduced motion', async ({
    page,
}) => {
    const unapprovedRequests = await preparePage(page, 'desktop', { locale: 'en' });
    await page.emulateMedia({ reducedMotion: 'reduce', forcedColors: 'active' });
    await page.goto('./submissions/synthetic-result');
    await expectVisibleFocus(page.getByRole('button', { name: 'Helpful' }).first());
    await expect(page.locator('.issue-card')).toHaveCount(3);
    const dimensions = await page.evaluate(() => ({
        clientWidth: document.documentElement.clientWidth,
        rootScrollWidth: document.documentElement.scrollWidth,
        bodyScrollWidth: document.body.scrollWidth,
        transitionDurations: Array.from(document.querySelectorAll<HTMLElement>('.card')).map(
            (element) => getComputedStyle(element).transitionDuration,
        ),
    }));
    expect(Math.max(dimensions.rootScrollWidth, dimensions.bodyScrollWidth)).toBeLessThanOrEqual(
        dimensions.clientWidth + 1,
    );
    expect(dimensions.transitionDurations.every((duration) => parseFloat(duration) <= 0.01)).toBe(
        true,
    );
    expect(unapprovedRequests).toEqual([]);
});

test('focused paired single-project choices', async ({ page }) => {
    const unapprovedRequests = await preparePage(page, 'desktop', { locale: 'en' });
    await page.goto('./submit');
    const choices = page.locator('.analysis-choice-group-primary');
    await expect(choices.getByLabel('Your project file')).toBeVisible();
    await expect(choices.getByLabel('Project link')).toBeVisible();
    // The two ways in are offered side by side, as one choice rather than one form after another.
    const columns = await choices
        .locator('.analysis-choice-grid')
        .evaluate((element) => getComputedStyle(element).gridTemplateColumns.split(' ').length);
    expect(columns).toBe(2);
    expect(unapprovedRequests).toEqual([]);
});

test('focused issue-family grouping', async ({ page }) => {
    const unapprovedRequests = await preparePage(page, 'desktop', { locale: 'en' });
    await page.goto('./submissions/synthetic-result');
    await waitForScratchblocks(page);
    const groups = page.locator('.issue-family-list');
    await expect(groups.getByRole('heading', { name: 'Bugs' })).toBeVisible();
    await expect(groups.getByRole('heading', { name: 'Smells' })).toBeVisible();
    await expect(groups.getByRole('heading', { name: 'Perfumes' })).toBeVisible();
    // Bugs before smells before perfumes: the worst news first, whatever order the service sent.
    expect(
        await groups
            .locator('.issue-family-heading h3')
            .evaluateAll((headings) => headings.map((heading) => heading.id)),
    ).toEqual(['issue-family-bug', 'issue-family-smell', 'issue-family-perfume']);
    expect(unapprovedRequests).toEqual([]);
});

// Everywhere else the reference endpoint is left unmocked on purpose, because that is what a deployment with no
// history behind it answers and the pages have to read properly without a word of comparison. This is the other
// case: the service knows what a project usually comes to, and says so on the numbers.
test('focused project measurements against the reference distribution', async ({ page }) => {
    const unapprovedRequests = await preparePage(page, 'desktop', { locale: 'en' });
    await page.route('**/api/v1/metrics/reference', async (route) =>
        route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
                metrics: [
                    { name: 'sprite_count', sampleSize: 512, lowerBound: 6, upperBound: 14 },
                    { name: 'script_count', sampleSize: 512, lowerBound: 9, upperBound: 30 },
                    { name: 'block_count', sampleSize: 512, lowerBound: 20, upperBound: 90 },
                ],
            }),
        }),
    );
    await page.goto('./submissions/synthetic-result');
    const measurements = page.locator('.basic-statistics-panel');
    await expect(measurements.getByText('(lower than most)')).toBeVisible();
    await expect(measurements.getByText('(around the middle)')).toBeVisible();
    await expect(measurements.getByText('(higher than most)')).toBeVisible();
    await expect(
        measurements.getByText(/Compared with 512 projects analysed here before\./),
    ).toBeVisible();
    // The comparison says where the value sits, and says in the same breath that this is not a mark.
    await expect(measurements.getByText(/It is not a rating of the project\./)).toBeVisible();
    expect(unapprovedRequests).toEqual([]);
});

test('focused catalogue-family navigation', async ({ page }) => {
    const unapprovedRequests = await preparePage(page, 'desktop', { locale: 'en' });
    await page.goto('./catalogue');
    const navigation = page.locator('.catalogue-family-controls');
    await expect(navigation.getByRole('button', { name: /Bugs/ })).toBeVisible();
    await expect(navigation.getByRole('button', { name: /Smells/ })).toBeVisible();
    await expect(navigation.getByRole('button', { name: /Perfumes/ })).toBeVisible();
    const panel = page.locator('.catalogue-panel');
    await expect(panel.getByRole('combobox', { name: 'Blocks' })).toBeVisible();
    await expect(panel.locator('.catalogue-block-set-badge')).toHaveCount(4);
    expect(unapprovedRequests).toEqual([]);
});

test('focused mBlock ScratchBlocks device icons', async ({ page }) => {
    const unapprovedRequests = await preparePage(page, 'desktop', { locale: 'en' });
    await page.goto('./catalogue');
    const entry = page.locator('.catalogue-entry').filter({ hasText: 'synthetic-perfume' });
    await entry.locator('summary').click();
    const preview = entry.locator('.scratchblocks-rendered');
    await expect(preview).toHaveAttribute('data-render-state', 'ready');
    for (const [icon, count] of Object.entries({
        codeyA: 1,
        codeyB: 2,
        rocky: 1,
        mBot: 1,
        matrix: 1,
    })) {
        await expect(preview.locator(`use[href="#sb3-${icon}"]`)).toHaveCount(count);
    }
    await expect(preview).not.toContainText(/@(codeyA|codeyB|rocky|mBot|matrix)/);
    expect(unapprovedRequests).toEqual([]);
});

test('focused footer and University identity', async ({ page }) => {
    const unapprovedRequests = await preparePage(page, 'desktop', { locale: 'en' });
    await page.goto('./contact');
    const footer = page.locator('.site-footer');
    await expect(footer.getByRole('img', { name: 'University of Passau' })).toBeVisible();
    // The identity is the University's own asset, not our own wording standing in for it.
    await expect(footer.getByRole('img', { name: 'University of Passau' })).toHaveAttribute(
        'src',
        /uniPassauLogoSmall\.png$/,
    );
    await expect(footer.locator('.image-slot-fallback')).toHaveCount(0);
    expect(unapprovedRequests).toEqual([]);
});

test('brand image text and CSS fallbacks', async ({ page }) => {
    const unapprovedRequests = await preparePage(page, 'desktop', {
        locale: 'en',
        missingBrandAssets: true,
    });
    await page.goto('./contact');
    await expect(page.locator('.site-banner-slot.image-slot-fallback')).toBeVisible();
    await expect(page.locator('.site-header .brand-image-slot')).toHaveCount(0);
    await expect(
        page.getByRole('navigation', { name: 'Main navigation' }).getByRole('link', {
            name: 'Check my project',
        }),
    ).toBeVisible();
    await expect(page.locator('.footer-university-slot.image-slot-fallback')).toContainText(
        'University of Passau',
    );
    expect(unapprovedRequests).toEqual([]);
});

for (const state of ['empty', 'failed', 'partial', 'processing'] as const) {
    test(`visual analysis ${state} state`, async ({ page }) => {
        const unapprovedRequests = await preparePage(page, 'desktop', {
            locale: 'en',
            submission: state,
        });
        await page.goto(`./submissions/synthetic-${state}`);
        await expect(
            page.getByRole('heading', { name: 'Project analysis', level: 1 }),
        ).toBeVisible();
        if (state === 'empty')
            await expect(
                page.getByText('No findings were reported for this project.'),
            ).toBeVisible();
        if (state === 'failed') await expect(page.getByRole('alert')).toBeVisible();
        if (state === 'partial') await waitForScratchblocks(page);
        if (state === 'processing') await expect(page.locator('.status-processing')).toBeVisible();
        expect(unapprovedRequests).toEqual([]);
    });
}

for (const [viewportName, viewport] of Object.entries(viewports) as [
    ViewportName,
    (typeof viewports)[ViewportName],
][]) {
    test(`rendered graph ${viewportName}`, async ({ page }) => {
        const unapprovedRequests = await preparePage(page, viewportName, {
            locale: 'en',
            features: [...capabilities.enabledFeatures, 'metrics-graphs'],
        });
        await page.route('**/api/v1/submissions/*/analyses/7/graphs/ast', async (route) =>
            route.fulfill({
                status: 200,
                headers: {
                    'Content-Type': 'text/vnd.graphviz;charset=UTF-8',
                    'X-LitterBox-Graph-Nodes': '2',
                    'X-LitterBox-Graph-Edges': '1',
                },
                body: graphDot,
            }),
        );
        await page.goto('./submissions/synthetic-result');
        await page.getByRole('link', { name: 'Open advanced analysis' }).click();
        // The graphs are a fold of the advanced workspace; they are opened before they can be rendered.
        await page.locator('.advanced-section-title', { hasText: 'Program graphs' }).click();
        await page.getByRole('button', { name: 'Render selected graph' }).click();
        await expect(page.locator('.metrics-graph-viewport > svg')).toBeVisible();
        if (viewportName === 'mobile') {
            await expectNarrowReflow(page, viewport.height);
            await page.setViewportSize(viewport);
        }
        // Rendered from the service's DOT, not fetched as a picture: the labels are in the page's own SVG.
        const graph = page.locator('.metrics-graph-viewport > svg');
        await expect(graph.getByText('Synthetic start')).toBeVisible();
        await expect(graph.getByText('Safe finish')).toBeVisible();
        expect(unapprovedRequests).toEqual([]);
    });
}

for (const [viewportName, viewport] of Object.entries(viewports) as [
    ViewportName,
    (typeof viewports)[ViewportName],
][]) {
    for (const locale of locales) {
        test(`teacher submission ${locale} ${viewportName}`, async ({ page }) => {
            const unapprovedRequests = await preparePage(page, viewportName, {
                locale,
                features: batchCapabilities.enabledFeatures,
            });
            await page.goto('./teacher');
            await expectLocale(page, locale);
            await expect(page.locator('#teacher-archive')).toBeVisible();
            if (viewportName === 'mobile') {
                await expectNarrowReflow(page, viewport.height);
                await page.setViewportSize(viewport);
            }
            expect(unapprovedRequests).toEqual([]);
        });

        test(`partial batch ${locale} ${viewportName}`, async ({ page }) => {
            const unapprovedRequests = await preparePage(page, viewportName, {
                locale,
                submission: 'partial',
                features: batchCapabilities.enabledFeatures,
            });
            await page.goto('./submissions/synthetic-partial');
            await expectLocale(page, locale);
            await expect(
                page.getByRole('heading', { name: headings.result[locale] }),
            ).toBeVisible();
            await expect(page.locator('.batch-result-select').first()).toBeVisible();
            await waitForScratchblocks(page);
            if (viewportName === 'mobile') {
                await expectNarrowReflow(page, viewport.height);
                await page.setViewportSize(viewport);
            }
            expect(unapprovedRequests).toEqual([]);
        });

        test(`completed batch ${locale} ${viewportName}`, async ({ page }) => {
            const unapprovedRequests = await preparePage(page, viewportName, {
                locale,
                submission: 'batch-completed',
                features: batchCapabilities.enabledFeatures,
            });
            await page.goto('./submissions/synthetic-batch-completed');
            await expectLocale(page, locale);
            await expect(
                page.getByRole('heading', { name: headings.result[locale] }),
            ).toBeVisible();
            await expect(page.getByText(`synthetic-${locale}-second-project.sb3`)).toBeVisible();
            await waitForScratchblocks(page);
            if (viewportName === 'mobile') {
                await expectNarrowReflow(page, viewport.height);
                await page.setViewportSize(viewport);
            }
            expect(unapprovedRequests).toEqual([]);
        });
    }
}

for (const width of [320, 195]) {
    test(`dense Scratchblocks reflow at ${width} CSS pixels`, async ({ page }) => {
        const unapprovedRequests = await preparePage(page, 'mobile', { locale: 'de' });
        await page.setViewportSize({ width, height: 844 });
        await page.goto('./submissions/synthetic-result');
        await waitForScratchblocks(page);
        await expectNarrowReflow(page, 844);
        expect(unapprovedRequests).toEqual([]);
    });
}
