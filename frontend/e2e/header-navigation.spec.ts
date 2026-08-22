// SPDX-License-Identifier: EUPL-1.2
// SPDX-FileCopyrightText: 2026 LitterBox-Web contributors
import { expect, test, type Page } from '@playwright/test';

/**
 * The header used to wrap onto a second row: German needed 895px of link space in a
 * 851px slot, so it wrapped even at full desktop width, and English wrapped around
 * 1100px. This guards the fix at every width in every locale, with every optional
 * capability advertised so the nav carries its maximum item count.
 */

const LOCALES = ['en', 'de', 'es', 'nl'] as const;
const WIDTHS = [1440, 1280, 1200, 1100, 1040, 1024, 960, 820, 640, 480, 320];
const EXPECTED_ITEMS = 6;

const CAPABILITIES = {
    schemaVersion: 1,
    litterboxVersion: 'synthetic-e2e',
    supportedLocales: ['de', 'en', 'es', 'nl'],
    enabledFeatures: [
        'single-project',
        'teacher-archive',
        'studio',
        'metrics-graphs',
        'semantic-diff',
        'program-export',
        'fault-injection',
        'qlc',
    ],
};

async function stubCapabilities(page: Page) {
    await page.route('**/api/v1/capabilities', (route) =>
        route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify(CAPABILITIES),
        }),
    );
}

for (const locale of LOCALES) {
    test(`header navigation never wraps in ${locale}`, async ({ page }) => {
        await stubCapabilities(page);

        for (const width of WIDTHS) {
            await page.setViewportSize({ width, height: 900 });
            await page.goto('./');
            await page.selectOption('#language-select', locale);
            await expect(page.locator('.nav-list li')).toHaveCount(EXPECTED_ITEMS);

            const layout = await page.evaluate(() => {
                const items = [...document.querySelectorAll('.nav-list li')];
                const list = document.querySelector('.nav-list') as HTMLElement;
                const toggle = document.querySelector('.nav-toggle') as HTMLElement;
                return {
                    rows: new Set(items.map((item) => Math.round(item.getBoundingClientRect().top)))
                        .size,
                    collapsed:
                        getComputedStyle(toggle).display !== 'none' &&
                        getComputedStyle(list).display === 'none',
                    horizontallyScrollable:
                        document.documentElement.scrollWidth > document.documentElement.clientWidth,
                };
            });

            // Either the menu is collapsed behind the toggle, or every link sits on one row.
            expect(
                layout.collapsed || layout.rows === 1,
                `nav occupied ${layout.rows} rows at ${width}px in ${locale}`,
            ).toBe(true);
            expect(
                layout.horizontallyScrollable,
                `page scrolled horizontally at ${width}px in ${locale}`,
            ).toBe(false);
        }
    });
}
