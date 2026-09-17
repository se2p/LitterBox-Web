// SPDX-License-Identifier: EUPL-1.2
// SPDX-FileCopyrightText: 2026 LitterBox-Web contributors

import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
    commonQuestionSelector,
    type AskAiFindingFamily,
    type AskAiGeneralIntent,
    type AskAiQuestions,
} from '../../api/ask-ai';
import type { TranslationKey } from '../../i18n/locales';
import type { ConversationScope } from '../../pages/ask-ai-machine';
import { richHintLead } from '../single-project/rich-hint';
import { spriteDisplayName } from '../single-project/sprite-name';
import { inquiryTheme, type InquiryTheme } from './inquiry-theme';
import type { QuestionIconName } from './QuestionIcon';
import { buildProjectTree, type ProjectTree, type TargetNode } from './project-targets';

export const ASK_AI_GOALS = ['understand', 'problems', 'add', 'improve', 'unsure'] as const;
export type AskAiGoal = (typeof ASK_AI_GOALS)[number];

export type QuestionGoal = Exclude<AskAiGoal, 'unsure'>;

export const ASK_AI_GOAL_CARDS: QuestionGoal[] = ['understand', 'problems', 'add', 'improve'];

export const GOAL_LABEL_KEYS: Record<AskAiGoal, TranslationKey> = {
    understand: 'askAiGoalUnderstand',
    problems: 'askAiGoalProblems',
    add: 'askAiGoalAdd',
    improve: 'askAiGoalImprove',
    unsure: 'askAiGoalUnsure',
};

export const GOAL_LEAD_KEYS: Record<QuestionGoal, TranslationKey> = {
    understand: 'askAiGoalUnderstandLead',
    problems: 'askAiGoalProblemsLead',
    add: 'askAiGoalAddLead',
    improve: 'askAiGoalImproveLead',
};

export const GOAL_ICONS: Record<AskAiGoal, QuestionIconName> = {
    understand: 'lightbulb',
    problems: 'magnifier',
    add: 'add-block',
    improve: 'sparkle',
    unsure: 'other',
};

const GOAL_OF_INTENT: Record<AskAiGeneralIntent, QuestionGoal[]> = {
    SUMMARISE: ['understand'],
    EXPLAIN: ['understand'],
    SUGGEST_EXTENSION: ['add'],
    PROVIDE_FEEDBACK: ['improve'],
};

type PlaceKind = 'program' | 'sprite' | 'script';

const INTENT_LABELS: Record<PlaceKind, Partial<Record<AskAiGeneralIntent, TranslationKey>>> = {
    program: {
        SUMMARISE: 'askAiGeneralSummarise',
        EXPLAIN: 'askAiGeneralExplain',
        SUGGEST_EXTENSION: 'askAiGeneralSuggestExtension',
        PROVIDE_FEEDBACK: 'askAiGeneralProvideFeedback',
    },
    sprite: {
        SUMMARISE: 'askAiSpriteSummarise',
        EXPLAIN: 'askAiSpriteExplain',
        SUGGEST_EXTENSION: 'askAiSpriteSuggestExtension',
        PROVIDE_FEEDBACK: 'askAiSpriteProvideFeedback',
    },
    script: {
        EXPLAIN: 'askAiScriptExplain',
        PROVIDE_FEEDBACK: 'askAiScriptProvideFeedback',
    },
};

export const INTENT_ICONS: Record<AskAiGeneralIntent, QuestionIconName> = {
    SUMMARISE: 'stage',
    EXPLAIN: 'lightbulb',
    SUGGEST_EXTENSION: 'add-block',
    PROVIDE_FEEDBACK: 'sparkle',
};

const GOAL_OF_FAMILY: Record<AskAiFindingFamily, QuestionGoal[]> = {
    bug: ['problems'],
    smell: ['problems'],
    perfume: ['improve'],
    other: ['problems'],
};

const GOAL_OF_INQUIRY_KIND: Readonly<Record<string, QuestionGoal[]>> = {
    'score-idea': ['add'],
    'smooth-motion': ['improve'],
};

const EXPLAINS: QuestionGoal[] = ['understand'];

// Unmapped inquiry kinds default to understanding.
const goalsOfInquiry = (kind: string): QuestionGoal[] => GOAL_OF_INQUIRY_KIND[kind] ?? EXPLAINS;

const CONNECTION_THEMES: InquiryTheme[] = ['messages', 'sensing', 'moving'];

export interface CataloguePlace {
    key: string | null;
    kind: PlaceKind;
    node: TargetNode | undefined;
    sprite: string;
    number?: number;
    code?: TargetNode;
}

export interface CatalogueQuestion {
    goals: QuestionGoal[];
    place: string | null;
    scope: ConversationScope;
    text: string;
    rich: boolean;
    source: 'general' | 'inquiry' | 'finding';
    intent?: AskAiGeneralIntent;
    theme?: InquiryTheme;
    family?: AskAiFindingFamily;
    code?: string;
}

export interface Catalogue {
    questions: CatalogueQuestion[];
    places: CataloguePlace[];
    /** True when the service returned only a selection of the available questions. */
    truncated: boolean;
    /** True when some scripts are shown without their code; they can still be asked about. */
    previewsTruncated: boolean;
}

const UNSURE_QUESTIONS = 5;

export interface CatalogueNaming {
    general: (key: TranslationKey, sprite: string) => string;
    stageName: string;
}

export const buildCatalogue = (
    tree: ProjectTree,
    questions: AskAiQuestions,
    naming: CatalogueNaming,
): Catalogue => {
    const places: CataloguePlace[] = [];
    const catalogued: CatalogueQuestion[] = [];

    const addGeneral = (place: CataloguePlace, intents: AskAiGeneralIntent[]) => {
        for (const intent of intents) {
            const key = INTENT_LABELS[place.kind][intent];
            if (!key) continue;
            const label = naming.general(key, place.sprite);
            catalogued.push({
                goals: GOAL_OF_INTENT[intent],
                place: place.key,
                scope: {
                    kind: 'common',
                    selector: commonQuestionSelector(intent, place.key ?? undefined),
                    label,
                },
                text: label,
                rich: false,
                source: 'general',
                intent,
            });
        }
    };

    const addFound = (node: TargetNode, place: CataloguePlace) => {
        for (const inquiry of node.inquiries) {
            catalogued.push({
                goals: goalsOfInquiry(inquiry.kind),
                place: place.key,
                // The opaque selector does not identify the inquiry kind needed by follow-up policy.
                scope: {
                    kind: 'inquiry',
                    selector: inquiry.selector,
                    label: inquiry.label,
                    inquiryKind: inquiry.kind,
                },
                text: inquiry.label,
                rich: true,
                source: 'inquiry',
                theme: inquiryTheme(inquiry.kind),
            });
        }
        for (const finding of node.findings) {
            catalogued.push({
                goals: GOAL_OF_FAMILY[finding.family],
                place: place.key,
                scope: { kind: 'finding', selector: finding.selector, label: finding.label },
                text: richHintLead(finding.label),
                rich: true,
                source: 'finding',
                family: finding.family,
                code: finding.scratchblocks,
            });
        }
    };

    if (tree.program) {
        const whole: CataloguePlace = {
            key: null,
            kind: 'program',
            node: tree.program,
            sprite: '',
        };
        places.push(whole);
        addGeneral(whole, tree.program.target.intents);
        addFound(tree.program, whole);
    }
    for (const actor of tree.actors) {
        const sprite = spriteDisplayName(actor.target.label, naming.stageName);
        // Keep a sole script on the sprite place instead of adding a one-choice screen.
        const sole = actor.scripts.length === 1 ? actor.scripts[0] : undefined;
        const place: CataloguePlace = {
            key: actor.target.key,
            kind: 'sprite',
            node: actor,
            sprite,
            code: sole,
        };
        places.push(place);
        addGeneral(place, actor.target.intents);
        addFound(actor, place);
        if (sole) {
            addFound(sole, place);
            continue;
        }
        actor.scripts.forEach((script, index) => {
            const scriptPlace: CataloguePlace = {
                key: script.target.key,
                kind: 'script',
                node: script,
                sprite,
                number: index + 1,
            };
            places.push(scriptPlace);
            addGeneral(scriptPlace, script.target.intents);
            addFound(script, scriptPlace);
        });
    }

    return {
        questions: catalogued,
        places,
        truncated: questions.truncated,
        previewsTruncated: questions.previewsTruncated,
    };
};

/** Deterministic sample prioritizing parts, a problem, a connection, positive feedback, and ideas. */
export const unsureShortlist = (catalogue: Catalogue): CatalogueQuestion[] => {
    const chosen: CatalogueQuestion[] = [];
    const take = (wanted: (question: CatalogueQuestion) => boolean): boolean => {
        const found = catalogue.questions.find(
            (question) => !chosen.includes(question) && wanted(question),
        );
        if (!found) return false;
        chosen.push(found);
        return true;
    };
    const somewhereNew = (question: CatalogueQuestion) =>
        !chosen.some((already) => already.place === question.place);
    const connects = (question: CatalogueQuestion) =>
        question.theme !== undefined && CONNECTION_THEMES.includes(question.theme);
    const somethingElse = (question: CatalogueQuestion) =>
        !chosen.some((already) => already.theme === question.theme);

    const takeBest = (...wanted: ((question: CatalogueQuestion) => boolean)[]) => {
        for (const predicate of wanted) if (take(predicate)) return;
    };

    takeBest(
        (question) => question.source === 'inquiry' && question.place !== null,
        (question) => question.place !== null,
    );
    take((question) => question.family === 'bug');
    takeBest(
        (question) => connects(question) && somewhereNew(question) && somethingElse(question),
        (question) => connects(question) && somethingElse(question),
        (question) =>
            question.source === 'inquiry' &&
            question.place !== null &&
            somewhereNew(question) &&
            somethingElse(question),
        (question) =>
            question.source === 'inquiry' && somewhereNew(question) && somethingElse(question),
    );
    takeBest(
        (question) => question.source === 'finding' && question.goals.includes('improve'),
        (question) => question.intent === 'PROVIDE_FEEDBACK',
    );
    take((question) => question.intent === 'SUGGEST_EXTENSION');
    while (chosen.length < UNSURE_QUESTIONS) {
        if (!take((question) => question.place !== null) && !take(() => true)) break;
    }
    return chosen.slice(0, UNSURE_QUESTIONS);
};

export const questionsFor = (
    catalogue: Catalogue,
    goal: AskAiGoal,
    place?: string | null,
): CatalogueQuestion[] =>
    goal === 'unsure'
        ? unsureShortlist(catalogue)
        : catalogue.questions.filter(
              (question) =>
                  question.goals.includes(goal) &&
                  (place === undefined || question.place === place),
          );

export const placesFor = (catalogue: Catalogue, goal: AskAiGoal): CataloguePlace[] => {
    if (goal === 'unsure') return catalogue.places.filter((place) => place.key === null);
    const asked = new Set(
        catalogue.questions
            .filter((question) => question.goals.includes(goal))
            .map((question) => question.place),
    );
    return catalogue.places.filter((place) => asked.has(place.key));
};

export const placeOf = (catalogue: Catalogue, key: string | null): CataloguePlace | undefined =>
    catalogue.places.find((place) => place.key === key);

export const goalWorthOffering = (catalogue: Catalogue, goal: AskAiGoal): boolean =>
    questionsFor(catalogue, goal).length > 0 ||
    (goal === 'problems' && catalogue.places.length > 0);

export const goalsOffered = (catalogue: Catalogue): AskAiGoal[] =>
    ASK_AI_GOALS.filter((goal) => goalWorthOffering(catalogue, goal));

export const useCatalogue = (questions: AskAiQuestions | undefined): Catalogue => {
    const { t } = useTranslation();
    return useMemo(
        () =>
            questions
                ? buildCatalogue(buildProjectTree(questions), questions, {
                      general: (key, sprite) => t(key, { sprite }),
                      stageName: t('stageName'),
                  })
                : { questions: [], places: [], truncated: false, previewsTruncated: false },
        [questions, t],
    );
};
