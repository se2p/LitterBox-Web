// SPDX-License-Identifier: EUPL-1.2
// SPDX-FileCopyrightText: 2025 LitterBox-Web contributors

const OPENING_WRAPPER = '[scratchblocks]';
const CLOSING_WRAPPER = '[/scratchblocks]';

/** Remove transport wrappers while preserving the Scratchblocks source itself. */
export function normalizeScratchblocksSource(source: string | null | undefined): string {
    if (typeof source !== 'string') return '';
    return source
        .replaceAll('\r\n', '\n')
        .replaceAll('\r', '\n')
        .replaceAll(OPENING_WRAPPER, '')
        .replaceAll(CLOSING_WRAPPER, '')
        .trim();
}

/**
 * LitterBox emits block opcodes in English and only the arguments in the report locale, so a renderer restricted to
 * the report locale recognises nothing and paints every block in the "obsolete" red. The core HTML export solves this
 * the same way: try the locale first, then fall back to English.
 */
export function scratchblocksLanguages(locale: string): string[] {
    const language = locale.toLowerCase().slice(0, 2);
    return language === 'en' || language === '' ? ['en'] : [language, 'en'];
}
