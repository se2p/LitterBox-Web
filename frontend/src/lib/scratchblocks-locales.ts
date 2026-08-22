// SPDX-License-Identifier: EUPL-1.2
// SPDX-FileCopyrightText: 2026 LitterBox-Web contributors

import scratchblocksGerman from 'scratchblocks/locales/de.json';
import scratchblocksSpanish from 'scratchblocks/locales/es.json';
import scratchblocksDutch from 'scratchblocks/locales/nl.json';

/**
 * The block vocabulary of the three languages that are not the renderer's own. Kept in a module of its own so that
 * it is fetched with the renderer it is for: imported beside it, the three dictionaries rode into the entry chunk
 * on the back of the loader module, and every first visit paid for a renderer most of them never asked to draw.
 */
export const SCRATCHBLOCKS_LANGUAGES: Record<string, unknown> = {
    de: scratchblocksGerman,
    es: scratchblocksSpanish,
    nl: scratchblocksDutch,
};
