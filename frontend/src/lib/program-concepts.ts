// SPDX-License-Identifier: EUPL-1.2
// SPDX-FileCopyrightText: 2026 LitterBox-Web contributors

import type { TranslationKey } from '../i18n/locales';
import { metricValue } from './overview-metrics';

export const CONCEPTS = {
    motion: { names: ['motion_block_count'], nameKey: 'programConceptMotion' },
    looks: { names: ['looks_block_count'], nameKey: 'programConceptLooks' },
    sound: { names: ['sound_block_count'], nameKey: 'programConceptSound' },
    events: { names: ['events_block_count'], nameKey: 'programConceptEvents' },
    eventTriggers: { names: ['hat_count'], nameKey: 'programConceptEventTriggers' },
    control: { names: ['control_block_count'], nameKey: 'programConceptControl' },
    sensing: { names: ['sensing_block_count'], nameKey: 'programConceptSensing' },
    operators: { names: ['operators_block_count'], nameKey: 'programConceptOperators' },
    variables: { names: ['variables_block_count'], nameKey: 'programConceptVariables' },
    lists: { names: ['list_block_count_only_direct_list'], nameKey: 'programConceptLists' },
    customBlocks: {
        names: ['my_blocks_block_count', 'procedure_count'],
        nameKey: 'programConceptCustomBlocks',
    },
    booleanLogic: { names: ['boolean_operation_count'], nameKey: 'programConceptBooleanLogic' },
    pen: { names: ['pen_block_count'], nameKey: 'programConceptPen' },
    music: { names: ['music_block_count'], nameKey: 'programConceptMusic' },
    textToSpeech: { names: ['text_to_speech_block_count'], nameKey: 'programConceptTextToSpeech' },
    translate: { names: ['translate_block_count'], nameKey: 'programConceptTranslate' },
    sequences: { names: ['sequence_count'], nameKey: 'programConceptSequences' },
    loops: { names: ['loop_count'], nameKey: 'programConceptLoops' },
    conditionals: { names: ['conditional_count'], nameKey: 'programConceptConditionals' },
    broadcasts: { names: ['broadcast_count'], nameKey: 'programConceptBroadcasts' },
    clones: { names: ['clone_count'], nameKey: 'programConceptClones' },
} as const satisfies Record<string, { names: readonly string[]; nameKey: TranslationKey }>;

export type ConceptId = keyof typeof CONCEPTS;

export const CONCEPT_ORDER = Object.keys(CONCEPTS) as readonly ConceptId[];

export const BLOCK_CATEGORY_ORDER = [
    'motion',
    'looks',
    'sound',
    'events',
    'control',
    'sensing',
    'operators',
    'variables',
    'customBlocks',
] as const satisfies readonly ConceptId[];

export const PROGRAMMING_CONCEPT_GROUPS = [
    {
        titleKey: 'programmingConceptsFoundationTitle',
        ids: ['sequences', 'eventTriggers'],
    },
    {
        titleKey: 'programmingConceptsControlTitle',
        ids: ['loops', 'conditionals', 'booleanLogic'],
    },
    {
        titleKey: 'programmingConceptsDataTitle',
        ids: ['variables', 'lists', 'customBlocks'],
    },
    {
        titleKey: 'programmingConceptsCoordinationTitle',
        ids: ['broadcasts', 'clones'],
    },
] as const satisfies readonly { titleKey: TranslationKey; ids: readonly ConceptId[] }[];

export const PROGRAMMING_CONCEPT_ORDER: readonly ConceptId[] = PROGRAMMING_CONCEPT_GROUPS.flatMap(
    ({ ids }) => [...ids],
);

export type ScratchPaletteColour =
    | 'motion'
    | 'looks'
    | 'sound'
    | 'events'
    | 'control'
    | 'sensing'
    | 'operators'
    | 'variables'
    | 'list'
    | 'custom'
    | 'extension';

export const CONCEPT_PALETTE_COLOUR = {
    motion: 'motion',
    looks: 'looks',
    sound: 'sound',
    events: 'events',
    control: 'control',
    sensing: 'sensing',
    operators: 'operators',
    variables: 'variables',
    lists: 'list',
    customBlocks: 'custom',
    pen: 'extension',
    music: 'extension',
    textToSpeech: 'extension',
    translate: 'extension',
} as const satisfies Partial<Record<ConceptId, ScratchPaletteColour>>;

export interface ConceptCoverage {
    id: ConceptId;
    count: number | undefined;
    present: boolean;
}

export function conceptCoverage(metrics: unknown): ConceptCoverage[] {
    return CONCEPT_ORDER.map((id) => {
        const count = metricValue(metrics, CONCEPTS[id].names);
        return { id, count, present: count !== undefined && count > 0 };
    });
}

export interface BlockCategoryShare {
    id: ConceptId;
    colour: ScratchPaletteColour;
    count: number | undefined;
    share: number | undefined;
}

export interface BlockCategoryShares {
    categories: BlockCategoryShare[];
    counted: number;
}

export function blockCategoryShares(metrics: unknown): BlockCategoryShares {
    const counts = BLOCK_CATEGORY_ORDER.map((id) => ({
        id,
        colour: CONCEPT_PALETTE_COLOUR[id],
        count: metricValue(metrics, CONCEPTS[id].names),
    }));
    const counted = counts.reduce((total, entry) => total + (entry.count ?? 0), 0);
    return {
        counted,
        categories: counts.map((entry) => ({
            ...entry,
            share: entry.count === undefined || counted <= 0 ? undefined : entry.count / counted,
        })),
    };
}

const CT_NOT_SHOWN_KEY: TranslationKey = 'ctLevelNotShown';

export const CT_DIMENSIONS = {
    flowControl: {
        metric: 'ct_score_flow_control',
        nameKey: 'ctDimensionFlowControl',
        descriptionKey: 'ctDimensionFlowControlDescription',
        learnUrl: 'https://www.drscratch.org/learn/Dimensions/FlowControl/',
        levelKeys: [
            CT_NOT_SHOWN_KEY,
            'ctLevelFlowControl1',
            'ctLevelFlowControl2',
            'ctLevelFlowControl3',
        ],
    },
    logic: {
        metric: 'ct_score_logic',
        nameKey: 'ctDimensionLogic',
        descriptionKey: 'ctDimensionLogicDescription',
        learnUrl: 'https://www.drscratch.org/learn/Dimensions/Logic/',
        levelKeys: [CT_NOT_SHOWN_KEY, 'ctLevelLogic1', 'ctLevelLogic2', 'ctLevelLogic3'],
    },
    dataRepresentation: {
        metric: 'ct_score_data_representation',
        nameKey: 'ctDimensionDataRepresentation',
        descriptionKey: 'ctDimensionDataRepresentationDescription',
        learnUrl: 'https://www.drscratch.org/learn/Dimensions/DataRepresentation/',
        levelKeys: [
            CT_NOT_SHOWN_KEY,
            'ctLevelDataRepresentation1',
            'ctLevelDataRepresentation2',
            'ctLevelDataRepresentation3',
        ],
    },
    abstraction: {
        metric: 'ct_score_abstraction',
        nameKey: 'ctDimensionAbstraction',
        descriptionKey: 'ctDimensionAbstractionDescription',
        learnUrl: 'https://www.drscratch.org/learn/Dimensions/Abstraction/',
        levelKeys: [
            CT_NOT_SHOWN_KEY,
            'ctLevelAbstraction1',
            'ctLevelAbstraction2',
            'ctLevelAbstraction3',
        ],
    },
    synchronization: {
        metric: 'ct_score_synchronization',
        nameKey: 'ctDimensionSynchronization',
        descriptionKey: 'ctDimensionSynchronizationDescription',
        learnUrl: 'https://www.drscratch.org/learn/Dimensions/Synchronization/',
        levelKeys: [
            CT_NOT_SHOWN_KEY,
            'ctLevelSynchronization1',
            'ctLevelSynchronization2',
            'ctLevelSynchronization3',
        ],
    },
    parallelism: {
        metric: 'ct_score_parallelization',
        nameKey: 'ctDimensionParallelism',
        descriptionKey: 'ctDimensionParallelismDescription',
        learnUrl: 'https://www.drscratch.org/learn/Dimensions/Parallelization/',
        levelKeys: [
            CT_NOT_SHOWN_KEY,
            'ctLevelParallelism1',
            'ctLevelParallelism2',
            'ctLevelParallelism3',
        ],
    },
    userInteractivity: {
        metric: 'ct_score_user_interactivity',
        nameKey: 'ctDimensionUserInteractivity',
        descriptionKey: 'ctDimensionUserInteractivityDescription',
        learnUrl: 'https://www.drscratch.org/learn/Dimensions/UserInteractivity/',
        levelKeys: [
            CT_NOT_SHOWN_KEY,
            'ctLevelUserInteractivity1',
            'ctLevelUserInteractivity2',
            'ctLevelUserInteractivity3',
        ],
    },
} as const satisfies Record<
    string,
    {
        metric: string;
        nameKey: TranslationKey;
        descriptionKey: TranslationKey;
        learnUrl: string;
        levelKeys: readonly [TranslationKey, TranslationKey, TranslationKey, TranslationKey];
    }
>;

export type CtDimensionId = keyof typeof CT_DIMENSIONS;

export const CT_DIMENSION_ORDER = Object.keys(CT_DIMENSIONS) as readonly CtDimensionId[];

export interface CtDimensionLevel {
    id: CtDimensionId;
    level: 0 | 1 | 2 | 3 | undefined;
}

const clampLevel = (value: number): 0 | 1 | 2 | 3 => {
    const rounded = Math.round(value);
    if (rounded <= 0) return 0;
    if (rounded >= 3) return 3;
    return rounded as 1 | 2;
};

export function ctProfile(metrics: unknown): CtDimensionLevel[] {
    return CT_DIMENSION_ORDER.map((id) => {
        const raw = metricValue(metrics, [CT_DIMENSIONS[id].metric]);
        return { id, level: raw === undefined ? undefined : clampLevel(raw) };
    });
}

export interface CtTotal {
    score: number | undefined;
    max: number;
}

export function ctTotal(metrics: unknown): CtTotal {
    return { score: metricValue(metrics, ['ct_score']), max: 21 };
}

export type CtTotalBand = 'narrow' | 'moderate' | 'broad';

export function ctTotalBand(score: number): CtTotalBand {
    if (score <= 7) return 'narrow';
    if (score <= 14) return 'moderate';
    return 'broad';
}

export const CT_BAND_DESCRIPTION_KEYS: Record<CtTotalBand, TranslationKey> = {
    narrow: 'ctTotalBandNarrow',
    moderate: 'ctTotalBandModerate',
    broad: 'ctTotalBandBroad',
};
