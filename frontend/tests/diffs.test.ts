// SPDX-License-Identifier: EUPL-1.2
// SPDX-FileCopyrightText: 2026 LitterBox-Web contributors

import { afterEach, describe, expect, it, vi } from 'vitest';
import { DIFFS_URL, DiffApiError, MAX_DIFF_RESPONSE_BYTES, fetchDiff } from '../src/api/diffs';

const issue = (name: string) => ({
    finderId: `${name}-id`,
    finderName: name,
    issueType: `${name}-type`,
    severity: 2,
    sprite: `${name}-sprite`,
    blockId: `${name}-block`,
    scratchblocks: `when green flag clicked\nsay [${name}]`,
});

const diffResponse = () => ({
    schemaVersion: 1,
    before: { analysisId: 1, name: 'before.sb3' },
    after: { analysisId: 2, name: 'after.sb3' },
    // As the service counts them: a fixed finding is not in the newer version, so it is not part of the total
    // after. Requiring it there rejected every comparison in which anything had been repaired.
    counts: { beforeTotal: 3, afterTotal: 2, fixed: 1, newIssues: 1, persisting: 1, removed: 1 },
    fixed: [issue('fixed')],
    newIssues: [issue('new')],
    persisting: [issue('persisting')],
    removed: [issue('removed')],
    actors: [
        {
            actorName: 'Stage',
            stage: true,
            scripts: [
                {
                    changeType: 'changed',
                    beforeScratchblocks: 'move (10) steps',
                    afterScratchblocks: 'move (20) steps',
                    annotatedBeforeScratchblocks: null,
                    annotatedAfterScratchblocks: 'move (20) steps',
                },
            ],
        },
    ],
});

const jsonResponse = (body: unknown, status = 200, contentType = 'application/json') =>
    new Response(JSON.stringify(body), {
        status,
        headers: { 'Content-Type': contentType },
    });

describe('semantic diff API wrapper', () => {
    afterEach(() => vi.restoreAllMocks());

    it('uses the exact deployment-relative POST contract without authorization', async () => {
        const fetchMock = vi
            .spyOn(globalThis, 'fetch')
            .mockResolvedValue(jsonResponse(diffResponse()));
        const signal = new AbortController().signal;
        await expect(
            fetchDiff(
                {
                    before: { submissionToken: 'before-token', analysisId: 1 },
                    after: { submissionToken: 'after-token', analysisId: 2 },
                },
                signal,
            ),
        ).resolves.toMatchObject({ before: { analysisId: 1 }, after: { analysisId: 2 } });
        expect(fetchMock).toHaveBeenCalledWith(DIFFS_URL, {
            method: 'POST',
            headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
            body: JSON.stringify({
                before: { submissionToken: 'before-token', analysisId: 1 },
                after: { submissionToken: 'after-token', analysisId: 2 },
            }),
            signal,
        });
        const headers = fetchMock.mock.calls[0]?.[1]?.headers;
        expect(headers).not.toHaveProperty('Authorization');
    });

    it('rejects invalid references before making a request', async () => {
        const fetchMock = vi.spyOn(globalThis, 'fetch');
        await expect(
            fetchDiff({
                before: { submissionToken: ' ', analysisId: 1 },
                after: { submissionToken: 'ok', analysisId: 2 },
            }),
        ).rejects.toMatchObject({ category: 'validation' });
        await expect(
            fetchDiff({
                before: { submissionToken: 'x'.repeat(129), analysisId: 1 },
                after: { submissionToken: 'ok', analysisId: 2 },
            }),
        ).rejects.toMatchObject({ category: 'validation' });
        await expect(
            fetchDiff({
                before: { submissionToken: 'ok', analysisId: 0 },
                after: { submissionToken: 'ok', analysisId: 2 },
            }),
        ).rejects.toMatchObject({ category: 'validation' });
        await expect(
            fetchDiff({
                before: { submissionToken: 'ok', analysisId: Number.MAX_SAFE_INTEGER + 1 },
                after: { submissionToken: 'ok', analysisId: 2 },
            }),
        ).rejects.toMatchObject({ category: 'validation' });
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it('preserves deterministic response ordering and validates the complete shape', async () => {
        vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse(diffResponse()));
        const result = await fetchDiff({
            before: { submissionToken: 'before', analysisId: 1 },
            after: { submissionToken: 'after', analysisId: 2 },
        });
        expect(result.fixed[0]?.finderName).toBe('fixed');
        expect(result.newIssues[0]?.finderName).toBe('new');
        expect(result.persisting[0]?.finderName).toBe('persisting');
        expect(result.removed[0]?.finderName).toBe('removed');
        expect(result.actors[0]?.scripts[0]?.changeType).toBe('changed');

        vi.restoreAllMocks();
        vi.spyOn(globalThis, 'fetch').mockResolvedValue(
            jsonResponse({ ...diffResponse(), unexpected: 'field' }),
        );
        await expect(
            fetchDiff({
                before: { submissionToken: 'before', analysisId: 1 },
                after: { submissionToken: 'after', analysisId: 2 },
            }),
        ).rejects.toMatchObject({ category: 'malformed_response' });
    });

    it.each([
        [404, 'capability_disabled', 'capability_disabled'],
        [404, 'analysis_not_found', 'analysis_not_found'],
        [409, 'analysis_not_ready', 'analysis_not_ready'],
        [413, 'capability_limit_exceeded', 'capability_limit_exceeded'],
        [422, 'unsupported_source_format', 'unsupported_source_format'],
        [503, 'capability_unavailable', 'capability_unavailable'],
        [504, 'capability_timeout', 'capability_timeout'],
        [400, 'malformed_request', 'malformed_request'],
    ] as const)('maps %s/%s to %s', async (status, code, category) => {
        vi.spyOn(globalThis, 'fetch').mockResolvedValue(
            jsonResponse(
                { code, detail: 'synthetic detail that must not escape' },
                status,
                'application/problem+json',
            ),
        );
        await expect(
            fetchDiff({
                before: { submissionToken: 'before', analysisId: 1 },
                after: { submissionToken: 'after', analysisId: 2 },
            }),
        ).rejects.toMatchObject({ category, status });
    });

    it('rejects non-JSON, invalid schema, mismatched counts, and oversized success responses', async () => {
        vi.spyOn(globalThis, 'fetch').mockResolvedValue(
            jsonResponse(diffResponse(), 200, 'text/html'),
        );
        await expect(
            fetchDiff({
                before: { submissionToken: 'before', analysisId: 1 },
                after: { submissionToken: 'after', analysisId: 2 },
            }),
        ).rejects.toMatchObject({ category: 'malformed_response' });

        vi.restoreAllMocks();
        vi.spyOn(globalThis, 'fetch').mockResolvedValue(
            jsonResponse({ ...diffResponse(), schemaVersion: 2 }),
        );
        await expect(
            fetchDiff({
                before: { submissionToken: 'before', analysisId: 1 },
                after: { submissionToken: 'after', analysisId: 2 },
            }),
        ).rejects.toMatchObject({ category: 'malformed_response' });

        vi.restoreAllMocks();
        vi.spyOn(globalThis, 'fetch').mockResolvedValue(
            jsonResponse({
                ...diffResponse(),
                counts: { ...diffResponse().counts, fixed: 0 },
            }),
        );
        await expect(
            fetchDiff({
                before: { submissionToken: 'before', analysisId: 1 },
                after: { submissionToken: 'after', analysisId: 2 },
            }),
        ).rejects.toMatchObject({ category: 'malformed_response' });

        // The total after is what the newer version still has, so counting the repaired findings into it is
        // wrong however it is arrived at.
        vi.restoreAllMocks();
        vi.spyOn(globalThis, 'fetch').mockResolvedValue(
            jsonResponse({
                ...diffResponse(),
                counts: { ...diffResponse().counts, afterTotal: 3 },
            }),
        );
        await expect(
            fetchDiff({
                before: { submissionToken: 'before', analysisId: 1 },
                after: { submissionToken: 'after', analysisId: 2 },
            }),
        ).rejects.toMatchObject({ category: 'malformed_response' });

        vi.restoreAllMocks();
        vi.spyOn(globalThis, 'fetch').mockResolvedValue(
            new Response(`{"tooLarge":"${'x'.repeat(MAX_DIFF_RESPONSE_BYTES)}"}`, {
                status: 200,
                headers: {
                    'Content-Type': 'application/json',
                    'Content-Length': String(MAX_DIFF_RESPONSE_BYTES + 20),
                },
            }),
        );
        let error: unknown;
        try {
            await fetchDiff({
                before: { submissionToken: 'before', analysisId: 1 },
                after: { submissionToken: 'after', analysisId: 2 },
            });
        } catch (reason) {
            error = reason;
        }
        expect(error).toBeInstanceOf(DiffApiError);
        if (!(error instanceof DiffApiError)) throw new Error('Expected a bounded API error');
        expect(error.category).toBe('malformed_response');
        expect(error.message).not.toContain('tooLarge');
    });

    it('maps network failures and AbortError cancellation without exposing details', async () => {
        vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('secret network content'));
        let networkError: unknown;
        try {
            await fetchDiff({
                before: { submissionToken: 'before', analysisId: 1 },
                after: { submissionToken: 'after', analysisId: 2 },
            });
        } catch (reason) {
            networkError = reason;
        }
        expect(networkError).toBeInstanceOf(DiffApiError);
        if (!(networkError instanceof DiffApiError))
            throw new Error('Expected a bounded API error');
        expect(networkError.category).toBe('network_failure');
        expect(networkError.message).not.toContain('secret');

        vi.restoreAllMocks();
        vi.spyOn(globalThis, 'fetch').mockRejectedValue(
            new DOMException('secret token', 'AbortError'),
        );
        await expect(
            fetchDiff({
                before: { submissionToken: 'before', analysisId: 1 },
                after: { submissionToken: 'after', analysisId: 2 },
            }),
        ).rejects.toMatchObject({ category: 'canceled' });
    });

    it('keeps cancellation bounded while reading a problem response', async () => {
        vi.spyOn(globalThis, 'fetch').mockResolvedValue(
            new Response(
                new ReadableStream({
                    start(controller) {
                        controller.error(new DOMException('secret token', 'AbortError'));
                    },
                }),
                {
                    status: 503,
                    headers: { 'Content-Type': 'application/problem+json' },
                },
            ),
        );
        await expect(
            fetchDiff({
                before: { submissionToken: 'before', analysisId: 1 },
                after: { submissionToken: 'after', analysisId: 2 },
            }),
        ).rejects.toMatchObject({ category: 'canceled' });
    });
});
