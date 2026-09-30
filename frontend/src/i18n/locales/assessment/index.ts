// SPDX-License-Identifier: EUPL-1.2
// SPDX-FileCopyrightText: 2026 LitterBox-Web contributors

import type { SupportedLocale } from '../../../api/capabilities';
import { type AssessmentPack } from './en';

export type { AssessmentKey, AssessmentPack } from './en';

const englishPack = () => import('./en').then((module) => module.assessmentKeys);

const translatedPacks: Record<
    Exclude<SupportedLocale, 'en'>,
    () => Promise<Partial<AssessmentPack>>
> = {
    de: () => import('./de').then((module) => module.pack),
    es: () => import('./es').then((module) => module.pack),
    nl: () => import('./nl').then((module) => module.pack),
};

export const loadAssessmentPack = async (locale: SupportedLocale): Promise<AssessmentPack> => {
    const english = await englishPack();
    if (locale === 'en') return { ...english };
    return { ...english, ...(await translatedPacks[locale]()) };
};
