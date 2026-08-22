// SPDX-License-Identifier: EUPL-1.2
// SPDX-FileCopyrightText: 2026 LitterBox-Web contributors

import { submissionEventsUrl } from '../api/submissions';

// Both watchers fall back to polling at this rate; one constant so they cannot end up disagreeing on it.
export const SUBMISSION_POLL_INTERVAL_MS = 2500;

// Every event name a submission's stream may send for a status change. One list, so the two watchers of that
// stream cannot disagree about which events count as one.
export const SUBMISSION_EVENT_NAMES = [
    'queued',
    'running',
    'processing',
    'completed',
    'partial',
    'failed',
    'cancelled',
    'done',
] as const;

export type SubmissionConnectionState = 'connected' | 'disconnected' | 'unavailable' | 'connecting';

/**
 * Opens a submission's event stream and calls `onChange` for anything that may mean its status moved: the stream
 * opening, an unnamed message, or any of the named lifecycle events. Callers are left to decide what "re-read it"
 * means; this only decides when to say so. Returns a function that closes the stream, safe to call more than once
 * and safe to call even when no stream was ever opened.
 */
export const watchSubmissionEvents = (
    token: string,
    onChange: () => void,
    onConnectionState?: (state: SubmissionConnectionState) => void,
): (() => void) => {
    if (typeof EventSource === 'undefined') {
        onConnectionState?.('unavailable');
        return () => undefined;
    }
    try {
        const source = new EventSource(submissionEventsUrl(token));
        source.onopen = () => {
            onConnectionState?.('connected');
            onChange();
        };
        source.onmessage = onChange;
        SUBMISSION_EVENT_NAMES.forEach((eventName) => source.addEventListener(eventName, onChange));
        source.onerror = () => onConnectionState?.('disconnected');
        return () => source.close();
    } catch {
        // A browser that fails to open the stream at all is treated the same as one without EventSource: the
        // caller keeps polling and is never told about a connection it never had.
        onConnectionState?.('unavailable');
        return () => undefined;
    }
};
