// SPDX-License-Identifier: EUPL-1.2
// SPDX-FileCopyrightText: 2026 LitterBox-Web contributors

import type { LocalScratchblocks } from '../../lib/dynamic-libraries';
import {
    normalizeScratchblocksTransforms,
    translateScratchblocks,
} from '../../lib/scratchblocks-runtime';
import { scratchblocksLanguages } from './scratchblocks-source';

/**
 * How large a rendered block is drawn. Blocks are quoted evidence inside an explanation, and at full size they read
 * as the point of the paragraph rather than as the thing being pointed at, so they are drawn a little under the
 * surrounding prose.
 */
export const BLOCK_SCALE = 0.6;

/**
 * One block drawing, the way every place that quotes blocks draws them: parsed and rendered in the locale's
 * vocabulary, in Scratch 3 style, with the inline styles the renderer leaves behind cleaned off. Throws where the
 * renderer answers with something other than an element of `view`'s document, which a caller reads as a failed
 * drawing.
 */
export function drawScratchblocks(
    renderer: LocalScratchblocks,
    source: string,
    {
        locale,
        inline = false,
        scale = BLOCK_SCALE,
    }: { locale: string; inline?: boolean; scale?: number },
    view: Window,
): Element {
    const languages = scratchblocksLanguages(locale);
    const model = renderer.parse(source, { inline, languages });
    translateScratchblocks(renderer, model, languages[0]);
    const rendered = renderer.render(model, { inline, languages, scale, style: 'scratch3' });
    // The renderer is typed loosely; the drawing must belong to the document that will hold it.
    const ElementConstructor = (view as Window & typeof globalThis).Element;
    if (!(rendered instanceof ElementConstructor))
        throw new Error('Scratchblocks did not return a DOM node');
    normalizeScratchblocksTransforms(rendered);
    return rendered;
}
