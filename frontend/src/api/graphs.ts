// SPDX-License-Identifier: EUPL-1.2
// SPDX-FileCopyrightText: 2025 LitterBox-Web contributors

import { isAbortError } from '../lib/abort-error';
import { BASE_URL } from '../lib/base-url';
import { readBoundedText } from './validation';

export const GRAPH_TYPES = ['ast', 'cfg', 'cdg', 'ddg', 'dt', 'pdt', 'tdg', 'pdg'] as const;
export type GraphType = (typeof GRAPH_TYPES)[number];

export type GraphErrorCategory =
    | 'disabled'
    | 'unavailable'
    | 'authorization'
    | 'not-ready'
    | 'unsupported'
    | 'limit'
    | 'timeout'
    | 'empty'
    | 'server';

export interface GraphResult {
    graphType: GraphType;
    dot: string;
    nodeCount: number;
    edgeCount: number;
}

export class GraphApiError extends Error {
    public readonly category: GraphErrorCategory;
    public readonly status?: number;
    public readonly code?: string;

    public constructor(
        category: GraphErrorCategory,
        message: string,
        status?: number,
        code?: string,
    ) {
        super(message);
        this.name = 'GraphApiError';
        this.category = category;
        this.status = status;
        this.code = code;
    }
}

export const MAX_GRAPH_DOT_BYTES = 5 * 1024 * 1024;
export const MAX_GRAPH_NODES = 100_000;
export const MAX_GRAPH_EDGES = 250_000;
export const GRAPH_MEDIA_TYPE = 'text/vnd.graphviz;charset=UTF-8';

export const isGraphType = (value: string): value is GraphType =>
    (GRAPH_TYPES as readonly string[]).includes(value);

export const graphUrl = (
    token: string,
    analysisId: string | number,
    graphType: GraphType,
): string =>
    `${BASE_URL}api/v1/submissions/${encodeURIComponent(token)}/analyses/${encodeURIComponent(
        String(analysisId),
    )}/graphs/${encodeURIComponent(graphType)}`;

const categoryFor = (status: number, code?: string): GraphErrorCategory => {
    switch (code) {
        case 'capability_disabled':
            return 'disabled';
        case 'capability_unavailable':
            return 'unavailable';
        case 'authorization_required':
            return 'authorization';
        case 'analysis_not_ready':
            return 'not-ready';
        case 'unsupported_source_format':
            return 'unsupported';
        case 'capability_limit_exceeded':
            return 'limit';
        case 'capability_timeout':
            return 'timeout';
        default:
            break;
    }
    if (status === 401 || status === 403) return 'authorization';
    if (status === 409) return 'not-ready';
    if (status === 413 || status === 429) return 'limit';
    if (status === 422) return 'unsupported';
    if (status === 503) return 'unavailable';
    if (status === 504) return 'timeout';
    return status === 404 ? 'unavailable' : 'server';
};

const readProblemCode = async (response: Response): Promise<string | undefined> => {
    const contentType = response.headers.get('Content-Type')?.toLowerCase() ?? '';
    if (!contentType.includes('json')) return undefined;
    try {
        const body = await response.text();
        if (body.length > 16_384) return undefined;
        const parsed: unknown = JSON.parse(body);
        if (!parsed || typeof parsed !== 'object') return undefined;
        const code = (parsed as Record<string, unknown>).code;
        return typeof code === 'string' ? code : undefined;
    } catch {
        return undefined;
    }
};

const boundedCount = (response: Response, header: string, maximum: number): number => {
    const value = response.headers.get(header);
    if (value === null || !/^\d+$/.test(value)) {
        throw new GraphApiError(
            'server',
            `Graph response did not contain a valid ${header} header`,
        );
    }
    const count = Number(value);
    if (!Number.isSafeInteger(count) || count < 0 || count > maximum) {
        throw new GraphApiError('limit', `Graph ${header} exceeded its bounded limit`);
    }
    return count;
};

const readGraphDot = (response: Response): Promise<string> =>
    readBoundedText(response, MAX_GRAPH_DOT_BYTES, {
        tooLarge: () => new GraphApiError('limit', 'Graph DOT exceeded its bounded response size'),
        // Bytes that are not UTF-8 are not a graph this client can draw. Named as a server fault rather than left
        // to escape as the decoder's own TypeError, which the caller would have no category for.
        malformed: () => new GraphApiError('server', 'The graph response was not valid UTF-8'),
    });

const isGraphvizContentType = (value: string | null): boolean => {
    if (!value) return false;
    const [mediaType, ...parameters] = value.split(';').map((part) => part.trim().toLowerCase());
    if (mediaType !== 'text/vnd.graphviz') return false;
    return parameters.every((parameter) => parameter === '' || parameter === 'charset=utf-8');
};

export async function fetchGraph(
    token: string,
    analysisId: string | number,
    graphType: GraphType,
    signal?: AbortSignal,
): Promise<GraphResult> {
    if (!isGraphType(graphType)) {
        throw new GraphApiError('unsupported', 'This graph type is not supported');
    }
    let response: Response;
    try {
        response = await fetch(graphUrl(token, analysisId, graphType), {
            headers: {
                Accept: GRAPH_MEDIA_TYPE,
                Authorization: `Bearer ${token}`,
            },
            signal,
        });
    } catch (error) {
        if (isAbortError(error)) throw error;
        throw new GraphApiError('unavailable', 'The graph service is unavailable');
    }
    if (!response.ok) {
        const code = await readProblemCode(response);
        const category = categoryFor(response.status, code);
        throw new GraphApiError(category, 'The graph could not be loaded', response.status, code);
    }
    if (!isGraphvizContentType(response.headers.get('Content-Type'))) {
        throw new GraphApiError('server', 'The graph response had an unexpected media type');
    }
    const nodeCount = boundedCount(response, 'X-LitterBox-Graph-Nodes', MAX_GRAPH_NODES);
    const edgeCount = boundedCount(response, 'X-LitterBox-Graph-Edges', MAX_GRAPH_EDGES);
    const dot = await readGraphDot(response);
    if (!dot.trim()) throw new GraphApiError('empty', 'The graph response was empty');
    return { graphType, dot, nodeCount, edgeCount };
}
