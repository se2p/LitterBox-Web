// SPDX-License-Identifier: EUPL-1.2
// SPDX-FileCopyrightText: 2025 LitterBox-Web contributors

import { useCallback, useEffect, useRef, useState } from 'react';
import {
    fetchSubmission,
    SubmissionApiError,
    type SubmissionStatusResponse,
} from '../../api/submissions';
import { isAbortError } from '../../lib/abort-error';
import {
    SUBMISSION_POLL_INTERVAL_MS,
    watchSubmissionEvents,
    type SubmissionConnectionState,
} from '../../lib/submission-events';
import type { TranslationKey } from '../../i18n/locales';
import type { StatusTone } from '../Status';

export const TERMINAL_STATUSES = new Set(['completed', 'partial', 'failed', 'cancelled']);

export type SubmissionState =
    | { status: 'loading' }
    | {
          status: 'ready';
          value: SubmissionStatusResponse;
          refreshError?: string;
          tokenInvalid?: boolean;
      }
    | { status: 'error'; message: string; tokenInvalid?: boolean };

export type SseState = SubmissionConnectionState;

export const statusTone = (status: string): StatusTone => {
    switch (status.toLowerCase()) {
        case 'queued':
            return 'queued';
        case 'processing':
        case 'running':
            return 'processing';
        case 'completed':
            return 'completed';
        case 'partial':
            return 'partial';
        case 'failed':
            return 'failed';
        case 'cancelled':
            return 'cancelled';
        default:
            return 'neutral';
    }
};

export const statusLabel = (status: string, t: (key: TranslationKey) => string): string => {
    switch (status.toLowerCase()) {
        case 'queued':
            return t('statusQueued');
        case 'processing':
        case 'running':
            return t('statusProcessing');
        case 'completed':
            return t('statusCompleted');
        case 'partial':
            return t('statusPartial');
        case 'failed':
            return t('statusFailed');
        case 'cancelled':
            return t('statusCancelled');
        default:
            return status;
    }
};

export function useSubmission(token: string, enabled = true) {
    const [state, setState] = useState<SubmissionState>({ status: 'loading' });
    const [sseState, setSseState] = useState<SseState>('connecting');
    const requestSequence = useRef(0);

    const load = useCallback(
        async (signal?: AbortSignal, initial = false) => {
            const requestId = ++requestSequence.current;
            if (initial) {
                setState({ status: 'loading' });
                setSseState('connecting');
            }
            try {
                const value = await fetchSubmission(token, signal);
                if (requestId !== requestSequence.current) return;
                setState({ status: 'ready', value });
            } catch (reason) {
                if (isAbortError(reason)) return;
                if (requestId !== requestSequence.current) return;
                const tokenInvalid =
                    reason instanceof SubmissionApiError &&
                    (reason.status === 404 || reason.status === 410);
                setState((previous) => {
                    if (!initial && previous.status === 'ready')
                        return {
                            ...previous,
                            refreshError: reason instanceof Error ? reason.message : String(reason),
                            tokenInvalid,
                        };
                    return {
                        status: 'error',
                        message: reason instanceof Error ? reason.message : String(reason),
                        tokenInvalid,
                    };
                });
            }
        },
        [token],
    );

    useEffect(() => {
        if (!enabled) {
            setState({ status: 'loading' });
            setSseState('unavailable');
            return;
        }
        const controller = new AbortController();
        setState({ status: 'loading' });
        setSseState('connecting');
        void load(controller.signal, true);
        return () => controller.abort();
    }, [enabled, load]);

    const submissionStatus = state.status === 'ready' ? state.value.status : undefined;
    const tokenInvalid = state.status !== 'loading' && state.tokenInvalid === true;
    const terminal = submissionStatus
        ? TERMINAL_STATUSES.has(submissionStatus.toLowerCase())
        : false;

    useEffect(() => {
        if (!submissionStatus || terminal || tokenInvalid) return;
        const timer = window.setInterval(() => void load(), SUBMISSION_POLL_INTERVAL_MS);
        return () => window.clearInterval(timer);
    }, [load, submissionStatus, terminal, tokenInvalid]);

    useEffect(() => {
        if (!submissionStatus || terminal || tokenInvalid) return;
        return watchSubmissionEvents(token, () => void load(), setSseState);
    }, [load, submissionStatus, terminal, token, tokenInvalid]);

    return { state, sseState, load, terminal };
}
