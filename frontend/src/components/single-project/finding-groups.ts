// SPDX-License-Identifier: EUPL-1.2
// SPDX-FileCopyrightText: 2026 LitterBox-Web contributors

import type { AnalysisIssue } from '../../api/submissions';

export interface FindingGroup {
    /** Stable within one analysis, and used as the React key and the id the disclosure is labelled by. */
    key: string;
    /** Empty when the finding carried no finder id, in which case the group holds that one occurrence. */
    finderId: string;
    finderName: string;
    type: string;
    occurrences: AnalysisIssue[];
    /** Distinct sprite names among the occurrences, in the order they first appear. */
    sprites: string[];
}

/**
 * How many sprites a heading names, and how many it is left counting.
 *
 * A finder that turned up in two sprites should say which two. A finder that turned up in fifteen should not push
 * its own count off the line to say so.
 */
export const namedSprites = (
    sprites: readonly string[],
    limit: number,
): { named: string[]; remaining: number } => ({
    named: sprites.slice(0, Math.max(limit, 0)),
    remaining: Math.max(sprites.length - Math.max(limit, 0), 0),
});

/**
 * The occurrences of one finder, gathered.
 *
 * A single missing initialisation reported against twelve variables is twelve findings with the same name, the same
 * explanation and the same suggested fix, one after another. Read as twelve cards it looks like twelve problems; read
 * as one group of twelve it is the one thing it actually is, and the count is the useful part.
 *
 * Nothing is hidden: every occurrence keeps its own evidence, its own sprite and its own feedback control inside the
 * group it belongs to.
 *
 * A finding without a finder id is kept on its own. Two of them could only be grouped by their displayed name, and a
 * name is a translation — merging on it would claim two findings came from one finder on the strength of the current
 * language.
 */
export const groupFindings = (issues: readonly AnalysisIssue[]): FindingGroup[] => {
    const groups = new Map<string, FindingGroup>();
    issues.forEach((issue) => {
        const finderId = issue.finderId?.trim() ?? '';
        const key = finderId ? `finder:${finderId}` : `issue:${issue.id}`;
        const group = groups.get(key);
        if (group === undefined) {
            groups.set(key, {
                key,
                finderId,
                finderName: issue.finderName ?? '',
                type: issue.type ?? '',
                occurrences: [issue],
                sprites: issue.sprite?.trim() ? [issue.sprite] : [],
            });
            return;
        }
        group.occurrences.push(issue);
        const sprite = issue.sprite?.trim() ? issue.sprite : undefined;
        if (sprite !== undefined && !group.sprites.includes(sprite)) group.sprites.push(sprite);
    });
    // Insertion order, so the groups follow whichever order the occurrences were handed over in: the analyser's own
    // when nothing is sorted, and the reader's sort when one is chosen.
    return Array.from(groups.values());
};
