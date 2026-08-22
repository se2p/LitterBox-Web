// SPDX-License-Identifier: EUPL-1.2
// SPDX-FileCopyrightText: 2026 LitterBox-Web contributors

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchGraph, GRAPH_MEDIA_TYPE, GRAPH_TYPES, graphUrl } from '../src/api/graphs';
import { sanitizeGraphvizSvg } from '../src/components/capabilities/metrics/safe-svg';

const graphResponse = (
    body = 'digraph { a -> b }',
    status = 200,
    extraHeaders: Record<string, string> = {},
) =>
    new Response(body, {
        status,
        headers: {
            'Content-Type': GRAPH_MEDIA_TYPE,
            'X-LitterBox-Graph-Nodes': '2',
            'X-LitterBox-Graph-Edges': '1',
            ...extraHeaders,
        },
    });

const problemResponse = (status: number, code: string) =>
    new Response(JSON.stringify({ code, detail: '<b>synthetic</b>' }), {
        status,
        headers: { 'Content-Type': 'application/problem+json' },
    });

describe('graph API wrapper', () => {
    beforeEach(() => vi.restoreAllMocks());

    it('constructs a base-path URL, sends the matching bearer, and returns bounded metadata', async () => {
        const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(graphResponse());

        await expect(fetchGraph('token/with spaces', 'analysis/7', 'cfg')).resolves.toEqual({
            graphType: 'cfg',
            dot: 'digraph { a -> b }',
            nodeCount: 2,
            edgeCount: 1,
        });
        expect(graphUrl('token/with spaces', 'analysis/7', 'cfg')).toBe(
            '/litterbox/api/v1/submissions/token%2Fwith%20spaces/analyses/analysis%2F7/graphs/cfg',
        );
        expect(fetchMock).toHaveBeenCalledWith(
            '/litterbox/api/v1/submissions/token%2Fwith%20spaces/analyses/analysis%2F7/graphs/cfg',
            expect.objectContaining({
                headers: {
                    Accept: GRAPH_MEDIA_TYPE,
                    Authorization: 'Bearer token/with spaces',
                },
            }),
        );
    });

    it('keeps the graph type allowlist explicit', async () => {
        const fetchMock = vi.spyOn(globalThis, 'fetch');
        expect(GRAPH_TYPES).toHaveLength(8);
        await expect(fetchGraph('token', 1, 'html' as never)).rejects.toMatchObject({
            category: 'unsupported',
        });
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it.each([
        [404, 'capability_disabled', 'disabled'],
        [503, 'capability_unavailable', 'unavailable'],
        [401, 'authorization_required', 'authorization'],
        [409, 'analysis_not_ready', 'not-ready'],
        [422, 'unsupported_source_format', 'unsupported'],
        [413, 'capability_limit_exceeded', 'limit'],
        [504, 'capability_timeout', 'timeout'],
    ] as const)('maps %s/%s into the bounded %s category', async (status, code, category) => {
        vi.spyOn(globalThis, 'fetch').mockResolvedValue(problemResponse(status, code));
        await expect(fetchGraph('token', 1, 'ast')).rejects.toMatchObject({
            category,
            status,
            code,
        });
    });

    it('rejects HTML-shaped success responses and malformed bounded headers', async () => {
        vi.spyOn(globalThis, 'fetch').mockResolvedValue(
            new Response('<svg><script>alert(1)</script></svg>', {
                status: 200,
                headers: {
                    'Content-Type': 'text/html',
                    'X-LitterBox-Graph-Nodes': '2',
                    'X-LitterBox-Graph-Edges': '1',
                },
            }),
        );
        await expect(fetchGraph('token', 1, 'ast')).rejects.toMatchObject({ category: 'server' });

        vi.restoreAllMocks();
        vi.spyOn(globalThis, 'fetch').mockResolvedValue(
            graphResponse('digraph {}', 200, { 'X-LitterBox-Graph-Nodes': 'not-a-count' }),
        );
        await expect(fetchGraph('token', 1, 'ast')).rejects.toMatchObject({ category: 'server' });
    });

    it('reports empty bodies without interpreting them as markup', async () => {
        vi.spyOn(globalThis, 'fetch').mockResolvedValue(graphResponse('   '));
        await expect(fetchGraph('token', 1, 'ast')).rejects.toMatchObject({ category: 'empty' });
    });
});

describe('safe Graphviz SVG boundary', () => {
    const validSvg = `<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="10pt" height="10pt" viewBox="0 0 10 10"><g class="graph"><title>safe</title><polygon fill="white" points="0,0 10,0 10,10 0,10"/><text xml:space="preserve" x="1" y="2" font-family="Times,serif">safe label</text></g></svg>`;

    it('copies only inert SVG content into a new same-document tree', () => {
        const result = sanitizeGraphvizSvg(validSvg);
        expect(result).not.toBe(document.querySelector('svg'));
        expect(result.namespaceURI).toBe('http://www.w3.org/2000/svg');
        expect(result.querySelector('text')?.textContent).toBe('safe label');
        expect(result.getAttribute('xmlns:xlink')).toBeNull();
    });

    it.each([
        ['<script>alert(1)</script>', 'scripts'],
        ['<g onload="alert(1)"></g>', 'event attributes'],
        ['<a href="https://example.invalid"><text>x</text></a>', 'active links'],
        ['<foreignObject><div>html</div></foreignObject>', 'foreignObject'],
        ['<image href="https://example.invalid/x.png"/>', 'external resources'],
        ['<g style="fill:url(#bad)"></g>', 'style attributes'],
        ['<evil:thing xmlns:evil="urn:evil"/>', 'unexpected namespaces'],
    ])('rejects %s-shaped %s', (content) => {
        expect(() =>
            sanitizeGraphvizSvg(`<svg xmlns="http://www.w3.org/2000/svg">${content}</svg>`),
        ).toThrow();
    });
});
