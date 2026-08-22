// SPDX-License-Identifier: EUPL-1.2
// SPDX-FileCopyrightText: 2026 LitterBox-Web contributors

import type { CatalogueEntry } from '../../api/submissions';

/** The catalogue entries of an analysis, keyed by the finder id each of them describes. */
export type CatalogueLookup = ReadonlyMap<string, CatalogueEntry>;

/** A token the service left unfilled, such as `%SPRITE`, because the pattern has no project behind it. */
const UNRESOLVED_TOKEN = /%[A-Z_]+/;

export const buildCatalogueLookup = (entries: readonly CatalogueEntry[] = []): CatalogueLookup => {
    const byId = new Map<string, CatalogueEntry>();
    entries.forEach((entry) => {
        const id = entry.id?.trim();
        if (id) byId.set(id, entry);
    });
    return byId;
};

/**
 * The catalogue entry this finder is described by, if the analysis carries one.
 *
 * Matching is on identifiers only. A title is a translation and a humanised finder name is a guess; either would
 * attach one pattern's explanation to another pattern's findings, which is worse than attaching none.
 */
export const catalogueForFinder = (
    finderId: string | null | undefined,
    lookup: CatalogueLookup,
): CatalogueEntry | undefined => {
    const id = finderId?.trim();
    if (!id) return undefined;
    return lookup.get(id);
};

/**
 * Catalogue prose is worth showing only when it is finished. The same sentences are used on the catalogue page, where
 * a generic stand-in is substituted for each unfilled token so the pattern reads as a description of itself. Here the
 * finding's own hint has already named the real sprite and the real variable, so a second sentence about "a sprite"
 * would be describing a different project. An unfinished sentence is left out instead.
 */
export const completeProse = (value: string | null | undefined): string | undefined => {
    const text = value?.trim();
    if (!text || UNRESOLVED_TOKEN.test(text)) return undefined;
    return text;
};
