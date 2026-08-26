// SPDX-License-Identifier: EUPL-1.2
// SPDX-FileCopyrightText: 2026 LitterBox-Web contributors

import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import JSZip from 'jszip';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../src/App';
import type { CapabilityState } from '../src/lib/capabilities';
import { ComparisonPage } from '../src/pages/ComparisonPage';
import { monitorSubmission, submissionTokenFrom } from '../src/pages/comparison-utils';
import { forgetProjects, rememberProject } from '../src/lib/recent-projects';
import i18n from '../src/i18n';

const capabilityState: CapabilityState = {
    status: 'ready',
    value: {
        schemaVersion: 1,
        litterboxVersion: 'synthetic',
        supportedLocales: ['de', 'en', 'es', 'nl'],
        enabledFeatures: ['semantic-diff'],
    },
};

const issue = (name: string) => ({
    finderId: `${name}-finder`,
    finderName: `${name} finder`,
    issueType: `${name} issue`,
    severity: 2,
    sprite: `${name} sprite`,
    blockId: `${name}-block`,
    scratchblocks: `when green flag clicked\nsay [${name}]`,
});

const result = (empty = false) => ({
    schemaVersion: 1,
    before: { analysisId: 101, name: '<before-project>.sb3' },
    after: { analysisId: 202, name: '<after-project>.sb3' },
    // The totals the service actually sends: a fixed finding is gone from the newer version, so it counts towards
    // the total before and not the total after.
    counts: empty
        ? { beforeTotal: 0, afterTotal: 0, fixed: 0, newIssues: 0, persisting: 0, removed: 0 }
        : { beforeTotal: 3, afterTotal: 2, fixed: 1, newIssues: 1, persisting: 1, removed: 1 },
    fixed: empty ? [] : [issue('fixed')],
    newIssues: empty ? [] : [issue('new')],
    persisting: empty ? [] : [issue('persisting')],
    removed: empty ? [] : [issue('removed')],
    actors: empty
        ? []
        : [
              {
                  actorName: '<actor>',
                  stage: false,
                  scripts: [
                      {
                          changeType: 'added',
                          beforeScratchblocks: null,
                          afterScratchblocks: 'move (10) steps',
                          annotatedBeforeScratchblocks: null,
                          annotatedAfterScratchblocks: 'move (10) steps\nsay [annotated]',
                      },
                  ],
              },
          ],
});

const jsonResponse = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
        status,
        headers: { 'Content-Type': 'application/json' },
    });

const renderPage = (state: unknown = undefined) =>
    render(
        <MemoryRouter
            initialEntries={[
                {
                    pathname: '/compare',
                    state,
                },
            ]}
        >
            <ComparisonPage capabilityState={capabilityState} />
        </MemoryRouter>,
    );

const projectCapabilityState: CapabilityState = {
    ...capabilityState,
    value: { ...capabilityState.value, enabledFeatures: ['semantic-diff', 'single-project'] },
};

const renderProjectPage = () =>
    render(
        <MemoryRouter initialEntries={['/compare']}>
            <ComparisonPage capabilityState={projectCapabilityState} />
        </MemoryRouter>,
    );

/**
 * Both sides typed by hand, which is what the expert form is for. Arriving from an analysis no longer fills these
 * in: that reference is offered as one of the project sources above, by name.
 */
const typeExpertReferences = async (user: ReturnType<typeof userEvent.setup>) => {
    await user.type(
        screen.getByLabelText('Result link or code', { selector: '#diff-before-token' }),
        'before-token',
    );
    await user.type(
        screen.getByLabelText('Analysis ID', { selector: '#diff-before-analysis-id' }),
        '1',
    );
    await user.type(
        screen.getByLabelText('Result link or code', { selector: '#diff-after-token' }),
        'after-token',
    );
    await user.type(
        screen.getByLabelText('Analysis ID', { selector: '#diff-after-analysis-id' }),
        '2',
    );
};

const syntheticProjectFile = async (name: string): Promise<File> => {
    const archive = new JSZip();
    archive.file('project.json', '{}');
    const bytes = await archive.generateAsync({ type: 'uint8array' });
    return new File(
        [bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer],
        name,
        { type: 'application/zip' },
    );
};

describe('comparison page', () => {
    beforeEach(async () => {
        await i18n.changeLanguage('en');
        vi.restoreAllMocks();
    });

    it('offers the arriving analysis as a source by name and makes no request on load', () => {
        const fetchMock = vi.spyOn(globalThis, 'fetch');
        renderPage({
            before: {
                submissionToken: 'router-before-token',
                analysisId: 17,
                name: 'Cat chase',
            },
        });
        // The reader came here from that analysis, so it is chosen for them by name; nothing asks for the
        // identifier of a result they are already looking at.
        expect(screen.getByLabelText('Analysed project')).toHaveValue('router-before-token:17');
        expect(screen.getByRole('option', { name: 'Cat chase' })).toBeInTheDocument();
        expect(
            screen.getByLabelText('Result link or code', { selector: '#diff-before-token' }),
        ).toHaveValue('');
        expect(fetchMock).not.toHaveBeenCalled();
        expect(screen.getByRole('heading', { name: 'Compare analyses' })).toBeInTheDocument();
    });

    it('validates blank, long, and invalid references before submitting', async () => {
        const user = userEvent.setup();
        const fetchMock = vi.spyOn(globalThis, 'fetch');
        renderPage();
        await user.click(screen.getByRole('button', { name: 'Compare these analyses' }));
        expect(screen.getByRole('alert')).toHaveTextContent('result link or code');
        expect(fetchMock).not.toHaveBeenCalled();

        await user.type(
            screen.getByLabelText('Result link or code', { selector: '#diff-before-token' }),
            'before',
        );
        await user.type(
            screen.getByLabelText('Analysis ID', { selector: '#diff-before-analysis-id' }),
            '1.5',
        );
        await user.type(
            screen.getByLabelText('Result link or code', { selector: '#diff-after-token' }),
            'x'.repeat(129),
        );
        await user.type(
            screen.getByLabelText('Analysis ID', { selector: '#diff-after-analysis-id' }),
            '2',
        );
        await user.click(screen.getByRole('button', { name: 'Compare these analyses' }));
        expect(screen.getByRole('alert')).toBeInTheDocument();
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it('deliberately swaps both complete references and clears a stale result', async () => {
        const user = userEvent.setup();
        vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse(result(true)));
        renderPage();
        await typeExpertReferences(user);
        await user.click(screen.getByRole('button', { name: 'Compare these analyses' }));
        await screen.findByRole('heading', { name: 'Identical project state' });
        await user.click(screen.getByRole('button', { name: 'Swap before and after' }));
        expect(
            screen.getByLabelText('Result link or code', { selector: '#diff-before-token' }),
        ).toHaveValue('after-token');
        expect(
            screen.getByLabelText('Analysis ID', { selector: '#diff-before-analysis-id' }),
        ).toHaveValue('2');
        expect(
            screen.getByLabelText('Result link or code', { selector: '#diff-after-token' }),
        ).toHaveValue('before-token');
        expect(
            screen.queryByRole('heading', { name: 'Identical project state' }),
        ).not.toBeInTheDocument();
    });

    it('renders every issue category, source metadata, and structural changes in response order', async () => {
        const user = userEvent.setup();
        vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse(result()));
        renderPage();
        await typeExpertReferences(user);
        await user.click(screen.getByRole('button', { name: 'Compare these analyses' }));
        await waitFor(() =>
            expect(screen.getByRole('heading', { name: 'Comparison result' })).toHaveFocus(),
        );
        expect(screen.getByText('<before-project>.sb3')).toBeInTheDocument();
        expect(screen.getByText('<after-project>.sb3')).toBeInTheDocument();
        expect(screen.getByRole('heading', { name: 'Fixed' })).toBeInTheDocument();
        expect(screen.getByRole('heading', { name: 'New findings' })).toBeInTheDocument();
        expect(screen.getByRole('heading', { name: 'Still there' })).toBeInTheDocument();
        expect(screen.getByRole('heading', { name: 'Gone' })).toBeInTheDocument();
        expect(screen.getByText('fixed finder')).toBeInTheDocument();
        expect(screen.getByText('new finder')).toBeInTheDocument();
        expect(screen.getByText('persisting finder')).toBeInTheDocument();
        expect(screen.getByText('removed finder')).toBeInTheDocument();
        expect(screen.getByRole('heading', { name: 'Structural changes' })).toBeInTheDocument();
        expect(screen.getByText('<actor>')).toBeInTheDocument();
        expect(screen.getByRole('heading', { name: 'Added script' })).toBeInTheDocument();
        // One comparison, drawn from the marked-up pair, rather than the marked-up and plain copies side by side.
        expect(document.querySelectorAll('.script-diff-panel')).toHaveLength(1);
        expect(document.querySelector('.script-diff')).toHaveClass('script-diff-single');
        expect(screen.queryByText('Annotated after Scratchblocks')).not.toBeInTheDocument();
        // The marks are for the drawing; whoever reads the source is handed the script as the service reported it.
        expect(document.querySelector('.script-diff-after pre')).toHaveTextContent(
            'move (10) steps',
        );
        expect(document.querySelector('.script-diff-after pre')).not.toHaveTextContent('annotated');
        expect(document.querySelector('script')).toBeNull();
        expect(document.querySelector('img')).toBeNull();
    });

    it('keeps hostile source, issue, actor, block, and Scratchblocks content inert', async () => {
        const user = userEvent.setup();
        const hostile = result(false);
        hostile.before.name = '<img src=x onerror=alert(1)>.sb3';
        hostile.after.name = '<svg onload=alert(2)>.sb3';
        hostile.fixed[0] = {
            ...hostile.fixed[0],
            finderName: '<script>alert(3)</script>',
            sprite: '<img src=x onerror=alert(4)>',
            blockId: '<svg onload=alert(5)>',
            scratchblocks: '<script>alert(6)</script>',
        };
        hostile.actors[0].actorName = '<script>alert(7)</script>';
        vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse(hostile));
        renderPage();
        await typeExpertReferences(user);
        await user.click(screen.getByRole('button', { name: 'Compare these analyses' }));
        await screen.findByRole('heading', { name: 'Comparison result' });
        expect(screen.getByText('<script>alert(3)</script>')).toBeInTheDocument();
        expect(screen.getByText('<img src=x onerror=alert(4)>')).toBeInTheDocument();
        expect(screen.getByText('<script>alert(7)</script>')).toBeInTheDocument();
        expect(document.querySelector('script')).toBeNull();
        expect(document.querySelector('img')).toBeNull();
        expect(document.querySelector('svg[onload]')).toBeNull();
    });

    it('folds the parts of the result, says what each holds, and names findings rather than blocks', async () => {
        const user = userEvent.setup();
        // The shape of a real comparison of two drafts: a handful of changes and a long tail of findings that
        // are in both versions.
        const listOf = (name: string, count: number) =>
            Array.from({ length: count }, (_unused, index) => issue(`${name}${index}`));
        const many = {
            ...result(false),
            counts: {
                beforeTotal: 43,
                afterTotal: 40,
                fixed: 0,
                newIssues: 4,
                persisting: 36,
                removed: 7,
            },
            fixed: [],
            newIssues: listOf('new', 4),
            persisting: listOf('persisting', 36),
            removed: listOf('removed', 7),
        };
        vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse(many));
        renderPage();
        await typeExpertReferences(user);
        await user.click(screen.getByRole('button', { name: 'Compare these analyses' }));
        await screen.findByRole('heading', { name: 'Comparison result' });

        // Both totals said as the sums they are, so a full list underneath is what the reader expects rather
        // than a sign that the new findings were never filtered out.
        expect(
            screen.getByText('43 findings before: 0 fixed, 7 gone, 36 still there.'),
        ).toBeInTheDocument();
        expect(screen.getByText('40 findings after: 4 new, 36 still there.')).toBeInTheDocument();

        // What changed is unrolled; what is in both versions is folded away and says why. An empty part stays
        // folded too — there is nothing behind it to read.
        const fold = (name: string) =>
            screen.getByRole('heading', { name }).closest('details') as HTMLDetailsElement;
        expect(fold('New findings').open).toBe(true);
        expect(fold('Gone').open).toBe(true);
        expect(fold('Still there').open).toBe(false);
        expect(fold('Fixed').open).toBe(false);
        expect(screen.getByText(/In both versions, unchanged\./)).toBeInTheDocument();

        // The identifier of a block named nothing a reader could look up; the finder's own name leads instead,
        // with the catalogue key under it.
        expect(screen.getByText('new0 finder')).toBeInTheDocument();
        expect(screen.queryByText('new0-block')).not.toBeInTheDocument();
        expect(screen.getByText('new0-finder')).toBeInTheDocument();

        // Every part is reachable from the top without scrolling past the ones the reader did not come for.
        const navigation = screen.getByRole('navigation', { name: 'Parts of this comparison' });
        expect(within(navigation).getByRole('button', { name: /Still there/ })).toBeInTheDocument();
        await user.click(within(navigation).getByRole('button', { name: /Still there/ }));
        expect(fold('Still there').open).toBe(true);
    });

    it('shows honest empty categories and the identical-project state', async () => {
        const user = userEvent.setup();
        vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse(result(true)));
        renderPage();
        await typeExpertReferences(user);
        await user.click(screen.getByRole('button', { name: 'Compare these analyses' }));
        await screen.findByRole('heading', { name: 'Identical project state' });
        expect(screen.getAllByText(/No issues in the/)).toHaveLength(4);
        expect(screen.getByText('No script or actor structure changed.')).toBeInTheDocument();
    });

    it('retains references after timeout and allows an explicit retry', async () => {
        const user = userEvent.setup();
        vi.spyOn(globalThis, 'fetch')
            .mockResolvedValueOnce(jsonResponse({ code: 'capability_timeout' }, 504))
            .mockResolvedValueOnce(jsonResponse(result(true)));
        renderPage();
        await typeExpertReferences(user);
        await user.click(screen.getByRole('button', { name: 'Compare these analyses' }));
        await waitFor(() =>
            expect(
                screen.getByRole('heading', { name: 'Comparison could not be completed' }),
            ).toHaveFocus(),
        );
        expect(
            screen.getByLabelText('Result link or code', { selector: '#diff-before-token' }),
        ).toHaveValue('before-token');
        await user.click(screen.getByRole('button', { name: 'Retry' }));
        await screen.findByRole('heading', { name: 'Identical project state' });
    });

    it.each([
        ['en', 'Before', 'Compare analyses'],
        ['de', 'Vorher', 'Analysen vergleichen'],
        ['es', 'Antes', 'Comparar análisis'],
        ['nl', 'Voor', 'Analyses vergelijken'],
    ] as const)('renders the workflow in the %s locale', async (locale, beforeLabel, title) => {
        await i18n.changeLanguage(locale);
        renderPage();
        expect(screen.getByRole('heading', { name: title })).toBeInTheDocument();
        expect(screen.getByText(beforeLabel, { selector: 'legend' })).toBeInTheDocument();
    });

    it.each([
        ['capability_disabled', 404, 'Semantic comparison is disabled'],
        ['analysis_not_ready', 409, 'not ready'],
        ['analysis_not_found', 404, 'found or authorized'],
        ['capability_limit_exceeded', 413, 'safety limit'],
        ['capability_unavailable', 503, 'temporarily unavailable'],
    ] as const)(
        'shows a bounded %s state without losing references',
        async (code, status, message) => {
            const user = userEvent.setup();
            vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse({ code }, status));
            renderPage();
            await typeExpertReferences(user);
            await user.click(screen.getByRole('button', { name: 'Compare these analyses' }));
            await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(message));
            expect(
                screen.getByLabelText('Result link or code', { selector: '#diff-before-token' }),
            ).toHaveValue('before-token');
        },
    );
});

describe('comparison route capability gate', () => {
    beforeEach(async () => {
        await i18n.changeLanguage('en');
        vi.restoreAllMocks();
    });

    it('fetches capabilities on the direct route and hides the workflow when disabled', async () => {
        const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
            jsonResponse({
                schemaVersion: 1,
                litterboxVersion: 'synthetic',
                supportedLocales: ['de', 'en', 'es', 'nl'],
                enabledFeatures: [],
            }),
        );
        render(
            <MemoryRouter initialEntries={['/compare']}>
                <App />
            </MemoryRouter>,
        );
        await waitFor(() =>
            expect(
                screen.getByText('Semantic comparison is not enabled for this service.'),
            ).toBeInTheDocument(),
        );
        expect(
            screen.queryByLabelText('Result link or code', { selector: '#diff-before-token' }),
        ).not.toBeInTheDocument();
        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect(fetchMock.mock.calls[0]?.[0]).toContain('/api/v1/capabilities');
    });

    it('hides the completed-result compare action when the capability is not advertised', async () => {
        vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
            if (String(input).includes('/capabilities'))
                return Promise.resolve(
                    jsonResponse({ ...capabilityState.value, enabledFeatures: [] }),
                );
            return Promise.resolve(
                jsonResponse({
                    status: 'completed',
                    token: 'synthetic-submission-token',
                    analysis: {
                        id: 7,
                        status: 'completed',
                        name: 'Synthetic result',
                        issues: [],
                        metrics: {},
                    },
                    analyses: [],
                }),
            );
        });
        render(
            <MemoryRouter initialEntries={['/submissions/synthetic-submission-token']}>
                <App />
            </MemoryRouter>,
        );
        await screen.findByRole('heading', { name: 'Project analysis' });
        expect(
            screen.queryByRole('link', { name: 'Compare this analysis' }),
        ).not.toBeInTheDocument();
    });

    it('carries the retained analysis from advanced analysis without adding it to the URL', async () => {
        const user = userEvent.setup();
        const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
            if (String(input).includes('/capabilities'))
                return Promise.resolve(jsonResponse({ ...capabilityState.value }));
            return Promise.resolve(
                jsonResponse({
                    status: 'completed',
                    token: 'synthetic-submission-token',
                    analysis: {
                        id: 7,
                        status: 'completed',
                        name: 'Synthetic result',
                        issues: [],
                        metrics: {},
                    },
                    analyses: [],
                }),
            );
        });
        render(
            <MemoryRouter initialEntries={['/submissions/synthetic-submission-token']}>
                <App />
            </MemoryRouter>,
        );
        await user.click(await screen.findByRole('link', { name: 'Open advanced analysis' }));
        await user.click(await screen.findByRole('link', { name: 'Compare results' }));
        expect(screen.getByLabelText('Analysed project')).toHaveValue(
            'synthetic-submission-token:7',
        );
        expect(window.location.search).toBe('');
        expect(window.location.hash).toBe('');
        expect(
            fetchMock.mock.calls.filter(([input]) => String(input).includes('/diffs')),
        ).toHaveLength(0);
    });
});

describe('project-oriented comparison workflow', () => {
    beforeEach(async () => {
        await i18n.changeLanguage('en');
        vi.restoreAllMocks();
        forgetProjects();
    });

    afterEach(() => forgetProjects());

    const setupSuccessfulWorkflow = () => {
        const submissions: Array<{ body: unknown; idempotency: string | undefined }> = [];
        const statusByToken = new Map<string, number>();
        const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
            const url = String(input);
            const method = init?.method ?? 'GET';
            if (url.endsWith('/api/v1/submissions') && method === 'POST') {
                const form = init?.body instanceof FormData ? init.body : undefined;
                const body =
                    typeof init?.body === 'string'
                        ? (JSON.parse(init.body) as { projectUrl?: string })
                        : {
                              fileName:
                                  form?.get('file') instanceof File
                                      ? (form.get('file') as File).name
                                      : undefined,
                          };
                const token = `synthetic-${submissions.length + 1}`;
                submissions.push({
                    body,
                    idempotency: (init?.headers as Record<string, string> | undefined)?.[
                        'Idempotency-Key'
                    ],
                });
                statusByToken.set(token, 0);
                return jsonResponse(
                    { submissionId: submissions.length, token, status: 'queued' },
                    202,
                );
            }
            const tokenMatch = /\/submissions\/([^/]+)$/.exec(url);
            if (tokenMatch) {
                const token = decodeURIComponent(tokenMatch[1]);
                const id = token === 'synthetic-1' ? 11 : 22;
                return jsonResponse({
                    schemaVersion: 1,
                    submissionId: id,
                    token,
                    status: 'completed',
                    analysis: { id, status: 'completed' },
                    analyses: [],
                });
            }
            if (url.endsWith('/api/v1/diffs') && method === 'POST')
                return jsonResponse(result(true));
            throw new Error(`Unexpected synthetic request: ${url}`);
        });
        return { fetchMock, submissions };
    };

    it('keeps simultaneous archive preflights independent', async () => {
        const beforeFile = await syntheticProjectFile('before.sb3');
        const afterFile = await syntheticProjectFile('after.mblock');
        renderProjectPage();

        fireEvent.change(
            screen.getByLabelText('Your project file', {
                selector: '#diff-before-file',
            }),
            { target: { files: [beforeFile] } },
        );
        fireEvent.change(
            screen.getByLabelText('Your project file', {
                selector: '#diff-after-file',
            }),
            { target: { files: [afterFile] } },
        );

        await waitFor(() => expect(screen.getAllByText('Your file looks good.')).toHaveLength(2));
        expect(screen.getByRole('button', { name: 'Compare these projects' })).toBeEnabled();
    });

    it.each([
        ['upload/upload', 'upload', 'upload'],
        ['URL/URL', 'url', 'url'],
        ['upload/URL', 'upload', 'url'],
        ['URL/upload', 'url', 'upload'],
    ] as const)('supports %s project sources', async (_name, beforeMode, afterMode) => {
        const user = userEvent.setup();
        const { submissions } = setupSuccessfulWorkflow();
        renderProjectPage();

        if (beforeMode === 'upload')
            await user.upload(
                screen.getByLabelText('Your project file', {
                    selector: '#diff-before-file',
                }),
                await syntheticProjectFile('before.sb3'),
            );
        else {
            await user.click(screen.getAllByRole('radio', { name: 'Use a Scratch URL or ID' })[0]);
            await user.type(
                screen.getByLabelText('Project link', {
                    selector: '#diff-before-url',
                }),
                '12345',
            );
        }
        if (afterMode === 'upload')
            await user.upload(
                screen.getByLabelText('Your project file', {
                    selector: '#diff-after-file',
                }),
                await syntheticProjectFile('after.mblock'),
            );
        else {
            await user.click(screen.getAllByRole('radio', { name: 'Use a Scratch URL or ID' })[1]);
            await user.type(
                screen.getByLabelText('Project link', {
                    selector: '#diff-after-url',
                }),
                'https://scratch.mit.edu/projects/67890',
            );
        }

        await waitFor(() =>
            expect(screen.getByRole('button', { name: 'Compare these projects' })).toBeEnabled(),
        );
        await user.click(screen.getByRole('button', { name: 'Compare these projects' }));
        await screen.findByRole('heading', { name: 'Comparison result' });
        // The two ways into a comparison end the same way, so they leave the reader in the same place.
        await waitFor(() =>
            expect(screen.getByRole('heading', { name: 'Comparison result' })).toHaveFocus(),
        );
        await waitFor(() => {
            expect(document.querySelector('#diff-before-status')).toHaveTextContent(
                'Analysis complete',
            );
            expect(document.querySelector('#diff-after-status')).toHaveTextContent(
                'Analysis complete',
            );
        });
        expect(submissions).toHaveLength(2);
        const bodies = submissions.map(({ body }) => body);
        if (beforeMode === 'url')
            expect(bodies).toContainEqual({
                projectUrl: 'https://scratch.mit.edu/projects/12345/',
            });
        else expect(bodies).toContainEqual({ fileName: 'before.sb3' });
        if (afterMode === 'url')
            expect(bodies).toContainEqual({
                projectUrl: 'https://scratch.mit.edu/projects/67890/',
            });
        else expect(bodies).toContainEqual({ fileName: 'after.mblock' });
        expect(window.location.search).toBe('');
    });

    it('does not request a diff until both independently monitored analyses resolve', async () => {
        const user = userEvent.setup();
        let releaseBefore: ((response: Response) => void) | undefined;
        let diffRequests = 0;
        vi.spyOn(globalThis, 'fetch').mockImplementation((input, init) => {
            const url = String(input);
            if (url.endsWith('/api/v1/submissions') && init?.method === 'POST') {
                const token = JSON.parse(String(init.body)).projectUrl.includes('1')
                    ? 'before-token'
                    : 'after-token';
                return Promise.resolve(
                    jsonResponse({ submissionId: 1, token, status: 'queued' }, 202),
                );
            }
            if (url.endsWith('/submissions/after-token'))
                return Promise.resolve(
                    jsonResponse({
                        token: 'after-token',
                        status: 'completed',
                        analysis: { id: 2, status: 'completed' },
                    }),
                );
            if (url.endsWith('/submissions/before-token'))
                return new Promise<Response>((resolve) => {
                    releaseBefore = resolve;
                });
            if (url.endsWith('/api/v1/diffs')) {
                diffRequests += 1;
                return Promise.resolve(jsonResponse(result(true)));
            }
            return Promise.reject(new Error(`Unexpected synthetic request: ${url}`));
        });
        renderProjectPage();
        await user.click(screen.getAllByRole('radio', { name: 'Use a Scratch URL or ID' })[0]);
        await user.click(screen.getAllByRole('radio', { name: 'Use a Scratch URL or ID' })[1]);
        await user.type(
            screen.getByLabelText('Project link', { selector: '#diff-before-url' }),
            '1',
        );
        await user.type(
            screen.getByLabelText('Project link', { selector: '#diff-after-url' }),
            '2',
        );
        await user.click(screen.getByRole('button', { name: 'Compare these projects' }));
        await waitFor(() => expect(releaseBefore).toBeDefined());
        expect(diffRequests).toBe(0);
        releaseBefore?.(
            jsonResponse({
                token: 'before-token',
                status: 'completed',
                analysis: { id: 1, status: 'completed' },
            }),
        );
        await screen.findByRole('heading', { name: 'Comparison result' });
        expect(diffRequests).toBe(1);
    });

    it('retries only the failed side with its original idempotency key', async () => {
        const user = userEvent.setup();
        let afterAttempts = 0;
        const posts: Array<{ side: string; key: string | undefined }> = [];
        vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
            const url = String(input);
            if (url.endsWith('/api/v1/submissions') && init?.method === 'POST') {
                const projectUrl = JSON.parse(String(init.body)).projectUrl as string;
                const side = projectUrl.endsWith('/1/') ? 'before' : 'after';
                const key = (init.headers as Record<string, string>)['Idempotency-Key'];
                posts.push({ side, key });
                if (side === 'after' && afterAttempts++ === 0)
                    return jsonResponse({ code: 'timeout' }, 504);
                return jsonResponse(
                    { submissionId: posts.length, token: `${side}-token`, status: 'queued' },
                    202,
                );
            }
            if (url.endsWith('/submissions/before-token'))
                return jsonResponse({
                    token: 'before-token',
                    status: 'completed',
                    analysis: { id: 1, status: 'completed' },
                });
            if (url.endsWith('/submissions/after-token'))
                return jsonResponse({
                    token: 'after-token',
                    status: 'completed',
                    analysis: { id: 2, status: 'completed' },
                });
            if (url.endsWith('/api/v1/diffs')) return jsonResponse(result(true));
            throw new Error(`Unexpected synthetic request: ${url}`);
        });
        renderProjectPage();
        await user.click(screen.getAllByRole('radio', { name: 'Use a Scratch URL or ID' })[0]);
        await user.click(screen.getAllByRole('radio', { name: 'Use a Scratch URL or ID' })[1]);
        await user.type(
            screen.getByLabelText('Project link', { selector: '#diff-before-url' }),
            '1',
        );
        await user.type(
            screen.getByLabelText('Project link', { selector: '#diff-after-url' }),
            '2',
        );
        await user.click(screen.getByRole('button', { name: 'Compare these projects' }));
        await screen.findByRole('heading', {
            name: 'The project comparison could not be completed',
        });
        expect(posts.filter(({ side }) => side === 'before')).toHaveLength(1);
        await user.click(screen.getByRole('button', { name: 'Retry this side' }));
        await screen.findByRole('heading', { name: 'Comparison result' });
        expect(posts.filter(({ side }) => side === 'before')).toHaveLength(1);
        expect(posts.filter(({ side }) => side === 'after')).toHaveLength(2);
        expect(posts[1]?.key).toBe(posts[2]?.key);
    });

    it('compares a project it already holds against an upload without analysing it again', async () => {
        const user = userEvent.setup();
        rememberProject({
            token: 'remembered-token',
            name: 'cat-chase.sb3',
            kind: 'issues',
            analysisId: 4,
        });
        let diffBody: unknown;
        vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
            const url = String(input);
            if (url.endsWith('/api/v1/submissions') && init?.method === 'POST')
                return jsonResponse(
                    { submissionId: 1, token: 'after-token', status: 'queued' },
                    202,
                );
            if (url.endsWith('/submissions/after-token'))
                return jsonResponse({
                    token: 'after-token',
                    status: 'completed',
                    analysis: { id: 2, status: 'completed' },
                });
            if (url.endsWith('/api/v1/diffs')) {
                diffBody = JSON.parse(String(init?.body));
                return jsonResponse(result(true));
            }
            throw new Error(`Unexpected synthetic request: ${url}`);
        });
        renderProjectPage();

        // The project is already here, so it is offered by name and nothing about it is sent anywhere again.
        await user.click(screen.getAllByRole('radio', { name: 'A project already analysed' })[0]);
        expect(screen.getByLabelText('Analysed project')).toHaveValue('remembered-token:4');
        await user.click(screen.getAllByRole('radio', { name: 'Use a Scratch URL or ID' })[1]);
        await user.type(
            screen.getByLabelText('Project link', { selector: '#diff-after-url' }),
            '2',
        );
        await user.click(screen.getByRole('button', { name: 'Compare these projects' }));
        await screen.findByRole('heading', { name: 'Identical project state' });

        expect(diffBody).toEqual({
            before: { submissionToken: 'remembered-token', analysisId: 4 },
            after: { submissionToken: 'after-token', analysisId: 2 },
        });
    });

    // Each source mode says what it wants in its own words: the file picker and the URL field are not explained
    // by the same note, and a chosen analysis is not reported as still being waited for.
    it('says what each source mode wants and whether it has it', async () => {
        const user = userEvent.setup();
        rememberProject({
            token: 'remembered-token',
            name: 'cat-chase.sb3',
            kind: 'issues',
            analysisId: 4,
        });
        renderProjectPage();
        const hint = () => document.querySelector('#diff-before-hint')?.textContent ?? '';
        const status = () => document.querySelector('#diff-before-status')?.textContent ?? '';

        // Upload, empty.
        expect(hint()).toBe('An .sb3 or .mblock file from your computer.');
        expect(status()).toContain('Waiting for a valid source.');

        // Upload, with a readable archive.
        await user.upload(
            screen.getByLabelText('Your project file', { selector: '#diff-before-file' }),
            await syntheticProjectFile('before.sb3'),
        );
        await waitFor(() => expect(hint()).toBe('Your file looks good.'));
        expect(status()).toContain('This source is ready.');

        // URL, empty, then wrong, then right.
        await user.click(screen.getAllByRole('radio', { name: 'Use a Scratch URL or ID' })[0]);
        expect(hint()).toBe('Use a canonical Scratch project URL or a numeric project ID.');
        expect(status()).toContain('Waiting for a valid source.');
        await user.type(
            screen.getByLabelText('Project link', { selector: '#diff-before-url' }),
            'not a link',
        );
        expect(status()).toContain('This source cannot be used.');
        expect(document.querySelector('#diff-before-hint')).toHaveClass('validation-error');
        await user.clear(screen.getByLabelText('Project link', { selector: '#diff-before-url' }));
        await user.type(
            screen.getByLabelText('Project link', { selector: '#diff-before-url' }),
            '12345',
        );
        expect(status()).toContain('This source is ready.');

        // An analysis this device already holds is chosen the moment the mode is.
        await user.click(screen.getAllByRole('radio', { name: 'A project already analysed' })[0]);
        expect(hint()).not.toContain('Scratch project URL');
        expect(status()).toContain('This source is ready.');
    });

    it('tells two results of the same project apart in the chooser', async () => {
        const user = userEvent.setup();
        const hour = 60 * 60 * 1000;
        rememberProject({
            token: 'older',
            name: 'cat-chase.sb3',
            kind: 'issues',
            analysisId: 4,
            at: Date.now() - 3 * hour,
        });
        rememberProject({
            token: 'newer',
            name: 'cat-chase.sb3',
            kind: 'issues',
            analysisId: 9,
            at: Date.now() - 5 * 60 * 1000,
        });
        renderProjectPage();

        await user.click(screen.getAllByRole('radio', { name: 'A project already analysed' })[0]);
        const options = [...screen.getByLabelText('Analysed project').querySelectorAll('option')]
            .map((option) => option.textContent)
            .filter((label) => label !== 'Choose a project…');

        expect(options).toEqual(['cat-chase.sb3 · 5 minutes ago', 'cat-chase.sb3 · 3 hours ago']);
    });

    it('takes the whole result link where a bare code used to be required', async () => {
        expect(submissionTokenFrom('https://example.org/litterbox/submissions/abc-123')).toBe(
            'abc-123',
        );
        expect(submissionTokenFrom('  https://example.org/litterbox/questions/xyz/  ')).toBe('xyz');
        // Anything that is not a link is what the field always took.
        expect(submissionTokenFrom('  abc-123 ')).toBe('abc-123');
        expect(submissionTokenFrom('https://example.org/elsewhere/abc')).toBe(
            'https://example.org/elsewhere/abc',
        );
    });

    it('gives the form back the moment a run is cancelled, without waiting for it to unwind', async () => {
        const user = userEvent.setup();
        vi.spyOn(globalThis, 'fetch').mockImplementation((input, init) => {
            const url = String(input);
            if (url.endsWith('/api/v1/submissions') && init?.method === 'POST')
                return Promise.resolve(
                    jsonResponse(
                        { submissionId: 1, token: 'pending-token', status: 'queued' },
                        202,
                    ),
                );
            if (url.endsWith('/cancel'))
                return Promise.resolve(new Response(null, { status: 204 }));
            // Neither side ever answers, so the run is still in flight when it is cancelled.
            if (url.includes('/submissions/pending-token'))
                return new Promise<Response>(() => undefined);
            return Promise.reject(new Error(`Unexpected synthetic request: ${url}`));
        });
        renderProjectPage();
        await user.click(screen.getAllByRole('radio', { name: 'Use a Scratch URL or ID' })[0]);
        await user.click(screen.getAllByRole('radio', { name: 'Use a Scratch URL or ID' })[1]);
        const beforeUrl = screen.getByLabelText('Project link', { selector: '#diff-before-url' });
        await user.type(beforeUrl, '1');
        await user.type(
            screen.getByLabelText('Project link', { selector: '#diff-after-url' }),
            '2',
        );
        await user.click(screen.getByRole('button', { name: 'Compare these projects' }));
        const cancel = await screen.findByRole('button', { name: 'Cancel project comparison' });
        expect(beforeUrl).toBeDisabled();

        await user.click(cancel);

        // The abandoned run is still unwinding in the background and will never report back. What the reader can
        // see must not be waiting on it: the fields are theirs again as soon as they ask for them back.
        expect(beforeUrl).toBeEnabled();
        expect(
            screen.queryByRole('button', { name: 'Cancel project comparison' }),
        ).not.toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Compare these projects' })).toBeEnabled();
    });

    it('aborts outstanding project requests on unmount without persisting source secrets', async () => {
        const user = userEvent.setup();
        const signals: AbortSignal[] = [];
        vi.spyOn(globalThis, 'fetch').mockImplementation((input, init) => {
            const url = String(input);
            if (url.endsWith('/api/v1/submissions') && init?.method === 'POST') {
                if (init.signal) signals.push(init.signal);
                return new Promise<Response>(() => undefined);
            }
            return Promise.reject(new Error(`Unexpected synthetic request: ${url}`));
        });
        const view = renderProjectPage();
        await user.click(screen.getAllByRole('radio', { name: 'Use a Scratch URL or ID' })[0]);
        await user.click(screen.getAllByRole('radio', { name: 'Use a Scratch URL or ID' })[1]);
        await user.type(
            screen.getByLabelText('Project link', { selector: '#diff-before-url' }),
            '1',
        );
        await user.type(
            screen.getByLabelText('Project link', { selector: '#diff-after-url' }),
            '2',
        );
        await user.click(screen.getByRole('button', { name: 'Compare these projects' }));
        await waitFor(() => expect(signals).toHaveLength(2));
        view.unmount();
        expect(signals.every((signal) => signal.aborted)).toBe(true);
        expect(window.location.search).toBe('');
        expect(window.localStorage.getItem('before-token')).toBeNull();
        expect(window.localStorage.getItem('after-token')).toBeNull();
        expect(window.sessionStorage.getItem('before-token')).toBeNull();
        expect(window.sessionStorage.getItem('after-token')).toBeNull();
    });
});

describe('monitorSubmission inactivity timeout', () => {
    beforeEach(async () => {
        await i18n.changeLanguage('en');
        vi.restoreAllMocks();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('does not give up on a run that keeps reporting progress past the 120-second mark, and resolves once it completes', async () => {
        vi.useFakeTimers();
        let completed = false;
        vi.spyOn(globalThis, 'fetch').mockImplementation(async () =>
            completed
                ? jsonResponse({
                      token: 'progressing-token',
                      status: 'completed',
                      analysis: { id: 7, status: 'completed' },
                  })
                : jsonResponse({ token: 'progressing-token', status: 'processing' }),
        );
        const controller = new AbortController();
        const statuses: string[] = [];
        const assertion = expect(
            monitorSubmission('progressing-token', controller.signal, (status) =>
                statuses.push(status),
            ),
        ).resolves.toEqual({ submissionToken: 'progressing-token', analysisId: 7 });

        // 50 polls 2.5 seconds apart span 125 seconds of elapsed time, past the old total-duration cap. Every
        // one of them answers, so under the fixed, inactivity-based cap none of that time counts as silence.
        for (let i = 0; i < 50; i += 1) {
            await vi.advanceTimersByTimeAsync(2500);
        }
        expect(statuses.filter((status) => status === 'processing').length).toBeGreaterThan(48);

        completed = true;
        await vi.advanceTimersByTimeAsync(2500);
        await assertion;
    });

    it('still times out a run that never answers at all once the inactivity window elapses', async () => {
        vi.useFakeTimers();
        vi.spyOn(globalThis, 'fetch').mockImplementation(
            () => new Promise<Response>(() => undefined),
        );
        const controller = new AbortController();
        const assertion = expect(
            monitorSubmission('silent-token', controller.signal, () => undefined),
        ).rejects.toMatchObject({ category: 'timeout' });

        await vi.advanceTimersByTimeAsync(120_000);
        await assertion;
    });
});
