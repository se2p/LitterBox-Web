// SPDX-License-Identifier: EUPL-1.2
// SPDX-FileCopyrightText: 2026 LitterBox-Web contributors

import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { InjectionControls } from '../src/components/capabilities/injection/InjectionControls';
import {
    fetchInjectionArchive,
    fetchAllInjectionPreviews,
    fetchInjectionPreview,
    fetchInjectorCatalogue,
    InjectionApiError,
    MAX_INJECTION_ARCHIVE_BYTES,
} from '../src/api/injections';
import i18n from '../src/i18n';

vi.mock('../src/components/single-project/ScratchblocksPreview', () => ({
    ScratchblocksPreview: ({
        source,
        label,
    }: {
        source: string | null | undefined;
        label: string;
    }) => (
        <div data-testid="safe-scratchblocks">
            <span>{label}</span>
            <pre>{source}</pre>
        </div>
    ),
}));

const token = 'token/with spaces';
const analysisId = 7;

const injector = (injectorId: string, finderId = `finder-${injectorId}`) => ({
    injectorId,
    finderId,
    name: `Injector ${injectorId}`,
    description: `Educational description for ${injectorId}.`,
});

const injectorCatalogue = (
    injectors: unknown[],
    maxSelectedInjectors = 8,
    allSelectionSupported = true,
) => ({
    injectors,
    maxSelectedInjectors,
    allSelectionSupported,
});

const result = (injectorId: string, resultIndex = 0) => ({
    injectorId,
    finderId: `finder-${injectorId}`,
    resultIndex,
    spriteName: 'Synthetic sprite',
    originalScriptId: `original-${injectorId}-${resultIndex}`,
    mutatedScriptId: `mutated-${injectorId}-${resultIndex}`,
    originalScratchblocks: 'when green flag clicked\nsay [original]',
    mutatedScratchblocks: 'when green flag clicked\nsay [mutated]',
});

const preview = (
    results = [result('injector-a')],
    failures: { injectorId: string; finderId: string; code: string }[] = [],
) => ({
    schemaVersion: 1,
    source: { analysisId, name: 'synthetic-original.sb3' },
    results,
    failures,
});

const jsonResponse = (value: unknown, status = 200) =>
    new Response(JSON.stringify(value), {
        status,
        headers: { 'Content-Type': 'application/json' },
    });

const archiveResponse = (
    body = 'synthetic zip bytes',
    inputFormat: 'sb3' | 'mblock' = 'sb3',
    headers: Record<string, string | undefined> = {},
) => {
    const filename = inputFormat === 'sb3' ? 'litterbox-derived.sb3' : 'litterbox-derived.mblock';
    const bytes = new TextEncoder().encode(body).byteLength;
    const mergedHeaders: Record<string, string> = {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Content-Length': String(bytes),
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
    };
    for (const [name, value] of Object.entries(headers)) {
        if (value === undefined) delete mergedHeaders[name];
        else mergedHeaders[name] = value;
    }
    return new Response(body, {
        status: 200,
        headers: mergedHeaders,
    });
};

const renderControls = (inputFormat: string | null = 'sb3') =>
    render(
        <InjectionControls
            enabled
            token={token}
            analysisId={analysisId}
            analysisStatus="completed"
            inputFormat={inputFormat}
            locale="en"
        />,
    );

describe('injection API wrapper', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('reads the bounded injector catalogue contract', async () => {
        const catalogue = {
            injectors: [injector('injector-a'), injector('injector-b')],
            maxSelectedInjectors: 8,
            allSelectionSupported: true,
        };
        const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse(catalogue));
        const signal = new AbortController().signal;

        await expect(fetchInjectorCatalogue(token, analysisId, 'en', signal)).resolves.toEqual(
            catalogue,
        );
        expect(fetchMock).toHaveBeenCalledWith(
            '/litterbox/api/v1/submissions/token%2Fwith%20spaces/analyses/7/injector-catalogue?locale=en',
            {
                headers: {
                    Accept: 'application/json',
                    Authorization: `Bearer ${token}`,
                },
                signal,
            },
        );
    });

    it('sends one and multiple preview selections in deliberate order', async () => {
        const fetchMock = vi
            .spyOn(globalThis, 'fetch')
            .mockResolvedValueOnce(jsonResponse(preview([result('injector-a')])))
            .mockResolvedValueOnce(
                jsonResponse(preview([result('injector-b'), result('injector-a', 1)])),
            );
        await fetchInjectionPreview(token, analysisId, ['injector-a']);
        await fetchInjectionPreview(token, analysisId, ['injector-b', 'injector-a']);
        expect(fetchMock).toHaveBeenNthCalledWith(
            1,
            '/litterbox/api/v1/submissions/token%2Fwith%20spaces/analyses/7/injections',
            expect.objectContaining({
                method: 'POST',
                headers: {
                    Accept: 'application/json',
                    Authorization: `Bearer ${token}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ injectorIds: ['injector-a'] }),
            }),
        );
        expect(fetchMock).toHaveBeenNthCalledWith(
            2,
            '/litterbox/api/v1/submissions/token%2Fwith%20spaces/analyses/7/injections',
            expect.objectContaining({
                body: JSON.stringify({ injectorIds: ['injector-b', 'injector-a'] }),
            }),
        );
    });

    it('requests atomic server-side selection for the complete known catalogue', async () => {
        const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
            jsonResponse(
                preview(
                    [result('injector-a')],
                    [
                        {
                            injectorId: 'injector-b',
                            finderId: 'finder-injector-b',
                            code: 'no_applicable_mutation',
                        },
                    ],
                ),
            ),
        );

        await fetchAllInjectionPreviews(token, analysisId, ['injector-a', 'injector-b']);

        expect(fetchMock).toHaveBeenCalledWith(
            '/litterbox/api/v1/submissions/token%2Fwith%20spaces/analyses/7/injections',
            expect.objectContaining({
                method: 'POST',
                body: JSON.stringify({ injectorIds: [], all: true }),
            }),
        );
    });

    it('rejects malformed catalogue limits and invalid complete-catalogue selections', async () => {
        const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
            jsonResponse({
                injectors: [injector('injector-a')],
                maxSelectedInjectors: 9,
                allSelectionSupported: true,
            }),
        );
        await expect(fetchInjectorCatalogue(token, analysisId, 'en')).rejects.toMatchObject({
            category: 'malformed_response',
        });

        fetchMock.mockClear();
        await expect(fetchAllInjectionPreviews(token, analysisId, [])).rejects.toMatchObject({
            category: 'invalid_request',
        });
        await expect(
            fetchAllInjectionPreviews(token, analysisId, ['injector-a', 'injector-a']),
        ).rejects.toMatchObject({ category: 'invalid_request' });
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it('rejects duplicate, excessive, and invalid selections before fetch', async () => {
        const fetchMock = vi.spyOn(globalThis, 'fetch');
        const excessive = Array.from({ length: 9 }, (_, index) => `injector-${index}`);
        for (const selection of [
            [],
            ['injector-a', 'injector-a'],
            [' '],
            ['x'.repeat(129)],
            excessive,
        ]) {
            await expect(fetchInjectionPreview(token, analysisId, selection)).rejects.toMatchObject(
                {
                    category: 'invalid_request',
                },
            );
        }
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it('validates bounded preview data, known failure codes, and rejects unknown fields', async () => {
        const fetchMock = vi.spyOn(globalThis, 'fetch');
        fetchMock.mockResolvedValueOnce(
            jsonResponse(
                preview(
                    [result('injector-a')],
                    [
                        { injectorId: 'injector-b', finderId: 'finder-b', code: 'injector_failed' },
                        {
                            injectorId: 'injector-a',
                            finderId: 'finder-a',
                            code: 'no_applicable_mutation',
                        },
                        {
                            injectorId: 'injector-b',
                            finderId: 'finder-b',
                            code: 'injector_unavailable',
                        },
                    ],
                ),
            ),
        );
        const value = await fetchInjectionPreview(token, analysisId, ['injector-a', 'injector-b']);
        expect(value.results[0]?.resultIndex).toBe(0);
        expect(value.failures.map((failure) => failure.code)).toEqual([
            'injector_failed',
            'no_applicable_mutation',
            'injector_unavailable',
        ]);

        fetchMock.mockResolvedValueOnce(
            jsonResponse({ ...preview(), unexpected: 'implementation detail' }),
        );
        await expect(
            fetchInjectionPreview(token, analysisId, ['injector-a']),
        ).rejects.toMatchObject({
            category: 'malformed_response',
        });

        fetchMock.mockResolvedValueOnce(jsonResponse({ ...preview(), schemaVersion: 2 }));
        await expect(
            fetchInjectionPreview(token, analysisId, ['injector-a']),
        ).rejects.toMatchObject({
            category: 'malformed_response',
        });
    });

    it('keeps a mutation that renamed no script, and names the ceiling it was a preview too large for', async () => {
        const fetchMock = vi.spyOn(globalThis, 'fetch');
        // Several injectors rewrite a script where it stands, so the answer carries no new name for it. Insisting
        // on one threw away the other seventy-odd mutations that came back in the same answer.
        fetchMock.mockResolvedValueOnce(
            jsonResponse(
                preview([
                    { ...result('injector-a'), mutatedScriptId: '' },
                    { ...result('injector-a', 1), originalScriptId: '' },
                ]),
            ),
        );
        const value = await fetchInjectionPreview(token, analysisId, ['injector-a']);
        expect(value.results.map((entry) => entry.mutatedScriptId)).toEqual([
            '',
            'mutated-injector-a-1',
        ]);

        // Too much to show and unreadable are different complaints, and only the first tells a reader what to do.
        fetchMock.mockResolvedValueOnce(
            jsonResponse(
                preview(
                    Array.from({ length: 201 }, (_, index) => result('injector-a', index)),
                    [],
                ),
            ),
        );
        await expect(
            fetchInjectionPreview(token, analysisId, ['injector-a']),
        ).rejects.toMatchObject({
            category: 'response_too_large',
        });
    });

    it('rejects successful JSON with an unexpected status or media type', async () => {
        const fetchMock = vi.spyOn(globalThis, 'fetch');
        fetchMock.mockResolvedValueOnce(
            new Response(JSON.stringify([injector('injector-a')]), {
                status: 200,
                headers: { 'Content-Type': 'text/plain' },
            }),
        );
        await expect(fetchInjectorCatalogue(token, analysisId, 'en')).rejects.toMatchObject({
            category: 'malformed_response',
        });

        fetchMock.mockResolvedValueOnce(
            new Response(JSON.stringify([injector('injector-a')]), {
                status: 201,
                headers: { 'Content-Type': 'application/json' },
            }),
        );
        await expect(fetchInjectorCatalogue(token, analysisId, 'en')).rejects.toMatchObject({
            category: 'malformed_response',
        });
    });

    it('sends the exact download contract and validates the archive bytes', async () => {
        const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(archiveResponse());
        const value = await fetchInjectionArchive(token, analysisId, 'sb3', {
            injectorId: 'injector-a',
            resultIndex: 0,
        });
        expect(fetchMock).toHaveBeenCalledWith(
            '/litterbox/api/v1/submissions/token%2Fwith%20spaces/analyses/7/injections/download',
            expect.objectContaining({
                method: 'POST',
                headers: {
                    Accept: 'application/zip',
                    Authorization: `Bearer ${token}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ injectorId: 'injector-a', resultIndex: 0 }),
            }),
        );
        expect(value.filename).toBe('litterbox-derived.sb3');
        expect(value.byteLength).toBe(new TextEncoder().encode('synthetic zip bytes').byteLength);
        expect(value.blob.size).toBe(value.byteLength);
    });

    it.each([
        ['missing content type', { 'Content-Type': undefined }],
        ['wrong content type', { 'Content-Type': 'application/octet-stream' }],
        ['dishonest length', { 'Content-Length': '1' }],
    ] as const)('rejects %s archive metadata', async (_label, header) => {
        vi.spyOn(globalThis, 'fetch').mockResolvedValue(
            archiveResponse('synthetic', 'sb3', header),
        );
        await expect(
            fetchInjectionArchive(token, analysisId, 'sb3', {
                injectorId: 'injector-a',
                resultIndex: 0,
            }),
        ).rejects.toMatchObject({ category: 'malformed_response' });
    });

    it('accepts a Content-Length that reflects a compressed body when Content-Encoding is set', async () => {
        // A proxy compressing this zip response makes Content-Length describe the compressed bytes on the wire,
        // while fetch hands back the decoded ones; that mismatch is exactly what "dishonest length" above rejects
        // whenever Content-Encoding is absent, so the same header pair must be accepted once it is present.
        vi.spyOn(globalThis, 'fetch').mockResolvedValue(
            archiveResponse('synthetic', 'sb3', {
                'Content-Length': '1',
                'Content-Encoding': 'gzip',
            }),
        );
        const value = await fetchInjectionArchive(token, analysisId, 'sb3', {
            injectorId: 'injector-a',
            resultIndex: 0,
        });
        expect(value.byteLength).toBe(new TextEncoder().encode('synthetic').byteLength);
    });

    it('accepts an archive response with no Content-Length, Content-Disposition, or caching headers at all', async () => {
        vi.spyOn(globalThis, 'fetch').mockResolvedValue(
            archiveResponse('synthetic', 'sb3', {
                'Content-Length': undefined,
                'Content-Disposition': undefined,
                'Cache-Control': undefined,
                'X-Content-Type-Options': undefined,
            }),
        );
        const value = await fetchInjectionArchive(token, analysisId, 'sb3', {
            injectorId: 'injector-a',
            resultIndex: 0,
        });
        expect(value.byteLength).toBe(new TextEncoder().encode('synthetic').byteLength);
    });

    it('enforces the streamed byte ceiling independently of Content-Length', async () => {
        const stream = new ReadableStream<Uint8Array>({
            start(controller) {
                controller.enqueue(new Uint8Array(MAX_INJECTION_ARCHIVE_BYTES + 1));
                controller.close();
            },
        });
        vi.spyOn(globalThis, 'fetch').mockResolvedValue(
            new Response(stream, {
                status: 200,
                headers: {
                    'Content-Type': 'application/zip',
                    'Content-Disposition': 'attachment; filename="litterbox-derived.sb3"',
                    'Content-Length': '1',
                    'Cache-Control': 'no-store',
                    'X-Content-Type-Options': 'nosniff',
                },
            }),
        );
        await expect(
            fetchInjectionArchive(token, analysisId, 'sb3', {
                injectorId: 'injector-a',
                resultIndex: 0,
            }),
        ).rejects.toMatchObject({ category: 'response_too_large' });
    });

    it('maps bounded problem codes and never exposes server detail', async () => {
        const fetchMock = vi.spyOn(globalThis, 'fetch');
        fetchMock.mockResolvedValue(
            new Response(
                JSON.stringify({ code: 'capability_unavailable', detail: 'secret server detail' }),
                { status: 503, headers: { 'Content-Type': 'application/problem+json' } },
            ),
        );
        let error: unknown;
        try {
            await fetchInjectorCatalogue(token, analysisId, 'en');
        } catch (reason) {
            error = reason;
        }
        expect(error).toBeInstanceOf(InjectionApiError);
        expect(error).toMatchObject({ category: 'capability_unavailable', status: 503 });
        expect((error as Error).message).not.toContain('secret');

        fetchMock.mockRejectedValueOnce(new Error('secret network detail'));
        await expect(fetchInjectorCatalogue(token, analysisId, 'en')).rejects.toMatchObject({
            category: 'network_failure',
        });
    });
});

describe('injection controls', () => {
    beforeEach(async () => {
        await i18n.changeLanguage('en');
        vi.restoreAllMocks();
        // Only the two object-URL methods, never the whole class: replacing `URL` wholesale also takes away the
        // constructor, and the bundler resolves the locale packs' dynamic imports through it, so the German,
        // Spanish and Dutch packs never arrived. jsdom implements neither method, so they have to exist first.
        URL.createObjectURL ??= () => '';
        URL.revokeObjectURL ??= () => undefined;
        vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:synthetic-derived');
        vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
    });

    afterEach(() => {
        cleanup();
        vi.unstubAllGlobals();
    });

    it('loads injectors but does not preview or download until each explicit action', async () => {
        const user = userEvent.setup();
        const fetchMock = vi
            .spyOn(globalThis, 'fetch')
            .mockResolvedValueOnce(
                jsonResponse(injectorCatalogue([injector('injector-a'), injector('injector-b')])),
            )
            .mockResolvedValueOnce(jsonResponse(preview([result('injector-a')])))
            .mockResolvedValueOnce(archiveResponse());
        const anchorClick = vi
            .spyOn(HTMLAnchorElement.prototype, 'click')
            .mockImplementation(() => {});
        renderControls();
        await screen.findByText('Injector injector-a');
        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect(screen.queryByRole('button', { name: 'Download this project' })).toBeNull();

        await user.click(screen.getByRole('checkbox', { name: /Injector injector-a/ }));
        await user.click(screen.getByRole('button', { name: 'Request mutation previews' }));
        await screen.findByRole('heading', { name: 'Mutation previews ready' });
        expect(fetchMock).toHaveBeenCalledTimes(2);
        expect(JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body))).toEqual({
            injectorIds: ['injector-a'],
        });
        expect(anchorClick).not.toHaveBeenCalled();

        // Saving a mutation is one press on the mutation, not a selection, a tick box and two more buttons.
        await user.click(screen.getByRole('button', { name: 'Download this project' }));
        await screen.findByRole('heading', { name: 'Saved to your downloads' });
        expect(fetchMock).toHaveBeenCalledTimes(3);
        expect(String(fetchMock.mock.calls[2]?.[0])).toContain('/injections/download');
        expect(JSON.parse(String(fetchMock.mock.calls[2]?.[1]?.body))).toEqual({
            injectorId: 'injector-a',
            resultIndex: 0,
        });
        expect(anchorClick).toHaveBeenCalledTimes(1);
    });

    it('offers every mutation as one archive without asking for them one at a time', async () => {
        const user = userEvent.setup();
        const bundle = () =>
            new Response('synthetic bundle bytes', {
                status: 200,
                headers: {
                    'Content-Type': 'application/zip',
                    'Content-Disposition': 'attachment; filename="litterbox-derived-all.zip"',
                    'Content-Length': String(
                        new TextEncoder().encode('synthetic bundle bytes').byteLength,
                    ),
                    'Cache-Control': 'no-store',
                    'X-Content-Type-Options': 'nosniff',
                },
            });
        const fetchMock = vi
            .spyOn(globalThis, 'fetch')
            .mockResolvedValueOnce(
                jsonResponse(injectorCatalogue([injector('injector-a'), injector('injector-b')])),
            )
            .mockResolvedValueOnce(
                jsonResponse(
                    preview([result('injector-a'), result('injector-a', 1), result('injector-b')]),
                ),
            )
            .mockResolvedValueOnce(bundle());
        const anchorClick = vi
            .spyOn(HTMLAnchorElement.prototype, 'click')
            .mockImplementation(() => {});

        renderControls();
        // The button says what it is about to do: the jump from a hand-picked few to the whole catalogue.
        await screen.findByRole('button', { name: 'Select all 2' });
        await user.click(screen.getByRole('button', { name: 'Select all 2' }));
        await user.click(screen.getByRole('button', { name: 'Request mutation previews' }));
        await screen.findByRole('heading', { name: 'Mutation previews ready' });

        await user.click(screen.getByRole('button', { name: 'Download all 3 projects' }));
        await screen.findByRole('heading', { name: 'Saved to your downloads' });
        expect(String(fetchMock.mock.calls[2]?.[0])).toContain('/injections/download-all');
        // Whatever the previews were asked for is what the archive is asked for, so the two agree.
        expect(JSON.parse(String(fetchMock.mock.calls[2]?.[1]?.body))).toEqual({
            injectorIds: [],
            all: true,
        });
        expect(anchorClick).toHaveBeenCalledTimes(1);
        expect(screen.getByText('litterbox-derived-all.zip')).toBeInTheDocument();
    });

    it('uses the advertised explicit limit and rejects an additional injector without truncating', async () => {
        const user = userEvent.setup();
        const fetchMock = vi
            .spyOn(globalThis, 'fetch')
            .mockResolvedValueOnce(
                jsonResponse(
                    injectorCatalogue(
                        [injector('one'), injector('two'), injector('three'), injector('four')],
                        3,
                    ),
                ),
            )
            .mockResolvedValueOnce(jsonResponse(preview([result('one'), result('two')])));

        renderControls();
        await screen.findByRole('checkbox', { name: 'Injector one' });
        for (const id of ['one', 'two', 'three'])
            await user.click(screen.getByRole('checkbox', { name: `Injector ${id}` }));

        expect(document.querySelector('.injection-catalogue-status')).toHaveTextContent(
            '3 of 3 chosen. Showing 4 of 4 injectors.',
        );
        await user.click(screen.getByRole('checkbox', { name: 'Injector four' }));
        expect(screen.getByRole('checkbox', { name: 'Injector four' })).not.toBeChecked();
        expect(
            screen.getByText('Selection rejected. Custom subsets allow at most 3 injectors.'),
        ).toBeInTheDocument();

        await user.click(screen.getByRole('button', { name: 'Request mutation previews' }));
        await screen.findByRole('heading', { name: 'Mutation previews ready' });
        expect(JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body))).toEqual({
            injectorIds: ['one', 'two', 'three'],
        });
    });

    it('selects the complete catalogue atomically, keeps it through search, and exits bulk mode explicitly', async () => {
        const user = userEvent.setup();
        const injectors = Array.from({ length: 10 }, (_, index) => injector(`injector-${index}`));
        const fetchMock = vi
            .spyOn(globalThis, 'fetch')
            .mockResolvedValueOnce(jsonResponse(injectorCatalogue(injectors, 8, true)))
            .mockResolvedValueOnce(jsonResponse(preview([result('injector-0')])));

        renderControls();
        await screen.findByRole('button', { name: 'Select all 10' });
        await user.click(screen.getByRole('button', { name: 'Select all 10' }));
        expect(screen.getByText(/All 10 injectors are chosen/)).toBeVisible();
        // With everything chosen, clearing the selection and choosing a subset were the same act under two names.
        expect(screen.getByRole('button', { name: 'Choose custom subset' })).toBeVisible();
        expect(screen.queryByRole('button', { name: 'Clear selection' })).not.toBeInTheDocument();
        expect(
            screen
                .getAllByRole('checkbox')
                .every((checkbox) => (checkbox as HTMLInputElement).checked),
        ).toBe(true);

        const search = screen.getByRole('searchbox', { name: 'Search injectors' });
        await user.type(search, 'injector-9');
        expect(screen.getAllByRole('checkbox')).toHaveLength(1);
        expect(screen.getByRole('checkbox', { name: 'Injector injector-9' })).toBeChecked();
        expect(document.querySelector('.injection-catalogue-status')).toHaveTextContent(
            'All 10 injectors are chosen. Search only changes what is shown.',
        );

        await user.click(screen.getByRole('button', { name: 'Request mutation previews' }));
        await screen.findByRole('heading', { name: 'Mutation previews ready' });
        expect(JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body))).toEqual({
            injectorIds: [],
            all: true,
        });

        await user.click(screen.getByRole('button', { name: 'Choose custom subset' }));
        expect(document.querySelector('.injection-catalogue-status')).toHaveTextContent(
            '0 of 8 chosen. Showing 1 of 10 injectors.',
        );
        expect(screen.getAllByRole('checkbox')).toHaveLength(1);
        expect(screen.getByRole('checkbox', { name: 'Injector injector-9' })).not.toBeChecked();
        await user.click(screen.getByRole('checkbox', { name: 'Injector injector-9' }));
        expect(screen.getByRole('checkbox', { name: 'Injector injector-9' })).toBeChecked();
    });

    it('offers visible explicit selection only within the advertised limit', async () => {
        const user = userEvent.setup();
        const injectors = Array.from({ length: 12 }, (_, index) => injector(`injector-${index}`));
        vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
            jsonResponse(injectorCatalogue(injectors, 3, true)),
        );

        renderControls();
        await screen.findByRole('searchbox', { name: 'Search injectors' });
        const search = screen.getByRole('searchbox', { name: 'Search injectors' });
        await user.type(search, 'injector-0');
        expect(screen.getByRole('button', { name: 'Select all visible' })).toBeEnabled();
        await user.click(screen.getByRole('button', { name: 'Select all visible' }));
        expect(screen.getByRole('checkbox', { name: 'Injector injector-0' })).toBeChecked();

        await user.clear(search);
        await user.type(search, 'injector-11');
        await user.click(screen.getByRole('button', { name: 'Select all visible' }));
        expect(screen.getByRole('checkbox', { name: 'Injector injector-11' })).toBeChecked();
        await user.clear(search);
        await user.type(search, 'injector-1');
        expect(screen.getByRole('button', { name: 'Select all visible' })).toBeDisabled();
        expect(screen.getByText(/resulting selection would contain 4/)).toBeVisible();
        expect(screen.getByRole('checkbox', { name: 'Injector injector-0' })).toBeChecked();
        expect(screen.getByRole('checkbox', { name: 'Injector injector-11' })).toBeChecked();
    });

    it('does not expose complete-catalogue selection when the service does not support it', async () => {
        const user = userEvent.setup();
        const items = [injector('one'), injector('two'), injector('three')];
        vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
            jsonResponse(injectorCatalogue(items, 3, false)),
        );

        renderControls();
        await screen.findByRole('checkbox', { name: 'Injector one' });
        expect(screen.queryByRole('button', { name: /^Select all \d/ })).toBeNull();
        expect(screen.getByRole('button', { name: 'Select all visible' })).toBeVisible();
        await user.click(screen.getByRole('button', { name: 'Select all visible' }));
        expect(
            screen
                .getAllByRole('checkbox')
                .every((checkbox) => checkbox instanceof HTMLInputElement && checkbox.checked),
        ).toBe(true);
    });

    it('keeps a long catalogue compact and keyboard operable', async () => {
        const user = userEvent.setup();
        const injectors = Array.from({ length: 24 }, (_, index) =>
            injector(`injector-${index}`, `finder-${index}`),
        );
        vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
            jsonResponse(injectorCatalogue(injectors)),
        );

        renderControls();
        await screen.findByRole('searchbox', { name: 'Search injectors' });

        expect(screen.getAllByRole('checkbox')).toHaveLength(24);
        expect(screen.getAllByRole('button', { name: /^Explain Injector / })).toHaveLength(24);
        expect(screen.queryByText('Educational description for injector-0.')).toBeNull();

        const firstCheckbox = screen.getByRole('checkbox', { name: 'Injector injector-0' });
        firstCheckbox.focus();
        await user.keyboard(' ');
        expect(firstCheckbox).toBeChecked();

        const firstDisclosure = screen.getByRole('button', { name: 'Explain Injector injector-0' });
        firstDisclosure?.focus();
        await user.keyboard('{Enter}');
        expect(screen.getByText('Educational description for injector-0.')).toBeVisible();
    });

    it('searches names and safely normalized rich descriptions without changing selections', async () => {
        const user = userEvent.setup();
        const injectors = [
            {
                ...injector('name-match'),
                name: 'Distinctive localized name',
                description: 'A generic explanation.',
            },
            {
                ...injector('description-match'),
                name: 'Another injector',
                description: '[b]Rich mutation[/b] uses [sbi]move (10) steps[/sbi].',
            },
            injector('hidden-selection'),
        ];
        vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
            jsonResponse(injectorCatalogue(injectors)),
        );

        renderControls();
        await screen.findByRole('checkbox', { name: 'Distinctive localized name' });
        const selected = screen.getByRole('checkbox', { name: 'Injector hidden-selection' });
        await user.click(selected);

        const search = screen.getByRole('searchbox', { name: 'Search injectors' });
        await user.type(search, 'distinctive localized');
        expect(screen.getByRole('checkbox', { name: 'Distinctive localized name' })).toBeVisible();
        expect(screen.queryByRole('checkbox', { name: 'Another injector' })).toBeNull();
        expect(selected).toBeChecked();
        expect(document.querySelector('.injection-catalogue-status')).toHaveTextContent(
            '1 of 8 chosen. Showing 1 of 3 injectors.',
        );

        await user.clear(search);
        await user.type(search, 'move (10) steps');
        expect(screen.getByRole('checkbox', { name: 'Another injector' })).toBeVisible();
        expect(screen.queryByRole('checkbox', { name: 'Distinctive localized name' })).toBeNull();
        expect(selected).toBeChecked();
    });

    it('orders the catalogue by the name the reader sees, not by the English identifier', async () => {
        vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
            jsonResponse(
                injectorCatalogue([
                    { ...injector('a-first-id'), name: 'Zebra mutation' },
                    { ...injector('z-last-id'), name: 'Ähnlicher Fehler' },
                    { ...injector('m-middle-id'), name: 'Blockierendes Wenn-Sonst' },
                ]),
            ),
        );

        renderControls();
        await screen.findByRole('checkbox', { name: 'Zebra mutation' });

        expect(
            Array.from(
                document.querySelectorAll('.injection-injector-copy > span:first-child'),
            ).map((element) => element.textContent),
        ).toEqual(['Ähnlicher Fehler', 'Blockierendes Wenn-Sonst', 'Zebra mutation']);
    });

    it('reports visible, selected, and selected-but-filtered counts and clears selection', async () => {
        const user = userEvent.setup();
        vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
            jsonResponse(
                injectorCatalogue([injector('first'), injector('second'), injector('third')]),
            ),
        );

        renderControls();
        await screen.findByRole('checkbox', { name: 'Injector first' });
        await user.click(screen.getByRole('checkbox', { name: 'Injector second' }));
        const search = screen.getByRole('searchbox', { name: 'Search injectors' });
        await user.type(search, 'first');

        expect(document.querySelector('.injection-catalogue-status')).toHaveTextContent(
            '1 of 8 chosen. Showing 1 of 3 injectors. 1 selected injector does not match the current search.',
        );
        expect(
            screen.getByRole('heading', { name: 'Selected injectors outside this search' }),
        ).toBeVisible();
        expect(screen.getByRole('checkbox', { name: 'Injector second' })).toBeChecked();

        await user.click(screen.getByRole('button', { name: 'Clear selection' }));
        expect(screen.queryByRole('checkbox', { name: 'Injector second' })).toBeNull();
        expect(document.querySelector('.injection-catalogue-status')).toHaveTextContent(
            '0 of 8 chosen. Showing 1 of 3 injectors.',
        );
        expect(screen.getByRole('button', { name: 'Clear selection' })).toBeDisabled();
    });

    it('renders disclosed rich descriptions safely, including Scratchblocks and inert tags', async () => {
        const user = userEvent.setup();
        vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
            jsonResponse(
                injectorCatalogue([
                    {
                        ...injector('rich'),
                        description:
                            '[b]Bold explanation[/b][newLine][sbi]move (10) steps[/sbi] [unknown] readable <img src=x onerror=alert(1)>',
                    },
                ]),
            ),
        );

        renderControls();
        await screen.findByRole('checkbox', { name: 'Injector rich' });
        await user.click(screen.getByRole('button', { name: 'Explain Injector rich' }));

        expect(screen.getByText('Bold explanation')).toBeVisible();
        expect(document.querySelector('.injection-injector-description strong')).toHaveTextContent(
            'Bold explanation',
        );
        expect(screen.getByTestId('safe-scratchblocks')).toHaveTextContent('move (10) steps');
        expect(
            screen.getByText(/\[unknown\] readable <img src=x onerror=alert\(1\)>/),
        ).toBeVisible();
        expect(document.querySelector('img')).toBeNull();
        expect(document.querySelector('script')).toBeNull();
    });

    it('enforces the maximum selection before preview submission', async () => {
        const user = userEvent.setup();
        const fetchMock = vi
            .spyOn(globalThis, 'fetch')
            .mockResolvedValueOnce(
                jsonResponse(
                    injectorCatalogue(
                        Array.from({ length: 9 }, (_, index) => injector(`injector-${index}`)),
                    ),
                ),
            );
        renderControls();
        await screen.findByRole('checkbox', { name: 'Injector injector-0' });

        for (let index = 0; index < 8; index += 1)
            await user.click(screen.getByRole('checkbox', { name: `Injector injector-${index}` }));

        expect(
            screen
                .getAllByRole('checkbox')
                .filter((checkbox) => (checkbox as HTMLInputElement).checked),
        ).toHaveLength(8);
        const rejected = screen.getByRole('checkbox', { name: 'Injector injector-8' });
        expect(rejected).toBeEnabled();
        await user.click(rejected);
        expect(rejected).not.toBeChecked();
        expect(
            screen.getByText('Selection rejected. Custom subsets allow at most 8 injectors.'),
        ).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Request mutation previews' })).toBeEnabled();
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('keeps hostile metadata inert and renders both safe code previews', async () => {
        const hostile = {
            ...injector('injector-a', '<img src=x onerror=alert(1)>'),
            name: '<script>alert(1)</script>',
            description: '<b>hostile description</b>',
        };
        const hostileResult = {
            ...result('injector-a'),
            spriteName: '<img src=x>',
            originalScriptId: '<script>original</script>',
            mutatedScriptId: '<script>mutated</script>',
            originalScratchblocks: '<script>alert(1)</script>',
            mutatedScratchblocks: '[mutated] <img src=x>',
        };
        vi.spyOn(globalThis, 'fetch')
            .mockResolvedValueOnce(jsonResponse(injectorCatalogue([hostile])))
            .mockResolvedValueOnce(jsonResponse(preview([hostileResult])));
        const user = userEvent.setup();
        renderControls();
        await screen.findByText('<script>alert(1)</script>');
        await user.click(screen.getByRole('checkbox'));
        await user.click(screen.getByRole('button', { name: 'Request mutation previews' }));
        await screen.findByText('<script>original</script>');
        expect(document.querySelector('script')).toBeNull();
        expect(document.querySelector('img')).toBeNull();
        expect(screen.getAllByTestId('safe-scratchblocks')).toHaveLength(2);
    });

    it('picks out the block a mutation changed instead of leaving the reader to find it', async () => {
        const user = userEvent.setup();
        const changed = {
            ...result('injector-a'),
            originalScratchblocks: 'when green flag clicked\nsay [hello]\nmove (10) steps',
            mutatedScratchblocks: 'when green flag clicked\nsay [goodbye]\nmove (10) steps',
        };
        vi.spyOn(globalThis, 'fetch')
            .mockResolvedValueOnce(jsonResponse(injectorCatalogue([injector('injector-a')])))
            .mockResolvedValueOnce(jsonResponse(preview([changed])));
        renderControls();
        await screen.findByRole('checkbox');
        await user.click(screen.getByRole('checkbox'));
        await user.click(screen.getByRole('button', { name: 'Request mutation previews' }));
        await screen.findByRole('heading', { name: 'Mutation previews ready' });

        // The same colours LitterBox's own diff report paints a change in, so the two read alike.
        expect(document.querySelector('.script-diff-before pre')).toHaveTextContent(
            'say [hello] :: #dc3545',
        );
        expect(document.querySelector('.script-diff-after pre')).toHaveTextContent(
            'say [goodbye] :: #28a745',
        );
        // The blocks that survived the mutation are left in their own colours.
        expect(document.querySelector('.script-diff-after pre')).not.toHaveTextContent(
            'move (10) steps :: ',
        );
    });

    it('shows partial failures and a bounded no-applicable-result state', async () => {
        const user = userEvent.setup();
        const fetchMock = vi
            .spyOn(globalThis, 'fetch')
            .mockResolvedValueOnce(
                jsonResponse(injectorCatalogue([injector('injector-a'), injector('injector-b')])),
            )
            .mockResolvedValueOnce(
                jsonResponse(
                    preview(
                        [result('injector-a')],
                        [
                            {
                                injectorId: 'injector-b',
                                finderId: 'finder-injector-b',
                                code: 'injector_unavailable',
                            },
                        ],
                    ),
                ),
            );
        renderControls();
        await screen.findByText('Injector injector-a');
        await user.click(screen.getByRole('checkbox', { name: /Injector injector-a/ }));
        await user.click(screen.getByRole('checkbox', { name: /Injector injector-b/ }));
        await user.click(screen.getByRole('button', { name: 'Request mutation previews' }));
        await screen.findByText('Some selected injectors did not produce a result.');
        expect(screen.getByRole('alert')).toHaveTextContent('Injector unavailable');
        expect(screen.getAllByRole('button', { name: 'Download this project' })).toHaveLength(1);

        cleanup();
        fetchMock.mockReset();
        fetchMock
            .mockResolvedValueOnce(jsonResponse(injectorCatalogue([injector('injector-a')])))
            .mockResolvedValueOnce(
                jsonResponse(
                    preview(
                        [],
                        [
                            {
                                injectorId: 'injector-a',
                                finderId: 'finder-injector-a',
                                code: 'no_applicable_mutation',
                            },
                        ],
                    ),
                ),
            );
        renderControls();
        await screen.findByText('Injector injector-a');
        await user.click(screen.getByRole('checkbox', { name: /Injector injector-a/ }));
        await user.click(screen.getByRole('button', { name: 'Request mutation previews' }));
        await screen.findByText('No selected injector produced an applicable mutation.');
        expect(screen.getByText(/No injector had anything to change here/)).toBeVisible();
        expect(screen.queryByRole('button', { name: /^Download/ })).toBeNull();
    });

    it.each([
        ['capability disabled', false, 'completed', 'sb3'],
        ['not completed', true, 'processing', 'sb3'],
        ['invalid id', true, 'completed', 'sb3'],
        ['unsupported format', true, 'completed', 'zip'],
    ] as const)('does not render when %s', async (_label, enabled, status, inputFormat) => {
        const fetchMock = vi.spyOn(globalThis, 'fetch');
        render(
            <InjectionControls
                enabled={enabled}
                token={token}
                analysisId={_label === 'invalid id' ? 0 : analysisId}
                analysisStatus={status}
                inputFormat={inputFormat}
                locale="en"
            />,
        );
        await waitFor(() => expect(fetchMock).not.toHaveBeenCalled());
        expect(screen.queryByRole('heading', { name: 'Fault injection' })).toBeNull();
    });

    it.each(['de', 'en', 'es', 'nl'] as const)('renders the workflow in %s', async (locale) => {
        await i18n.changeLanguage(locale);
        vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(jsonResponse(injectorCatalogue([])));
        render(
            <InjectionControls
                enabled
                token={token}
                analysisId={analysisId}
                analysisStatus="completed"
                inputFormat=".mblock"
                locale={locale}
            />,
        );
        await screen.findByRole('heading', {
            name: {
                de: 'Fehlerinjektion',
                en: 'Fault injection',
                es: 'Inyección de fallos',
                nl: 'Foutinjectie',
            }[locale],
        });
        // The heading is already there while the catalogue is still loading, so waiting for it says nothing about
        // whether the answer has arrived; the empty state has to be waited for on its own account.
        expect(
            await screen.findByText(
                {
                    de: 'Für diese Analyse sind keine Fehlerinjektoren verfügbar.',
                    en: 'No fault injectors are available for this analysis.',
                    es: 'No hay inyectores de fallos disponibles para este análisis.',
                    nl: 'Er zijn geen foutinjectoren beschikbaar voor deze analyse.',
                }[locale],
            ),
        ).toBeVisible();
    });

    it('revokes a prepared object URL when the selection changes and on unmount', async () => {
        const user = userEvent.setup();
        const revokeObjectURL = vi.fn();
        vi.stubGlobal('URL', {
            createObjectURL: vi.fn(() => 'blob:synthetic-derived'),
            revokeObjectURL,
        });
        // These tests are about the object URL being released, not about the download itself. Left to run, the
        // anchor asks jsdom to navigate and jsdom writes an error nobody is meant to act on, which buries the
        // ones that matter.
        vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
        vi.spyOn(globalThis, 'fetch')
            .mockResolvedValueOnce(
                jsonResponse(injectorCatalogue([injector('injector-a'), injector('injector-b')])),
            )
            .mockResolvedValueOnce(jsonResponse(preview()))
            .mockResolvedValueOnce(archiveResponse());
        const view = renderControls();
        await screen.findByText('Injector injector-a');
        await user.click(screen.getByRole('checkbox', { name: /Injector injector-a/ }));
        await user.click(screen.getByRole('button', { name: 'Request mutation previews' }));
        await screen.findByRole('heading', { name: 'Mutation previews ready' });
        await user.click(screen.getByRole('button', { name: 'Download this project' }));
        await screen.findByRole('heading', { name: 'Saved to your downloads' });
        await user.click(screen.getByRole('checkbox', { name: /Injector injector-b/ }));
        expect(revokeObjectURL).toHaveBeenCalledWith('blob:synthetic-derived');
        view.unmount();
        expect(revokeObjectURL).toHaveBeenCalledWith('blob:synthetic-derived');
    });

    it('revokes a prepared object URL when eligibility is withdrawn', async () => {
        const user = userEvent.setup();
        const revokeObjectURL = vi.fn();
        vi.stubGlobal('URL', {
            createObjectURL: vi.fn(() => 'blob:synthetic-derived'),
            revokeObjectURL,
        });
        // These tests are about the object URL being released, not about the download itself. Left to run, the
        // anchor asks jsdom to navigate and jsdom writes an error nobody is meant to act on, which buries the
        // ones that matter.
        vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
        vi.spyOn(globalThis, 'fetch')
            .mockResolvedValueOnce(jsonResponse(injectorCatalogue([injector('injector-a')])))
            .mockResolvedValueOnce(jsonResponse(preview()))
            .mockResolvedValueOnce(archiveResponse());
        const view = renderControls();
        await screen.findByText('Injector injector-a');
        await user.click(screen.getByRole('checkbox', { name: /Injector injector-a/ }));
        await user.click(screen.getByRole('button', { name: 'Request mutation previews' }));
        await screen.findByRole('heading', { name: 'Mutation previews ready' });
        await user.click(screen.getByRole('button', { name: 'Download this project' }));
        await screen.findByRole('heading', { name: 'Saved to your downloads' });

        view.rerender(
            <InjectionControls
                enabled={false}
                token={token}
                analysisId={analysisId}
                analysisStatus="completed"
                inputFormat="sb3"
                locale="en"
            />,
        );

        expect(screen.queryByRole('heading', { name: 'Fault injection' })).toBeNull();
        expect(revokeObjectURL).toHaveBeenCalledWith('blob:synthetic-derived');
    });
});
