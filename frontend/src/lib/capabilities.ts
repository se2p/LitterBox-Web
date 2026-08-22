// SPDX-License-Identifier: EUPL-1.2
// SPDX-FileCopyrightText: 2026 LitterBox-Web contributors

import { useCallback, useEffect, useState } from 'react';
import {
    CAPABILITIES_SCHEMA_VERSION,
    CAPABILITIES_URL,
    SUPPORTED_LOCALES,
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
}

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
    return {
        schemaVersion: candidate.schemaVersion,
        litterboxVersion: candidate.litterboxVersion,
        supportedLocales,
        enabledFeatures,
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
    const load = useCallback((signal?: AbortSignal) => {
        setState({ status: 'loading' });
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
        load(controller.signal);
        return () => controller.abort();
    }, [load]);

    return { state, retry: () => load() };
}
