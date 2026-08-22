// SPDX-License-Identifier: EUPL-1.2
// SPDX-FileCopyrightText: 2026 LitterBox-Web contributors

import { describe, expect, it } from 'vitest';
import { annotateScratchblocksDiff } from '../src/lib/scratchblocks-diff';

describe('script diff annotation', () => {
    it('tints only the blocks that differ, on the side that owns the difference', () => {
        const before = 'when green flag clicked\nsay [hello]\nmove (10) steps';
        const after = 'when green flag clicked\nsay [goodbye]\nmove (10) steps';

        const annotated = annotateScratchblocksDiff(before, after);

        expect(annotated.changed).toBe(true);
        expect(annotated.before.split('\n')).toEqual([
            'when green flag clicked',
            'say [hello] :: #dc3545',
            'move (10) steps',
        ]);
        expect(annotated.after.split('\n')).toEqual([
            'when green flag clicked',
            'say [goodbye] :: #28a745',
            'move (10) steps',
        ]);
    });

    it('marks an inserted block as gained without claiming anything was lost', () => {
        const annotated = annotateScratchblocksDiff(
            'when green flag clicked\nmove (10) steps',
            'when green flag clicked\nwait (1) seconds\nmove (10) steps',
        );

        expect(annotated.before).toBe('when green flag clicked\nmove (10) steps');
        expect(annotated.after.split('\n')[1]).toBe('wait (1) seconds :: #28a745');
    });

    it('leaves the sprite and script headings alone, being prose rather than blocks', () => {
        // The injection previews carry these comment lines; a colour marker appended to one lands in the text.
        const annotated = annotateScratchblocksDiff(
            '//Sprite: Banana\n\n//Script: abc\nhide',
            '//Sprite: Banana\n\n//Script: abc\nshow',
        );

        expect(annotated.after.split('\n')).toEqual([
            '//Sprite: Banana',
            '',
            '//Script: abc',
            'show :: #28a745',
        ]);
    });

    it('says nothing changed when the two sides are the same script', () => {
        const script = 'when green flag clicked\nmove (10) steps';
        const annotated = annotateScratchblocksDiff(script, script);

        expect(annotated).toStrictEqual({ before: script, after: script, changed: false });
    });

    it('treats a missing side as everything gained or everything lost', () => {
        expect(annotateScratchblocksDiff('', 'move (10) steps').after).toBe(
            'move (10) steps :: #28a745',
        );
        expect(annotateScratchblocksDiff('move (10) steps', '').before).toBe(
            'move (10) steps :: #dc3545',
        );
    });

    it('shows a very long script plainly rather than spending the comparison on it', () => {
        const longScript = (last: string) =>
            [...Array.from({ length: 400 }, (_, index) => `move (${index}) steps`), last].join(
                '\n',
            );

        const annotated = annotateScratchblocksDiff(longScript('hide'), longScript('show'));

        expect(annotated.changed).toBe(true);
        expect(annotated.before).not.toContain('#dc3545');
        expect(annotated.after).not.toContain('#28a745');
    });
});
