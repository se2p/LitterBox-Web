// SPDX-License-Identifier: EUPL-1.2
// SPDX-FileCopyrightText: 2026 LitterBox-Web contributors

import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
    ASK_AI_ELIGIBILITY_URL,
    AskAiApiError,
    fetchAskAiEligibility,
    isAskAiCancellation,
} from '../src/api/ask-ai';
import { useAskAiEligibility } from '../src/lib/ask-ai-eligibility';

const jsonResponse = (body: unknown, status = 200, contentType = 'application/json') =>
    new Response(JSON.stringify(body), {
        status,
        headers: { 'Content-Type': contentType },
    });

describe('ask-ai eligibility API wrapper', () => {
    afterEach(() => vi.restoreAllMocks());

    it('reads the exact deployment-relative GET contract', async () => {
        const fetchMock = vi
            .spyOn(globalThis, 'fetch')
            .mockResolvedValue(jsonResponse({ schemaVersion: 1, available: true }));
        const signal = new AbortController().signal;
        await expect(fetchAskAiEligibility({ signal })).resolves.toEqual({
            schemaVersion: 1,
            available: true,
        });
        expect(fetchMock).toHaveBeenCalledWith(ASK_AI_ELIGIBILITY_URL, {
            headers: { Accept: 'application/json' },
            signal,
        });
    });

    it('accepts available: false as a valid, well-formed answer', async () => {
        vi.spyOn(globalThis, 'fetch').mockResolvedValue(
            jsonResponse({ schemaVersion: 1, available: false }),
        );
        await expect(fetchAskAiEligibility()).resolves.toEqual({
            schemaVersion: 1,
            available: false,
        });
    });

    it('rejects a wrong schema version', async () => {
        vi.spyOn(globalThis, 'fetch').mockResolvedValue(
            jsonResponse({ schemaVersion: 2, available: true }),
        );
        await expect(fetchAskAiEligibility()).rejects.toMatchObject({
            category: 'malformed_response',
        });
    });

    it('rejects a response missing a documented key', async () => {
        vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse({ schemaVersion: 1 }));
        await expect(fetchAskAiEligibility()).rejects.toMatchObject({
            category: 'malformed_response',
        });
    });

    it('rejects a response carrying an extra, undocumented key', async () => {
        vi.spyOn(globalThis, 'fetch').mockResolvedValue(
            jsonResponse({ schemaVersion: 1, available: true, extra: 'field' }),
        );
        await expect(fetchAskAiEligibility()).rejects.toMatchObject({
            category: 'malformed_response',
        });
    });

    it('rejects a non-JSON content type on an otherwise-ok response', async () => {
        vi.spyOn(globalThis, 'fetch').mockResolvedValue(
            jsonResponse({ schemaVersion: 1, available: true }, 200, 'text/html'),
        );
        await expect(fetchAskAiEligibility()).rejects.toMatchObject({
            category: 'malformed_response',
        });
    });

    it('maps a gateway 403 to network_denied without exposing its body', async () => {
        vi.spyOn(globalThis, 'fetch').mockResolvedValue(
            jsonResponse(
                { detail: 'must not escape to the caller' },
                403,
                'application/problem+json',
            ),
        );
        let error: unknown;
        try {
            await fetchAskAiEligibility();
        } catch (reason) {
            error = reason;
        }
        expect(error).toBeInstanceOf(AskAiApiError);
        if (!(error instanceof AskAiApiError)) throw new Error('Expected AskAiApiError');
        expect(error.category).toBe('network_denied');
        expect(error.status).toBe(403);
        expect(error.message).not.toContain('escape');
    });

    it('maps an unrecognised problem code by status, and a 503 with no code to unavailable', async () => {
        vi.spyOn(globalThis, 'fetch').mockResolvedValue(
            jsonResponse({ code: 'something_else' }, 400, 'application/problem+json'),
        );
        await expect(fetchAskAiEligibility()).rejects.toMatchObject({ category: 'failed' });

        vi.restoreAllMocks();
        vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: 503 }));
        await expect(fetchAskAiEligibility()).rejects.toMatchObject({
            category: 'unavailable',
            status: 503,
        });
    });

    it('maps an aborted request to canceled', async () => {
        vi.spyOn(globalThis, 'fetch').mockRejectedValue(
            new DOMException('secret token', 'AbortError'),
        );
        await expect(fetchAskAiEligibility()).rejects.toMatchObject({ category: 'canceled' });
    });

    it('maps a network failure to failed without exposing details', async () => {
        vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('secret network content'));
        let error: unknown;
        try {
            await fetchAskAiEligibility();
        } catch (reason) {
            error = reason;
        }
        expect(error).toBeInstanceOf(AskAiApiError);
        if (!(error instanceof AskAiApiError)) throw new Error('Expected AskAiApiError');
        expect(error.category).toBe('failed');
        expect(error.message).not.toContain('secret');
    });
});

describe('Ask AI cancellation detection', () => {
    it('recognizes both fetch aborts and normalized API cancellation errors', () => {
        expect(isAskAiCancellation(new DOMException('aborted', 'AbortError'))).toBe(true);
        expect(isAskAiCancellation(new AskAiApiError('canceled'))).toBe(true);
        expect(isAskAiCancellation(new AskAiApiError('timeout'))).toBe(false);
    });
});

describe('ask-ai eligibility hook', () => {
    afterEach(() => vi.restoreAllMocks());

    it('settles on eligible when the service answers that this network may ask', async () => {
        vi.spyOn(globalThis, 'fetch').mockResolvedValue(
            jsonResponse({ schemaVersion: 1, available: true }),
        );
        const { result } = renderHook(() => useAskAiEligibility(true));
        expect(result.current.state).toBe('unknown');
        await waitFor(() => expect(result.current.state).toBe('eligible'));
    });

    it('reads a refusal as denied whether it arrives in JSON or as a gateway 403', async () => {
        vi.spyOn(globalThis, 'fetch').mockResolvedValue(
            jsonResponse({ schemaVersion: 1, available: false }),
        );
        const answered = renderHook(() => useAskAiEligibility(true));
        await waitFor(() => expect(answered.result.current.state).toBe('denied'));

        vi.restoreAllMocks();
        vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: 403 }));
        const refused = renderHook(() => useAskAiEligibility(true));
        await waitFor(() => expect(refused.result.current.state).toBe('denied'));
    });

    it.each([
        ['a dropped connection', () => Promise.reject(new Error('offline'))],
        ['a server fault', () => Promise.resolve(new Response(null, { status: 503 }))],
        ['an answer that is not the documented one', () => Promise.resolve(jsonResponse({}))],
    ] as const)('reads %s as unavailable rather than as a refusal', async (_case, respond) => {
        vi.spyOn(globalThis, 'fetch').mockImplementation(respond);
        const { result } = renderHook(() => useAskAiEligibility(true));
        await waitFor(() => expect(result.current.state).toBe('unavailable'));
    });

    it('asks once and not again on its own, and a retry can settle the same tab on eligible', async () => {
        const fetchMock = vi
            .spyOn(globalThis, 'fetch')
            .mockRejectedValue(new Error('the check never got through'));
        const { result, rerender } = renderHook(() => useAskAiEligibility(true));
        await waitFor(() => expect(result.current.state).toBe('unavailable'));
        rerender();
        expect(fetchMock).toHaveBeenCalledTimes(1);

        fetchMock.mockResolvedValue(jsonResponse({ schemaVersion: 1, available: true }));
        act(() => result.current.retry());
        await waitFor(() => expect(result.current.state).toBe('eligible'));
        expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it('asks nothing at all while the deployment does not advertise the feature', async () => {
        const fetchMock = vi
            .spyOn(globalThis, 'fetch')
            .mockResolvedValue(jsonResponse({ schemaVersion: 1, available: true }));
        const { result, rerender } = renderHook(
            ({ advertised }) => useAskAiEligibility(advertised),
            { initialProps: { advertised: false } },
        );
        rerender({ advertised: false });
        expect(fetchMock).not.toHaveBeenCalled();
        expect(result.current.state).toBe('unknown');

        rerender({ advertised: true });
        await waitFor(() => expect(result.current.state).toBe('eligible'));
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });
});
