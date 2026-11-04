// SPDX-License-Identifier: EUPL-1.2
// SPDX-FileCopyrightText: 2026 LitterBox-Web contributors

import { readFile } from 'node:fs/promises';
import JSZip from 'jszip';
import { expect, test } from '@playwright/test';

test('analyses a synthetic project and retains both CT rubrics after reload', async ({ page }) => {
    test.skip(process.env.PLAYWRIGHT_REAL_API !== 'true', 'requires the synthetic backend');
    const project = JSON.parse(
        await readFile(
            new URL(
                '../../litterbox-web/src/test/resources/fixtures/scratch_programs/extendedCt.json',
                import.meta.url,
            ),
            'utf8',
        ),
    );
    const zip = new JSZip();
    zip.file('project.json', JSON.stringify(project));
    zip.file(
        project.targets[0].costumes[0].md5ext,
        Buffer.from(
            'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
            'base64',
        ),
    );
    await page.addInitScript(() => localStorage.setItem('litterbox.locale', 'en'));
    await page.goto('./teacher/task');
    await page.locator('#task-analysis-project-file').setInputFiles({
        name: 'synthetic-extended-ct.sb3',
        mimeType: 'application/zip',
        buffer: await zip.generateAsync({ type: 'nodebuffer' }),
    });
    await page
        .locator('form')
        .filter({ has: page.locator('#task-analysis-project-file') })
        .getByRole('button', { name: 'Analyse this task' })
        .click();
    const selector = page.getByRole('combobox', { name: 'Computational-thinking rubric' });
    await expect(selector).toHaveValue('extended', { timeout: 60_000 });
    await expect(page.locator('.task-ct-profile tbody tr')).toHaveCount(9);
    await expect(page.locator('.task-ct-total')).toContainText('of 36');
    const flow = page.locator('.task-ct-profile tbody tr').filter({ hasText: 'Flow control' });
    await expect(flow.locator('.task-ct-level-segment.is-reached')).toHaveCount(4);
    await selector.selectOption('classic');
    await expect(page.locator('.task-ct-profile tbody tr')).toHaveCount(7);
    await expect(page.locator('.task-ct-total')).toContainText('of 21');
    await expect(flow.locator('.task-ct-level-segment.is-reached')).toHaveCount(2);
    await page.reload();
    await expect(selector).toHaveValue('extended');
    await expect(flow.locator('.task-ct-level-segment.is-reached')).toHaveCount(4);
});
