// SPDX-License-Identifier: EUPL-1.2
// SPDX-FileCopyrightText: 2026 LitterBox-Web contributors

/**
 * The two things every page that can start an analysis needs, kept in one place so a caller's idea of what comes
 * back does not depend on which file it happens to import from.
 */
import { SUPPORTED_LOCALES, type SupportedLocale } from '../api/capabilities';
import { isNumericScratchProjectUrl } from './archive-preflight';

/**
 * A project named by link, reduced to the one spelling this service sends on. A bare number is taken as a project
 * id, because that is what a reader who copied it out of the address bar has.
 */
export const canonicalProjectUrl = (value: string): string | undefined => {
    const trimmed = value.trim();
    if (/^[1-9]\d*$/.test(trimmed)) return `https://scratch.mit.edu/projects/${trimmed}/`;
    if (!isNumericScratchProjectUrl(trimmed)) return undefined;
    const match = /^\/projects\/([1-9]\d*)\/?$/.exec(new URL(trimmed).pathname);
    return match ? `https://scratch.mit.edu/projects/${match[1]}/` : undefined;
};

/**
 * The language to analyse in, from whatever the caller has — an i18next language, a locale off a stored result,
 * or nothing at all. Anything this service does not offer is English.
 */
export const localeFrom = (value: string | null | undefined): SupportedLocale =>
    (SUPPORTED_LOCALES as readonly string[]).includes(value ?? '')
        ? (value as SupportedLocale)
        : 'en';

/**
 * A key that lets a retry of the same submission be recognised as the same submission. The scope only shows up
 * in the last-resort branch, which needs a runtime with no Web Crypto at all; it is kept so that a key from such
 * a runtime still says where it came from.
 */
export const newIdempotencyKey = (scope = 'submission'): string => {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function')
        return crypto.randomUUID();
    if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
        const bytes = new Uint8Array(16);
        crypto.getRandomValues(bytes);
        return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
    }
    return `${scope}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
};
