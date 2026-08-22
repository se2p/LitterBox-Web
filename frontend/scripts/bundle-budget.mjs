// SPDX-License-Identifier: EUPL-1.2
// SPDX-FileCopyrightText: 2026 LitterBox-Web contributors

/**
 * What a first visit has to download before anything can be shown, held to a ceiling.
 *
 * A first visit is the home page, so the entry chunk is not the whole bill: whatever index.html links or preloads
 * arrives with it, and a chunk the landing page imports on sight is downloaded as surely as the entry itself. Both
 * are measured here. Everything reached only by a dynamic import that a *press* triggers — the pattern catalogue,
 * the teacher's workflows, the researcher's workspace, Graphviz, the zip reader — is fetched when it is first
 * asked for, and a school connection should not pay for a page nobody opened.
 *
 * Raise a ceiling deliberately, in a commit that says why, or split the thing that pushed it over.
 */
import { readdir, readFile, stat } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';
import { join } from 'node:path';

const DIST = new URL('../dist/', import.meta.url).pathname;
const ASSETS = join(DIST, 'assets');

/** Room to move without a fortnightly argument, but not room for another workflow to slip in. */
const ENTRY_BUDGET_BYTES = 540 * 1024;
const ENTRY_BUDGET_GZIP_BYTES = 165 * 1024;

/**
 * Everything index.html tells the browser to fetch before it can run a line of our code: the entry, the stylesheet
 * and any chunk Vite chose to preload beside them. Held separately, because a chunk split out of the first route
 * leaves the entry looking smaller while a visitor downloads exactly as much.
 *
 * It does not cover what the home page then asks for itself — the block renderer it draws its illustration with is
 * fetched when the browser is next idle. That is a dynamic import like any other, and the rule for those is the
 * one above: load it on demand, and keep the demand real.
 *
 * Nor does it cover the German, Spanish and Dutch translations, for the same reason and with the same caveat: the
 * application carries English, and a reader who has chosen one of the others pays one file for it before anything
 * is drawn. That is a real saving for the English reader and a real cost for everyone else, not an accounting one.
 */
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
