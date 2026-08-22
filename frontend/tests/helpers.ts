// SPDX-License-Identifier: EUPL-1.2
// SPDX-FileCopyrightText: 2026 LitterBox-Web contributors

/**
 * What every test needs before it can say anything of its own: a service that answers, and a finding to put in
 * front of the reader. One copy of each, so a change to the shape of a response is one edit rather than one per
 * test file, and so no file quietly disagrees with another about fields it is making no point about.
 *
 * Nothing here draws anything, so a test about a pure function does not pull the whole application in behind it.
 * Mounting the application lives next door, in render.tsx.
 */

import type { SupportedLocale } from '../src/api/capabilities';
import type { AnalysisIssue } from '../src/api/submissions';
import { loadPack, type TranslationPack } from '../src/i18n/locales';

export const SUPPORTED_LOCALES: readonly SupportedLocale[] = ['de', 'en', 'es', 'nl'];

/**
 * Every language at once, which is what a test about the copy is asking about. The application fetches one pack at
 * a time; a test that reads all four says so by awaiting them.
 */
export const allLocalePacks = async (): Promise<Record<SupportedLocale, TranslationPack>> =>
    Object.fromEntries(
        await Promise.all(
            SUPPORTED_LOCALES.map(async (locale) => [locale, await loadPack(locale)] as const),
        ),
    ) as Record<SupportedLocale, TranslationPack>;

/** A JSON reply, or a bodiless one where the body is left out; the service answers in nothing else. */
export const response = (body: unknown, status = 200): Response =>
    new Response(body === undefined ? null : JSON.stringify(body), {
        status,
        headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    });

export interface CapabilitiesOverrides {
    schemaVersion?: number;
    litterboxVersion?: string | null;
    supportedLocales?: readonly string[];
}

/**
 * What the service says it offers. Only the feature list is ever the point of a test, so that is the argument;
 * everything else is the same everywhere and is named here once.
 */
export const capabilitiesResponse = (
    enabledFeatures: readonly string[] = [],
    overrides: CapabilitiesOverrides = {},
): Response =>
    response({
        schemaVersion: 1,
        litterboxVersion: 'synthetic-capabilities',
        supportedLocales: ['de', 'en', 'es', 'nl'],
        ...overrides,
        enabledFeatures: [...enabledFeatures],
    });

/**
 * One finding, complete. A test names only the fields it is making a point about; the other seventeen exist
 * because the response carries them, not because any test cares what is in them.
 */
export const issue = (overrides: Partial<AnalysisIssue> & { id: number }): AnalysisIssue =>
    ({
        finderId: 'uninitialised-variable',
        finderName: 'Variable never set',
        type: 'bug',
        hint: '',
        sprite: '',
        blockId: null,
        costume: null,
        scratchblocks: '',
        duplicates: [],
        subsumedBy: [],
        coupledWith: [],
        severity: 1,
        costumes: [],
        currentCostume: 0,
        refactoringScratchblocks: null,
        similarTo: [],
        thumbnailRef: null,
        ...overrides,
    }) as AnalysisIssue;
