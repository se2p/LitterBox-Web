// SPDX-License-Identifier: EUPL-1.2
// SPDX-FileCopyrightText: 2026 LitterBox-Web contributors

import type { TFunction } from 'i18next';
import { BLOCK_CATEGORY_ORDER, CONCEPTS, type ConceptId } from '../../lib/program-concepts';

const categoryNames = {
    motion_block_count: 'motion',
    looks_block_count: 'looks',
    sound_block_count: 'sound',
    events_block_count: 'events',
    control_block_count: 'control',
    sensing_block_count: 'sensing',
    operators_block_count: 'operators',
    variables_block_count: 'variables',
    my_blocks_block_count: 'my-blocks',
    other_block_count: 'other',
} as const;

export const blockCategoryClass = (metric: string): string =>
    categoryNames[metric.toLowerCase() as keyof typeof categoryNames] ?? 'other';

/** These metrics name the same Scratch categories the task-analysis treemap shows, so the label is borrowed from
 * {@link CONCEPTS} — read off its own metric names, rather than kept as a second, driftable copy. */
const categoryConceptId = (metric: string): ConceptId | undefined =>
    BLOCK_CATEGORY_ORDER.find((id) =>
        (CONCEPTS[id].names as readonly string[]).includes(metric.toLowerCase()),
    );

export const blockCategoryLabel = (metric: string, translate: TFunction): string => {
    const conceptId = categoryConceptId(metric);
    return translate(conceptId ? CONCEPTS[conceptId].nameKey : 'statisticsBlockCategoryOther');
};
