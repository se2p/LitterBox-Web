// SPDX-License-Identifier: EUPL-1.2
// SPDX-FileCopyrightText: 2026 LitterBox-Web contributors

import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../src/App';
import { MetricsGraphControls } from '../src/components/capabilities/metrics/MetricsGraphControls';
import { MetricSummary } from '../src/components/capabilities/metrics/MetricSummary';
import {
    bandFor,
    metricEntries,
    overviewEntries,
    searchMetrics,
    tercile,
} from '../src/components/capabilities/metrics/metric-utils';
import { GRAPH_MEDIA_TYPE } from '../src/api/graphs';
import i18n from '../src/i18n';

vi.mock('../src/lib/dynamic-libraries', () => ({
    loadGraphviz: vi.fn(),
}));

import { loadGraphviz } from '../src/lib/dynamic-libraries';

const response = (body: unknown, status = 200, headers?: Record<string, string>) =>
    new Response(body === undefined ? null : JSON.stringify(body), {
        status,
        headers: headers ?? { 'Content-Type': 'application/json' },
    });

const graphResponse = (body = 'digraph { a -> b }', nodes = '2', edges = '1') =>
    new Response(body, {
        status: 200,
        headers: {
            'Content-Type': GRAPH_MEDIA_TYPE,
            'X-LitterBox-Graph-Nodes': nodes,
            'X-LitterBox-Graph-Edges': edges,
        },
    });

const submissionPayload = (status: string, inputFormat?: string) => ({
    schemaVersion: 1,
    submissionId: 1,
    token: 'synthetic-token',
    status,
    locale: 'en',
    sourceType: 'UPLOAD',
    analysis:
        status === 'completed'
            ? {
                  id: 7,
                  status: 'completed',
                  inputFormat,
                  metrics: { block_count: 12 },
                  issues: [],
                  relationships: [],
                  catalogue: [],
                  quiz: [],
                  assetRefs: [],
              }
            : null,
    analyses: [],
    counts: { expected: 1, completed: status === 'completed' ? 1 : 0, failed: 0 },
});

const renderSubmission = (features: readonly string[], status: string, inputFormat?: string) => {
    vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
        if (String(input).includes('/capabilities')) {
            return Promise.resolve(
                response({
                    schemaVersion: 1,
                    litterboxVersion: 'synthetic',
                    supportedLocales: ['de', 'en', 'es', 'nl'],
                    enabledFeatures: features,
                }),
            );
        }
        return Promise.resolve(response(submissionPayload(status, inputFormat)));
    });
    return render(
        <MemoryRouter initialEntries={['/submissions/synthetic-token']}>
            <App />
        </MemoryRouter>,
    );
};

describe('persisted metric summary', () => {
    beforeEach(async () => {
        await i18n.changeLanguage('en');
        vi.restoreAllMocks();
    });

    it('orders every finite metric by its own identifier', () => {
        const summary = metricEntries(
            {
                unknown_metric: 4,
                statement_count: 2,
                block_count: 12,
                not_finite: Number.NaN,
                infinite: Number.POSITIVE_INFINITY,
                script_count: 3,
            },
            (key: string) => key,
        );
        // One flat list. Which group a measurement belongs to is not something the report says, and the regular
        // expressions that used to decide it filed ct_score under "learning".
        expect(summary.entries.map((entry) => entry.id)).toEqual([
            'block_count',
            'script_count',
            'statement_count',
            'unknown_metric',
        ]);
        expect(summary.invalidCount).toBe(2);
    });

    it('keeps absent and empty metric states distinct', () => {
        expect(metricEntries(undefined, (key: string) => key)).toMatchObject({ hasInput: false });
        expect(metricEntries({}, (key: string) => key)).toMatchObject({
            hasInput: true,
            invalidCount: 0,
        });
    });

    it('counts a measurement once when the report carries two of its names', () => {
        const summary = metricEntries({ block_count: 12, blocks: 12 }, (key: string) => key);
        const overview = overviewEntries(summary.entries, (key: string) => key);

        expect(overview.map((entry) => entry.id)).toEqual(['block_count']);
    });

    it('matches a value to its distribution under either of the names it goes by', () => {
        const [entry] = metricEntries({ blocks: 95 }, (key: string) => key).entries;
        const reference = [
            { name: 'block_count', sampleSize: 512, lowerBound: 20, upperBound: 90 },
        ];

        expect(bandFor(entry!, reference)?.name).toBe('block_count');
        expect(tercile(95, reference[0]!)).toBe('upper');
        // The bounds are the edges of the middle third, so a value on either of them is inside it.
        expect(tercile(20, reference[0]!)).toBe('middle');
        expect(tercile(90, reference[0]!)).toBe('middle');
        expect(tercile(19, reference[0]!)).toBe('lower');
    });

    it('searches the raw identifier as well as the label', () => {
        const { entries } = metricEntries({ block_count: 1, sprite_count: 2 }, (key: string) =>
            key === 'metricBlocks' ? 'Blocks' : key,
        );

        expect(searchMetrics(entries, 'sprite_').map((entry) => entry.id)).toEqual([
            'sprite_count',
        ]);
        expect(searchMetrics(entries, 'blocks').map((entry) => entry.id)).toEqual(['block_count']);
        expect(searchMetrics(entries, '  ').map((entry) => entry.id)).toHaveLength(2);
    });

    it('uses translated labels and locale-aware number formatting', async () => {
        await i18n.changeLanguage('de');
        vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('synthetic'));
        render(<MetricSummary locale="de" metrics={{ block_count: 1234.5 }} />);
        expect(screen.getAllByText('Blöcke').length).toBeGreaterThan(0);
        expect(screen.getAllByText('1.234,5').length).toBeGreaterThan(0);
        // The reference lookup settles after the assertions whether or not they care about it. Left to land on its
        // own it writes an act(...) warning into the run, which is noise about the test rather than the component.
        await act(async () => {
            await Promise.resolve();
        });
    });

    it('keeps the raw identifier reachable and tells an empty search from an empty analysis', async () => {
        const user = userEvent.setup();
        vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('synthetic'));
        render(<MetricSummary locale="en" metrics={{ block_count: 12, halstead_volume: 3 }} />);

        expect(screen.getByText('halstead_volume')).toBeInTheDocument();
        await user.type(screen.getByLabelText('Search measurements'), 'zzz');
        expect(screen.getByText('No measurement matches “zzz”.')).toBeInTheDocument();
        expect(screen.queryByText('This analysis reported no metrics.')).not.toBeInTheDocument();
    });
});

describe('on-demand graph controls', () => {
    beforeEach(async () => {
        await i18n.changeLanguage('en');
        vi.restoreAllMocks();
        vi.mocked(loadGraphviz).mockResolvedValue({
            instance: async () => ({
                renderString: () =>
                    '<svg xmlns="http://www.w3.org/2000/svg"><g><text x="1" y="2">safe</text></g></svg>',
            }),
        } as never);
    });

    it('does not load Graphviz during ordinary control rendering and offers all eight choices', () => {
        render(<MetricsGraphControls enabled token="synthetic-token" analysisId={7} locale="en" />);
        expect(loadGraphviz).not.toHaveBeenCalled();
        expect(
            screen.getByRole('combobox', { name: 'Graph type' }).querySelectorAll('option'),
        ).toHaveLength(8);
    });

    it('makes exactly one request for an explicit action and focuses the completion status', async () => {
        const user = userEvent.setup();
        const fetchMock = vi
            .spyOn(globalThis, 'fetch')
            .mockImplementation(() => Promise.resolve(graphResponse()));
        render(<MetricsGraphControls enabled token="synthetic-token" analysisId={7} locale="en" />);

        await user.click(screen.getByRole('button', { name: 'Render selected graph' }));
        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect(await screen.findByText('AST is ready.')).toBeInTheDocument();
        expect(screen.getByText('Nodes: 2 · Edges: 1')).toBeInTheDocument();
        // The drawing announces itself to anyone who can see it, so the sentence saying so is spoken only.
        expect(screen.getByText('AST is ready.')).toHaveClass('visually-hidden');
        // Focus is moved by an effect, which runs after the heading it moves to has been painted.
        await waitFor(() =>
            expect(screen.getByRole('heading', { name: 'AST result' })).toHaveFocus(),
        );
        expect(loadGraphviz).toHaveBeenCalledTimes(1);
    });

    it('offers pan and zoom over a rendered graph and keeps the graph itself untouched', async () => {
        const user = userEvent.setup();
        vi.spyOn(globalThis, 'fetch').mockImplementation(() => Promise.resolve(graphResponse()));
        render(<MetricsGraphControls enabled token="synthetic-token" analysisId={7} locale="en" />);

        await user.click(screen.getByRole('button', { name: 'Render selected graph' }));
        await screen.findByText('AST is ready.');

        // Block labels make these graphs wider than the page, so the reader gets a window they can move.
        const canvas = screen.getByRole('group', { name: 'Graph, movable' });
        const surface = canvas.querySelector('.metrics-graph-surface');
        expect(surface).toHaveStyle({ transform: 'translate(0px, 0px) scale(1)' });
        expect(screen.getByText('100%')).toBeInTheDocument();

        await user.click(screen.getByRole('button', { name: 'Zoom in' }));
        expect(screen.getByText('125%')).toBeInTheDocument();
        await user.click(screen.getByRole('button', { name: 'Zoom out' }));
        expect(screen.getByText('100%')).toBeInTheDocument();

        // Arrow keys are the keyboard's pan; a graph nobody can drag must still be reachable.
        canvas.focus();
        await user.keyboard('{ArrowRight}');
        expect(surface).toHaveStyle({ transform: 'translate(-48px, 0px) scale(1)' });
        await user.click(screen.getByRole('button', { name: 'Actual size' }));
        expect(surface).toHaveStyle({ transform: 'translate(0px, 0px) scale(1)' });

        // The SVG keeps its own size: only the surface around it moves, so the drawing stays crisp.
        expect(canvas.querySelector('svg')).not.toHaveAttribute('style');
    });

    it('requests each selected graph type exactly once', async () => {
        const user = userEvent.setup();
        const types = ['ast', 'cfg', 'cdg', 'ddg', 'dt', 'pdt', 'tdg', 'pdg'];
        const fetchMock = vi
            .spyOn(globalThis, 'fetch')
            .mockImplementation(() => Promise.resolve(graphResponse()));
        render(<MetricsGraphControls enabled token="synthetic-token" analysisId={7} locale="en" />);

        for (const type of types) {
            await user.selectOptions(screen.getByRole('combobox', { name: 'Graph type' }), type);
            await user.click(screen.getByRole('button', { name: 'Render selected graph' }));
            await screen.findByText(/is ready\./);
        }

        expect(fetchMock).toHaveBeenCalledTimes(types.length);
        expect(fetchMock.mock.calls.map(([input]) => String(input))).toEqual(
            types.map((type) => expect.stringContaining(`/graphs/${type}`)),
        );
    });

    it('keeps the selected type on timeout and retries only that graph', async () => {
        const user = userEvent.setup();
        const fetchMock = vi
            .spyOn(globalThis, 'fetch')
            .mockResolvedValueOnce(
                response({ code: 'capability_timeout' }, 504, {
                    'Content-Type': 'application/problem+json',
                }),
            )
            .mockResolvedValueOnce(graphResponse());
        render(<MetricsGraphControls enabled token="synthetic-token" analysisId={7} locale="en" />);
        await user.selectOptions(screen.getByRole('combobox', { name: 'Graph type' }), 'pdg');
        await user.click(screen.getByRole('button', { name: 'Render selected graph' }));
        expect((await screen.findAllByRole('alert'))[0]).toHaveTextContent(/timed out/);
        await user.click(screen.getByRole('button', { name: 'Retry selected graph' }));
        expect(await screen.findByText(/PDG is ready/)).toBeInTheDocument();
        expect(fetchMock).toHaveBeenCalledTimes(2);
        expect(String(fetchMock.mock.calls[0]?.[0])).toContain('/graphs/pdg');
        expect(String(fetchMock.mock.calls[1]?.[0])).toContain('/graphs/pdg');
    });

    it('retains the DOT alternative when SVG sanitization fails', async () => {
        const user = userEvent.setup();
        vi.mocked(loadGraphviz).mockResolvedValue({
            instance: async () => ({
                renderString: () =>
                    '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>',
            }),
        } as never);
        vi.spyOn(globalThis, 'fetch').mockResolvedValue(graphResponse());
        render(<MetricsGraphControls enabled token="synthetic-token" analysisId={7} locale="en" />);

        await user.click(screen.getByRole('button', { name: 'Render selected graph' }));
        expect(
            (
                await screen.findAllByText(
                    'The graph could not be safely rendered. The DOT alternative remains available.',
                )
            ).length,
        ).toBeGreaterThan(0);
        await user.click(screen.getByText('Show plain-text DOT alternative'));
        expect(screen.getByText('digraph { a -> b }')).toBeInTheDocument();
    });

    it('aborts an in-flight request when the component unmounts', async () => {
        const user = userEvent.setup();
        let signal: AbortSignal | undefined;
        const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation((_input, init) => {
            signal = init?.signal ?? undefined;
            return new Promise<Response>(() => undefined);
        });
        const { unmount } = render(
            <MetricsGraphControls enabled token="synthetic-token" analysisId={7} locale="en" />,
        );

        await user.click(screen.getByRole('button', { name: 'Render selected graph' }));
        expect(fetchMock).toHaveBeenCalledTimes(1);
        unmount();
        expect(signal?.aborted).toBe(true);
    });

    it('hides controls when the capability is not advertised', () => {
        render(
            <MetricsGraphControls
                enabled={false}
                token="synthetic-token"
                analysisId={7}
                locale="en"
            />,
        );
        expect(screen.queryByRole('group', { name: 'Graph request' })).not.toBeInTheDocument();
    });
});

describe('graph capability gating through the submission route', () => {
    beforeEach(async () => {
        await i18n.changeLanguage('en');
        vi.restoreAllMocks();
    });

    it('shows controls only in advanced analysis for an advertised, completed retained project format', async () => {
        const user = userEvent.setup();
        renderSubmission(['metrics-graphs'], 'completed', 'sb3');
        // Wait for the loaded result, not for the loading placeholder, which carries the same heading.
        expect(
            await screen.findByRole('link', { name: 'Open advanced analysis' }),
        ).toBeInTheDocument();
        expect(screen.queryByRole('heading', { name: 'Program graphs' })).not.toBeInTheDocument();
        await user.click(screen.getByRole('link', { name: 'Open advanced analysis' }));
        expect(await screen.findByRole('heading', { name: 'Program graphs' })).toBeInTheDocument();
    });

    it.each([
        ['missing capability', [], 'completed', 'sb3'],
        ['incomplete analysis', ['metrics-graphs'], 'processing', undefined],
        ['ineligible format', ['metrics-graphs'], 'completed', 'zip'],
    ] as const)('hides controls for %s', async (_label, features, status, inputFormat) => {
        renderSubmission(features, status, inputFormat);
        await screen.findByRole('heading', { name: 'Project analysis' });
        expect(screen.queryByRole('heading', { name: 'Program graphs' })).not.toBeInTheDocument();
    });
});
