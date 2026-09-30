// SPDX-License-Identifier: EUPL-1.2
// SPDX-FileCopyrightText: 2026 LitterBox-Web contributors

import { useCallback, useEffect, useState } from 'react';
import {
    CAPABILITIES_SCHEMA_VERSION,
    CAPABILITIES_URL,
    DEFAULT_ASSESSMENT_LIMITS,
    SUPPORTED_LOCALES,
    type AssessmentLimits,
    type Capabilities,
    type SupportedLocale,
} from '../api/capabilities';
import { isAbortError } from './abort-error';

export type CapabilityState =
    | { status: 'idle' }
    | { status: 'loading' }
    | { status: 'ready'; value: Capabilities }
    | { status: 'incompatible'; serverLocales: string[] }
    | { status: 'error'; message: string };

interface CapabilityPayload {
    schemaVersion: number;
    litterboxVersion: string;
    supportedLocales: string[];
    enabledFeatures: string[];
    assessmentLimits?: AssessmentLimits;
}

/**
 * The limits a quiz is measured against, where the service reports them at all. Each limit is taken independently,
 * falling back to this client's own default when absent; present but not a positive whole number is refused as
 * malformed rather than guessed at.
 */
const assessmentLimits = (value: unknown): AssessmentLimits | undefined => {
    if (value === undefined || value === null) return undefined;
    if (typeof value !== 'object')
        throw new Error('Capabilities response did not match the API contract');
    const candidate = value as Record<string, unknown>;
    const reported = Object.keys(DEFAULT_ASSESSMENT_LIMITS)
        .map((name) => [name, candidate[name]] as const)
        .filter(([, limit]) => limit !== undefined && limit !== null);
    if (
        !reported.every(
            ([, limit]) => typeof limit === 'number' && Number.isSafeInteger(limit) && limit > 0,
        )
    )
        throw new Error('Capabilities response did not match the API contract');
    return { ...DEFAULT_ASSESSMENT_LIMITS, ...Object.fromEntries(reported) };
};

const sameLocaleSet = (left: readonly string[], right: readonly string[]): boolean =>
    new Set(left).size === new Set(right).size &&
    new Set(left).size === left.length &&
    left.every((locale) => right.includes(locale));

const capabilityPayload = (value: unknown): CapabilityPayload => {
    if (!value || typeof value !== 'object') throw new Error('Invalid capabilities response');
    const candidate = value as Record<string, unknown>;
    const supportedLocales = candidate.supportedLocales;
    const enabledFeatures = candidate.enabledFeatures;
    if (
        candidate.schemaVersion !== CAPABILITIES_SCHEMA_VERSION ||
        typeof candidate.litterboxVersion !== 'string' ||
        !Array.isArray(supportedLocales) ||
        !supportedLocales.every((locale) => typeof locale === 'string') ||
        !Array.isArray(enabledFeatures) ||
        !enabledFeatures.every((feature) => typeof feature === 'string')
    )
        throw new Error('Capabilities response did not match the API contract');
    const limits = assessmentLimits(candidate.assessmentLimits);
    return {
        schemaVersion: candidate.schemaVersion,
        litterboxVersion: candidate.litterboxVersion,
        supportedLocales,
        enabledFeatures,
        ...(limits === undefined ? {} : { assessmentLimits: limits }),
    };
};

const loadCapabilities = async (signal?: AbortSignal): Promise<CapabilityState> => {
    const response = await fetch(CAPABILITIES_URL, {
        headers: { Accept: 'application/json' },
        signal,
    });
    if (!response.ok) throw new Error(`Capabilities request failed (${response.status})`);
    const payload = capabilityPayload(await response.json());
    if (!sameLocaleSet(payload.supportedLocales, SUPPORTED_LOCALES))
        return { status: 'incompatible', serverLocales: payload.supportedLocales };
    return {
        status: 'ready',
        value: {
            ...payload,
            supportedLocales: payload.supportedLocales as SupportedLocale[],
        },
    };
};

export function useCapabilities() {
    const [state, setState] = useState<CapabilityState>({ status: 'loading' });
    /** Only the request: the state it starts from is the one the hook already holds on the first attempt. */
    const request = useCallback((signal?: AbortSignal) => {
        void loadCapabilities(signal)
            .then(setState)
            .catch((error: unknown) => {
                if (isAbortError(error)) return;
                setState({
                    status: 'error',
                    message: error instanceof Error ? error.message : String(error),
                });
            });
    }, []);

    useEffect(() => {
        const controller = new AbortController();
        request(controller.signal);
        return () => controller.abort();
    }, [request]);

    return {
        state,
        retry: () => {
            setState({ status: 'loading' });
            request();
        },
    };
}
