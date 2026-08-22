// SPDX-License-Identifier: EUPL-1.2
// SPDX-FileCopyrightText: 2026 LitterBox-Web contributors

/**
 * A request this client gave up on, however the runtime chose to say so. Checking only for a `name` property
 * would miss nothing today but would miss it the moment a runtime raised something that is a DOMException
 * without being a plain object with a name.
 *
 * Every abort check in the application reads through this one, because a narrower check somewhere reports a
 * cancellation the reader asked for as a network failure they did not.
 */
export const isAbortError = (error: unknown): boolean =>
    (typeof DOMException !== 'undefined' &&
        error instanceof DOMException &&
        error.name === 'AbortError') ||
    (error instanceof Error && error.name === 'AbortError');
