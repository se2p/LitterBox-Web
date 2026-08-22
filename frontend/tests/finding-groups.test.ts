// SPDX-License-Identifier: EUPL-1.2
// SPDX-FileCopyrightText: 2026 LitterBox-Web contributors

import { describe, expect, it } from 'vitest';
import { groupFindings, namedSprites } from '../src/components/single-project/finding-groups';
import { issue } from './helpers';

describe('grouping findings by finder', () => {
    it('gathers every occurrence of one finder and counts them', () => {
        const groups = groupFindings([
            issue({ id: 1, sprite: 'Cat' }),
            issue({ id: 2, sprite: 'Dog' }),
            issue({ id: 3, sprite: 'Cat' }),
        ]);

        expect(groups).toHaveLength(1);
        expect(groups[0]?.occurrences.map((one) => one.id)).toEqual([1, 2, 3]);
        // Distinct, in the order they appear: the same sprite twice is one sprite.
        expect(groups[0]?.sprites).toEqual(['Cat', 'Dog']);
    });

    it('keeps findings without a finder id apart', () => {
        // They could only be merged on their displayed name, which is a translation. Two findings are not one
        // finder's work on the strength of the current language.
        const groups = groupFindings([
            issue({ id: 1, finderId: '', finderName: 'Untitled' }),
            issue({ id: 2, finderId: '   ', finderName: 'Untitled' }),
        ]);

        expect(groups).toHaveLength(2);
        expect(groups.map((group) => group.key)).toEqual(['issue:1', 'issue:2']);
    });

    it('orders the groups by the first occurrence it was handed', () => {
        // The page hands over findings in whatever order the reader chose, so the groups follow that order rather
        // than imposing one of their own.
        const groups = groupFindings([
            issue({ id: 1, finderId: 'second' }),
            issue({ id: 2, finderId: 'first' }),
            issue({ id: 3, finderId: 'second' }),
        ]);

        expect(groups.map((group) => group.finderId)).toEqual(['second', 'first']);
        expect(groups[0]?.occurrences).toHaveLength(2);
    });

    it('leaves an empty result empty', () => {
        expect(groupFindings([])).toEqual([]);
    });

    it('names the first few sprites and counts the rest', () => {
        // A heading that lists fifteen sprites has lost the count it was there to carry.
        expect(namedSprites(['Cat', 'Dog'], 4)).toEqual({ named: ['Cat', 'Dog'], remaining: 0 });
        expect(namedSprites(['a', 'b', 'c', 'd', 'e', 'f'], 4)).toEqual({
            named: ['a', 'b', 'c', 'd'],
            remaining: 2,
        });
        expect(namedSprites([], 4)).toEqual({ named: [], remaining: 0 });
    });
});
