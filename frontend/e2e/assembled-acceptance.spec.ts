// SPDX-License-Identifier: EUPL-1.2
// SPDX-FileCopyrightText: 2026 LitterBox-Web contributors

import JSZip from 'jszip';
import { expect, test, type Page } from '@playwright/test';

const locales = ['de', 'en', 'es', 'nl'] as const;
type Locale = (typeof locales)[number];

// Fault injection is not one of them: it makes a second project rather than reading the one in hand, so it is
// offered on the teacher's pages and has its own spec.
const advancedFeatures = ['metrics-graphs', 'semantic-diff', 'program-export'] as const;

const capabilities = (enabledFeatures: readonly string[]) => ({
    schemaVersion: 1,
    litterboxVersion: 'synthetic-assembled-acceptance',
    supportedLocales: [...locales],
    enabledFeatures: [...enabledFeatures],
});

const thumbnailHash = 'a'.repeat(64);
const failingThumbnailHash = 'b'.repeat(64);
const validThumbnail = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
    'base64',
);

const syntheticIssue = (
    id: number,
    type: 'bug' | 'smell' | 'perfume',
    sprite: string,
    thumbnailRef: string | null,
    scratchblocks: string,
    refactoringScratchblocks: string | null = null,
) => ({
    id,
    finderId: `synthetic-finder-${id}`,
    finderName:
        id === 1
            ? '<img src="x" onerror="alert(1)"><script>unsafe()</script>'
            : `Synthetic ${type} finding ${id}`,
    type,
    hint:
        id === 1
            ? '[b]<script>alert(1)</script>[/b] [sbi]move (10) steps[/sbi]'
            : `Synthetic ${type} explanation with a long sentence for assembled reflow evidence.`,
    sprite,
    blockId: `raw-block-identifier-${id}`,
    costume: `raw-costume-identifier-${id}.png`,
    scratchblocks,
    duplicates: id === 2 ? [919191] : [],
    subsumedBy: [],
    coupledWith: id === 3 ? [818181] : [],
    severity: 3 - id + 1,
    costumes: [],
    currentCostume: -1,
    refactoringScratchblocks,
    similarTo: [],
    thumbnailRef,
});

const assembledIssues = [
    syntheticIssue(
        1,
        'bug',
        'Success sprite',
        `/litterbox/api/v1/submissions/assembled-result/assets/${thumbnailHash}`,
        'when green flag clicked\nsay [Synthetic current code]',
    ),
    syntheticIssue(
        2,
        'smell',
        'Invalid reference sprite',
        'https://example.invalid/private/raw-costume.png',
        'repeat (10)\nmove (10) steps',
        'define safer loop\nmove (5) steps\nmove (5) steps',
    ),
    syntheticIssue(
        3,
        'perfume',
        'Load failure sprite',
        `/litterbox/api/v1/submissions/assembled-result/assets/${failingThumbnailHash}`,
        'when I receive [synthetic]\nturn cw (15) degrees',
    ),
];

const ordinaryQuiz = [
    {
        questionId: 'ordinary-question-id',
        question: 'This question belongs only to the dedicated workflow.',
        options: ['A', 'B'],
    },
];

const ordinaryResult = (features: readonly string[] = []) => ({
    schemaVersion: 1,
    submissionId: 7,
    token: 'assembled-result',
    status: 'completed',
    locale: 'en',
    sourceType: 'UPLOAD',
    counts: { expected: 1, completed: 1, failed: 0 },
    analysis: {
        id: 7,
        status: 'completed',
        name: 'synthetic-assembled-project.sb3',
        failureType: null,
        failureMessage: null,
        reportSchemaVersion: '1',
        litterboxVersion: 'synthetic',
        locale: 'en',
        provenance: 'synthetic',
        detectors: ['synthetic'],
        configuration: {},
        sourceSha256: null,
        inputFormat: 'sb3',
        metrics: { blocks: 12, sprites: 3, scripts: 4 },
        issues: assembledIssues,
        relationships: [{ source: 919191, target: 818181, type: 'synthetic-relationship' }],
        catalogue: [
            {
                id: 'ordinary-result-catalogue-entry',
                title: 'This catalogue entry must stay on the standalone page.',
                description: 'Synthetic catalogue description.',
                locale: 'en',
                fallback: false,
                instruction: '',
                examples: [],
                provenance: 'synthetic',
                licence: 'synthetic',
                issueType: 'bug',
                severity: 1,
                fallbackFields: [],
            },
        ],
        quiz: ordinaryQuiz,
        assetRefs: [
            `/litterbox/api/v1/submissions/assembled-result/assets/${thumbnailHash}`,
            `/litterbox/api/v1/submissions/assembled-result/assets/${failingThumbnailHash}`,
        ],
    },
    analyses: [],
    features,
});

const questionResult = (token: string, sourceType: 'QUESTION_UPLOAD' | 'QUESTION_SCRATCH_URL') => ({
    schemaVersion: 1,
    submissionId: 88,
    token,
    status: 'completed',
    locale: 'en',
    sourceType,
    counts: { expected: 1, completed: 1, failed: 0 },
    analysis: {
        id: 88,
        status: 'completed',
        name: 'synthetic-question-project.sb3',
        issues: [],
        quiz: [
            {
                questionId: 'qlc-question-1',
                question: 'Which synthetic answer is recorded?',
                options: ['A', 'B'],
            },
        ],
    },
    analyses: [],
});

async function useCapabilities(
    page: Page,
    enabledFeatures: readonly string[],
    locale: Locale = 'en',
) {
    await page.addInitScript((selectedLocale) => {
        window.localStorage.setItem('litterbox.locale', selectedLocale);
    }, locale);
    await page.route('**/api/v1/capabilities', (route) =>
        route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify(capabilities(enabledFeatures)),
        }),
    );
    await page.emulateMedia({ reducedMotion: 'reduce' });
}

async function useOrdinaryResult(page: Page, features: readonly string[] = []) {
    await page.route('**/api/v1/submissions/assembled-result/events', (route) =>
        route.abort('failed'),
    );
    await page.route('**/api/v1/submissions/assembled-result', (route) =>
        route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify(ordinaryResult(features)),
        }),
    );
    await page.route(`**/api/v1/submissions/assembled-result/assets/${thumbnailHash}`, (route) =>
        route.fulfill({ status: 200, contentType: 'image/png', body: validThumbnail }),
    );
    await page.route(
        `**/api/v1/submissions/assembled-result/assets/${failingThumbnailHash}`,
        (route) => route.abort('failed'),
    );
    await page.route('**/api/v1/analyses/7/feedback', (route) => route.fulfill({ status: 204 }));
    if (features.includes('fault-injection'))
        await page.route('**/api/v1/submissions/assembled-result/analyses/7/injectors**', (route) =>
            route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: '[]',
            }),
        );
}

async function assertNoHorizontalOverflow(page: Page) {
    const dimensions = await page.evaluate(() => ({
        clientWidth: document.documentElement.clientWidth,
        rootScrollWidth: document.documentElement.scrollWidth,
        bodyScrollWidth: document.body.scrollWidth,
    }));
    expect(
        Math.max(dimensions.rootScrollWidth, dimensions.bodyScrollWidth),
        JSON.stringify(dimensions),
    ).toBeLessThanOrEqual(dimensions.clientWidth + 1);
}

async function assertScaledContentDoesNotOverflow(page: Page) {
    const dimensions = await page.evaluate(() =>
        ['.site-header', '.main-region']
            .map((selector) => document.querySelector<HTMLElement>(selector))
            .filter((element): element is HTMLElement => element !== null)
            .map((element) => ({
                selector: element.className,
                clientWidth: element.clientWidth,
                scrollWidth: element.scrollWidth,
            })),
    );
    expect(
        dimensions.every((element) => element.scrollWidth <= element.clientWidth + 1),
        JSON.stringify(dimensions),
    ).toBe(true);
}

async function assertShell(page: Page) {
    await expect(page.locator('.site-banner')).toHaveCount(1);
    await expect(page.locator('.site-banner-slot')).toHaveCount(1);
    await expect(page.locator('.site-banner-slot img')).toHaveCount(1);
    await expect(page.locator('.site-nav')).toHaveCount(1);
    await expect(page.locator('.site-nav img')).toHaveCount(0);
    await expect(page.locator('.site-nav')).not.toContainText('LitterBox');
    await expect(page.locator('.site-header .brand-image-slot')).toHaveCount(0);
    const surfaces = await page.locator('.site-banner, .site-header-bar').evaluateAll((elements) =>
        elements.map((element) => {
            const style = getComputedStyle(element);
            return {
                backgroundColor: style.backgroundColor,
                borderBottomWidth: style.borderBottomWidth,
            };
        }),
    );
    expect(surfaces[0]?.backgroundColor).not.toBe(surfaces[1]?.backgroundColor);
    // A single yellow rule is the header's only decoration.
    expect(surfaces[1]?.borderBottomWidth).toBe('2px');
}

const firstLevelRoutes = [
    './',
    './submit',
    './teacher',
    './advanced',
    './questions',
    './compare',
    './catalogue',
    './about',
    './contact',
    './faq',
    './imprint',
    './privacy',
    './status',
] as const;

test('the ready shell keeps one banner and one plain menu on every first-level route', async ({
    page,
}) => {
    await useCapabilities(page, [
        'single-project',
        'teacher-archive',
        'studio',
        'qlc',
        'metrics-graphs',
        'semantic-diff',
        'program-export',
        'fault-injection',
    ]);
    await page.route('**/api/v1/catalogue*', (route) =>
        route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: '[]',
        }),
    );

    for (const path of firstLevelRoutes) {
        await page.goto(path);
        await assertShell(page);
    }
});

const shellCapabilityStates = [
    { name: 'loading', kind: 'loading' },
    { name: 'ready', kind: 'ready' },
    { name: 'disabled', kind: 'disabled' },
    { name: 'error', kind: 'error' },
    { name: 'incompatible', kind: 'incompatible' },
] as const;

for (const state of shellCapabilityStates) {
    test(`static pages keep the same shell while capabilities are ${state.name}`, async ({
        page,
    }) => {
        await page.addInitScript((selectedLocale) => {
            window.localStorage.setItem('litterbox.locale', selectedLocale);
        }, 'en');
        await page.emulateMedia({ reducedMotion: 'reduce' });
        if (state.kind === 'loading')
            await page.route('**/api/v1/capabilities', () => new Promise(() => undefined));
        else if (state.kind === 'error')
            await page.route('**/api/v1/capabilities', (route) =>
                route.fulfill({ status: 503, body: 'synthetic capability outage' }),
            );
        else if (state.kind === 'incompatible')
            await page.route('**/api/v1/capabilities', (route) =>
                route.fulfill({
                    status: 200,
                    contentType: 'application/json',
                    body: JSON.stringify({
                        ...capabilities([]),
                        supportedLocales: ['en'],
                    }),
                }),
            );
        else
            await page.route('**/api/v1/capabilities', (route) =>
                route.fulfill({
                    status: 200,
                    contentType: 'application/json',
                    body: JSON.stringify(
                        capabilities(
                            state.kind === 'ready'
                                ? ['teacher-archive', 'metrics-graphs', 'qlc']
                                : [],
                        ),
                    ),
                }),
            );

        for (const path of ['./about', './contact', './faq', './imprint', './privacy']) {
            await page.goto(path);
            await assertShell(page);
            const navigation = page.getByRole('navigation', { name: 'Main navigation' });
            await expect(navigation.getByRole('link', { name: 'Check my project' })).toBeVisible();
            await expect(navigation.getByRole('link', { name: 'Submit project' })).toHaveCount(0);
            await expect(navigation.getByRole('link', { name: 'Catalogue' })).toBeVisible();
            await expect(navigation.getByRole('link', { name: 'About' })).toBeVisible();
            await expect(navigation.getByRole('link', { name: 'For teachers' })).toHaveCount(
                state.kind === 'ready' ? 1 : 0,
            );
            await expect(navigation.getByRole('link', { name: 'Advanced analysis' })).toHaveCount(
                state.kind === 'ready' ? 1 : 0,
            );
            await expect(navigation.getByRole('link', { name: 'Ask me' })).toHaveCount(
                state.kind === 'ready' ? 1 : 0,
            );
            if (state.kind === 'loading')
                await expect(navigation).toHaveAttribute('aria-busy', 'true');
            else await expect(navigation).not.toHaveAttribute('aria-busy');
        }
    });
}

test('capability aliases and differently cased values do not advertise workflow entries', async ({
    page,
}) => {
    await useCapabilities(page, [
        'TEACHER-ARCHIVE',
        'STUDIO',
        'METRICS-GRAPHS',
        'SEMANTIC-DIFF',
        'PROGRAM-EXPORT',
        'FAULT-INJECTION',
        'QLC',
    ]);
    await page.goto('./');
    const navigation = page.getByRole('navigation', { name: 'Main navigation' });
    // Waited for first. Every entry is absent while the answer is still on its way, so asking straight after the
    // navigation is a question the page passes without having heard from the service at all.
    await expect(navigation).not.toHaveAttribute('aria-busy', 'true');
    await expect(navigation.getByRole('link')).toHaveText([
        'Check my project',
        'Catalogue',
        'About',
    ]);
});

async function assertWorkflowFields(page: Page, path: string, features: readonly string[]) {
    await page.goto(path);
    const singleEnabled = features.includes('single-project');
    const archiveEnabled = features.includes('teacher-archive');
    const studioEnabled = features.includes('studio');
    if (path.endsWith('teacher')) {
        await expect(page.locator('#project-file')).toHaveCount(0);
        await expect(page.locator('#project-url')).toHaveCount(0);
        await expect(page.locator('#teacher-archive')).toHaveCount(archiveEnabled ? 1 : 0);
        await expect(page.locator('#studio-id')).toHaveCount(studioEnabled ? 1 : 0);
    } else {
        await expect(page.locator('#project-file')).toHaveCount(singleEnabled ? 1 : 0);
        await expect(page.locator('#project-url')).toHaveCount(singleEnabled ? 1 : 0);
        await expect(page.locator('#teacher-archive')).toHaveCount(0);
        await expect(page.locator('#studio-id')).toHaveCount(0);
    }
}

const capabilityCombinations = [
    { name: 'single-project only', features: ['single-project'] },
    { name: 'teacher archive only', features: ['teacher-archive'] },
    { name: 'studio only', features: ['studio'] },
    { name: 'all submission workflows', features: ['single-project', 'teacher-archive', 'studio'] },
    { name: 'no submission workflows', features: [] },
] as const;

for (const combination of capabilityCombinations) {
    test(`assembled submission navigation is honest with ${combination.name}`, async ({ page }) => {
        await useCapabilities(page, combination.features);
        await page.goto('./');
        await expect(page.getByRole('heading', { name: 'LitterBox', level: 1 })).toBeVisible();
        await assertShell(page);
        const navigation = page.getByRole('navigation', { name: 'Main navigation' });
        await expect(navigation.getByRole('link', { name: 'For teachers' })).toHaveCount(
            combination.features.includes('teacher-archive') ||
                combination.features.includes('studio')
                ? 1
                : 0,
        );
        await assertWorkflowFields(page, './', combination.features);
        await assertWorkflowFields(page, './submit', combination.features);
        await assertWorkflowFields(page, './teacher', combination.features);

        // Which analysis produced a finding is the one service detail a reader can act on, and the footer carries
        // it whatever the deployment can do; the page that listed the rest of the internals is gone.
        await expect(page.locator('.footer-version')).toHaveText(/^LitterBox \S+/);
        await expect(
            page.getByRole('navigation', { name: 'Footer navigation' }).getByRole('link', {
                name: 'System information',
            }),
        ).toHaveCount(0);
    });
}

for (const locale of locales) {
    test(`assembled home and result preserve the ${locale} locale`, async ({ page }) => {
        await useCapabilities(page, ['single-project'], locale);
        await page.goto('./');
        await expect(page.locator('html')).toHaveAttribute('lang', locale);
        await expect(page.locator('#language-select')).toHaveValue(locale);
        await expect(page.locator('#project-file')).toBeVisible();
        await page.setViewportSize({ width: 320, height: 844 });
        await assertNoHorizontalOverflow(page);
    });
}

/**
 * At the reflow width the header stops laying its parts out in a row and the picker is the part with something to
 * lose: it is allowed to shrink, and a picker shrunk past its own labels tells a reader nothing. What that costs in
 * pixels depends on the typeface the machine happens to have, so the picker is measured against the width its own
 * content asks for rather than against a number, which would only record whether Verdana was installed.
 */
test('language picker keeps its selected option readable at a 200% reflow width', async ({
    page,
}) => {
    await useCapabilities(page, ['single-project']);
    await page.setViewportSize({ width: 640, height: 844 });
    await page.goto('./');

    const languageSelect = page.locator('#language-select');
    await expect(languageSelect).toHaveValue('en');
    const dimensions = await languageSelect.evaluate((element) => {
        const select = element as HTMLSelectElement;
        // A copy of the picker asked how wide it would like to be, taken out of the flow it is measured against and
        // removed again before anything else looks at the page.
        const unconstrained = select.cloneNode(true) as HTMLSelectElement;
        unconstrained.removeAttribute('id');
        unconstrained.style.position = 'absolute';
        unconstrained.style.visibility = 'hidden';
        unconstrained.style.width = 'max-content';
        select.parentElement?.append(unconstrained);
        const contentWidth = unconstrained.getBoundingClientRect().width;
        unconstrained.remove();
        return {
            selectedLabel: select.selectedOptions.item(0)?.textContent,
            width: select.getBoundingClientRect().width,
            contentWidth,
            fontSize: Number.parseFloat(getComputedStyle(select).fontSize),
        };
    });

    expect(dimensions.selectedLabel).toBe('English');
    // Sub-pixel slack: both widths are laid out, not computed from the same number.
    expect(dimensions.width).toBeGreaterThanOrEqual(dimensions.contentWidth - 0.5);
    // Narrow viewports elsewhere shrink a control's text to hide what will not fit. Doing it here would leave the
    // picker wide enough for labels nobody can read, which the width alone would not catch.
    expect(dimensions.fontSize).toBeGreaterThanOrEqual(12);
    await assertNoHorizontalOverflow(page);
});

test.describe('assembled shell', () => {
    const snapshots = [
        { name: 'desktop', width: 1440, zoom: false },
        { name: 'mobile', width: 390, zoom: false },
        { name: '320', width: 320, zoom: false },
        { name: '200-zoom', width: 320, zoom: true },
    ] as const;

    for (const snapshot of snapshots) {
        test(`has one banner and a distinct menu at ${snapshot.name}`, async ({ page }) => {
            await useCapabilities(page, ['single-project', 'teacher-archive', 'studio']);
            await page.setViewportSize({ width: snapshot.width, height: 844 });
            await page.goto('./');
            if (snapshot.zoom)
                await page.evaluate(() => (document.documentElement.style.zoom = '2'));
            await assertShell(page);
            if (snapshot.zoom) {
                await assertScaledContentDoesNotOverflow(page);
                const languagePicker = await page
                    .locator('.language-picker')
                    .evaluate((element) => {
                        const select = element.querySelector('select');
                        return {
                            direction: getComputedStyle(element).flexDirection,
                            pickerWidth: element.getBoundingClientRect().width,
                            selectWidth: select?.getBoundingClientRect().width ?? 0,
                        };
                    });
                expect(languagePicker.direction).toBe('column');
                expect(languagePicker.selectWidth).toBeGreaterThanOrEqual(
                    languagePicker.pickerWidth - 1,
                );
            } else await assertNoHorizontalOverflow(page);
        });
    }
});

test('assembled ordinary results preserve hierarchy, safe thumbnails, feedback, and reflow', async ({
    page,
}) => {
    await useCapabilities(page, ['single-project']);
    await useOrdinaryResult(page);
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto('./submissions/assembled-result');
    await expect(page.getByRole('heading', { name: 'Project analysis', level: 1 })).toBeVisible();
    // The statistics are one compact line now; findings are counted beside the findings themselves.
    await expect(page.getByLabel('Analysis summary')).toBeVisible();
    for (const label of ['Sprites', 'Scripts', 'Blocks'])
        await expect(page.getByText(label, { exact: true })).toBeVisible();
    await expect(page.locator('.issue-filter-status')).toHaveText('Showing 3 of 3 findings.');
    // Bugs, smells and perfumes are three folds. The first part that found something is unrolled; the reader
    // opens the rest, and everything below is asserted with all three open.
    await expect(page.locator('details.issue-family')).toHaveCount(3);
    await expect(page.locator('details.issue-family[open]')).toHaveCount(1);
    const folds = page.locator('details.issue-family');
    for (let index = 0; index < (await folds.count()); index += 1) {
        const fold = folds.nth(index);
        if (await fold.evaluate((element) => !(element as HTMLDetailsElement).open))
            await fold.locator('> summary').click();
    }
    await expect(page.locator('details.issue-family[open]')).toHaveCount(3);
    await expect(page.locator('.issue-card')).toHaveCount(3);
    await expect(page.locator('.issue-card .costume-thumbnail')).toHaveCount(1);
    await expect(page.locator('.issue-card .costume-fallback')).toHaveCount(2);
    await expect(
        page.getByRole('img', { name: 'Current costume for Success sprite' }),
    ).toBeVisible();
    await expect(
        page.getByRole('img', { name: 'Current costume for Invalid reference sprite' }),
    ).toBeVisible();
    await expect(
        page.getByRole('img', { name: 'Current costume for Load failure sprite' }),
    ).toBeVisible();

    const card = page.locator('.issue-card').first();
    const desktopLayout = await card.locator('.issue-card-body').evaluate((element) => {
        const explanation = element.querySelector('.issue-explanation')?.getBoundingClientRect();
        const code = element.querySelector('.issue-code')?.getBoundingClientRect();
        return {
            columns: getComputedStyle(element).gridTemplateColumns.split(' ').filter(Boolean)
                .length,
            explanationLeft: explanation?.left ?? 0,
            codeLeft: code?.left ?? 0,
        };
    });
    expect(desktopLayout.columns).toBe(2);
    expect(desktopLayout.codeLeft).toBeGreaterThan(desktopLayout.explanationLeft);

    const findingsMarkup = await page.locator('.analysis-findings').innerHTML();
    // Never rendered at all: a costume filename and a question belong to other workflows, and the catalogue entry
    // here is not the one this finder is described by.
    for (const rawIdentifier of [
        'raw-costume-identifier-1.png',
        'This catalogue entry must stay on the standalone page.',
        'This question belongs only to the dedicated workflow.',
    ])
        expect(findingsMarkup).not.toContain(rawIdentifier);
    // Not on a child's page at all, folded or otherwise: the severity number and the graph of findings this one
    // sits in are for whoever is checking the analysis against the tool, which is what the class-set view is for.
    await expect(page.locator('.issue-technical')).toHaveCount(0);
    await expect(page.getByText('Finding 818181')).toHaveCount(0);
    // On the markup rather than by text: the severity filter offers "All severity levels", which a
    // case-insensitive text query cannot tell apart from the analyser's own label.
    expect(findingsMarkup).not.toContain('Severity level');
    // The block identifier likewise: the block it names is drawn right there.
    await expect(page.getByText('raw-block-identifier-1')).toHaveCount(0);
    for (const heading of ['Relationships', 'Project assets', 'Catalogue'])
        await expect(page.getByRole('heading', { name: heading })).toHaveCount(0);
    await expect(page.getByRole('heading', { name: /^Question \d+$/ })).toHaveCount(0);
    await expect(card.locator('script')).toHaveCount(0);
    await expect(card.locator('img[src="x"]')).toHaveCount(0);
    await expect(card.locator('[onerror]')).toHaveCount(0);
    await expect(card).toContainText('<script>alert(1)</script>');

    // Family and sprite are buttons; type, finder and severity stay behind the detail disclosure.
    await page.locator('.issue-filters').getByRole('button', { name: /^Bugs/ }).click();
    await page.getByRole('button', { name: /^Success sprite/ }).click();
    await page.locator('.issue-filters-detailed > summary').click();
    await page.getByLabel('Filter by type').selectOption('bug');
    await page.getByLabel('Filter by finder').selectOption('synthetic-finder-1');
    await page.getByLabel('Filter by severity').selectOption('3');
    await expect(page.locator('.issue-card')).toHaveCount(1);
    await expect(page.locator('.issue-filter-status')).toHaveText('Showing 1 of 3 findings.');
    await page.getByRole('button', { name: 'Reset filters' }).click();
    await expect(page.locator('.issue-card')).toHaveCount(3);
    await expect(page.locator('.issue-filter-status')).toHaveText('Showing 3 of 3 findings.');
    await page.getByLabel('Sort findings').selectOption('severity-asc');
    expect(await page.locator('.finding-group-heading h4').allTextContents()).toEqual([
        'Synthetic perfume finding 3',
        'Synthetic smell finding 2',
        '<img src="x" onerror="alert(1)"><script>unsafe()</script>',
    ]);
    await page.getByLabel('Sort findings').selectOption('severity-desc');
    expect(await page.locator('.finding-group-heading h4').allTextContents()).toEqual([
        '<img src="x" onerror="alert(1)"><script>unsafe()</script>',
        'Synthetic smell finding 2',
        'Synthetic perfume finding 3',
    ]);

    const helpful = page.getByRole('button', { name: 'Helpful' }).first();
    const notHelpful = page.getByRole('button', { name: 'Not helpful' }).first();
    await expect(helpful.locator('img')).toHaveCount(1);
    await expect(notHelpful.locator('img')).toHaveCount(1);
    await expect(helpful).toHaveAttribute('aria-pressed', 'false');
    await expect(notHelpful).toHaveAttribute('aria-pressed', 'false');
    await helpful.focus();
    await expect(helpful).toBeFocused();
    await helpful.press('Enter');
    await expect(page.getByText('Feedback saved.')).toBeVisible();
    await expect(helpful).toHaveAttribute('aria-pressed', 'true');
    await notHelpful.focus();
    await notHelpful.press('Space');
    await expect(notHelpful).toHaveAttribute('aria-pressed', 'true');
    const transitionDuration = await page
        .locator('.card')
        .first()
        .evaluate((element) => parseFloat(getComputedStyle(element).transitionDuration));
    expect(transitionDuration).toBeLessThanOrEqual(0.01);

    await page.setViewportSize({ width: 320, height: 1000 });
    await expectNoHorizontalOverflowAndSingleColumn(page, card);
    await page.evaluate(() => (document.documentElement.style.zoom = '2'));
    await expectNoHorizontalOverflowAndSingleColumn(page, card, false);
});

async function expectNoHorizontalOverflowAndSingleColumn(
    page: Page,
    card: ReturnType<Page['locator']>,
    strictRootOverflow = true,
) {
    const layout = await card.locator('.issue-card-body').evaluate((element) => {
        const explanation = element.querySelector('.issue-explanation')?.getBoundingClientRect();
        const code = element.querySelector('.issue-code')?.getBoundingClientRect();
        return {
            columns: getComputedStyle(element).gridTemplateColumns.split(' ').filter(Boolean)
                .length,
            explanationBottom: explanation?.bottom ?? 0,
            codeTop: code?.top ?? 0,
            cardOverflow: element.parentElement
                ? element.parentElement.scrollWidth > element.parentElement.clientWidth
                : true,
            mainOverflow: document.querySelector<HTMLElement>('.main-region')
                ? document.querySelector<HTMLElement>('.main-region')!.scrollWidth >
                  document.querySelector<HTMLElement>('.main-region')!.clientWidth
                : true,
        };
    });
    expect(layout.columns).toBe(1);
    expect(layout.codeTop).toBeGreaterThanOrEqual(layout.explanationBottom - 1);
    expect(layout.cardOverflow).toBe(false);
    expect(layout.mainOverflow).toBe(false);
    if (strictRootOverflow) await assertNoHorizontalOverflow(page);
}

/** Each capability is a fold now, so what names it is the summary that opens it. */
const advancedSection = (page: Page, title: string) =>
    page.locator('.advanced-section-title', { hasText: title });

const advancedSectionTitles = {
    'metrics-graphs': 'Program graphs',
    'semantic-diff': 'Compare this result',
    'program-export': 'Export program',
} as const;

for (const feature of advancedFeatures) {
    test(`assembled advanced analysis stays independent for ${feature}`, async ({ page }) => {
        await useCapabilities(page, [feature]);
        await useOrdinaryResult(page, [feature]);
        await page.goto('./submissions/assembled-result');
        await expect(page.getByRole('link', { name: 'Open advanced analysis' })).toBeVisible();
        await expect(advancedSection(page, advancedSectionTitles[feature])).toHaveCount(0);
        await page.getByRole('link', { name: 'Open advanced analysis' }).click();
        await expect(advancedSection(page, advancedSectionTitles[feature])).toBeVisible();
        await expect(page.getByRole('link', { name: 'Advanced analysis' })).toHaveAttribute(
            'aria-current',
            'page',
        );
        for (const otherTitle of Object.values(advancedSectionTitles))
            if (otherTitle !== advancedSectionTitles[feature])
                await expect(advancedSection(page, otherTitle)).toHaveCount(0);
    });
}

/**
 * The advanced workspace shows one section at a time. A panel that is merely painted over still hands its selects
 * and buttons to the keyboard and to a screen reader; a closed <details> does not, and this is where that is
 * checked rather than assumed.
 */
test('a closed advanced section hands nothing to the keyboard', async ({ page }) => {
    await useCapabilities(page, advancedFeatures);
    await useOrdinaryResult(page, advancedFeatures);
    await page.goto('./submissions/assembled-result');
    await page.getByRole('link', { name: 'Open advanced analysis' }).click();
    await expect(page.locator('details.advanced-section')).not.toHaveCount(0);

    const closed = page.locator('details.advanced-section:not([open])');
    expect(await closed.count()).toBeGreaterThan(0);
    const controls = closed.locator('button, select, input, a, textarea, [tabindex]');
    expect(await controls.count()).toBeGreaterThan(0);
    for (let index = 0; index < (await controls.count()); index++)
        await expect(controls.nth(index)).toBeHidden();

    // And nothing inside one can be reached by tabbing through the page.
    const reached = await page.evaluate(() => {
        const focusable = [
            ...document.querySelectorAll<HTMLElement>(
                'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
            ),
        ];
        return focusable.filter((element) => {
            element.focus();
            return (
                document.activeElement === element &&
                element.closest('details.advanced-section:not([open])') !== null
            );
        }).length;
    });
    expect(reached).toBe(0);
});

test('the legacy Tools path redirects to the canonical advanced entry', async ({ page }) => {
    await useCapabilities(page, ['metrics-graphs']);
    await page.goto('./tools');
    await expect(page).toHaveURL(/\/advanced$/);
    // Without a retained analysis the page offers its own project entry rather than a way back to the start page.
    await expect(page.getByRole('heading', { name: 'Advanced analysis', level: 1 })).toBeVisible();
    await expect(page.getByRole('group', { name: 'Choose a project' })).toBeVisible();
});

const retainedAnalysisFailureCases = [
    {
        name: 'missing analysis',
        response: {
            status: 200,
            body: JSON.stringify({
                ...ordinaryResult(),
                analysis: null,
                analyses: [],
            }),
        },
    },
    {
        name: 'unauthorized analysis',
        response: { status: 403, body: 'synthetic unauthorized retained analysis' },
    },
    {
        name: 'stale analysis',
        response: { status: 410, body: 'synthetic stale retained analysis' },
    },
    {
        name: 'incomplete analysis',
        response: {
            status: 200,
            body: JSON.stringify({
                ...ordinaryResult(),
                status: 'processing',
                analysis: {
                    ...ordinaryResult().analysis,
                    status: 'processing',
                },
            }),
        },
    },
    {
        name: 'mismatched analysis',
        response: {
            status: 200,
            body: JSON.stringify({
                ...ordinaryResult(),
                analysis: { ...ordinaryResult().analysis, id: 999 },
            }),
        },
    },
] as const;

for (const failureCase of retainedAnalysisFailureCases) {
    test(`retained analysis fails safely for a ${failureCase.name} response`, async ({ page }) => {
        await useCapabilities(page, ['metrics-graphs']);
        const requestMethods: string[] = [];
        let submissionRequests = 0;
        let advancedRequested = false;
        page.on('request', (request) => {
            if (request.url().endsWith('/api/v1/submissions/assembled-result'))
                requestMethods.push(request.method());
        });
        await page.route('**/api/v1/submissions/assembled-result/events', (route) =>
            route.abort('failed'),
        );
        await page.route('**/api/v1/submissions/assembled-result', (route) => {
            submissionRequests += 1;
            if (!advancedRequested)
                return route.fulfill({
                    status: 200,
                    contentType: 'application/json',
                    body: JSON.stringify(ordinaryResult()),
                });
            return route.fulfill({
                ...failureCase.response,
                contentType: 'application/json',
            });
        });

        await page.goto('./submissions/assembled-result');
        await expect(page.getByRole('link', { name: 'Open advanced analysis' })).toBeVisible();
        advancedRequested = true;
        await page.getByRole('link', { name: 'Open advanced analysis' }).click();
        await expect(page.getByRole('group', { name: 'Choose a project' })).toBeVisible();
        await expect(page).toHaveURL(/\/advanced$/);
        expect(submissionRequests).toBeGreaterThanOrEqual(2);
        expect(requestMethods.every((method) => method === 'GET')).toBe(true);
    });
}

test('assembled advanced analysis exposes every advertised workflow and none when disabled', async ({
    page,
}) => {
    await useCapabilities(page, advancedFeatures);
    await useOrdinaryResult(page, advancedFeatures);
    await page.goto('./submissions/assembled-result');
    await page.getByRole('link', { name: 'Open advanced analysis' }).click();
    for (const title of Object.values(advancedSectionTitles))
        await expect(advancedSection(page, title)).toBeVisible();

    await page.unroute('**/api/v1/capabilities');
    await useCapabilities(page, []);
    await useOrdinaryResult(page, []);
    await page.goto('./submissions/assembled-result');
    await expect(page.getByRole('link', { name: 'Open advanced analysis' })).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'Advanced analysis' })).toHaveCount(0);
});

const questionArchive = async (): Promise<Buffer> => {
    const zip = new JSZip();
    zip.file('project.json', '{}');
    zip.file('sprites/sprite.json', '{}');
    return Buffer.from(await zip.generateAsync({ type: 'nodebuffer' }));
};

for (const questionInput of ['url', 'upload'] as const) {
    test(`assembled qlc workflow returns shaped questions for ${questionInput}`, async ({
        page,
    }) => {
        const token = `assembled-question-${questionInput}`;
        const sourceType = questionInput === 'url' ? 'QUESTION_SCRATCH_URL' : 'QUESTION_UPLOAD';
        await useCapabilities(page, ['qlc']);
        await page.route('**/api/v1/question-submissions', async (route) =>
            route.fulfill({
                status: 202,
                contentType: 'application/json',
                body: JSON.stringify({ submissionId: 88, token, status: 'queued' }),
            }),
        );
        await page.route(`**/api/v1/submissions/${token}/events`, (route) => route.abort('failed'));
        await page.route(`**/api/v1/submissions/${token}`, (route) =>
            route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify(questionResult(token, sourceType)),
            }),
        );
        await page.route('**/api/v1/analyses/88/quiz-answers', (route) =>
            route.fulfill({ status: 204 }),
        );

        await page.goto('./questions');
        await expect(page.getByRole('link', { name: 'Ask me' })).toBeVisible();
        if (questionInput === 'url')
            await page
                .locator('#questions-project-url')
                .fill('https://scratch.mit.edu/projects/24680/');
        else {
            await page.locator('#questions-project-file').setInputFiles({
                name: 'synthetic-question.sb3',
                mimeType: 'application/zip',
                buffer: await questionArchive(),
            });
            await expect(page.getByRole('status')).toContainText('Your file looks good');
        }
        await page.getByRole('button', { name: 'Ask me about this project' }).click();
        await expect(page).toHaveURL(new RegExp(`/questions/${token}$`));
        await expect(page.getByText('Which synthetic answer is recorded?')).toBeVisible();
        await expect(page.getByRole('heading', { name: 'Project analysis' })).toHaveCount(0);
        await page.getByRole('radio', { name: 'A' }).click();
        await expect(page.getByRole('heading', { name: 'Question 1 of 1' })).toBeVisible();
        await page.getByRole('button', { name: 'Send answer' }).click();
        await page.getByRole('button', { name: 'See summary' }).click();
        await expect(page.getByRole('heading', { name: 'Your score' })).toBeVisible();
    });
}

test('assembled Questions navigation requires exact qlc capability', async ({ page }) => {
    await useCapabilities(page, ['question-generation']);
    await page.goto('./questions');
    await expect(page.getByText('This service cannot ask you about a project.')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Ask me' })).toHaveCount(0);
});

/**
 * The renderer draws a script at full size and scales the whole drawing down to fit the viewport it sizes for it.
 * It used to say so in an inline style, which the assembled site's policy refuses, and the site recovered the
 * value by reading the attribute back. Chromium leaves a refused style readable; Firefox empties it. So on the
 * assembled site, and only there, and only in Firefox, the drawing kept its full size inside a viewport built for
 * a fraction of it — a sixth larger than it could show, and clipped at the right and the bottom.
 *
 * Nothing about that is visible against the dev server, which sends no policy, so this belongs here rather than
 * beside the other drawing tests: the assembled site is the only place the policy is real.
 */
test('a drawn script fits the viewport drawn for it under the assembled policy', async ({
    page,
}) => {
    await useCapabilities(page, ['single-project']);
    await useOrdinaryResult(page);
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto('./submissions/assembled-result');
    await expect(page.locator('.scratchblocks-rendered').first()).toHaveAttribute(
        'data-render-state',
        'ready',
    );

    const drawings = await page.evaluate(() =>
        Array.from(document.querySelectorAll<SVGSVGElement>('.scratchblocks-rendered svg')).map(
            (svg) => {
                const box = (svg as unknown as SVGGraphicsElement).getBBox();
                const round = (value: number) => Math.round(value * 10) / 10;
                return {
                    viewport: [
                        round(Number(svg.getAttribute('width'))),
                        round(Number(svg.getAttribute('height'))),
                    ],
                    drawn: [round(box.x + box.width), round(box.y + box.height)],
                };
            },
        ),
    );

    expect(drawings.length).toBeGreaterThan(0);
    for (const drawing of drawings) {
        expect(drawing.drawn[0], JSON.stringify(drawing)).toBeLessThanOrEqual(drawing.viewport[0]);
        expect(drawing.drawn[1], JSON.stringify(drawing)).toBeLessThanOrEqual(drawing.viewport[1]);
    }
});

/**
 * The page offers one shape for one kind of choice. Picking which analysis to look at is the same act as picking a
 * family of findings on the result page, and that one is a chip; this row used to be drawn like the banner's
 * navigation instead, which reads as a way off the page rather than a choice within it.
 *
 * Asserted against the result page's own chip rather than against a list of values, because the property wanted
 * here is agreement with the rest of the site, not a particular radius. A future change to the site's button
 * shape should move both of these or neither.
 */
test('the advanced workspace picks a section with the same chip the rest of the site uses', async ({
    page,
}) => {
    await useCapabilities(page, ['single-project']);
    await useOrdinaryResult(page);
    await page.goto('./submissions/assembled-result');
    const chip = await page
        .locator('.issue-choice')
        .first()
        .evaluate((element) => {
            const style = getComputedStyle(element);
            return {
                borderRadius: style.borderRadius,
                borderStyle: style.borderStyle,
                chosen: getComputedStyle(
                    document.querySelector('.issue-choice[aria-pressed="true"]')!,
                ).backgroundColor,
            };
        });

    await useCapabilities(page, advancedFeatures);
    await useOrdinaryResult(page, advancedFeatures);
    await page.goto('./submissions/assembled-result');
    await page.getByRole('link', { name: 'Open advanced analysis' }).click();
    const menu = page.locator('.advanced-section-menu button');
    await expect(menu.first()).toBeVisible();
    // One section stands open, and it is the one the menu marks.
    await expect(page.locator('.advanced-section-menu button[aria-expanded="true"]')).toHaveCount(
        1,
    );

    const section = await menu.first().evaluate((element) => {
        const style = getComputedStyle(element);
        return {
            borderRadius: style.borderRadius,
            borderStyle: style.borderStyle,
            chosen: getComputedStyle(
                document.querySelector('.advanced-section-menu button[aria-expanded="true"]')!,
            ).backgroundColor,
        };
    });

    expect(section, JSON.stringify({ chip, section })).toEqual(chip);
});

/**
 * Bug, smell and perfume are told apart by a colour as well as by a word, and the same three colours are meant to
 * mean the same three families wherever they appear. Twice they had quietly stopped: the chip naming a finding's
 * family was styled through an ancestor it no longer has, and the catalogue's badge was out-specified by a rule
 * greying every span in the list. Both left the mark drawn in one flat colour, and neither could fail — a
 * selector that matches nothing raises nothing.
 *
 * So this asks for the property that was lost rather than for particular colours: three families, three different
 * marks, in each of the places that claims to make that distinction. A palette may be rechosen without touching
 * this; a rule that stops applying cannot pass it.
 */
test('a finding family is marked by its own colour wherever the mark is drawn', async ({
    page,
}) => {
    await useCapabilities(page, ['single-project', 'catalogue']);
    await useOrdinaryResult(page);
    await page.goto('./submissions/assembled-result');
    await expect(page.locator('.issue-type').first()).toBeVisible();

    const families = ['bug', 'smell', 'perfume'] as const;
    const chips = await page.evaluate(
        (names) =>
            names.map((family) => {
                const chip = document.querySelector(`.issue-type-${family}`);
                const style = chip ? getComputedStyle(chip) : undefined;
                return { family, colour: style?.borderLeftColor, text: style?.color };
            }),
        families,
    );
    for (const chip of chips) expect(chip.colour, JSON.stringify(chips)).toBeTruthy();
    expect(new Set(chips.map((chip) => chip.colour)).size, JSON.stringify(chips)).toBe(3);
    expect(new Set(chips.map((chip) => chip.text)).size, JSON.stringify(chips)).toBe(3);

    // One entry per family, so the list has all three marks to compare and the buttons above it all three counts.
    await page.route('**/api/v1/catalogue*', (route) =>
        route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify(
                families.map((issueType) => ({
                    id: `assembled-${issueType}`,
                    issueType,
                    title: `Assembled ${issueType} entry`,
                    description: 'A synthetic catalogue description.',
                    locale: 'en',
                    fallback: true,
                    instruction: '',
                    examples: [],
                    provenance: 'synthetic-assembled-acceptance',
                    licence: 'synthetic',
                    severity: 2,
                    blockSet: 'scratch',
                    fallbackFields: [],
                })),
            ),
        }),
    );
    await page.goto('./catalogue');
    await expect(page.locator('.catalogue-family-badge').first()).toBeVisible();
    const badges = await page.evaluate(
        (names) =>
            names.map((family) => {
                const badge = document.querySelector(`.catalogue-family-badge-${family}`);
                return { family, colour: badge ? getComputedStyle(badge).color : undefined };
            }),
        families,
    );
    for (const badge of badges) expect(badge.colour, JSON.stringify(badges)).toBeTruthy();
    expect(new Set(badges.map((badge) => badge.colour)).size, JSON.stringify(badges)).toBe(3);

    // The filter buttons never broke, and they are what the other two are meant to agree with.
    const buttons = await page.evaluate(
        (names) =>
            names.map((family) => {
                const button = document.querySelector(`.catalogue-family-button-${family}`);
                return {
                    family,
                    colour: button ? getComputedStyle(button).borderBottomColor : undefined,
                };
            }),
        families,
    );
    expect(
        buttons.map((button) => button.colour),
        JSON.stringify({ badges, buttons }),
    ).toEqual(badges.map((badge) => badge.colour));
});
