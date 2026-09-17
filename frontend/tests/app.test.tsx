// SPDX-License-Identifier: EUPL-1.2
// SPDX-FileCopyrightText: 2025 LitterBox-Web contributors
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useNavigate } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../src/App';
import { response } from './helpers';
import { renderAt } from './render';
import i18n from '../src/i18n';

describe('app shell', () => {
    beforeEach(async () => {
        await i18n.changeLanguage('en');
        vi.restoreAllMocks();
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('makes single-project analysis available at home and names the version in the footer', async () => {
        const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
            new Response(
                JSON.stringify({
                    schemaVersion: 1,
                    litterboxVersion: 'test',
                    supportedLocales: ['de', 'en', 'es', 'nl'],
                    enabledFeatures: ['single-project'],
                }),
                { status: 200, headers: { 'Content-Type': 'application/json' } },
            ),
        );
        render(
            <MemoryRouter initialEntries={['/']}>
                <App />
            </MemoryRouter>,
        );
        expect(screen.getByRole('heading', { name: 'LitterBox', level: 1 })).toBeInTheDocument();
        // The hero blocks are a picture of what the site does, and are shipped as one: drawn ahead of time, so
        // no home visitor fetches a block renderer for a picture that never varies. It keeps the name that tells
        // a screen reader what the picture is of, and loses the caption and the transcript that repeated it to
        // everyone else.
        const heroBlocks = await screen.findByRole('img', { name: 'A small Scratch program' });
        expect(heroBlocks.tagName).toBe('IMG');
        expect(screen.queryByText('A small Scratch program')).not.toBeInTheDocument();
        expect(screen.queryByText('Text alternative')).not.toBeInTheDocument();
        await waitFor(() => expect(screen.getByLabelText('Your project file')).toBeInTheDocument());
        expect(fetchMock).toHaveBeenCalledTimes(1);

        // The version is the only thing the readiness page said that a reader could use, and it now says it on
        // every page instead of behind a link. Nothing else about the service is anyone's business.
        expect(screen.getByText('LitterBox test')).toBeInTheDocument();
        expect(screen.queryByRole('link', { name: 'System information' })).not.toBeInTheDocument();
        expect(screen.queryByText('Schema version')).not.toBeInTheDocument();
        expect(screen.queryByText('single-project')).not.toBeInTheDocument();
    });

    it('sends a bookmark of the retired readiness page back to the analyser', async () => {
        vi.spyOn(globalThis, 'fetch').mockResolvedValue(
            new Response(
                JSON.stringify({
                    schemaVersion: 1,
                    litterboxVersion: 'synthetic-retired',
                    supportedLocales: ['de', 'en', 'es', 'nl'],
                    enabledFeatures: ['single-project'],
                }),
                { status: 200, headers: { 'Content-Type': 'application/json' } },
            ),
        );
        render(
            <MemoryRouter initialEntries={['/status']}>
                <App />
            </MemoryRouter>,
        );
        await waitFor(() => expect(screen.getByLabelText('Your project file')).toBeInTheDocument());
    });

    it('allows changing locale without losing navigation', async () => {
        vi.spyOn(globalThis, 'fetch').mockResolvedValue(
            new Response(
                JSON.stringify({
                    schemaVersion: 1,
                    litterboxVersion: 'synthetic-locale',
                    supportedLocales: ['de', 'en', 'es', 'nl'],
                    enabledFeatures: ['single-project'],
                }),
                { status: 200, headers: { 'Content-Type': 'application/json' } },
            ),
        );
        const user = userEvent.setup();
        render(
            <MemoryRouter initialEntries={['/']}>
                <App />
            </MemoryRouter>,
        );
        await user.selectOptions(screen.getByLabelText('Language'), 'de');
        // Waited for in German. The pack is fetched when the language is chosen, so the heading — which reads
        // the same in both — says nothing about whether the change has landed.
        expect(
            await screen.findByText(
                'Analysiere Scratch-Projekte und mache aus Befunden verständliche Lerngelegenheiten.',
            ),
        ).toBeInTheDocument();
        expect(screen.getByRole('heading', { name: 'LitterBox' })).toBeInTheDocument();
        // Not "prüfen": the link is for children, and it should not sound like an examination.
        expect(screen.getByRole('link', { name: 'Projekt verbessern' })).toBeInTheDocument();
    });

    it('keeps the menu honest while capabilities load and resolves it on direct static routes', async () => {
        let resolveCapabilities: ((response: Response) => void) | undefined;
        vi.spyOn(globalThis, 'fetch').mockImplementation(
            () =>
                new Promise((resolve) => {
                    resolveCapabilities = resolve;
                }),
        );
        render(
            <MemoryRouter initialEntries={['/about']}>
                <App />
            </MemoryRouter>,
        );

        const navigation = screen.getByRole('navigation', { name: 'Main navigation' });
        const navigationQueries = within(navigation);
        expect(navigation).toHaveAttribute('aria-busy', 'true');
        expect(navigationQueries.getByRole('link', { name: 'Check my project' })).toHaveAttribute(
            'href',
            '/',
        );
        // Home is the submission form, so it is the only always-present entry.
        expect(
            navigationQueries.queryByRole('link', { name: 'Submit project' }),
        ).not.toBeInTheDocument();
        expect(
            navigationQueries.queryByRole('link', { name: 'For teachers' }),
        ).not.toBeInTheDocument();
        expect(
            navigationQueries.queryByRole('link', { name: 'Advanced analysis' }),
        ).not.toBeInTheDocument();
        expect(navigationQueries.queryByRole('link', { name: 'Ask me' })).not.toBeInTheDocument();

        resolveCapabilities?.(
            new Response(
                JSON.stringify({
                    schemaVersion: 1,
                    litterboxVersion: 'synthetic-static-navigation',
                    supportedLocales: ['de', 'en', 'es', 'nl'],
                    enabledFeatures: ['teacher-archive', 'metrics-graphs', 'qlc'],
                }),
                { status: 200, headers: { 'Content-Type': 'application/json' } },
            ),
        );

        expect(await screen.findByRole('link', { name: 'For teachers' })).toBeInTheDocument();
        expect(screen.getByRole('link', { name: 'Advanced analysis' })).toBeInTheDocument();
        expect(screen.getByRole('link', { name: 'Ask me' })).toBeInTheDocument();
        // What a child came to do stands at the front of the menu; the rest is for whoever is teaching them.
        expect(
            navigationQueries.getAllByRole('link').map((link) => link.textContent),
        ).toStrictEqual([
            'Check my project',
            'Ask me',
            'For teachers',
            'Advanced analysis',
            'Catalogue',
            'About',
        ]);
        expect(
            within(screen.getByRole('navigation', { name: 'Footer navigation' })).getByRole(
                'link',
                {
                    name: 'Statistics',
                },
            ),
        ).toHaveAttribute('href', '/statistics');
        expect(navigation).not.toHaveAttribute('aria-busy');
        expect(screen.getByRole('link', { name: 'About' })).toHaveAttribute('aria-current', 'page');
        // The version appears only once the service has answered; before that the footer says nothing about it.
        expect(screen.getByText('LitterBox synthetic-static-navigation')).toBeInTheDocument();
    });

    it('shows successful batch projects alongside per-project failures', async () => {
        vi.spyOn(globalThis, 'fetch').mockResolvedValue(
            new Response(
                JSON.stringify({
                    status: 'partial',
                    sourceType: 'teacher',
                    counts: { expected: 2, completed: 1, failed: 1 },
                    analyses: [
                        {
                            id: 'ok',
                            name: 'Working project',
                            status: 'completed',
                            issues: [],
                        },
                        {
                            id: 'bad',
                            name: 'Broken project',
                            status: 'failed',
                            failureMessage: 'Malformed project.json',
                        },
                    ],
                }),
                { status: 200, headers: { 'Content-Type': 'application/json' } },
            ),
        );
        render(
            <MemoryRouter initialEntries={['/submissions/synthetic-token']}>
                <App />
            </MemoryRouter>,
        );
        await waitFor(() => expect(screen.getByText('Batch progress')).toBeInTheDocument());
        expect(screen.getByText('Working project')).toBeInTheDocument();
        // The reason is reported once, under the heading that gathers what did not finish, rather than in a
        // table cell that has to be as wide as a sentence.
        expect(screen.getByRole('heading', { name: '1 analysis did not finish' })).toBeVisible();
        expect(screen.getByText('Malformed project.json')).toBeInTheDocument();
        // One expected, one complete, one failed, none still processing — plus the row's own counts.
        expect(screen.getAllByText('1').length).toBeGreaterThanOrEqual(2);
    });

    it('opens every advertised advanced capability from a completed result without rerunning it', async () => {
        const user = userEvent.setup();
        vi.stubGlobal('EventSource', undefined);
        vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
            const url = String(input);
            if (url.includes('/capabilities'))
                return Promise.resolve(
                    new Response(
                        JSON.stringify({
                            schemaVersion: 1,
                            litterboxVersion: 'synthetic',
                            supportedLocales: ['de', 'en', 'es', 'nl'],
                            enabledFeatures: [
                                'single-project',
                                'metrics-graphs',
                                'semantic-diff',
                                'program-export',
                                'fault-injection',
                            ],
                        }),
                        { status: 200, headers: { 'Content-Type': 'application/json' } },
                    ),
                );
            if (url.includes('/injectors'))
                return Promise.resolve(
                    new Response('[]', {
                        status: 200,
                        headers: { 'Content-Type': 'application/json' },
                    }),
                );
            return Promise.resolve(
                new Response(
                    JSON.stringify({
                        schemaVersion: 1,
                        submissionId: 7,
                        token: 'synthetic-all-capabilities',
                        status: 'completed',
                        locale: 'en',
                        sourceType: 'UPLOAD',
                        analysis: {
                            id: 17,
                            status: 'completed',
                            name: 'synthetic-all-capabilities.sb3',
                            inputFormat: 'sb3',
                            metrics: { block_count: 3 },
                            issues: [],
                            relationships: [],
                            catalogue: [],
                            quiz: [],
                            assetRefs: [],
                        },
                        analyses: [],
                        counts: { expected: 1, completed: 1, failed: 0 },
                    }),
                    { status: 200, headers: { 'Content-Type': 'application/json' } },
                ),
            );
        });

        render(
            <MemoryRouter initialEntries={['/submissions/synthetic-all-capabilities']}>
                <App />
            </MemoryRouter>,
        );

        // Wait for the loaded result, not for the loading placeholder, which carries the same heading.
        expect(
            await screen.findByRole('link', { name: 'Open advanced analysis' }),
        ).toBeInTheDocument();
        expect(
            screen.queryByRole('heading', { name: 'Persisted metrics' }),
        ).not.toBeInTheDocument();
        expect(screen.queryByRole('heading', { name: 'Program graphs' })).not.toBeInTheDocument();
        expect(screen.queryByRole('heading', { name: 'Export program' })).not.toBeInTheDocument();
        // LitterBox's own report, which the service has always been able to write and nothing linked. Named per
        // analysis, because a class set holds many and the submission's last one is not the one on screen.
        expect(screen.getByRole('link', { name: 'Download the report' })).toHaveAttribute(
            'href',
            '/litterbox/api/v1/submissions/synthetic-all-capabilities/analyses/17/report.html',
        );
        await user.click(screen.getByRole('link', { name: 'Open advanced analysis' }));
        await waitFor(() => {
            expect(screen.getByRole('heading', { name: 'Advanced analysis' })).toBeInTheDocument();
            expect(screen.getByRole('heading', { name: 'Persisted metrics' })).toBeInTheDocument();
            expect(screen.getByRole('heading', { name: 'Program graphs' })).toBeInTheDocument();
            expect(screen.getByRole('heading', { name: 'Export program' })).toBeInTheDocument();
        });
        // Fault injection is not among them any more. It makes a second project rather than reading the one in
        // hand, which is lesson preparation, so it is offered on the teacher's pages instead.
        expect(screen.queryByRole('heading', { name: 'Fault injection' })).not.toBeInTheDocument();
        expect(screen.getByRole('link', { name: 'Compare results' })).toHaveAttribute(
            'href',
            '/compare',
        );
    });

    it('refreshes after SSE events, keeps polling through disconnects, and permits reconnection', async () => {
        vi.useFakeTimers();
        const interval = vi.spyOn(window, 'setInterval');
        const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation((input) =>
            Promise.resolve(
                new Response(
                    JSON.stringify(
                        String(input).includes('capabilities')
                            ? {
                                  schemaVersion: 1,
                                  litterboxVersion: 'test',
                                  supportedLocales: ['de', 'en', 'es', 'nl'],
                                  enabledFeatures: [],
                              }
                            : { status: 'processing' },
                    ),
                    {
                        status: 200,
                        headers: { 'Content-Type': 'application/json' },
                    },
                ),
            ),
        );
        const close = vi.fn();
        let onmessage: (() => void) | null = null;
        let onerror: (() => void) | null = null;
        let onopen: (() => void) | null = null;
        class SyntheticEventSource {
            public set onmessage(listener: (() => void) | null) {
                onmessage = listener;
            }
            public set onerror(listener: (() => void) | null) {
                onerror = listener;
            }
            public set onopen(listener: (() => void) | null) {
                onopen = listener;
            }
            public addEventListener(): void {}
            public close = close;
        }
        vi.stubGlobal('EventSource', SyntheticEventSource);
        const view = render(
            <MemoryRouter initialEntries={['/submissions/synthetic-token']}>
                <App />
            </MemoryRouter>,
        );
        await act(async () => await vi.advanceTimersByTimeAsync(0));
        expect(onmessage).not.toBeNull();
        await act(async () => onmessage?.());
        expect(fetchMock).toHaveBeenCalledTimes(3);
        await act(async () => onerror?.());
        expect(close).not.toHaveBeenCalled();
        expect(screen.getByText('This page checks for updates automatically.')).toBeInTheDocument();
        expect(interval).toHaveBeenCalled();
        await act(async () => await vi.advanceTimersByTimeAsync(2500));
        expect(fetchMock).toHaveBeenCalledTimes(4);
        await act(async () => onopen?.());
        expect(fetchMock).toHaveBeenCalledTimes(5);
        view.unmount();
        expect(close).toHaveBeenCalledTimes(1);
        interval.mockRestore();
        vi.unstubAllGlobals();
        vi.useRealTimers();
    });
});

const capabilityResponse = (enabledFeatures: readonly string[]) =>
    new Response(
        JSON.stringify({
            schemaVersion: 1,
            litterboxVersion: 'synthetic-tools',
            supportedLocales: ['de', 'en', 'es', 'nl'],
            enabledFeatures,
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
    );

const completedResultResponse = new Response(
    JSON.stringify({
        schemaVersion: 1,
        submissionId: 7,
        token: 'synthetic-tools-result',
        status: 'completed',
        locale: 'en',
        sourceType: 'UPLOAD',
        analysis: {
            id: 17,
            status: 'completed',
            name: 'synthetic-tools-result.sb3',
            inputFormat: 'sb3',
            metrics: { block_count: 3 },
            issues: [],
            relationships: [],
            catalogue: [],
            quiz: [],
            assetRefs: [],
        },
        analyses: [],
        counts: { expected: 1, completed: 1, failed: 0 },
    }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
);

const retainedResultResponse = (token: string, analysisId: number, name: string, blocks: number) =>
    new Response(
        JSON.stringify({
            schemaVersion: 1,
            submissionId: 7,
            token,
            status: 'completed',
            locale: 'en',
            sourceType: 'UPLOAD',
            analysis: {
                id: analysisId,
                status: 'completed',
                name,
                inputFormat: 'sb3',
                metrics: { block_count: blocks },
                issues: [],
                relationships: [],
                catalogue: [],
                quiz: [],
                assetRefs: [],
            },
            analyses: [],
            counts: { expected: 1, completed: 1, failed: 0 },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
    );

describe('advanced analysis discovery', () => {
    beforeEach(async () => {
        await i18n.changeLanguage('en');
        vi.restoreAllMocks();
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('offers its own project entry on a direct visit without retained state', async () => {
        vi.spyOn(globalThis, 'fetch').mockResolvedValue(capabilityResponse(['metrics-graphs']));
        render(
            <MemoryRouter initialEntries={['/advanced']}>
                <App />
            </MemoryRouter>,
        );

        // No dead end back to the start page: a project can be handed over right here.
        expect(
            await screen.findByRole('heading', { name: 'Advanced analysis', level: 1 }),
        ).toBeInTheDocument();
        expect(screen.getByRole('group', { name: 'Choose a project' })).toBeInTheDocument();
        expect(screen.getByLabelText('Your project file')).toBeInTheDocument();
        expect(screen.getByLabelText('Project link')).toBeInTheDocument();
        expect(screen.queryByRole('heading', { name: 'Program graphs' })).not.toBeInTheDocument();
    });

    it('shows retained-analysis loading without flashing the recovery state', async () => {
        vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
            if (String(input).includes('/capabilities'))
                return Promise.resolve(capabilityResponse(['metrics-graphs']));
            return new Promise<Response>(() => undefined);
        });
        render(
            <MemoryRouter
                initialEntries={[
                    {
                        pathname: '/advanced',
                        state: {
                            retainedAnalysis: {
                                submissionToken: 'synthetic-tools-result',
                                analysisId: 17,
                            },
                        },
                    },
                ]}
            >
                <App />
            </MemoryRouter>,
        );

        expect(await screen.findByText('Loading the retained analysis…')).toBeInTheDocument();
        expect(
            screen.queryByRole('heading', { name: 'Advanced analysis is unavailable' }),
        ).not.toBeInTheDocument();
    });

    it('discards a retained response when router state changes during loading', async () => {
        let resolveOldResponse: ((response: Response) => void) | undefined;
        vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
            const url = String(input);
            if (url.includes('/capabilities'))
                return Promise.resolve(capabilityResponse(['metrics-graphs']));
            if (url.includes('old-retained-token'))
                return new Promise<Response>((resolve) => {
                    resolveOldResponse = resolve;
                });
            return Promise.resolve(
                retainedResultResponse('new-retained-token', 18, 'new-retained-project.sb3', 3),
            );
        });

        function ChangeRetainedState() {
            const navigate = useNavigate();
            return (
                <button
                    type="button"
                    onClick={() =>
                        navigate('/advanced', {
                            state: {
                                retainedAnalysis: {
                                    submissionToken: 'new-retained-token',
                                    analysisId: 18,
                                },
                            },
                        })
                    }
                >
                    Change retained analysis
                </button>
            );
        }

        render(
            <MemoryRouter
                initialEntries={[
                    {
                        pathname: '/advanced',
                        state: {
                            retainedAnalysis: {
                                submissionToken: 'old-retained-token',
                                analysisId: 17,
                            },
                        },
                    },
                ]}
            >
                <ChangeRetainedState />
                <App />
            </MemoryRouter>,
        );

        expect(await screen.findByText('Loading the retained analysis…')).toBeInTheDocument();
        await userEvent
            .setup()
            .click(screen.getByRole('button', { name: 'Change retained analysis' }));
        // Once in the hero and once in the analysis context, which records what produced the result.
        expect((await screen.findAllByText('new-retained-project.sb3')).length).toBeGreaterThan(0);
        expect(screen.queryByText('old-retained-project.sb3')).not.toBeInTheDocument();

        resolveOldResponse?.(
            retainedResultResponse('old-retained-token', 17, 'old-retained-project.sb3', 2),
        );
        await act(async () => undefined);
        expect(screen.getAllByText('new-retained-project.sb3').length).toBeGreaterThan(0);
        expect(screen.queryByText('old-retained-project.sb3')).not.toBeInTheDocument();
    });

    it('redirects the compatibility path to the canonical advanced route', async () => {
        vi.spyOn(globalThis, 'fetch').mockResolvedValue(capabilityResponse(['metrics-graphs']));
        render(
            <MemoryRouter initialEntries={['/tools']}>
                <App />
            </MemoryRouter>,
        );
        expect(
            await screen.findByRole('heading', { name: 'Advanced analysis', level: 1 }),
        ).toBeInTheDocument();
        expect(screen.getByRole('group', { name: 'Choose a project' })).toBeInTheDocument();
    });

    it('folds the advanced sections and opens one at a time from the section menu', async () => {
        const user = userEvent.setup();
        vi.stubGlobal('EventSource', undefined);
        vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
            const url = String(input);
            if (url.includes('/capabilities'))
                return Promise.resolve(capabilityResponse(['metrics-graphs', 'semantic-diff']));
            return Promise.resolve(completedResultResponse.clone());
        });
        render(
            <MemoryRouter
                initialEntries={[
                    {
                        pathname: '/advanced',
                        state: {
                            retainedAnalysis: {
                                submissionToken: 'synthetic-tools-result',
                                analysisId: 17,
                            },
                        },
                    },
                ]}
            >
                <App />
            </MemoryRouter>,
        );

        const menu = await screen.findByRole('navigation', { name: 'Sections on this page' });
        const menuQueries = within(menu);
        // The first section stands open so the page is not a wall of shut drawers.
        expect(menuQueries.getByRole('button', { name: 'Detailed metrics' })).toHaveAttribute(
            'aria-expanded',
            'true',
        );
        expect(menuQueries.getByRole('button', { name: 'Program graphs' })).toHaveAttribute(
            'aria-expanded',
            'false',
        );

        await user.click(menuQueries.getByRole('button', { name: 'Program graphs' }));
        // Opening one closes the other: that is the whole point of the fold.
        expect(menuQueries.getByRole('button', { name: 'Program graphs' })).toHaveAttribute(
            'aria-expanded',
            'true',
        );
        expect(menuQueries.getByRole('button', { name: 'Detailed metrics' })).toHaveAttribute(
            'aria-expanded',
            'false',
        );
        expect(
            screen.getByRole('combobox', { name: 'Graph type' }).closest('details'),
        ).toHaveAttribute('open');
    });

    // Metrics come out of the analysis record itself, so they belong to every row: an installation that has
    // turned graph rendering off still has its numbers, and only the graphs go away with the capability.
    it.each([
        ['metrics-graphs', ['Detailed metrics', 'Persisted metrics', 'Program graphs']],
        ['semantic-diff', ['Detailed metrics', 'Persisted metrics', 'Compare this result']],
        ['program-export', ['Detailed metrics', 'Persisted metrics', 'Export program']],
        // Fault injection is deliberately absent: it is the teacher's tool and has left this page.
        ['fault-injection', ['Detailed metrics', 'Persisted metrics']],
    ] as const)('shows only applicable sections for %s', async (feature, headings) => {
        vi.stubGlobal('EventSource', undefined);
        vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
            const url = String(input);
            if (url.includes('/capabilities'))
                return Promise.resolve(capabilityResponse([feature]));
            if (url.includes('/injectors'))
                return Promise.resolve(new Response('[]', { status: 200 }));
            return Promise.resolve(completedResultResponse.clone());
        });
        render(
            <MemoryRouter
                initialEntries={[
                    {
                        pathname: '/advanced',
                        state: {
                            retainedAnalysis: {
                                submissionToken: 'synthetic-tools-result',
                                analysisId: 17,
                            },
                        },
                    },
                ]}
            >
                <App />
            </MemoryRouter>,
        );
        // Each section is a fold now, so its name is on the summary that opens it rather than on a heading.
        for (const heading of headings)
            expect(await screen.findAllByText(heading)).not.toHaveLength(0);
        const allHeadings = [
            'Detailed metrics',
            'Persisted metrics',
            'Program graphs',
            'Export program',
            'Fault injection',
            'Compare this result',
        ];
        for (const heading of allHeadings)
            if (!headings.includes(heading as never))
                expect(screen.queryAllByText(heading)).toHaveLength(0);
    });

    it('keeps the persisted metrics when no capability at all is enabled', async () => {
        vi.stubGlobal('EventSource', undefined);
        vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
            const url = String(input);
            if (url.includes('/capabilities')) return Promise.resolve(capabilityResponse([]));
            if (url.includes('/injectors'))
                return Promise.resolve(new Response('[]', { status: 200 }));
            return Promise.resolve(completedResultResponse.clone());
        });
        render(
            <MemoryRouter
                initialEntries={[
                    {
                        pathname: '/advanced',
                        state: {
                            retainedAnalysis: {
                                submissionToken: 'synthetic-tools-result',
                                analysisId: 17,
                            },
                        },
                    },
                ]}
            >
                <App />
            </MemoryRouter>,
        );

        expect(await screen.findAllByText('Detailed metrics')).not.toHaveLength(0);
        expect(screen.queryAllByText('Program graphs')).toHaveLength(0);
    });

    it('omits the advanced navigation entry and result action when none are advertised', async () => {
        vi.spyOn(globalThis, 'fetch').mockImplementation((input) =>
            String(input).includes('/capabilities')
                ? Promise.resolve(capabilityResponse([]))
                : Promise.resolve(completedResultResponse.clone()),
        );
        render(
            <MemoryRouter initialEntries={['/submissions/synthetic-tools-result']}>
                <App />
            </MemoryRouter>,
        );
        expect(await screen.findByRole('heading', { name: 'Findings' })).toBeInTheDocument();
        expect(screen.queryByRole('link', { name: 'Advanced analysis' })).not.toBeInTheDocument();
        expect(
            screen.queryByRole('link', { name: 'Open advanced analysis' }),
        ).not.toBeInTheDocument();
    });

    it('does not recognize differently cased advanced capability aliases', async () => {
        vi.spyOn(globalThis, 'fetch').mockImplementation((input) =>
            String(input).includes('/capabilities')
                ? Promise.resolve(capabilityResponse(['METRICS-GRAPHS']))
                : Promise.resolve(completedResultResponse.clone()),
        );
        render(
            <MemoryRouter initialEntries={['/submissions/synthetic-tools-result']}>
                <App />
            </MemoryRouter>,
        );

        expect(await screen.findByRole('heading', { name: 'Findings' })).toBeInTheDocument();
        expect(screen.queryByRole('link', { name: 'Advanced analysis' })).not.toBeInTheDocument();
        expect(
            screen.queryByRole('link', { name: 'Open advanced analysis' }),
        ).not.toBeInTheDocument();
    });
});

const eligibilityResponse = (available: boolean) => response({ schemaVersion: 1, available });

const eligibilityDeniedResponse = () => new Response(null, { status: 403 });

describe('ask-ai discovery', () => {
    beforeEach(async () => {
        await i18n.changeLanguage('en');
        vi.restoreAllMocks();
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('names the entry in the menu, between Ask me and For teachers, once both the capability and the eligibility check say yes', async () => {
        vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
            const url = String(input);
            if (url.includes('/ask-ai/eligibility'))
                return Promise.resolve(eligibilityResponse(true));
            return Promise.resolve(capabilityResponse(['qlc', 'teacher-archive', 'ask-ai']));
        });
        renderAt('/');

        const link = await screen.findByRole('link', { name: 'Help me understand' });
        const navigation = screen.getByRole('navigation', { name: 'Main navigation' });
        expect(
            within(navigation)
                .getAllByRole('link')
                .map((entry) => entry.textContent),
        ).toStrictEqual([
            'Check my project',
            'Ask me',
            'Help me understand',
            'For teachers',
            'Catalogue',
            'About',
        ]);
        expect(link).toHaveAttribute('href', '/ask-ai');

        await userEvent.setup().click(link);
        expect(
            await screen.findByRole('heading', {
                name: 'Help me understand a Scratch project',
                level: 1,
            }),
        ).toBeInTheDocument();
    });

    it('offers neither the entry nor the route when the capability is not advertised', async () => {
        const fetchMock = vi
            .spyOn(globalThis, 'fetch')
            .mockResolvedValue(capabilityResponse(['single-project']));
        renderAt('/ask-ai');

        // A stale bookmark to the page bounces to the start page rather than showing nothing were offered.
        // This is the one answer worth sending a reader away over: the build has no such page at all.
        await waitFor(() => expect(screen.getByLabelText('Your project file')).toBeInTheDocument());
        expect(screen.queryByRole('link', { name: 'Help me understand' })).not.toBeInTheDocument();
        expect(
            screen.queryByRole('heading', { name: 'Questions are unavailable right now' }),
        ).not.toBeInTheDocument();
        expect(
            screen.queryByRole('heading', { name: 'Not available on this network' }),
        ).not.toBeInTheDocument();
        // Never asked: the eligibility endpoint costs the network something, and there is no capability to check
        // it on behalf of.
        expect(
            fetchMock.mock.calls.some(([input]) => String(input).includes('/ask-ai/eligibility')),
        ).toBe(false);
    });

    it('withholds the entry when the capability is advertised but the eligibility check is refused', async () => {
        vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
            const url = String(input);
            if (url.includes('/ask-ai/eligibility'))
                return Promise.resolve(eligibilityDeniedResponse());
            return Promise.resolve(capabilityResponse(['single-project', 'ask-ai']));
        });
        renderAt('/');

        await waitFor(() => expect(screen.getByLabelText('Your project file')).toBeInTheDocument());
        expect(screen.queryByRole('link', { name: 'Help me understand' })).not.toBeInTheDocument();
    });

    it('keeps a reader whose network is refused on the page and lets them try from another one', async () => {
        let eligibilityChecks = 0;
        vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
            const url = String(input);
            if (url.includes('/ask-ai/eligibility')) {
                eligibilityChecks += 1;
                return eligibilityChecks === 1
                    ? Promise.resolve(eligibilityDeniedResponse())
                    : Promise.resolve(eligibilityResponse(true));
            }
            return Promise.resolve(capabilityResponse(['single-project', 'ask-ai']));
        });
        renderAt('/ask-ai');

        expect(
            await screen.findByRole('heading', {
                name: 'Not available on this network',
                level: 1,
            }),
        ).toBeInTheDocument();
        expect(
            screen.getByText(
                'Questions about a project cannot be answered on this network. Checking a project still works. If you have since joined another network, try again.',
            ),
        ).toBeInTheDocument();
        // Not sent to the start page: this address is one this build has, and the reader is one this deployment
        // will answer as soon as they ask from somewhere it answers. Which is the whole reason a refusal offers to
        // look again — being told it is the network is what sends somebody to join another one.
        expect(screen.queryByLabelText('Your project file')).not.toBeInTheDocument();

        await userEvent.click(screen.getByRole('button', { name: 'Retry' }));

        await waitFor(() => expect(screen.getByLabelText('Your project file')).toBeInTheDocument());
    });

    it('keeps a reader whose check failed on the page and opens it when a retry succeeds', async () => {
        let eligibilityChecks = 0;
        vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
            const url = String(input);
            if (url.includes('/ask-ai/eligibility')) {
                eligibilityChecks += 1;
                return eligibilityChecks === 1
                    ? Promise.reject(new Error('the check never got through'))
                    : Promise.resolve(eligibilityResponse(true));
            }
            return Promise.resolve(capabilityResponse(['single-project', 'ask-ai']));
        });
        renderAt('/ask-ai');

        expect(
            await screen.findByRole('heading', {
                name: 'Questions are unavailable right now',
                level: 1,
            }),
        ).toBeInTheDocument();
        expect(
            screen.getByText(
                'Whether the AI helper can answer questions here could not be checked. This is usually temporary.',
            ),
        ).toBeInTheDocument();
        expect(screen.queryByLabelText('Your project file')).not.toBeInTheDocument();

        await userEvent.setup().click(screen.getByRole('button', { name: 'Retry' }));
        expect(
            await screen.findByRole('heading', {
                name: 'Help me understand a Scratch project',
                level: 1,
            }),
        ).toBeInTheDocument();
        expect(eligibilityChecks).toBe(2);
    });
});
