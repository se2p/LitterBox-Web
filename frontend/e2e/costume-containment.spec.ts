// SPDX-License-Identifier: EUPL-1.2
// SPDX-FileCopyrightText: 2025 LitterBox-Web contributors

import { expect, test, type Page } from '@playwright/test';

/**
 * The backend admission check reads a costume for active markup and stops there: it does not judge CSS, because every
 * fix for one spelling of a CSS fetch has been followed by another spelling. What actually contains a costume is that
 * it is served under `default-src 'none'; sandbox` and rendered through an `img` element, and that is a claim about the
 * browser, so it is a browser that has to answer it.
 *
 * Every payload below is a published bypass of Scratch's own SVG sanitiser. None of them is served in practice — a
 * `<script>` would never have been stored — but the point is what happens when one is, so the asset response is mocked
 * to carry them straight past the backend and into the real rendering path.
 *
 * `<s:script>` is here because it was once served in practice: bound to an alias of the SVG namespace it is the same
 * element as `<script>`, and the admission check used to read markup as strings and see two different ones. It is
 * refused at the door now, and it should be inert here for the reason everything else is.
 */
const escapedUrl = '\\75\\72\\6c';
const maliciousCostume = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:s="http://www.w3.org/2000/svg" width="8" height="8" viewBox="0 0 8 8">
  <style>
    @import url("https://example.invalid/import");
    :root { --leak: url(https://example.invalid/variable); }
    .variable { background-image: var(--leak); }
    .set { background-image: image-set("https://example.invalid/image-set" 1x); }
    .several { background-image: url(https://example.invalid/one), url(https://example.invalid/two); }
    .escaped { background-image: ${escapedUrl}(https://example.invalid/escaped); }
    nesting { rect { background-image: url(https://example.invalid/nested-rule); } }
    * { transform: scale(10000) !important; transition: all 9999s ease !important; }
  </style>
  <script type="text/javascript">(window.top || window).__costumeEscaped = 'script';</script>
  <s:script type="text/javascript">(window.top || window).__costumeEscaped = 'aliased';</s:script>
  <rect class="variable set several escaped" width="8" height="8" fill="#00a9c7"/>
  <image href="https://example.invalid/href" width="8" height="8"/>
  <image href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg'%3E%3C/svg%3E" width="8" height="8"/>
  <image href="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=" width="8" height="8"/>
</svg>`;

/** What the application really answers an asset request with, so the costume renders under the policy it ships with. */
const assetHeaders = {
    'content-type': 'image/svg+xml',
    'content-security-policy':
        "default-src 'none'; style-src 'unsafe-inline'; img-src data:; sandbox",
    'x-content-type-options': 'nosniff',
};

const costumeHash = '7'.repeat(64);

const completedStatus = (token: string) => ({
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
        issues: [
            {
                id: 1,
                finderId: 'synthetic-finder',
                finderName: 'Synthetic finding',
                type: 'smell',
                hint: 'Synthetic hint',
                sprite: 'Hostile sprite',
                blockId: 'block-containment',
                costume: 'costume.svg',
                scratchblocks: 'move (10) steps',
                duplicates: [],
                subsumedBy: [],
                coupledWith: [],
                severity: 1,
                costumes: [],
                currentCostume: -1,
                refactoringScratchblocks: null,
                similarTo: [],
                thumbnailRef: `/litterbox/api/v1/submissions/${token}/assets/${costumeHash}`,
            },
        ],
        relationships: [],
        catalogue: [],
        quiz: [],
        assetRefs: [],
    },
    expectedCount: 1,
    completedCount: 1,
    failedCount: 0,
    analyses: [],
    counts: { expected: 1, completed: 1, failed: 0 },
});

/**
 * Standing in for every host the payloads name. A blocked request still reaches Playwright's `request` event, so what
 * counts is not whether the browser considered fetching but whether anything was ever handed back: this handler runs
 * only for a request that got past the policy, and the URLs it collects are the leak.
 */
const answerOutboundRequests = async (page: Page, served: string[]) => {
    await page.route('https://example.invalid/**', (route) => {
        served.push(route.request().url());
        return route.fulfill({
            status: 200,
            contentType: 'text/css',
            body: 'body { outline: 0; }',
        });
    });
};

test('a hostile costume renders as a picture and reaches nothing around it', async ({ page }) => {
    const token = 'containment-token';
    const served: string[] = [];
    await answerOutboundRequests(page, served);

    await page.route('**/api/v1/capabilities', (route) =>
        route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
                schemaVersion: 1,
                litterboxVersion: 'synthetic',
                supportedLocales: ['de', 'en', 'es', 'nl'],
                enabledFeatures: ['single-project'],
            }),
        }),
    );
    await page.route(`**/api/v1/submissions/${token}/events`, (route) => route.abort());
    await page.route(`**/api/v1/submissions/${token}`, (route) =>
        route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify(completedStatus(token)),
        }),
    );
    await page.route(`**/assets/${costumeHash}`, (route) =>
        route.fulfill({ status: 200, headers: assetHeaders, body: maliciousCostume }),
    );

    const costumeResponse = page.waitForResponse(`**/assets/${costumeHash}`);
    await page.goto(`./submissions/${token}`);
    await expect(
        page.getByRole('img', { name: 'Current costume for Hostile sprite' }),
    ).toBeVisible();
    expect((await costumeResponse).headers()['content-security-policy']).toContain(
        "default-src 'none'",
    );

    // The costume is a picture, not markup the page adopted: the payload exists only inside the image resource.
    const costume = page.locator('.costume-thumbnail').first();
    await expect(costume).toHaveJSProperty('tagName', 'IMG');
    await expect(costume).toHaveAttribute('src', new RegExp(costumeHash));
    expect(await page.content()).not.toContain('example.invalid');
    expect(await page.locator('object, embed, iframe').count()).toBe(0);

    // Long transitions restyle the page they are inlined into. This one is not inlined into any page.
    const transformed = await page.evaluate(
        () =>
            [
                ...document.querySelectorAll<HTMLElement>(
                    'body, main, .issue-card, .costume-thumbnail',
                ),
            ].filter((element) => getComputedStyle(element).transform !== 'none').length,
    );
    expect(transformed).toBe(0);

    // The rect still paints, so containment did not cost the preview.
    expect(
        await costume.evaluate((image: HTMLImageElement) => ({
            complete: image.complete,
            width: image.naturalWidth,
        })),
    ).toEqual({ complete: true, width: 8 });

    await page.waitForTimeout(250);
    expect(
        await page.evaluate(() => (window as { __costumeEscaped?: string }).__costumeEscaped),
    ).toBe(undefined);
    expect(served).toEqual([]);
});

/**
 * The `img` element is one of the two things holding a costume, and a link somebody pasted skips it: the browser then
 * renders the costume as the document it is, with its CSS live. The asset policy is the half that answers that, so it
 * is asked on its own here rather than only behind the element that would have hidden the question.
 */
test('a hostile costume opened on its own neither runs nor fetches anything', async ({ page }) => {
    const served: string[] = [];
    await answerOutboundRequests(page, served);

    await page.route(`**/assets/${costumeHash}`, (route) =>
        route.fulfill({ status: 200, headers: assetHeaders, body: maliciousCostume }),
    );

    await page.goto(`/litterbox/api/v1/submissions/direct-token/assets/${costumeHash}`);
    // The costume really is being rendered as a document here, which is what makes the next assertion mean anything.
    expect(await page.evaluate(() => document.documentElement.tagName.toLowerCase())).toBe('svg');
    await page.waitForTimeout(500);

    // Both spellings of the script run here when the policy is absent, so their silence is the policy's doing.
    expect(
        await page.evaluate(() => (window as { __costumeEscaped?: string }).__costumeEscaped),
    ).toBe(undefined);
    expect(served).toEqual([]);
});
