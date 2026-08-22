// SPDX-License-Identifier: EUPL-1.2
// SPDX-FileCopyrightText: 2026 LitterBox-Web contributors

import { describe, expect, it } from 'vitest';
import type { CatalogueEntry } from '../src/api/submissions';
import {
    buildCatalogueLookup,
    catalogueForFinder,
    completeProse,
} from '../src/components/single-project/catalogue-lookup';

const entry = (id: string): CatalogueEntry =>
    ({
        id,
        title: `Title for ${id}`,
        description: `Description for ${id}`,
        locale: 'en',
        fallback: false,
        instruction: '',
        examples: [],
        issueType: 'bug',
    }) as CatalogueEntry;

describe('matching a finder to its catalogue entry', () => {
    it('matches on the identifier, trimming what came around it', () => {
        const lookup = buildCatalogueLookup([entry('long-script'), entry('dead-code')]);

        expect(catalogueForFinder('long-script', lookup)?.id).toBe('long-script');
        expect(catalogueForFinder('  long-script  ', lookup)?.id).toBe('long-script');
        // Identifiers, not titles: a title is a translation, and matching on one would attach an explanation of
        // one pattern to another pattern's findings.
        expect(catalogueForFinder('Title for long-script', lookup)).toBeUndefined();
        expect(catalogueForFinder('Long Script', lookup)).toBeUndefined();
    });

    it('matches nothing for a finding with no finder id', () => {
        const lookup = buildCatalogueLookup([entry('long-script')]);

        expect(catalogueForFinder('', lookup)).toBeUndefined();
        expect(catalogueForFinder('   ', lookup)).toBeUndefined();
        expect(catalogueForFinder(null, lookup)).toBeUndefined();
        expect(catalogueForFinder(undefined, lookup)).toBeUndefined();
    });

    it('copes with an analysis that carries no catalogue at all', () => {
        expect(catalogueForFinder('long-script', buildCatalogueLookup())).toBeUndefined();
        expect(catalogueForFinder('long-script', buildCatalogueLookup([]))).toBeUndefined();
    });
});

describe('catalogue prose', () => {
    it('is shown when it is finished', () => {
        expect(completeProse('  A complete sentence.  ')).toBe('A complete sentence.');
    });

    it('is left out when the service left a token in it', () => {
        // The catalogue page fills these with a generic stand-in so the pattern describes itself. Beside a
        // finding whose own hint names the real sprite, that stand-in describes a different project.
        expect(completeProse('The sprite %SPRITE has no scripts.')).toBeUndefined();
        expect(completeProse('Compare %VARIABLE with %MESSAGE.')).toBeUndefined();
    });

    it('is left out when there is nothing to show', () => {
        expect(completeProse('')).toBeUndefined();
        expect(completeProse('   ')).toBeUndefined();
        expect(completeProse(null)).toBeUndefined();
        expect(completeProse(undefined)).toBeUndefined();
    });
});
