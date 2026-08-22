// SPDX-License-Identifier: EUPL-1.2
// SPDX-FileCopyrightText: 2025 LitterBox-Web contributors

/**
 * One file per language. English is the canonical set — a key exists because en.ts names it — and each other pack
 * is the subset it says differently, merged over the English so that a key nobody has translated yet still reads
 * as something rather than as its own name.
 *
 * Only English is carried by the application itself. The other three are a quarter of a megabyte of prose between
 * them, and a reader wants exactly one of them: each is fetched when it is chosen, which for the reader who never
 * changes language is never. English stays where it is because every pack is merged over it.
 */
import type { SupportedLocale } from '../../api/capabilities';
import { translationKeys, type TranslationKey, type TranslationPack } from './en';

export { translationKeys };
export type { TranslationKey, TranslationPack };

const translatedPacks: Record<
    Exclude<SupportedLocale, 'en'>,
    () => Promise<Partial<TranslationPack>>
> = {
    de: () => import('./de').then((module) => module.pack),
    es: () => import('./es').then((module) => module.pack),
    nl: () => import('./nl').then((module) => module.pack),
};

export const isSupportedLocale = (value: unknown): value is SupportedLocale =>
    value === 'en' || (typeof value === 'string' && value in translatedPacks);

/** The complete set for one language: what it says differently, over the English it does not. */
export const loadPack = async (locale: SupportedLocale): Promise<TranslationPack> => {
    if (locale === 'en') return { ...translationKeys };
    return { ...translationKeys, ...(await translatedPacks[locale]()) };
};

/**
 * Each language named in itself, never in the language of the surrounding page. Someone who cannot read the current
 * page is exactly the person using this menu, and "Niederländisch" is no help to them; "Nederlands" is. Not a
 * translation key for the same reason: there is nothing here to translate.
 */
export const localeLabels: Record<SupportedLocale, string> = {
    de: 'Deutsch',
    en: 'English',
    es: 'Español',
    nl: 'Nederlands',
};
