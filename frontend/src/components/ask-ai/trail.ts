// SPDX-License-Identifier: EUPL-1.2
// SPDX-FileCopyrightText: 2026 LitterBox-Web contributors

import type { TranslationKey } from '../../i18n/locales';
import type { QuestionIconName } from './QuestionIcon';
import {
    GOAL_ICONS,
    GOAL_LABEL_KEYS,
    placeOf,
    placeTrigger,
    placesFor,
    type AskAiGoal,
    type Catalogue,
    type CataloguePlace,
} from './goal-catalogue';

export interface ChooserPosition {
    goal?: AskAiGoal;
    place?: string | null;
}

export interface ChooserStep {
    key: string;
    label: string;
    to: ChooserPosition;
    place?: CataloguePlace;
    goal?: AskAiGoal;
}

export interface TrailLabels {
    allQuestions: string;
    goal: (goal: AskAiGoal) => string;
    place: (place: CataloguePlace) => string;
}

type Translate = (key: TranslationKey, options?: Record<string, string | number>) => string;

export const placeInWords = (place: CataloguePlace, t: Translate, locale: string): string => {
    if (place.key === null) return t('askAiPartWholeProject');
    if (place.kind === 'sprite') return place.sprite;
    const trigger = placeTrigger(place, locale);
    const number = place.number ?? 1;
    return trigger
        ? t('askAiScriptSpoken', { sprite: place.sprite, number, trigger })
        : t('askAiScriptSpokenWithoutTrigger', { sprite: place.sprite, number });
};

export const chooserLabels = (t: Translate, locale: string): TrailLabels => ({
    allQuestions: t('askAiAllQuestions'),
    goal: (goal) => t(GOAL_LABEL_KEYS[goal]),
    place: (place) => placeInWords(place, t, locale),
});

export const chooserSteps = (
    catalogue: Catalogue,
    position: ChooserPosition,
    labels: TrailLabels,
): ChooserStep[] => {
    const steps: ChooserStep[] = [{ key: 'root', label: labels.allQuestions, to: {} }];
    const goal = position.goal;
    if (goal === undefined) return steps;
    steps.push({ key: `goal:${goal}`, label: labels.goal(goal), to: { goal }, goal });
    if (position.place === undefined || placesFor(catalogue, goal).length <= 1) return steps;
    const place = placeOf(catalogue, position.place);
    if (!place) return steps;
    steps.push({
        key: `place:${place.key ?? 'project'}`,
        label: labels.place(place),
        to: { goal, place: place.key },
        place,
    });
    return steps;
};

export const stepDecoration = (
    step: ChooserStep,
): { icon?: QuestionIconName; className?: string } =>
    step.goal === undefined
        ? {}
        : {
              icon: GOAL_ICONS[step.goal],
              className: `ask-ai-trail-goal-chip ask-ai-trail-goal-${step.goal}`,
          };
