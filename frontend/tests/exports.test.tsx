// SPDX-License-Identifier: EUPL-1.2
// SPDX-FileCopyrightText: 2026 LitterBox-Web contributors

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SubmissionPage } from '../src/pages/SubmissionPage';
import { AdvancedAnalysisPage } from '../src/pages/AdvancedAnalysisPage';
import { ExportControls } from '../src/components/capabilities/export/ExportControls';
import {
    EXPORT_FORMATS,
    EXPORT_FORMAT_METADATA,
    ExportApiError,
    MAX_EXPORT_RESPONSE_BYTES,
    fetchExport,
    fetchExportTargets,
    exportTargetsUrl,
    exportUrl,
} from '../src/api/exports';
import type { ExportRequestDto } from '../src/api/generated';
import type { CapabilityState } from '../src/lib/capabilities';
import i18n from '../src/i18n';

const bytesOf = (value: string): Uint8Array => new TextEncoder().encode(value);

const validHeaders = (format: (typeof EXPORT_FORMATS)[number], body: string) => ({
    'Content-Type': EXPORT_FORMAT_METADATA[format].mediaType,
    'Content-Disposition': `attachment; filename="${EXPORT_FORMAT_METADATA[format].filename}"`,
    'Content-Length': String(bytesOf(body).byteLength),
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
});

const exportResponse = (
    format: (typeof EXPORT_FORMATS)[number] = 'scratchblocks',
    body = 'synthetic export',
    status = 200,
    headers: Record<string, string | undefined> = {},
) =>
    (() => {
        const mergedHeaders: Record<string, string> = { ...validHeaders(format, body) };
        for (const [name, value] of Object.entries(headers)) {
            if (value === undefined) delete mergedHeaders[name];
            else mergedHeaders[name] = value;
        }
        return new Response(body, { status, headers: mergedHeaders });
    })();

const exportTargetsResponse = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
    new Response(JSON.stringify(body), {
        status,
        headers: {
            'Content-Type': 'application/json',
            'Cache-Control': 'no-store',
            'X-Content-Type-Options': 'nosniff',
            ...headers,
        },
    });

const requestFor = (
    format: (typeof EXPORT_FORMATS)[number],
    target: ExportRequestDto['target'] = { kind: 'program', spriteName: null, scriptId: null },
): ExportRequestDto => ({ format, target });

const capabilityState = (enabledFeatures: string[]): CapabilityState => ({
    status: 'ready',
    value: {
        schemaVersion: 1,
        litterboxVersion: 'synthetic',
        supportedLocales: ['de', 'en', 'es', 'nl'],
        enabledFeatures,
    },
});

const completedSubmission = (inputFormat: string | null = 'sb3') => ({
    status: 'completed',
    token: 'synthetic-token',
    analysis: {
        id: 7,
        status: 'completed',
        inputFormat,
        metrics: {},
        issues: [],
        relationships: [],
        catalogue: [],
        quiz: [],
        assetRefs: [],
    },
    analyses: [],
    counts: { expected: 1, completed: 1, failed: 0 },
});

describe('export API wrapper', () => {
    beforeEach(() => vi.restoreAllMocks());
    afterEach(() => vi.unstubAllGlobals());

    it('loads the authorized export target catalogue with frozen generated DTOs', async () => {
        const catalogue = {
            sprites: [
                { name: 'Stage', stage: true },
                { name: 'Sprite 1', stage: false },
            ],
            scripts: [
                {
                    scriptId: 'opaque-script-id',
                    spriteName: 'Sprite 1',
                    ordinal: 1,
                    scratchblocks: 'when green flag clicked',
                },
            ],
        };
        const fetchMock = vi
            .spyOn(globalThis, 'fetch')
            .mockResolvedValue(exportTargetsResponse(catalogue));
        const signal = new AbortController().signal;

        const result = await fetchExportTargets('token/with spaces', 7, signal);

        expect(exportTargetsUrl('token/with spaces', 7)).toBe(
            '/litterbox/api/v1/submissions/token%2Fwith%20spaces/analyses/7/export-targets',
        );
        expect(fetchMock).toHaveBeenCalledWith(
            '/litterbox/api/v1/submissions/token%2Fwith%20spaces/analyses/7/export-targets',
            {
                method: 'GET',
                headers: {
                    Accept: 'application/json',
                    Authorization: 'Bearer token/with spaces',
                },
                signal,
            },
        );
        expect(result).toEqual(catalogue);
        expect(Object.isFrozen(result)).toBe(true);
        expect(Object.isFrozen(result.sprites)).toBe(true);
        expect(Object.isFrozen(result.scripts[0])).toBe(true);
    });

    it.each([
        [{ sprites: [], scripts: [{ scriptId: 'id' }] }, {}],
        [{ sprites: [{ name: '', stage: false }], scripts: [] }, {}],
        [
            {
                sprites: [
                    { name: 'Sprite', stage: false },
                    { name: 'Sprite', stage: false },
                ],
                scripts: [],
            },
            {},
        ],
        [{ sprites: [], scripts: [] }, { 'Content-Type': 'text/html' }],
    ])('rejects malformed export target catalogue data and headers', async (body, headers) => {
        vi.spyOn(globalThis, 'fetch').mockResolvedValue(exportTargetsResponse(body, 200, headers));

        await expect(fetchExportTargets('token', 1)).rejects.toMatchObject({
            category: 'malformed_response',
        });
    });

    it.each([
        ['scratchblocks', { kind: 'program', spriteName: null, scriptId: null }],
        ['goboscript', { kind: 'sprite', spriteName: 'Sprite name', scriptId: null }],
        ['pystage', { kind: 'script', spriteName: null, scriptId: 'script-id' }],
    ] as const)('sends the exact POST contract for %s', async (format, target) => {
        const body = `synthetic-${format}`;
        const fetchMock = vi
            .spyOn(globalThis, 'fetch')
            .mockResolvedValue(exportResponse(format, body));
        const signal = new AbortController().signal;
        const request = requestFor(format, target);
        const result = await fetchExport('token/with spaces', 7, request, signal);

        expect(exportUrl('token/with spaces', 7)).toBe(
            '/litterbox/api/v1/submissions/token%2Fwith%20spaces/analyses/7/exports',
        );
        expect(fetchMock).toHaveBeenCalledWith(
            '/litterbox/api/v1/submissions/token%2Fwith%20spaces/analyses/7/exports',
            {
                method: 'POST',
                headers: {
                    Accept: EXPORT_FORMAT_METADATA[format].mediaType,
                    Authorization: 'Bearer token/with spaces',
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(request),
                signal,
            },
        );
        expect(result.metadata.filename).toBe(EXPORT_FORMAT_METADATA[format].filename);
        expect(result.metadata.extension).toBe(EXPORT_FORMAT_METADATA[format].extension);
        expect(result.metadata.mediaType).toBe(EXPORT_FORMAT_METADATA[format].mediaType);
        expect(result.blob.size).toBe(bytesOf(body).byteLength);
        expect(result.blob.type).toBe(EXPORT_FORMAT_METADATA[format].mediaType.toLowerCase());
        expect(Object.isFrozen(result.metadata)).toBe(true);
        expect(Object.isFrozen(result.metadata.target)).toBe(true);
    });

    it('rejects contradictory targets, invalid ids, and unsupported formats before fetch', async () => {
        const fetchMock = vi.spyOn(globalThis, 'fetch');
        const invalidRequests: ExportRequestDto[] = [
            requestFor('scratchblocks', { kind: 'program', spriteName: 'Sprite', scriptId: null }),
            requestFor('goboscript', { kind: 'sprite', spriteName: ' ', scriptId: null }),
            requestFor('pystage', { kind: 'script', spriteName: 'Sprite', scriptId: 'id' }),
            requestFor('scratchblocks', { kind: 'program', spriteName: null, scriptId: 'id' }),
            {
                format: 'html' as never,
                target: { kind: 'program', spriteName: null, scriptId: null },
            },
        ];
        for (const request of invalidRequests)
            await expect(fetchExport('token', 1, request)).rejects.toMatchObject({
                category: 'validation',
            });
        await expect(fetchExport('token', 0, requestFor('scratchblocks'))).rejects.toMatchObject({
            category: 'validation',
        });
        await expect(fetchExport(' ', 1, requestFor('scratchblocks'))).rejects.toMatchObject({
            category: 'validation',
        });
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it('accepts a successful export response with no Content-Length header at all', async () => {
        vi.spyOn(globalThis, 'fetch').mockResolvedValue(
            exportResponse('scratchblocks', 'synthetic', 200, { 'Content-Length': undefined }),
        );
        const result = await fetchExport('token', 1, requestFor('scratchblocks'));
        expect(result.blob.size).toBe(bytesOf('synthetic').byteLength);
    });

    it.each([
        ['invalid', { 'Content-Length': 'not-a-length' }],
        ['dishonest', { 'Content-Length': '1' }],
        ['excessive', { 'Content-Length': String(MAX_EXPORT_RESPONSE_BYTES + 1) }],
    ] as const)('rejects %s Content-Length', async (_name, header) => {
        vi.spyOn(globalThis, 'fetch').mockResolvedValue(
            exportResponse('scratchblocks', 'synthetic', 200, header),
        );
        await expect(fetchExport('token', 1, requestFor('scratchblocks'))).rejects.toMatchObject({
            category: 'malformed_response',
        });
    });

    it('accepts a Content-Length that reflects a compressed body when Content-Encoding is set', async () => {
        // A proxy compressing this text response makes Content-Length describe the gzipped bytes on the wire,
        // while fetch hands back the decoded ones; that mismatch is exactly what a dishonest length looks like,
        // so this same header combination is rejected above whenever Content-Encoding is absent.
        vi.spyOn(globalThis, 'fetch').mockResolvedValue(
            exportResponse('scratchblocks', 'synthetic', 200, {
                'Content-Length': '1',
                'Content-Encoding': 'gzip',
            }),
        );
        const result = await fetchExport('token', 1, requestFor('scratchblocks'));
        expect(result.blob.size).toBe(bytesOf('synthetic').byteLength);
    });

    it('rejects an export response with the wrong media type', async () => {
        vi.spyOn(globalThis, 'fetch').mockResolvedValue(
            exportResponse('scratchblocks', '<script>synthetic</script>', 200, {
                'Content-Type': 'text/html',
            }),
        );
        await expect(fetchExport('token', 1, requestFor('scratchblocks'))).rejects.toMatchObject({
            category: 'malformed_response',
        });
    });

    it('enforces the byte ceiling while reading a stream without trusting headers', async () => {
        let canceled = false;
        const stream = new ReadableStream<Uint8Array>({
            start(controller) {
                controller.enqueue(new Uint8Array(MAX_EXPORT_RESPONSE_BYTES + 1));
                controller.close();
            },
            cancel() {
                canceled = true;
            },
        });
        vi.spyOn(globalThis, 'fetch').mockResolvedValue(
            new Response(stream, {
                status: 200,
                headers: {
                    ...validHeaders('scratchblocks', ''),
                    'Content-Length': '1',
                },
            }),
        );
        await expect(fetchExport('token', 1, requestFor('scratchblocks'))).rejects.toMatchObject({
            category: 'malformed_response',
        });
        expect(canceled).toBe(false);
    });

    it.each([
        [404, 'capability_disabled'],
        [401, 'authorization_required'],
        [404, 'analysis_not_found'],
        [409, 'analysis_not_ready'],
        [413, 'capability_limit_exceeded'],
        [422, 'unsupported_source_format'],
        [422, 'target_not_found'],
        [503, 'capability_unavailable'],
        [504, 'capability_timeout'],
        [400, 'malformed_request'],
    ] as const)('maps %s/%s into a bounded category', async (status, code) => {
        vi.spyOn(globalThis, 'fetch').mockResolvedValue(
            new Response(JSON.stringify({ code, detail: 'secret synthetic server detail' }), {
                status,
                headers: { 'Content-Type': 'application/problem+json' },
            }),
        );
        let error: unknown;
        try {
            await fetchExport('token', 1, requestFor('scratchblocks'));
        } catch (reason) {
            error = reason;
        }
        expect(error).toBeInstanceOf(ExportApiError);
        expect(error).toMatchObject({ category: code, status });
        expect((error as Error).message).not.toContain('secret');
    });

    it('maps network and fetch/body cancellation without exposing details', async () => {
        vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('secret token network detail'));
        await expect(fetchExport('token', 1, requestFor('scratchblocks'))).rejects.toMatchObject({
            category: 'network_failure',
        });

        vi.restoreAllMocks();
        vi.spyOn(globalThis, 'fetch').mockRejectedValue(
            new DOMException('secret token', 'AbortError'),
        );
        await expect(fetchExport('token', 1, requestFor('scratchblocks'))).rejects.toMatchObject({
            category: 'canceled',
        });

        vi.restoreAllMocks();
        const stream = new ReadableStream<Uint8Array>({
            start(controller) {
                controller.error(new DOMException('secret body', 'AbortError'));
            },
        });
        vi.spyOn(globalThis, 'fetch').mockResolvedValue(
            new Response(stream, {
                status: 200,
                headers: validHeaders('scratchblocks', ''),
            }),
        );
        await expect(fetchExport('token', 1, requestFor('scratchblocks'))).rejects.toMatchObject({
            category: 'canceled',
        });
    });
});

describe('export controls', () => {
    beforeEach(async () => {
        await i18n.changeLanguage('en');
        vi.restoreAllMocks();
        vi.stubGlobal('EventSource', undefined);
        vi.stubGlobal('URL', {
            createObjectURL: vi.fn(() => 'blob:synthetic-export'),
            revokeObjectURL: vi.fn(),
        });
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    const renderControls = (enabled = true, inputFormat: string | null = 'sb3') =>
        render(
            <ExportControls
                enabled={enabled}
                token="synthetic-token"
                analysisId={7}
                inputFormat={inputFormat}
                locale="en"
            />,
        );

    it('does not request or download until the two explicit actions are used', async () => {
        const user = userEvent.setup();
        const fetchMock = vi
            .spyOn(globalThis, 'fetch')
            .mockResolvedValue(exportResponse('scratchblocks', 'synthetic bytes'));
        const anchorClick = vi
            .spyOn(HTMLAnchorElement.prototype, 'click')
            .mockImplementation(() => {});
        renderControls();
        expect(fetchMock).not.toHaveBeenCalled();
        expect(
            screen.queryByRole('button', { name: 'Download prepared export' }),
        ).not.toBeInTheDocument();
        await user.click(screen.getByRole('button', { name: 'Prepare export' }));
        await screen.findByRole('heading', { name: 'Export prepared' });
        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect(anchorClick).not.toHaveBeenCalled();
        await user.click(screen.getByRole('button', { name: 'Download prepared export' }));
        expect(anchorClick).toHaveBeenCalledTimes(1);
        expect(screen.queryByText('synthetic bytes')).not.toBeInTheDocument();
    });

    it('loads target choices on demand, excludes Stage from sprite export, and submits exact selections', async () => {
        const user = userEvent.setup();
        const fetchMock = vi
            .spyOn(globalThis, 'fetch')
            .mockResolvedValueOnce(
                exportTargetsResponse({
                    sprites: [
                        { name: 'Stage', stage: true },
                        { name: 'Sprite 1', stage: false },
                    ],
                    scripts: [],
                }),
            )
            .mockResolvedValueOnce(exportResponse('scratchblocks', 'sprite bytes'));
        renderControls();
        expect(fetchMock).not.toHaveBeenCalled();
        await user.selectOptions(screen.getByLabelText('Export target'), 'sprite');
        await screen.findByRole('option', { name: 'Sprite 1' });
        expect(screen.queryByRole('option', { name: 'Stage' })).not.toBeInTheDocument();
        await user.selectOptions(screen.getByLabelText('Sprite'), 'Sprite 1');
        await user.click(screen.getByRole('button', { name: 'Prepare export' }));
        await screen.findByRole('heading', { name: 'Export prepared' });
        expect(fetchMock).toHaveBeenCalledTimes(2);
        expect(JSON.parse(fetchMock.mock.calls[1]![1]!.body as string)).toEqual({
            format: 'scratchblocks',
            target: { kind: 'sprite', spriteName: 'Sprite 1', scriptId: null },
        });
    });

    it('browses scripts without displaying IDs and submits the selected script ID', async () => {
        const user = userEvent.setup();
        const fetchMock = vi
            .spyOn(globalThis, 'fetch')
            .mockResolvedValueOnce(
                exportTargetsResponse({
                    sprites: [],
                    scripts: [
                        {
                            scriptId: 'opaque-first',
                            spriteName: 'Sprite 1',
                            ordinal: 1,
                            scratchblocks: 'when green flag clicked',
                        },
                        {
                            scriptId: 'opaque-second',
                            spriteName: 'Stage',
                            ordinal: 2,
                            scratchblocks: 'say [second]',
                        },
                    ],
                }),
            )
            .mockResolvedValueOnce(exportResponse('goboscript', 'script bytes'));
        renderControls();
        await user.selectOptions(screen.getByLabelText('Output format'), 'goboscript');
        await user.selectOptions(screen.getByLabelText('Export target'), 'script');
        await screen.findByRole('option', { name: 'Sprite 1, script 1' });
        expect(screen.queryByText('opaque-first')).not.toBeInTheDocument();
        expect(screen.queryByText('opaque-second')).not.toBeInTheDocument();
        await user.click(screen.getByRole('button', { name: 'Next script' }));
        await screen.findByRole('option', { name: 'Stage, script 2' });
        await user.click(screen.getByRole('button', { name: 'Prepare export' }));
        await screen.findByRole('heading', { name: 'Export prepared' });
        expect(fetchMock).toHaveBeenCalledTimes(2);
        expect(JSON.parse(fetchMock.mock.calls[1]![1]!.body as string)).toEqual({
            format: 'goboscript',
            target: { kind: 'script', spriteName: null, scriptId: 'opaque-second' },
        });
    });

    it('refreshes target choices once after target_not_found and clears a missing selection', async () => {
        const user = userEvent.setup();
        const fetchMock = vi
            .spyOn(globalThis, 'fetch')
            .mockResolvedValueOnce(
                exportTargetsResponse({
                    sprites: [],
                    scripts: [
                        {
                            scriptId: 'stale-script',
                            spriteName: 'Sprite 1',
                            ordinal: 1,
                            scratchblocks: 'when green flag clicked',
                        },
                    ],
                }),
            )
            .mockResolvedValueOnce(
                new Response(JSON.stringify({ code: 'target_not_found' }), {
                    status: 422,
                    headers: { 'Content-Type': 'application/problem+json' },
                }),
            )
            .mockResolvedValueOnce(
                exportTargetsResponse({
                    sprites: [],
                    scripts: [
                        {
                            scriptId: 'new-script',
                            spriteName: 'Sprite 2',
                            ordinal: 2,
                            scratchblocks: 'say [new]',
                        },
                    ],
                }),
            )
            .mockResolvedValueOnce(exportResponse('scratchblocks', 'new script bytes'));
        renderControls();
        await user.selectOptions(screen.getByLabelText('Export target'), 'script');
        await screen.findByRole('option', { name: 'Sprite 1, script 1' });
        await user.click(screen.getByRole('button', { name: 'Prepare export' }));
        await screen.findByRole('heading', { name: 'Export could not be prepared' });
        expect(fetchMock).toHaveBeenCalledTimes(3);
        expect(screen.getByText(/The source targets changed/)).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Prepare export' })).toBeDisabled();
        expect(screen.getByRole('button', { name: 'Retry export' })).toBeDisabled();
        expect(screen.queryAllByText('Sprite 1, script 1')).toHaveLength(0);
        expect(screen.queryByText('stale-script')).not.toBeInTheDocument();
        await user.selectOptions(screen.getByLabelText('Script'), 'new-script');
        await user.click(screen.getByRole('button', { name: 'Prepare export' }));
        await screen.findByRole('heading', { name: 'Export prepared' });
        expect(fetchMock).toHaveBeenCalledTimes(4);
        expect(JSON.parse(fetchMock.mock.calls[3]![1]!.body as string)).toEqual({
            format: 'scratchblocks',
            target: { kind: 'script', spriteName: null, scriptId: 'new-script' },
        });
    });

    it('reports catalogue timeout and retries the catalogue explicitly', async () => {
        const user = userEvent.setup();
        const fetchMock = vi
            .spyOn(globalThis, 'fetch')
            .mockResolvedValueOnce(
                new Response(JSON.stringify({ code: 'capability_timeout' }), {
                    status: 504,
                    headers: { 'Content-Type': 'application/problem+json' },
                }),
            )
            .mockResolvedValueOnce(
                exportTargetsResponse({
                    sprites: [{ name: 'Sprite 1', stage: false }],
                    scripts: [],
                }),
            );
        renderControls();
        await user.selectOptions(screen.getByLabelText('Export target'), 'sprite');
        await screen.findByRole('alert');
        expect(screen.getByRole('alert')).toHaveTextContent('Program export timed out');
        await user.click(screen.getByRole('button', { name: 'Retry loading targets' }));
        await screen.findByRole('option', { name: 'Sprite 1' });
        expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it('revokes prepared object URLs on replacement, selection change, retry, and unmount', async () => {
        const user = userEvent.setup();
        const revoke = vi.mocked(URL.revokeObjectURL);
        vi.spyOn(globalThis, 'fetch')
            .mockResolvedValueOnce(exportResponse('scratchblocks', 'first'))
            .mockResolvedValueOnce(exportResponse('goboscript', 'second'));
        const view = renderControls();
        await user.click(screen.getByRole('button', { name: 'Prepare export' }));
        await screen.findByRole('heading', { name: 'Export prepared' });
        await user.selectOptions(screen.getByLabelText('Output format'), 'goboscript');
        expect(revoke).toHaveBeenCalledWith('blob:synthetic-export');
        await user.click(screen.getByRole('button', { name: 'Prepare export' }));
        await screen.findByRole('heading', { name: 'Export prepared' });
        view.unmount();
        expect(revoke).toHaveBeenCalledTimes(2);
    });

    it('revokes prepared object URLs when export eligibility is withdrawn', async () => {
        const user = userEvent.setup();
        const revoke = vi.mocked(URL.revokeObjectURL);
        vi.spyOn(globalThis, 'fetch').mockResolvedValue(
            exportResponse('scratchblocks', 'prepared before withdrawal'),
        );
        const view = renderControls();
        await user.click(screen.getByRole('button', { name: 'Prepare export' }));
        await screen.findByRole('heading', { name: 'Export prepared' });

        view.rerender(
            <ExportControls
                enabled={false}
                token="synthetic-token"
                analysisId={7}
                inputFormat="sb3"
                locale="en"
            />,
        );

        expect(screen.queryByRole('heading', { name: 'Export program' })).not.toBeInTheDocument();
        expect(revoke).toHaveBeenCalledWith('blob:synthetic-export');
    });

    it('hides ineligible or unadvertised workflows and accepts dotless source formats', () => {
        const disabled = renderControls(false);
        expect(screen.queryByRole('heading', { name: 'Export program' })).not.toBeInTheDocument();
        disabled.unmount();
        const unsupported = renderControls(true, 'zip');
        expect(screen.queryByRole('heading', { name: 'Export program' })).not.toBeInTheDocument();
        unsupported.unmount();
        renderControls(true, 'mblock');
        expect(screen.getByRole('heading', { name: 'Export program' })).toBeInTheDocument();
    });

    it.each([
        ['en', 'Export program'],
        ['de', 'Programm exportieren'],
        ['es', 'Exportar programa'],
        ['nl', 'Programma exporteren'],
    ] as const)('renders the export workflow in the %s locale', async (locale, title) => {
        await i18n.changeLanguage(locale);
        renderControls();
        expect(screen.getByRole('heading', { name: title })).toBeInTheDocument();
    });

    it('keeps the export workflow out of the basic result and gates it in advanced analysis', async () => {
        // A Response body can be read once. Handing every call the same instance left whichever consumer got there
        // second with an unusable body, and the page it belonged to rendered its failure state instead of itself.
        const submissionResponse = () =>
            new Response(JSON.stringify(completedSubmission('mblock')), {
                status: 200,
                headers: { 'Content-Type': 'application/json' },
            });
        const fetchMock = vi
            .spyOn(globalThis, 'fetch')
            .mockImplementation(() => Promise.resolve(submissionResponse()));
        const view = render(
            <MemoryRouter initialEntries={['/submissions/synthetic-token']}>
                <SubmissionPage capabilityState={capabilityState(['program-export'])} />
            </MemoryRouter>,
        );
        await waitFor(() => expect(fetchMock).toHaveBeenCalled());
        // The page settles through more than one shape before the result is on screen, and while the analysis is
        // still running it carries a second-level heading of the same name. Holding on to the node the first query
        // returned meant asserting against one the page had already replaced, so the heading is looked up afresh
        // until the result's own first-level one is there.
        await waitFor(() =>
            expect(
                screen.getByRole('heading', { level: 1, name: 'Project analysis' }),
            ).toBeInTheDocument(),
        );
        expect(screen.queryByRole('heading', { name: 'Export program' })).not.toBeInTheDocument();
        view.unmount();

        vi.restoreAllMocks();
        vi.spyOn(globalThis, 'fetch').mockImplementation(() =>
            Promise.resolve(submissionResponse()),
        );
        render(
            <MemoryRouter
                initialEntries={[
                    {
                        pathname: '/advanced',
                        state: {
                            retainedAnalysis: {
                                submissionToken: 'synthetic-token',
                                analysisId: 7,
                            },
                        },
                    },
                ]}
            >
                <AdvancedAnalysisPage capabilityState={capabilityState(['program-export'])} />
            </MemoryRouter>,
        );
        expect(await screen.findByRole('heading', { name: 'Export program' })).toBeInTheDocument();
    });
});
