// SPDX-License-Identifier: EUPL-1.2
// SPDX-FileCopyrightText: 2026 LitterBox-Web contributors

import { expect, test } from '@playwright/test';

const token = 'synthetic-task-analysis-e2e';
const analysisId = 21;

const capabilities = {
    schemaVersion: 1,
    litterboxVersion: 'synthetic-task-analysis',
    supportedLocales: ['de', 'en', 'es', 'nl'],
    enabledFeatures: ['single-project'],
};

// The fixture covers positive, zero and unreported concept counts.
const metrics = {
    block_count: 240,
    script_count: 18,
    sprite_count: 4,
    length_longest_script: 32,
    max_nested_block_count: 5,
    most_complex_script: 14,
    weighted_method_count: 9,
    interprocedural_cyclomatic_complexity: 12,
    motion_block_count: 64,
    looks_block_count: 48,
    control_block_count: 40,
    events_block_count: 22,
    hat_count: 3,
    sensing_block_count: 9,
    operators_block_count: 6,
    sound_block_count: 4,
    variables_block_count: 2,
    my_blocks_block_count: 1,
    pen_block_count: 0,
    boolean_operation_count: 0,
    ct_score: 11,
    ct_score_flow_control: 2,
};

const submission = {
    schemaVersion: 1,
    submissionId: 21,
    token,
    status: 'completed',
    locale: 'en',
    sourceType: 'UPLOAD',
    analysis: {
        id: analysisId,
        status: 'completed',
        name: 'synthetic-model-solution.sb3',
        inputFormat: 'sb3',
        metrics,
        issues: [
            {
                id: 1,
                finderId: 'missing-initialisation',
                finderName: 'Missing initialisation',
                type: 'bug',
                hint: 'A synthetic hint.',
                sprite: 'Cat',
                blockId: null,
                costume: null,
                scratchblocks: 'when green flag clicked',
                duplicates: [],
                subsumedBy: [],
                coupledWith: [],
                severity: 4,
                costumes: [],
            },
        ],
        relationships: [],
        catalogue: [],
        quiz: [],
        assetRefs: [],
    },
    analyses: [],
    counts: { expected: 1, completed: 1, failed: 0 },
};

// A service new enough to describe the whole distribution, so the comparison column draws a plot rather than
// falling back to the three words it has always been able to give.
const reference = {
    metrics: [
        {
            name: 'block_count',
            sampleSize: 40,
            lowerBound: 50,
            upperBound: 300,
            minimum: 10,
            q1: 60,
            median: 120,
            q3: 300,
            maximum: 600,
        },
    ],
};

test('reads a task across its four sections, drawing its blocks and placing its size', async ({
    page,
}) => {
    await page.route('**/api/v1/capabilities', (route) => route.fulfill({ json: capabilities }));
    await page.route('**/api/v1/metrics/reference', (route) => route.fulfill({ json: reference }));
    await page.route(`**/api/v1/submissions/${token}**`, (route) =>
        route.fulfill({ json: submission }),
    );

    // The task page is reached through navigation state rather than an address, so the result page is opened first
    // only to let this device remember the project the entry page then offers to work from — the same route
    // `injection.spec.ts` takes to the advanced workspace.
    await page.goto(`./submissions/${token}`);
    await expect(page.getByText('Analysis complete')).toBeVisible();
    await page.goto('./teacher/task');
    // The same offer is made twice on the entry page — once as the quick offer for the latest project, once in the
    // list of everything this device remembers — so the first one is named rather than the label alone.
    await page
        .getByRole('link', { name: 'Look at synthetic-model-solution.sb3 as a task' })
        .first()
        .click();

    await expect(
        page.getByRole('heading', { name: 'What LitterBox found in this task' }),
    ).toBeVisible();
    await expect(
        page.getByRole('heading', { name: 'Computational thinking in this task' }),
    ).toBeVisible();
    await expect(
        page.getByRole('heading', {
            name: 'Programming concepts and blocks in this task',
        }),
    ).toBeVisible();
    await expect(
        page.getByRole('heading', { name: 'Size and complexity of this task' }),
    ).toBeVisible();

    const tiles = page.locator('.task-blocks-tile');
    await expect(tiles).toHaveCount(9);
    const covered = await page.evaluate(() => {
        const drawing = document.querySelector('.task-blocks-treemap') as HTMLElement;
        const whole = drawing.getBoundingClientRect();
        return [...drawing.querySelectorAll<HTMLElement>('.task-blocks-tile')].every((tile) => {
            const box = tile.getBoundingClientRect();
            return (
                box.width > 0 &&
                box.height > 0 &&
                box.left >= whole.left - 1 &&
                box.right <= whole.right + 1 &&
                box.top >= whole.top - 1 &&
                box.bottom <= whole.bottom + 1
            );
        });
    });
    expect(covered).toBe(true);

    await expect(page.locator('.task-blocks-tile-full').first()).toContainText(/\d+ \(\d/);

    await expect(page.locator('.task-concept-group-heading')).toHaveText([
        'Sequence and events',
        'Repetition and decisions',
        'Data and abstraction',
    ]);
    await expect(
        page.locator('.task-concepts > div').first().locator('.task-concept-name'),
    ).toHaveText(['Event-triggered scripts']);
    await expect(
        page.locator('.task-concepts > div').first().locator('.task-concept-value'),
    ).toHaveText(['3']);
    await expect(
        page.locator('.task-concepts > div').nth(1).locator('.task-concept-name'),
    ).toHaveText(['Boolean operators']);
    await expect(
        page.locator('.task-concepts > div').nth(1).locator('.task-concept-value'),
    ).toHaveText(['0']);
    const unmeasuredConcepts = page.locator('#task-concepts-unmeasured');
    await expect(unmeasuredConcepts).toHaveJSProperty('open', false);
    await unmeasuredConcepts.locator('summary').click();
    await expect(unmeasuredConcepts.getByText('Loops')).toBeVisible();

    await expect(page.locator('.metric-box-plot-marker')).toHaveCount(1);
    await expect(page.locator('.metric-box-plot-marker-clamped')).toHaveCount(0);

    // Every reading on the page open at once, at the narrowest width this site supports. A treemap sized in
    // percentages cannot push the page sideways; a wide table inside one of these folds can, and this is what
    // would catch it — the computational-thinking table has a `min-width` and is expected to scroll in its own
    // region rather than take the page with it.
    for (const width of [320, 195]) {
        await page.setViewportSize({ width, height: 844 });
        const noOverflow = await page.evaluate(
            () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
        );
        if (!noOverflow) {
            const wide = await page.evaluate(() => {
                const limit = document.documentElement.clientWidth;
                const clipped = (node: HTMLElement): boolean => {
                    for (let up = node.parentElement; up; up = up.parentElement) {
                        if (getComputedStyle(up).overflowX !== 'visible') return true;
                    }
                    return false;
                };
                return [...document.querySelectorAll<HTMLElement>('*')]
                    .filter((node) => node.getBoundingClientRect().right > limit + 0.5)
                    .filter((node) => !clipped(node))
                    .slice(0, 12)
                    .map(
                        (node) =>
                            `${node.tagName}.${node.className} right=${Math.round(node.getBoundingClientRect().right)}`,
                    );
            });
            console.log('OVERFLOWING', width, JSON.stringify(wide, null, 2));
        }
        expect(noOverflow, `horizontal overflow at ${width} CSS pixels`).toBe(true);
    }
});
