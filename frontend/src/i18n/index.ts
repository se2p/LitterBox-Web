// SPDX-License-Identifier: EUPL-1.2
// SPDX-FileCopyrightText: 2025 LitterBox-Web contributors
import i18n, { type BackendModule, type ReadCallback } from 'i18next';
import { initReactI18next } from 'react-i18next';
import { isSupportedLocale, loadPack, translationKeys, type TranslationPack } from './locales';
import type { SupportedLocale } from '../api/capabilities';

export { localeLabels } from './locales';

export type Locale = SupportedLocale;

const LOCALE_STORAGE_KEY = 'litterbox.locale';

const isLocale = (value: string | null): value is Locale => isSupportedLocale(value);

const storedLocale = (): Locale => {
    if (typeof window === 'undefined') return 'en';
    try {
        const value = window.localStorage.getItem(LOCALE_STORAGE_KEY);
        return isLocale(value) ? value : 'en';
    } catch {
        return 'en';
    }
};

/**
 * Where a language comes from when it is asked for. Fetching it is what makes `changeLanguage` a promise, so
 * everything that already awaited that keeps working, and nothing renders in a language half-arrived.
 */
const packs: BackendModule = {
    type: 'backend',
    init: () => undefined,
    read: (language: string, _namespace: string, callback: ReadCallback) => {
        if (!isLocale(language)) {
            callback(null, {});
            return;
        }
        void loadPack(language).then(
            (pack) => callback(null, pack),
            (error: unknown) => callback(error as Error, false),
        );
    },
};

/**
 * Resolves once the reader's own language is in hand. The application waits for it rather than drawing itself in
 * English and correcting itself a moment later.
 */
export const localeReady = i18n
    .use(packs)
    .use(initReactI18next)
    .init({
        // English is carried by the application, so it is never fetched and never absent.
        resources: { en: { translation: translationKeys } },
        partialBundledLanguages: true,
        lng: storedLocale(),
        fallbackLng: 'en',
        interpolation: { escapeValue: false },
        returnNull: false,
    });

i18n.on('languageChanged', (language) => {
    if (!isLocale(language) || typeof window === 'undefined') return;
    try {
        window.localStorage.setItem(LOCALE_STORAGE_KEY, language);
    } catch {
        // Locale persistence is a convenience and must not block navigation.
    }
});

export const setLocale = (locale: Locale): Promise<unknown> => i18n.changeLanguage(locale);
const getLocale = (): Locale => (isLocale(i18n.language) ? i18n.language : 'en');

export const formatNumber = (value: number, locale = getLocale()): string =>
    new Intl.NumberFormat(locale).format(value);

const RELATIVE_UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
    ['year', 365 * 24 * 60 * 60 * 1000],
    ['month', 30 * 24 * 60 * 60 * 1000],
    ['day', 24 * 60 * 60 * 1000],
    ['hour', 60 * 60 * 1000],
    ['minute', 60 * 1000],
];

/**
 * "5 minutes ago", in the reader's language, without a translation key per unit. Anything under a minute is "just
 * now" rather than a count of seconds, which would be stale the moment it was drawn.
 */
export const formatRelativeTime = (
    value: number,
    locale = getLocale(),
    now = Date.now(),
): string => {
    if (!Number.isFinite(value)) return '—';
    const format = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
    const elapsed = value - now;
    for (const [unit, span] of RELATIVE_UNITS) {
        if (Math.abs(elapsed) >= span) return format.format(Math.round(elapsed / span), unit);
    }
    return format.format(0, 'second');
};

export const formatDateTime = (value: Date | string | number, locale = getLocale()): string => {
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return '—';
    return new Intl.DateTimeFormat(locale, {
        dateStyle: 'medium',
        timeStyle: 'short',
    }).format(date);
};

declare module 'i18next' {
    interface CustomTypeOptions {
        defaultNS: 'translation';
        resources: { translation: TranslationPack };
    }
}

export default i18n;
