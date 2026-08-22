// SPDX-License-Identifier: EUPL-1.2
// SPDX-FileCopyrightText: 2026 LitterBox-Web contributors

/**
 * Tints for the blocks that differ between two versions of a script, in the notation Scratchblocks reads: a block
 * whose line ends in `:: #rrggbb` is drawn in that colour. This is how LitterBox's own HTML diff report marks a
 * change, and a reader who has seen one report should recognise the other.
 */
const REMOVED_TINT = ' :: #dc3545';
const ADDED_TINT = ' :: #28a745';

/**
 * Past this many lines the comparison is not worth what it costs, and a script that long is not read block by block
 * anyway. Both sides are then shown untinted rather than not at all.
 */
const MAX_COMPARED_LINES = 400;

export interface AnnotatedScripts {
    /** The earlier script, with the lines that do not survive tinted red. */
    readonly before: string;
    /** The later script, with the lines that were not there before tinted green. */
    readonly after: string;
    /** Whether the two differ at all. A script that came through a change untouched is worth saying so about. */
    readonly changed: boolean;
}

/**
 * A blank line has nothing to colour, and a Scratchblocks comment is prose rather than a block: a tint appended to
 * either lands in the text instead of on a block, which is worse than leaving it plain.
 */
const tintable = (line: string): boolean => {
    const trimmed = line.trim();
    return trimmed.length > 0 && !trimmed.startsWith('//');
};

/**
 * Which lines of each side take part in no common subsequence, and are therefore the change. Computed as a plain
 * longest-common-subsequence walk, which is exact and, at the size of a Scratch script, immediate.
 */
const changedLines = (
    before: readonly string[],
    after: readonly string[],
): { before: boolean[]; after: boolean[] } => {
    const rows = before.length;
    const columns = after.length;
    const common: number[][] = Array.from({ length: rows + 1 }, () =>
        new Array<number>(columns + 1).fill(0),
    );
    for (let row = rows - 1; row >= 0; row--) {
        for (let column = columns - 1; column >= 0; column--) {
            common[row][column] =
                before[row] === after[column]
                    ? common[row + 1][column + 1] + 1
                    : Math.max(common[row + 1][column], common[row][column + 1]);
        }
    }

    const beforeChanged = new Array<boolean>(rows).fill(true);
    const afterChanged = new Array<boolean>(columns).fill(true);
    let row = 0;
    let column = 0;
    while (row < rows && column < columns) {
        if (before[row] === after[column]) {
            beforeChanged[row] = false;
            afterChanged[column] = false;
            row++;
            column++;
        } else if (common[row + 1][column] >= common[row][column + 1]) {
            row++;
        } else {
            column++;
        }
    }
    return { before: beforeChanged, after: afterChanged };
};

const tintAll = (code: string, tint: string): string =>
    code
        .split('\n')
        .map((line) => (tintable(line) ? line + tint : line))
        .join('\n');

const tintChanged = (lines: readonly string[], changed: readonly boolean[], tint: string): string =>
    lines.map((line, index) => (changed[index] && tintable(line) ? line + tint : line)).join('\n');

/**
 * Marks up two versions of one script so that what changed between them is visible in the drawing rather than only
 * discoverable by reading both. Neither side is altered beyond the colour markers, so the blocks themselves and the
 * order they are in stay exactly as the analysis reported them.
 */
export function annotateScratchblocksDiff(
    before: string | null | undefined,
    after: string | null | undefined,
): AnnotatedScripts {
    const beforeCode = typeof before === 'string' ? before : '';
    const afterCode = typeof after === 'string' ? after : '';
    if (!beforeCode.trim())
        return { before: beforeCode, after: tintAll(afterCode, ADDED_TINT), changed: true };
    if (!afterCode.trim())
        return { before: tintAll(beforeCode, REMOVED_TINT), after: afterCode, changed: true };
    if (beforeCode === afterCode) return { before: beforeCode, after: afterCode, changed: false };

    const beforeLines = beforeCode.split('\n');
    const afterLines = afterCode.split('\n');
    if (beforeLines.length > MAX_COMPARED_LINES || afterLines.length > MAX_COMPARED_LINES)
        return { before: beforeCode, after: afterCode, changed: true };

    const changed = changedLines(beforeLines, afterLines);
    return {
        before: tintChanged(beforeLines, changed.before, REMOVED_TINT),
        after: tintChanged(afterLines, changed.after, ADDED_TINT),
        changed: true,
    };
}
