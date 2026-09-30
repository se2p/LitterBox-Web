// SPDX-License-Identifier: EUPL-1.2
// SPDX-FileCopyrightText: 2026 LitterBox-Web contributors

import { vi } from 'vitest';
import type { SupportedLocale } from '../src/api/capabilities';
import type { AnalysisIssue } from '../src/api/submissions';
import { loadPack, type TranslationPack } from '../src/i18n/locales';

export const SUPPORTED_LOCALES: readonly SupportedLocale[] = ['de', 'en', 'es', 'nl'];

export const allLocalePacks = async (): Promise<Record<SupportedLocale, TranslationPack>> =>
    Object.fromEntries(
        await Promise.all(
            SUPPORTED_LOCALES.map(async (locale) => [locale, await loadPack(locale)] as const),
        ),
    ) as Record<SupportedLocale, TranslationPack>;

export const response = (body: unknown, status = 200): Response =>
    new Response(body === undefined ? null : JSON.stringify(body), {
        status,
        headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    });

export interface CapabilitiesOverrides {
    schemaVersion?: number;
    litterboxVersion?: string | null;
    supportedLocales?: readonly string[];
    assessmentLimits?: unknown;
}

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

type FetchInput = Parameters<typeof fetch>[0];
type FetchInit = Parameters<typeof fetch>[1];

export interface MockFetchRoute {
    /** Tried in the order given; the first route a request matches answers it. */
    when: (url: string, init: FetchInit) => boolean;
    respond: () => Response | Promise<Response>;
}

/**
 * The fetch mock almost every test in this file starts from: `/capabilities` answered from a feature list, a
 * handful of URL-matched routes tried in order, and a fallback for whatever none of them claimed. That plumbing
 * never varies between scenarios — only the features, the routes, and what a request outside them gets back — so
 * a call here states just the difference instead of the whole routing table.
 */
export const mockFetchRoutes = ({
    features = [],
    capabilitiesOverrides,
    routes = [],
    fallback = () => response({}, 404),
}: {
    features?: readonly string[];
    capabilitiesOverrides?: CapabilitiesOverrides;
    routes?: readonly MockFetchRoute[];
    fallback?: () => Response | Promise<Response>;
} = {}) =>
    vi.spyOn(globalThis, 'fetch').mockImplementation((input: FetchInput, init?: FetchInit) => {
        const url = String(input);
        if (url.includes('/capabilities'))
            return Promise.resolve(capabilitiesResponse(features, capabilitiesOverrides));
        const route = routes.find((candidate) => candidate.when(url, init));
        return Promise.resolve(route ? route.respond() : fallback());
    });

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
