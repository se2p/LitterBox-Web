// SPDX-License-Identifier: EUPL-1.2
// SPDX-FileCopyrightText: 2026 LitterBox-Web contributors

import type { TFunction } from 'i18next';

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

export const blockCategoryLabel = (metric: string, translate: TFunction): string => {
    const labels = {
        motion_block_count: 'statisticsBlockCategoryMotion',
        looks_block_count: 'statisticsBlockCategoryLooks',
        sound_block_count: 'statisticsBlockCategorySound',
        events_block_count: 'statisticsBlockCategoryEvents',
        control_block_count: 'statisticsBlockCategoryControl',
        sensing_block_count: 'statisticsBlockCategorySensing',
        operators_block_count: 'statisticsBlockCategoryOperators',
        variables_block_count: 'statisticsBlockCategoryVariables',
        my_blocks_block_count: 'statisticsBlockCategoryMyBlocks',
        other_block_count: 'statisticsBlockCategoryOther',
    } as const;
    return translate(
        labels[metric.toLowerCase() as keyof typeof labels] ?? 'statisticsBlockCategoryOther',
    );
};
