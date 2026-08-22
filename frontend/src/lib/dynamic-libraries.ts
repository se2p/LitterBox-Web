// SPDX-License-Identifier: EUPL-1.2
// SPDX-FileCopyrightText: 2025 LitterBox-Web contributors

/**
 * Nothing here may import a library at the top of the file. Every export is a door to something heavy, and a static
 * import would put the weight in the entry chunk to be downloaded by everyone who never opens that door.
 */

/** Keep Graphviz out of the initial bundle until a graph is requested. */
export async function loadGraphviz() {
    return import('@viz-js/viz');
}

export interface LocalScratchblocks {
    parse: (source: string, options?: Record<string, unknown>) => unknown;
    render: (document: unknown, options?: Record<string, unknown>) => unknown;
    loadLanguages?: (languages: Record<string, unknown>) => void;
}

/** Load the bundled renderer; no network request or CDN fallback is permitted. */
export async function loadScratchblocks(): Promise<unknown> {
    return import('scratchblocks/index.js');
}

/** Load the renderer stylesheet as data so it can be installed without inline CSS. */
export async function loadScratchblocksStyles(): Promise<string> {
    const module = await import('scratchblocks/scratch3/style.css.js');
    return module.default;
}

/** Load the block vocabulary of the languages the renderer does not carry itself. */
export async function loadScratchblocksLanguages(): Promise<Record<string, unknown>> {
    const module = await import('./scratchblocks-locales');
    return module.SCRATCHBLOCKS_LANGUAGES;
}

export function createScratchblocksRenderer(
    module: unknown,
    windowObject: Window,
    languages: Record<string, unknown> = {},
): LocalScratchblocks {
    const asRenderer = (value: unknown): LocalScratchblocks | undefined => {
        if (!value || (typeof value !== 'object' && typeof value !== 'function')) return undefined;
        const renderer = value as Partial<LocalScratchblocks>;
        return typeof renderer.parse === 'function' && typeof renderer.render === 'function'
            ? (renderer as LocalScratchblocks)
            : undefined;
    };
    const prepare = (renderer: LocalScratchblocks): LocalScratchblocks => {
        renderer.loadLanguages?.(languages);
        return renderer;
    };
    const candidate = module as { default?: unknown };
    if (typeof candidate.default === 'function') {
        const renderer = asRenderer(
            (candidate.default as (windowValue: Window) => unknown)(windowObject),
        );
        if (renderer) return prepare(renderer);
    }
    const renderer = asRenderer(candidate.default) ?? asRenderer(module);
    if (renderer) return prepare(renderer);
    throw new Error('The bundled Scratchblocks renderer is unavailable');
}
