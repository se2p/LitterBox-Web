// SPDX-License-Identifier: EUPL-1.2
// SPDX-FileCopyrightText: 2026 LitterBox-Web contributors

/** Keep the entry chunk and assets referenced by index.html within first-paint limits. */
import { readdir, readFile, stat } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';
import { join } from 'node:path';

const DIST = new URL('../dist/', import.meta.url).pathname;
const ASSETS = join(DIST, 'assets');

const ENTRY_BUDGET_BYTES = 540 * 1024;
const ENTRY_BUDGET_GZIP_BYTES = 165 * 1024;

/** Include every script and stylesheet referenced by index.html, including preloads. */
const FIRST_PAINT_BUDGET_BYTES = 620 * 1024;
const FIRST_PAINT_BUDGET_GZIP_BYTES = 180 * 1024;

const kilobytes = (bytes) => `${(bytes / 1024).toFixed(1)} kB`;

const sizes = async (name) => {
    const file = join(ASSETS, name);
    const [{ size }, contents] = await Promise.all([stat(file), readFile(file)]);
    return { name, bytes: size, gzip: gzipSync(contents).byteLength };
};

const entryChunk = async () => {
    const names = (await readdir(ASSETS)).filter(
        (name) => name.startsWith('index-') && name.endsWith('.js'),
    );
    if (names.length === 0) throw new Error('No entry chunk in dist/assets — run the build first.');
    // Vite emits more than one index-*.js; the entry is the largest of them.
    const sized = await Promise.all(names.map(sizes));
    return sized.sort((left, right) => right.bytes - left.bytes)[0];
};

/** Everything index.html points at under assets/, whatever base path the build was given. */
const firstPaintAssets = async () => {
    const html = await readFile(join(DIST, 'index.html'), 'utf8');
    const referenced = new Set(
        Array.from(
            html.matchAll(/(?:src|href)="[^"]*\/assets\/([^"]+\.(?:js|css))"/g),
            (match) => match[1],
        ),
    );
    if (referenced.size === 0)
        throw new Error('index.html references no assets — run the build first.');
    return Promise.all(Array.from(referenced, sizes));
};

const entry = await entryChunk();
const firstPaint = await firstPaintAssets();
const firstPaintBytes = firstPaint.reduce((total, asset) => total + asset.bytes, 0);
const firstPaintGzip = firstPaint.reduce((total, asset) => total + asset.gzip, 0);

const failures = [];
const hold = (measured, budget, what) => {
    if (measured > budget)
        failures.push(`${what}: ${kilobytes(measured)} exceeds ${kilobytes(budget)}`);
};
hold(entry.bytes, ENTRY_BUDGET_BYTES, 'entry chunk');
hold(entry.gzip, ENTRY_BUDGET_GZIP_BYTES, 'entry chunk gzipped');
hold(firstPaintBytes, FIRST_PAINT_BUDGET_BYTES, 'first paint');
hold(firstPaintGzip, FIRST_PAINT_BUDGET_GZIP_BYTES, 'first paint gzipped');

console.log(
    `entry chunk ${entry.name}: ${kilobytes(entry.bytes)} (${kilobytes(entry.gzip)} gzipped)`,
);
console.log(
    `first paint (${firstPaint.length} asset${firstPaint.length === 1 ? '' : 's'}): ` +
        `${kilobytes(firstPaintBytes)} (${kilobytes(firstPaintGzip)} gzipped)`,
);
if (failures.length > 0) {
    for (const failure of failures) console.error(`bundle budget: ${failure}`);
    console.error(
        'Load the new weight with a dynamic import, or raise the budget in scripts/bundle-budget.mjs.',
    );
    process.exit(1);
}
