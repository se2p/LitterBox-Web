// SPDX-License-Identifier: EUPL-1.2
// SPDX-FileCopyrightText: 2026 LitterBox-Web contributors

/**
 * Draws the home page's illustration once, here, instead of in every visitor's browser.
 *
 * The picture is a constant: the same four blocks, in each of the four languages, on every visit. Drawing it at
 * run time meant every home visitor fetched the Scratchblocks renderer and its dictionaries — 167 kB, 51 kB
 * gzipped — to arrive at a file this script can write once and check in.
 *
 * It renders through a real browser, and through the application's own modules, for two reasons. The renderer
 * measures its text: it asks the browser how wide each label is and lays the blocks out from the answer, so a DOM
 * without a canvas produces overlapping blocks. And going through `prepareScratchblocks` rather than a second
 * copy of the pipeline means the checked-in picture keeps whatever the live one had — the scale, the language
 * dictionaries, the transform rewriting the content security policy needs.
 *
 * Run `npm run home-visual` after changing `homeVisualSource` in any locale, and commit what it writes. The build
 * does not run it: the SVGs are sources, like any other asset.
 */
/* The bodies handed to page.evaluate run in the browser, not in this script's Node context. */
/* global document, CSSStyleSheet, CSSStyleRule, XMLSerializer */
import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const OUT = join(ROOT, 'src', 'assets', 'home-visual');
const ORIGIN = 'http://127.0.0.1:5177';
const BASE = `${ORIGIN}/litterbox/`;
const LOCALES = ['de', 'en', 'es', 'nl'];

const server = spawn('npx', ['vite', '--host', '127.0.0.1', '--port', '5177', '--strictPort'], {
    cwd: ROOT,
    stdio: 'ignore',
});
const stop = () => server.kill('SIGTERM');
process.on('exit', stop);

const reachable = async () => {
    for (let attempt = 0; attempt < 60; attempt++) {
        try {
            if ((await fetch(BASE)).ok) return true;
        } catch {
            // Not up yet.
        }
        await new Promise((resolve) => setTimeout(resolve, 500));
    }
    return false;
};

if (!(await reachable())) {
    stop();
    throw new Error(`The dev server never came up on ${BASE}`);
}

const browser = await chromium.launch();
try {
    const page = await browser.newPage();
    await page.goto(BASE);
    await mkdir(OUT, { recursive: true });
    const sizes = {};

    for (const locale of LOCALES) {
        const svg = await page.evaluate(async (language) => {
            // Served under the deployment's base path, so that is where its modules are.
            const [
                { prepareScratchblocks, normalizeScratchblocksTransforms },
                source,
                packs,
                libraries,
            ] = await Promise.all([
                import('/litterbox/src/lib/scratchblocks-runtime.ts'),
                import('/litterbox/src/components/single-project/scratchblocks-source.ts'),
                import('/litterbox/src/i18n/locales/index.ts'),
                import('/litterbox/src/lib/dynamic-libraries.ts'),
            ]);
            const code = (await packs.loadPack(language)).homeVisualSource;
            const renderer = await prepareScratchblocks(document);
            const languages = source.scratchblocksLanguages(language);
            const model = renderer.parse(code, { languages });
            // The scale the page drew it at, so the checked-in picture is the size the page expected.
            const rendered = renderer.render(model, { languages, scale: 0.6, style: 'scratch3' });
            normalizeScratchblocksTransforms(rendered);
            // Standalone, so an <img> shows what the live render showed. The renderer names only system font
            // stacks, and an <img> fetches nothing, so there is nothing else to carry.
            //
            // Only the rules this picture matches: the renderer's stylesheet covers every block in Scratch and
            // these are four of them, which is 46 kB of stylesheet for about 2 kB of it that applies. Each rule
            // is offered to the picture itself, so what is kept is decided by the drawing rather than guessed at.
            const all = new CSSStyleSheet();
            all.replaceSync(await libraries.loadScratchblocksStyles());
            const wanted = [...all.cssRules].filter((rule) => {
                if (!(rule instanceof CSSStyleRule)) return true;
                try {
                    return rule.selectorText
                        .split(',')
                        .some(
                            (one) =>
                                rendered.matches(one.trim()) || rendered.querySelector(one.trim()),
                        );
                } catch {
                    return true;
                }
            });
            // And only the definitions it points at. The renderer emits its whole shape and icon library into
            // <defs> whatever the picture uses — 35 kB of the 40 for the three shapes these four blocks refer
            // to. Followed transitively, because a kept definition may point at another.
            const referenced = (root) => {
                const found = new Set();
                for (const element of [root, ...root.querySelectorAll('*')]) {
                    for (const attribute of element.attributes) {
                        for (const [, id] of attribute.value.matchAll(/#([\w:.-]+)/g))
                            found.add(id);
                    }
                }
                return found;
            };
            const defs = rendered.querySelector('defs');
            if (defs) {
                const kept = new Set();
                let frontier = referenced(rendered);
                while (frontier.size > 0) {
                    const next = new Set();
                    for (const id of frontier) {
                        if (kept.has(id)) continue;
                        kept.add(id);
                        const definition = defs.querySelector(`[id="${id}"]`);
                        if (definition)
                            for (const nested of referenced(definition)) next.add(nested);
                    }
                    frontier = next;
                }
                for (const child of [...defs.children]) {
                    if (!kept.has(child.id)) child.remove();
                }
            }
            const sheet = document.createElementNS('http://www.w3.org/2000/svg', 'style');
            sheet.textContent = wanted.map((rule) => rule.cssText).join('\n');
            rendered.insertBefore(sheet, rendered.firstChild);
            rendered.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
            return new XMLSerializer().serializeToString(rendered);
        }, locale);

        await writeFile(join(OUT, `${locale}.svg`), `${svg}\n`, 'utf8');
        // Beside it, as the other assets in this project are covered: serialised SVG has nowhere sensible
        // to put a header, and a licence that travels with the file cannot be left behind by a split.
        // REUSE-IgnoreStart
        await writeFile(
            join(OUT, `${locale}.svg.license`),
            'SPDX-FileCopyrightText: 2026 LitterBox-Web contributors\nSPDX-License-Identifier: EUPL-1.2\n',
            'utf8',
        );
        // REUSE-IgnoreEnd
        // The blocks spell out a different sentence in each language, so each picture is its own width. Carried
        // beside them so the page can reserve the space before the file arrives and nothing jumps.
        const [, width, height] = /width="([\d.]+)" height="([\d.]+)"/.exec(svg) ?? [];
        sizes[locale] = { width: Math.round(Number(width)), height: Math.round(Number(height)) };
        console.log(
            `${locale}.svg: ${svg.length} bytes, ${sizes[locale].width}x${sizes[locale].height}`,
        );
    }

    // REUSE-IgnoreStart
    await writeFile(
        join(OUT, 'index.ts'),
        [
            '// SPDX-License-Identifier: EUPL-1.2',
            '// SPDX-FileCopyrightText: 2026 LitterBox-Web contributors',
            '',
            '// Written by scripts/home-visual.mjs. Run `npm run home-visual` rather than editing this.',
            '',
            ...LOCALES.map((locale) => `import ${locale} from './${locale}.svg';`),
            '',
            "import type { SupportedLocale } from '../../api/capabilities';",
            '',
            'export interface HomeVisual {',
            '    readonly source: string;',
            '    readonly width: number;',
            '    readonly height: number;',
            '}',
            '',
            'export const homeVisual: Record<SupportedLocale, HomeVisual> = {',
            ...LOCALES.map(
                (locale) =>
                    `    ${locale}: { source: ${locale}, width: ${sizes[locale].width}, height: ${sizes[locale].height} },`,
            ),
            '};',
            '',
        ].join('\n'),
        'utf8',
    );
    // REUSE-IgnoreEnd
} finally {
    await browser.close();
    stop();
}
