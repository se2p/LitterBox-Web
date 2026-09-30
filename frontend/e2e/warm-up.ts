// SPDX-License-Identifier: EUPL-1.2
// SPDX-FileCopyrightText: 2026 LitterBox-Web contributors
import { chromium, type FullConfig } from '@playwright/test';

/**
 * Loads the app once before the first test, so that a server that has only just started, or a dev server that
 * still has to transform its modules, pays that cost here rather than inside the first test's expectations.
 */
export default async function warmUp(config: FullConfig): Promise<void> {
    const baseURL = config.projects[0]?.use.baseURL;
    if (!baseURL) return;
    const browser = await chromium.launch();
    try {
        const page = await browser.newPage();
        await page.goto(baseURL, { waitUntil: 'load', timeout: 120_000 });
        await page.waitForSelector('#root > *', { timeout: 120_000 });
    } finally {
        await browser.close();
    }
}
