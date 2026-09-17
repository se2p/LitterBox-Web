// SPDX-License-Identifier: EUPL-1.2
// SPDX-FileCopyrightText: 2026 LitterBox-Web contributors

import { AskAiApiError, fetchAskAiEligibility } from '../api/ask-ai';
import { useAsync } from './useAsync';

export type AskAiEligibilityState = 'unknown' | 'eligible' | 'denied' | 'unavailable';

export interface AskAiEligibilityResult {
    state: AskAiEligibilityState;
    /** Runs the one check again, for a reader who was told it failed and would like it tried once more. */
    retry: () => void;
}

/**
 * Whether this network may use Ask AI, asked once when the capability flag turns on. `denied` is the service's
 * answer; `unavailable` is the check not getting through, which is what `retry` is for.
 */
export function useAskAiEligibility(advertised: boolean): AskAiEligibilityResult {
    const { state, reload } = useAsync((signal) => fetchAskAiEligibility({ signal }), [], {
        enabled: advertised,
        toError: (error): AskAiEligibilityState =>
            error instanceof AskAiApiError && error.category === 'network_denied'
                ? 'denied'
                : 'unavailable',
    });
    switch (state.status) {
        case 'ready':
            return { state: state.value.available ? 'eligible' : 'denied', retry: reload };
        case 'error':
            return { state: state.error, retry: reload };
        default:
            return { state: 'unknown', retry: reload };
    }
}
