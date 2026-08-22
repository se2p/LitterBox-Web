// SPDX-License-Identifier: EUPL-1.2
// SPDX-FileCopyrightText: 2026 LitterBox-Web contributors

import {
    createScratchblocksRenderer,
    loadScratchblocks,
    loadScratchblocksLanguages,
    loadScratchblocksStyles,
    type LocalScratchblocks,
} from './dynamic-libraries';

const documentsWithScratchblocksStyles = new WeakSet<Document>();

export function installScratchblocksStyles(documentObject: Document, css: string): void {
    if (documentsWithScratchblocksStyles.has(documentObject)) return;
    if ('adoptedStyleSheets' in documentObject && typeof CSSStyleSheet !== 'undefined') {
        const stylesheet = new CSSStyleSheet();
        stylesheet.replaceSync(css);
        documentObject.adoptedStyleSheets = [...documentObject.adoptedStyleSheets, stylesheet];
    } else {
        const stylesheet = documentObject.createElement('style');
        stylesheet.dataset.scratchblocks = 'true';
        stylesheet.textContent = css;
        documentObject.head.appendChild(stylesheet);
    }
    documentsWithScratchblocksStyles.add(documentObject);
}

/**
 * Strips inline styles off a rendered drawing, moving a transform onto the SVG attribute where one is readable.
 *
 * This used to be how the drawing got its scale, on the belief that a style the policy refuses is still readable
 * on the attribute. That is true of Chromium and false of Firefox, which empties the value — so the scale was
 * silently dropped on the assembled site, and only there, and only in that browser. The renderer is patched to
 * set the attribute itself now, and nothing depends on reading a refused style back.
 *
 * What is left is the cleanup: an inline style the policy would refuse anyway should not stay on the drawing.
 * Recovering a transform from one is kept for anything the renderer might yet emit, but a value that arrives
 * empty cannot be recovered, so it must not be the way anything is meant to work.
 */
export function normalizeScratchblocksTransforms(rendered: Node): void {
    if (!(rendered instanceof Element)) return;
    for (const element of rendered.querySelectorAll<SVGElement>('[style]')) {
        const style = element.getAttribute('style') ?? '';
        const transform = /(?:^|;)\s*transform\s*:\s*([^;]+)/i
            .exec(style)?.[1]
            ?.replace(/\s*!important\s*$/i, '')
            .trim();
        if (transform && !element.hasAttribute('transform'))
            element.setAttribute('transform', transform);
        element.removeAttribute('style');
    }
}

/** Load the renderer and install its stylesheet into the document that will host the rendered blocks. */
export async function prepareScratchblocks(documentObject: Document): Promise<LocalScratchblocks> {
    const view = documentObject.defaultView;
    if (!view) throw new Error('Scratchblocks needs a document with a window');
    const [module, css, languages] = await Promise.all([
        loadScratchblocks(),
        loadScratchblocksStyles(),
        loadScratchblocksLanguages(),
    ]);
    const renderer = createScratchblocksRenderer(module, view, languages);
    installScratchblocksStyles(documentObject, css);
    return renderer;
}
