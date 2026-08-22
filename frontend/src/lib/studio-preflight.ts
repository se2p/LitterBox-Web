// SPDX-License-Identifier: EUPL-1.2
// SPDX-FileCopyrightText: 2026 LitterBox-Web contributors

import { useEffect, useState } from 'react';
import { fetchStudioSummary, SubmissionApiError, type StudioSummary } from '../api/submissions';

/**
 * A studio is sent whole and runs until it is done; no project can be taken back out of it. Reading what it holds
 * first turns the confirmation from a general warning into a number, and catches the two mistakes that would
 * otherwise only surface as a run that produced nothing: a studio that is not public, and one that is empty.
 */
export type StudioPreflight =
    | { readonly status: 'idle' }
    | { readonly status: 'checking' }
    | { readonly status: 'ready'; readonly summary: StudioSummary }
    | { readonly status: 'missing' }
    | { readonly status: 'unreachable' };

/** Long enough that typing a studio number is one request rather than one per digit. */
export const STUDIO_PREFLIGHT_DELAY_MS = 400;

/**
 * An answer together with the studio it is an answer about. Held that way because the answer outlives the question:
 * a teacher who corrects one digit has a new studio a keystroke later and the previous studio's title and count
 * still on screen, and a submission made in that gap would send the new studio on the old studio's word.
 */
interface StudioAnswer {
    readonly studioId: string;
    readonly preflight: StudioPreflight;
}

const IDLE: StudioPreflight = { status: 'idle' };
const CHECKING: StudioPreflight = { status: 'checking' };

export function useStudioPreflight(studioId: string | undefined): StudioPreflight {
    const [answer, setAnswer] = useState<StudioAnswer>();

    useEffect(() => {
        if (!studioId) return;
        const controller = new AbortController();
        const timer = setTimeout(() => {
            setAnswer({ studioId, preflight: { status: 'checking' } });
            fetchStudioSummary(studioId, controller.signal)
                .then((summary) => {
                    if (!controller.signal.aborted)
                        setAnswer({ studioId, preflight: { status: 'ready', summary } });
                })
                .catch((error: unknown) => {
                    if (controller.signal.aborted) return;
                    // A studio nobody can name is the teacher's typo to fix. Anything else is this service or
                    // Scratch having a bad moment, which is no reason to stand between a teacher and a submission.
                    const missing = error instanceof SubmissionApiError && error.status === 404;
                    setAnswer({
                        studioId,
                        preflight: { status: missing ? 'missing' : 'unreachable' },
                    });
                });
        }, STUDIO_PREFLIGHT_DELAY_MS);
        return () => {
            clearTimeout(timer);
            controller.abort();
        };
    }, [studioId]);

    if (!studioId) return IDLE;
    // Anything said about another studio says nothing about this one, so until this studio has been asked about, the
    // only honest state is the one that submits nothing: the request is a debounce away rather than already made.
    return answer?.studioId === studioId ? answer.preflight : CHECKING;
}

/**
 * Whether the studio may be sent. An empty or unreadable studio is refused here, because submitting it can only
 * produce a run with nothing in it; a preflight that failed to answer refuses nothing.
 */
export const studioSubmittable = (preflight: StudioPreflight): boolean => {
    switch (preflight.status) {
        case 'ready':
            return preflight.summary.readable && preflight.summary.projects !== 0;
        case 'unreachable':
            return true;
        default:
            return false;
    }
};

/**
 * How many projects the studio holds: a number when it is known, {@code null} when the studio is readable but too
 * large to measure, and {@code undefined} when nothing was learned about it at all.
 */
export const studioProjectCount = (preflight: StudioPreflight): number | null | undefined =>
    preflight.status === 'ready' && preflight.summary.readable
        ? preflight.summary.projects
        : undefined;
