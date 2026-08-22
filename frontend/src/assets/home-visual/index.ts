// SPDX-License-Identifier: EUPL-1.2
// SPDX-FileCopyrightText: 2026 LitterBox-Web contributors

// Written by scripts/home-visual.mjs. Run `npm run home-visual` rather than editing this.

import de from './de.svg';
import en from './en.svg';
import es from './es.svg';
import nl from './nl.svg';

import type { SupportedLocale } from '../../api/capabilities';

export interface HomeVisual {
    readonly source: string;
    readonly width: number;
    readonly height: number;
}

export const homeVisual: Record<SupportedLocale, HomeVisual> = {
    de: { source: de, width: 234, height: 131 },
    en: { source: en, width: 229, height: 131 },
    es: { source: es, width: 215, height: 131 },
    nl: { source: nl, width: 255, height: 131 },
};
