// SPDX-License-Identifier: EUPL-1.2
// SPDX-FileCopyrightText: 2026 LitterBox-Web contributors

/** Group service inquiry kinds under child-facing themes. */
export const INQUIRY_THEMES = [
    'starting',
    'scripts',
    'repeating',
    'messages',
    'sensing',
    'moving',
    'speaking',
    'sound',
    'ideas',
    'polishing',
    'other',
] as const;

export type InquiryTheme = (typeof INQUIRY_THEMES)[number];

const THEME_OF_KIND: Readonly<Record<string, InquiryTheme>> = {
    usage: 'starting',
    event: 'starting',
    concurrency: 'starting',
    'procedure-usage': 'scripts',
    timing: 'scripts',
    randomness: 'scripts',
    loop: 'repeating',
    condition: 'repeating',
    'message-flow': 'messages',
    'backdrop-flow': 'messages',
    'clone-flow': 'messages',
    sensing: 'sensing',
    'data-flow': 'sensing',
    motion: 'moving',
    appearance: 'moving',
    'initial-state': 'moving',
    'backdrop-looks': 'moving',
    speech: 'speaking',
    sound: 'sound',
    startup: 'starting',
    stopping: 'starting',
    'score-idea': 'ideas',
    'smooth-motion': 'polishing',
};

export const inquiryTheme = (kind: string): InquiryTheme => THEME_OF_KIND[kind] ?? 'other';
