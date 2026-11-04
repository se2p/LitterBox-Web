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

export type ClassicCtDimensionId = keyof typeof CT_DIMENSIONS;
export type CtDimensionId = ClassicCtDimensionId | 'mathOperators' | 'motion';
export type CtRubricId = 'classic' | 'extended';
export type CtLevel = 0 | 1 | 2 | 3 | 4;

export const CT_DIMENSION_ORDER = Object.keys(CT_DIMENSIONS) as readonly ClassicCtDimensionId[];

export interface CtDimensionDefinition {
    id: CtDimensionId;
    metric: string;
    nameKey: TranslationKey;
    descriptionKey: TranslationKey;
    levelKeys: readonly TranslationKey[];
    learnUrl?: string;
}

export interface CtRubric {
    nameKey: TranslationKey;
    levelMax: 3 | 4;
    totalMax: 21 | 36;
    totalMetric: string;
    averageMetric: string;
    dimensions: readonly CtDimensionDefinition[];
}

const classicDimensions = CT_DIMENSION_ORDER.map((id) => ({
    id,
    ...CT_DIMENSIONS[id],
}));

const extendedFourthLevelKeys: Readonly<Record<ClassicCtDimensionId, TranslationKey>> = {
    flowControl: 'ctExtendedLevelFlowControl4',
    logic: 'ctExtendedLevelLogic4',
    dataRepresentation: 'ctExtendedLevelDataRepresentation4',
    synchronization: 'ctExtendedLevelSynchronization4',
    parallelism: 'ctExtendedLevelParallelism4',
    userInteractivity: 'ctExtendedLevelUserInteractivity4',
    abstraction: 'ctExtendedLevelAbstraction4',
};

const extendedDimensions: readonly CtDimensionDefinition[] = [
    ...classicDimensions.map<CtDimensionDefinition>(({ id, metric, ...dimension }) => ({
        ...dimension,
        id,
        metric: metric.replace('ct_score_', 'ct_extended_score_'),
        learnUrl: undefined,
        levelKeys:
            id === 'abstraction'
                ? [
                      CT_NOT_SHOWN_KEY,
                      'ctExtendedLevelAbstraction1',
                      'ctExtendedLevelAbstraction2',
                      'ctExtendedLevelAbstraction3',
                      'ctExtendedLevelAbstraction4',
                  ]
                : [
                      ...dimension.levelKeys.slice(0, 3),
                      id === 'userInteractivity'
                          ? 'ctExtendedLevelUserInteractivity3'
                          : dimension.levelKeys[3],
                      extendedFourthLevelKeys[id],
                  ],
    })),
    {
        id: 'mathOperators',
        metric: 'ct_extended_score_math_operators',
        nameKey: 'ctDimensionMathOperators',
        descriptionKey: 'ctDimensionMathOperatorsDescription',
        levelKeys: [
            CT_NOT_SHOWN_KEY,
            'ctExtendedLevelMathOperators1',
            'ctExtendedLevelMathOperators2',
            'ctExtendedLevelMathOperators3',
            'ctExtendedLevelMathOperators4',
        ],
    },
    {
        id: 'motion',
        metric: 'ct_extended_score_motion',
        nameKey: 'ctDimensionMotion',
        descriptionKey: 'ctDimensionMotionDescription',
        levelKeys: [
            CT_NOT_SHOWN_KEY,
            'ctExtendedLevelMotion1',
            'ctExtendedLevelMotion2',
            'ctExtendedLevelMotion3',
            'ctExtendedLevelMotion4',
        ],
    },
];

export const CT_RUBRICS: Readonly<Record<CtRubricId, CtRubric>> = {
    classic: {
        nameKey: 'ctRubricClassic',
        levelMax: 3,
        totalMax: 21,
        totalMetric: 'ct_score',
        averageMetric: 'ct_score_average',
        dimensions: classicDimensions,
    },
    extended: {
        nameKey: 'ctRubricExtended',
        levelMax: 4,
        totalMax: 36,
        totalMetric: 'ct_extended_score',
        averageMetric: 'ct_extended_score_average',
        dimensions: extendedDimensions,
    },
};

export function preferredCtRubric(metrics: unknown): CtRubricId {
    const rubric = CT_RUBRICS.extended;
    return [
        rubric.totalMetric,
        rubric.averageMetric,
        ...rubric.dimensions.map(({ metric }) => metric),
    ].some((metric) => metricValue(metrics, [metric]) !== undefined)
        ? 'extended'
        : 'classic';
}

export interface CtDimensionLevel {
    id: CtDimensionId;
    level: CtLevel | undefined;
}

const clampLevel = (value: number): CtLevel =>
    Math.max(0, Math.min(3, Math.round(value))) as CtLevel;

export function ctProfile(metrics: unknown, rubric: CtRubricId = 'classic'): CtDimensionLevel[] {
    return CT_RUBRICS[rubric].dimensions.map(({ id, metric }) => {
        const raw = metricValue(metrics, [metric]);
        const level =
            raw === undefined
                ? undefined
                : rubric === 'classic'
                  ? clampLevel(raw)
                  : Number.isInteger(raw) && raw >= 0 && raw <= 4
                    ? (raw as CtLevel)
                    : undefined;
        return { id, level };
    });
}

export interface CtTotal {
    score: number | undefined;
    max: number;
}

export function ctTotal(metrics: unknown, rubric: CtRubricId = 'classic'): CtTotal {
    const definition = CT_RUBRICS[rubric];
    const raw = metricValue(metrics, [definition.totalMetric]);
    const score =
        rubric === 'classic' || raw === undefined
            ? raw
            : Number.isInteger(raw) && raw >= 0 && raw <= definition.totalMax
              ? raw
              : undefined;
    return { score, max: definition.totalMax };
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
