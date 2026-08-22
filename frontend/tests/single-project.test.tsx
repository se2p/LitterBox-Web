// SPDX-License-Identifier: EUPL-1.2
// SPDX-FileCopyrightText: 2025 LitterBox-Web contributors

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import JSZip from 'jszip';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { validateArchiveBuffer } from '../src/lib/archive-inspection';
import { MAX_PATH_DEPTH, isNumericScratchProjectUrl } from '../src/lib/archive-preflight';
import { safeAssetUrl } from '../src/components/single-project/asset-url';
import { Thumbnail } from '../src/components/single-project/Thumbnail';
import i18n from '../src/i18n';
import { capabilitiesResponse, issue as finding, response } from './helpers';
import { renderAt } from './render';

const archiveFile = async (name: string): Promise<File> => {
    const zip = new JSZip();
    zip.file('project.json', '{}');
    zip.file('sprites/sprite.json', '{}');
    const bytes = await zip.generateAsync({ type: 'uint8array' });
    const buffer = bytes.buffer.slice(
        bytes.byteOffset,
        bytes.byteOffset + bytes.byteLength,
    ) as ArrayBuffer;
    return new File([buffer], name);
};

describe('single-project UI', () => {
    beforeEach(async () => {
        await i18n.changeLanguage('en');
        vi.restoreAllMocks();
        vi.stubGlobal('EventSource', undefined);
        vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
            measureText: () => ({ width: 10 }),
        } as unknown as CanvasRenderingContext2D);
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it.each(['project.sb3', 'project.mblock'])(
        'submits a valid %s archive with a stable retry key',
        async (name) => {
            const user = userEvent.setup();
            const file = await archiveFile(name);
            const fetchMock = vi
                .spyOn(globalThis, 'fetch')
                .mockResolvedValueOnce(capabilitiesResponse(['single-project']))
                .mockResolvedValueOnce(
                    response(
                        {
                            submissionId: 1,
                            token: 'synthetic-token',
                            status: 'queued',
                            location: '/submissions/synthetic-token',
                        },
                        202,
                    ),
                )
                .mockResolvedValue(
                    response({
                        status: 'completed',
                        analysis: { issues: [] },
                        analyses: [],
                        counts: { expected: 1, completed: 1, failed: 0 },
                    }),
                );
            renderAt('/submit');

            await waitFor(() =>
                expect(screen.getByLabelText('Your project file')).toBeInTheDocument(),
            );
            await user.upload(screen.getByLabelText('Your project file'), file);
            await waitFor(() =>
                expect(screen.getByRole('status')).toHaveTextContent('Your file looks good'),
            );
            await user.click(screen.getByRole('button', { name: 'Check my project' }));
            await waitFor(() => expect(fetchMock).toHaveBeenCalled());
            const request = fetchMock.mock.calls[1]?.[1];
            expect(request?.headers).toEqual(
                expect.objectContaining({ 'Idempotency-Key': expect.any(String) }),
            );
            expect(request?.body).toBeInstanceOf(FormData);
        },
    );

    it('rejects invalid canonical URLs and submits only the accepted URL shape', async () => {
        const user = userEvent.setup();
        const fetchMock = vi
            .spyOn(globalThis, 'fetch')
            .mockResolvedValueOnce(capabilitiesResponse(['single-project']))
            .mockResolvedValueOnce(
                response(
                    {
                        submissionId: 2,
                        token: 'url-token',
                        status: 'queued',
                        location: '/submissions/url-token',
                    },
                    202,
                ),
            )
            .mockResolvedValue(
                response({
                    status: 'completed',
                    analysis: { issues: [] },
                    analyses: [],
                    counts: { expected: 1, completed: 1, failed: 0 },
                }),
            );
        renderAt('/submit');
        await waitFor(() =>
            expect(screen.getByRole('group', { name: 'Analyse one project' })).toBeInTheDocument(),
        );
        expect(screen.getByRole('group', { name: 'Analyse one project' })).toBeInTheDocument();
        expect(
            screen.queryByRole('group', { name: 'Analyse a collection' }),
        ).not.toBeInTheDocument();
        // A greyed-out button says no without saying why, and there are two ways in to get wrong.
        expect(
            screen.getByText('Choose a file or paste a project link first.'),
        ).toBeInTheDocument();
        const url = screen.getByLabelText('Project link');
        await user.type(url, 'https://scratch.mit.edu/projects/not-numeric/?user=synthetic');
        expect(url).toHaveAttribute('aria-invalid', 'true');
        expect(screen.getByRole('button', { name: 'Check my project' })).toBeDisabled();
        expect(
            screen.getByText('Fix the project link, or choose a file instead.'),
        ).toBeInTheDocument();
        await user.clear(url);
        await user.type(url, 'https://scratch.mit.edu/projects/12345/');
        await user.click(screen.getByRole('button', { name: 'Check my project' }));
        await waitFor(() => expect(fetchMock).toHaveBeenCalled());
        expect(JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body))).toEqual({
            projectUrl: 'https://scratch.mit.edu/projects/12345/',
        });
        expect(isNumericScratchProjectUrl('http://scratch.mit.edu/projects/12345/')).toBe(false);
    });

    // There is no error boundary above these pages, so anything thrown while drawing them takes the whole
    // application down to a blank screen with no way back. A response that disagrees with the schema has to
    // stop being wrong at the boundary rather than halfway down a render.
    it.each([
        { what: 'an analysis that arrived as null', analysis: null as unknown },
        {
            what: 'findings that arrived as an object',
            analysis: { id: 1, status: 'completed', name: 'p.sb3', issues: {} } as unknown,
        },
        {
            what: 'lists inside a finding that arrived as objects',
            analysis: {
                id: 1,
                status: 'completed',
                name: 'p.sb3',
                issues: [{ ...finding({ id: 1 }), duplicates: {}, similarTo: {}, costumes: {} }],
            } as unknown,
        },
        {
            // Every one of these is read straight into .trim(), .toLowerCase() or localeCompare.
            what: 'a project name and version fields that arrived as numbers',
            analysis: {
                id: 1,
                status: 'completed',
                name: 1,
                litterboxVersion: 2,
                reportSchemaVersion: 3,
                locale: 4,
                provenance: 5,
                inputFormat: 6,
                sourceSha256: 7,
                detectors: [8, 'real-detector'],
                configuration: { detectors: {} },
                issues: [],
            } as unknown,
        },
        {
            what: 'a finding whose finder, type and sprite arrived as numbers',
            analysis: {
                id: 1,
                status: 'completed',
                name: 'p.sb3',
                issues: [{ ...finding({ id: 1 }), finderId: 1, finderName: 2, type: 3, sprite: 4 }],
            } as unknown,
        },
        {
            // entry.locale.toLowerCase() is read with no check at all, on any finding the catalogue matched.
            what: 'a catalogue entry with no usable locale or examples',
            analysis: {
                id: 1,
                status: 'completed',
                name: 'p.sb3',
                issues: [finding({ id: 1 })],
                catalogue: [
                    {
                        id: 1,
                        title: 2,
                        locale: 3,
                        description: 4,
                        instruction: 5,
                        examples: 'not a list',
                    },
                ],
            } as unknown,
        },
    ])('still shows the result page when the service sends $what', async ({ analysis }) => {
        vi.spyOn(globalThis, 'fetch').mockImplementation((input) =>
            Promise.resolve(
                String(input).includes('/capabilities')
                    ? capabilitiesResponse(['single-project'])
                    : response({
                          schemaVersion: 1,
                          submissionId: 1,
                          token: 'malformed-token',
                          status: 'completed',
                          locale: 'en',
                          sourceType: 'UPLOAD',
                          counts: { expected: 1, completed: 1, failed: 0 },
                          analysis,
                          analyses: [analysis],
                      }),
            ),
        );
        const view = renderAt('/submissions/malformed-token');
        expect(await screen.findByText('Analysis complete')).toBeInTheDocument();
        expect(screen.getAllByRole('heading', { level: 1 })[0]).toHaveTextContent(
            /^Project analysis/,
        );
        // Not merely "did not throw": a render that throws unmounts the root, and what is asserted above
        // would then have been found in the wreckage of a tree React had already given up on.
        expect(view.container.innerHTML.length).toBeGreaterThan(0);
    });

    it('drops a submission still in flight when the reader leaves the form', async () => {
        const user = userEvent.setup();
        const signals: AbortSignal[] = [];
        vi.spyOn(globalThis, 'fetch').mockImplementation((input, init) => {
            if (String(input).includes('/capabilities'))
                return Promise.resolve(capabilitiesResponse(['single-project']));
            // The service never answers, so the request is still outstanding when the form goes.
            if (init?.signal) signals.push(init.signal);
            return new Promise<Response>(() => undefined);
        });
        const view = renderAt('/submit');
        await waitFor(() => expect(screen.getByLabelText('Project link')).toBeInTheDocument());
        await user.type(
            screen.getByLabelText('Project link'),
            'https://scratch.mit.edu/projects/12345/',
        );
        await user.click(screen.getByRole('button', { name: 'Check my project' }));
        await waitFor(() => expect(signals).toHaveLength(1));

        view.unmount();

        // Nobody is left to be told. An answer arriving now would take a reader who has gone elsewhere and drop
        // them on a result they never waited for.
        expect(signals[0]?.aborted).toBe(true);
    });

    it('retries a failed submission with the same idempotency key', async () => {
        const user = userEvent.setup();
        const fetchMock = vi
            .spyOn(globalThis, 'fetch')
            .mockResolvedValueOnce(capabilitiesResponse(['single-project']))
            .mockRejectedValueOnce(new Error('synthetic transient failure'))
            .mockResolvedValueOnce(
                response(
                    {
                        submissionId: 3,
                        token: 'retry-token',
                        status: 'queued',
                        location: '/submissions/retry-token',
                    },
                    202,
                ),
            )
            .mockResolvedValue(
                response({ status: 'completed', analysis: { issues: [] }, analyses: [] }),
            );
        renderAt('/submit');
        await waitFor(() => expect(screen.getByLabelText('Project link')).toBeInTheDocument());
        const url = screen.getByLabelText('Project link');
        await user.type(url, 'https://scratch.mit.edu/projects/12345/');
        await user.click(screen.getByRole('button', { name: 'Check my project' }));
        await waitFor(() => expect(screen.getByRole('button', { name: 'Retry' })).toBeEnabled());
        await user.click(screen.getByRole('button', { name: 'Retry' }));
        await waitFor(() => expect(fetchMock.mock.calls.length).toBeGreaterThanOrEqual(2));
        expect(fetchMock.mock.calls[1]?.[1]?.headers).toEqual(
            expect.objectContaining({ 'Idempotency-Key': expect.any(String) }),
        );
        expect(fetchMock.mock.calls[2]?.[1]?.headers).toEqual(
            expect.objectContaining({
                'Idempotency-Key': fetchMock.mock.calls[1]?.[1]?.headers
                    ? (fetchMock.mock.calls[1]?.[1]?.headers as Record<string, string>)[
                          'Idempotency-Key'
                      ]
                    : undefined,
            }),
        );
    });

    it('renders grouped finding cards while omitting internal identifiers and legacy result sections', async () => {
        const user = userEvent.setup();
        const asset = `/api/v1/submissions/result-token/assets/${'a'.repeat(64)}`;
        const issue = finding({
            id: 1,
            finderId: 'long-script',
            finderName: 'Long script',
            type: 'smell',
            hint: '[b]Translated synthetic hint[/b][newLine]',
            sprite: 'Cat',
            blockId: 'block-1',
            costume: 'cat.png',
            scratchblocks: '[scratchblocks]\nmove (10) steps\n[/scratchblocks]',
            duplicates: [20202],
            severity: 2,
            costumes: ['cat.png'],
            refactoringScratchblocks: '[scratchblocks]\nmove (5) steps\n[/scratchblocks]',
        });
        const secondIssue = {
            ...issue,
            id: 2,
            finderId: 'dead-code',
            finderName: 'Dead code',
            type: 'bug',
            severity: 1,
            duplicates: [],
            refactoringScratchblocks: '[scratchblocks]   [/scratchblocks]',
        };
        const thirdIssue = {
            ...issue,
            id: 3,
            finderId: 'perfume-path',
            finderName: 'Perfume path',
            type: 'smell',
            sprite: 'Dog',
            severity: 3,
            duplicates: [],
            refactoringScratchblocks: null,
        };
        const body = {
            schemaVersion: 1,
            submissionId: 4,
            token: 'result-token',
            status: 'completed',
            locale: 'en',
            sourceType: 'UPLOAD',
            analysis: {
                id: 7,
                status: 'completed',
                name: 'synthetic.sb3',
                issues: [issue, secondIssue, thirdIssue],
                relationships: [{ source: 10101, target: 20202, type: 'duplicate' }],
                metrics: { blocks: 12 },
                catalogue: [
                    {
                        id: 'long-script',
                        title: 'Long script',
                        description: 'Synthetic catalogue entry',
                        locale: 'en',
                        fallback: true,
                        instruction: 'Use a smaller script.',
                        examples: [],
                        issueType: 'smell',
                        severity: 1,
                    },
                ],
                quiz: [
                    { questionId: 'q-1', question: 'Which option is useful?', options: ['A', 'B'] },
                ],
                assetRefs: [asset],
            },
            analyses: [],
            counts: { expected: 1, completed: 1, failed: 0 },
        };
        const fetchMock = vi
            .spyOn(globalThis, 'fetch')
            .mockResolvedValueOnce(response(body))
            .mockResolvedValueOnce(capabilitiesResponse(['single-project']))
            .mockResolvedValue(response(undefined, 204));
        renderAt('/submissions/result-token');

        await waitFor(() =>
            expect(screen.getByRole('heading', { name: 'Long script' })).toBeInTheDocument(),
        );
        // The page title and the line naming the project were two lines saying one thing between them.
        expect(
            screen.getByRole('heading', { name: 'Project analysis of synthetic.sb3', level: 1 }),
        ).toBeInTheDocument();
        expect(screen.queryByText('Analysed project:')).not.toBeInTheDocument();
        expect(screen.getAllByText('Translated synthetic hint')).toHaveLength(3);
        expect(screen.queryByText(/\[b\]|\[newLine\]/)).not.toBeInTheDocument();
        expect(screen.queryByText('cat.png')).not.toBeInTheDocument();
        const firstCardMarkup =
            screen.getByRole('heading', { name: 'Long script' }).closest('.finding-group')
                ?.outerHTML ?? '';
        expect(firstCardMarkup).not.toContain('cat.png');
        expect(screen.getAllByRole('img', { name: 'Current costume for Cat' })[0]).toHaveClass(
            'costume-fallback',
        );
        // The finder names the group; the thumbs belong to the one occurrence under it.
        const firstGroup = screen
            .getByRole('heading', { name: 'Long script' })
            .closest('.finding-group')!;
        expect(firstGroup.querySelector('.finding-group-meta .issue-type')).not.toBeNull();
        const firstCard = firstGroup.querySelector('article')!;
        expect(firstCard.querySelector('.issue-heading-meta .feedback-controls')).not.toBeNull();

        // Nothing of the analyser's own bookkeeping on a child's page: not the severity number, not the graph of
        // findings this one sits in, and not the identifiers. The finder is named in the heading above and the
        // block is the one drawn underneath, so all of it would only be the tool talking to itself.
        expect(firstCard.querySelector('.issue-technical')).toBeNull();
        expect(firstGroup.textContent).not.toContain('Severity level');
        expect(firstGroup.textContent).not.toContain('Finding 20202');
        expect(firstGroup.textContent).not.toContain('long-script');
        expect(firstGroup.textContent).not.toContain('block-1');
        expect(screen.getAllByText('Refactoring comparison')).toHaveLength(1);
        expect(screen.getAllByText('move (10) steps').length).toBeGreaterThan(0);
        expect(screen.getByText('move (5) steps')).toBeInTheDocument();
        expect(firstGroup.querySelectorAll('.scratchblocks-preview')).toHaveLength(2);
        const deadCode = screen
            .getByRole('heading', { name: 'Dead code' })
            .closest('.finding-group')!;
        expect(deadCode.querySelector('.issue-technical')).toBeNull();
        expect(deadCode.textContent).not.toContain('dead-code');
        expect(deadCode.querySelectorAll('.scratchblocks-preview')).toHaveLength(1);
        expect(deadCode.querySelector('.refactoring-comparison')).toBeNull();
        // The blocks are drawn, not captioned with the name of the notation they are drawn in.
        expect(screen.queryByText('Scratchblocks')).not.toBeInTheDocument();
        expect(screen.queryByText('Fallback content')).not.toBeInTheDocument();
        // What the catalogue says about this finder, once, beside the finder it describes.
        expect(screen.getByText('Synthetic catalogue entry')).toBeInTheDocument();
        expect(screen.getByText('Use a smaller script.')).toBeInTheDocument();
        expect(screen.getAllByText('English fallback').length).toBeGreaterThan(0);
        // Folded, and after the findings. Open and above them it was a paragraph and a picture of blocks about
        // the pattern in general, standing exactly where this project's own finding was expected.
        const material = firstGroup.querySelector('details.finding-group-catalogue')!;
        expect(material).not.toHaveAttribute('open');
        expect(material.querySelector('summary')?.textContent).toBe(
            'What LitterBox says about this pattern',
        );
        expect(
            firstCard.compareDocumentPosition(material) & Node.DOCUMENT_POSITION_FOLLOWING,
        ).toBeTruthy();
        expect(screen.queryByRole('heading', { name: 'Relationships' })).not.toBeInTheDocument();
        expect(screen.queryByRole('heading', { name: 'Project assets' })).not.toBeInTheDocument();
        expect(screen.queryByRole('heading', { name: 'Catalogue' })).not.toBeInTheDocument();
        expect(
            screen.queryByRole('heading', { name: 'Check your understanding' }),
        ).not.toBeInTheDocument();
        expect(screen.getByRole('heading', { name: 'Bugs' })).toBeInTheDocument();
        expect(screen.getByRole('heading', { name: 'Smells' })).toBeInTheDocument();
        expect(screen.getByRole('heading', { name: 'Perfumes' })).toBeInTheDocument();
        expect(screen.getByText('No findings in Perfumes.')).toBeInTheDocument();
        // The three words are the tool's own vocabulary, and nothing on the page said what they mean. Each
        // explainer says what LitterBox classifies under the heading — not what this child meant or got right,
        // neither of which LitterBox knows.
        expect(
            screen.getByText('Code patterns LitterBox reports as likely mistakes.'),
        ).toBeInTheDocument();
        expect(
            screen.getByText(
                'Patterns that work, but that LitterBox reports as harder to read or to change later on.',
            ),
        ).toBeInTheDocument();
        expect(
            screen.getByText('Patterns LitterBox reports as good practice.'),
        ).toBeInTheDocument();

        // Three parts, each a fold, the way the advanced workspace folds its capabilities. The first part that
        // found something is unrolled, so a reader lands on findings rather than on three closed doors.
        const folds = () =>
            Array.from(document.querySelectorAll<HTMLDetailsElement>('.issue-family')).map(
                (fold) => [fold.querySelector('h3')?.textContent?.trim(), fold.open] as const,
            );
        // Opening one is a browser behaviour jsdom does not carry, so the e2e suite does that half.
        expect(folds()).toEqual([
            ['Bugs', true],
            ['Smells', false],
            ['Perfumes', false],
        ]);

        expect(screen.getByText('Showing 3 of 3 findings.')).toBeInTheDocument();
        // Family and sprite are picked from buttons; the rest stay behind the detail disclosure.
        await user.click(screen.getByRole('button', { name: /^Smells/ }));
        await user.click(screen.getByRole('button', { name: /^Cat/ }));
        await user.selectOptions(screen.getByLabelText('Filter by finder'), 'long-script');
        await user.selectOptions(screen.getByLabelText('Filter by severity'), '2');
        expect(screen.getByRole('heading', { name: 'Long script' })).toBeInTheDocument();
        expect(screen.queryByRole('heading', { name: 'Dead code' })).not.toBeInTheDocument();
        expect(screen.queryByRole('heading', { name: 'Perfume path' })).not.toBeInTheDocument();
        expect(screen.getByText('Showing 1 of 3 findings.')).toBeInTheDocument();
        await user.click(screen.getByRole('button', { name: 'Reset filters' }));
        await user.selectOptions(screen.getByLabelText('Filter by type'), 'bug');
        expect(screen.queryByRole('heading', { name: 'Long script' })).not.toBeInTheDocument();
        expect(screen.getByRole('heading', { name: 'Dead code' })).toBeInTheDocument();
        await user.selectOptions(screen.getByLabelText('Filter by type'), 'all');
        await user.selectOptions(screen.getByLabelText('Sort findings'), 'severity-desc');
        // The sort orders the findings; the groups follow the first occurrence of each.
        expect(
            Array.from(document.querySelectorAll('.finding-group-heading h4')).map((heading) =>
                heading.textContent?.trim(),
            ),
        ).toEqual(['Perfume path', 'Long script', 'Dead code']);
        await user.click(screen.getAllByRole('button', { name: 'Helpful' })[0]!);
        await waitFor(() => expect(screen.getByText('Feedback saved.')).toBeInTheDocument());
        await user.click(screen.getAllByRole('button', { name: 'Not helpful' })[0]!);
        await waitFor(() => expect(fetchMock).toHaveBeenCalled());
        const requestBodies = fetchMock.mock.calls
            .map((call) => call[1]?.body)
            .filter((bodyValue): bodyValue is string => typeof bodyValue === 'string');
        expect(
            requestBodies.some((requestBody) => requestBody.includes('"reaction":"helpful"')),
        ).toBe(true);
        expect(
            requestBodies.some((requestBody) => requestBody.includes('"reaction":"not-helpful"')),
        ).toBe(true);
        expect(requestBodies.some((requestBody) => requestBody.includes('"correct"'))).toBe(false);
        expect(requestBodies.some((requestBody) => requestBody.includes('"questionId"'))).toBe(
            false,
        );
    });

    it('reports one finder once, however many times it was found', async () => {
        const repeated = (id: number, sprite: string) =>
            finding({ id, hint: `Occurrence ${id}`, sprite });
        vi.spyOn(globalThis, 'fetch')
            .mockResolvedValueOnce(
                response({
                    schemaVersion: 1,
                    submissionId: 9,
                    token: 'grouped-token',
                    status: 'completed',
                    locale: 'en',
                    sourceType: 'UPLOAD',
                    analysis: {
                        id: 9,
                        status: 'completed',
                        name: 'grouped.sb3',
                        issues: [
                            repeated(1, 'Cat'),
                            repeated(2, 'Dog'),
                            repeated(3, 'Cat'),
                            {
                                ...repeated(4, 'Cat'),
                                finderId: '',
                                finderName: '',
                                hint: 'Nameless occurrence',
                            },
                        ],
                        relationships: [],
                        metrics: {},
                        catalogue: [],
                        quiz: [],
                        assetRefs: [],
                    },
                    analyses: [],
                    counts: { expected: 1, completed: 1, failed: 0 },
                }),
            )
            .mockResolvedValue(capabilitiesResponse(['single-project']));
        renderAt('/submissions/grouped-token');

        // Three cards saying the same thing looked like three problems. It is one, found three times.
        const group = await screen.findByRole('heading', { name: 'Variable never set' });
        // How many and where in one phrase: three times says nothing on its own about which sprites it was in.
        expect(screen.getByText('Reported 3 times in Cat, Dog')).toBeInTheDocument();

        // Nothing is hidden: each occurrence keeps its own evidence and its own feedback control.
        const details = group.closest('details')!;
        expect(details.querySelectorAll('article')).toHaveLength(3);
        expect(details.querySelectorAll('.feedback-controls')).toHaveLength(3);

        // A finding with no finder id stands alone rather than joining anything by name.
        expect(screen.getByText('Nameless occurrence')).toBeInTheDocument();
        expect(document.querySelectorAll('.finding-group')).toHaveLength(2);
        expect(screen.getByText('Showing 4 of 4 findings.')).toBeInTheDocument();
    });

    it('gives the stage the reader\u2019s own word for it while filtering on the analyser\u2019s name', async () => {
        const user = userEvent.setup();
        await i18n.changeLanguage('de');
        const stageIssue = finding({
            id: 1,
            finderId: 'long-script',
            finderName: 'Langes Skript',
            type: 'smell',
            hint: 'Synthetischer Hinweis',
            // The analyser calls this actor "Stage" in every language, because that is the project file's own name.
            sprite: 'Stage',
            blockId: 'block-1',
            costume: 'stage.png',
            scratchblocks: '[scratchblocks]\nmove (10) steps\n[/scratchblocks]',
            severity: 2,
            costumes: ['stage.png'],
        });
        const spriteIssue = { ...stageIssue, id: 2, sprite: 'Katze', finderName: 'Toter Code' };
        vi.spyOn(globalThis, 'fetch')
            .mockResolvedValueOnce(
                response({
                    schemaVersion: 1,
                    submissionId: 4,
                    token: 'result-token',
                    status: 'completed',
                    locale: 'de',
                    sourceType: 'UPLOAD',
                    analysis: {
                        id: 7,
                        status: 'completed',
                        name: 'synthetic.sb3',
                        issues: [stageIssue, spriteIssue],
                        relationships: [],
                        metrics: {},
                        catalogue: [],
                        quiz: [],
                        assetRefs: [],
                    },
                    analyses: [],
                    counts: { expected: 1, completed: 1, failed: 0 },
                }),
            )
            .mockResolvedValue(capabilitiesResponse(['single-project']));
        renderAt('/submissions/result-token');

        await waitFor(() =>
            expect(screen.getByRole('heading', { name: 'Langes Skript' })).toBeInTheDocument(),
        );
        expect(screen.queryByRole('button', { name: /^Stage/ })).toBeNull();
        const stageFilter = screen.getByRole('button', { name: /^Bühne/ });

        // Filtering still runs on the analyser's name, so translating the label must not lose the findings.
        await user.click(stageFilter);
        expect(screen.getByRole('heading', { name: 'Langes Skript' })).toBeInTheDocument();
        expect(screen.queryByRole('heading', { name: 'Toter Code' })).toBeNull();
        expect(screen.getAllByText('Bühne').length).toBeGreaterThan(0);
        // Not restored here: beforeEach already does it, and changing the language with the page still mounted
        // re-renders every translated component outside act, which is what made this suite noisy.
    });

    it('shows an invalid-token recovery state without exposing response details', async () => {
        vi.spyOn(globalThis, 'fetch').mockResolvedValue(
            response({ error: 'source path /private/user' }, 404),
        );
        renderAt('/submissions/expired-token');
        await waitFor(() =>
            expect(screen.getByText('Invalid or expired submission token.')).toBeInTheDocument(),
        );
        expect(screen.queryByText(/private\/user/)).not.toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
    });

    it('renders persisted analysis failures without exposing response details', async () => {
        vi.spyOn(globalThis, 'fetch').mockResolvedValue(
            response(
                {
                    schemaVersion: 1,
                    submissionId: 12,
                    token: 'failed-token',
                    status: 'failed',
                    locale: 'en',
                    sourceType: 'UPLOAD',
                    analysis: {
                        id: 13,
                        status: 'failed',
                        name: 'broken.mblock',
                        failureType: 'ZipException',
                        failureMessage: 'Synthetic malformed archive',
                        issues: [],
                        relationships: [],
                        metrics: {},
                        catalogue: [],
                        quiz: [],
                        assetRefs: [],
                    },
                    analyses: [],
                    counts: { expected: 1, completed: 0, failed: 1 },
                },
                200,
            ),
        );
        renderAt('/submissions/failed-token');

        expect(await screen.findByRole('alert')).toHaveTextContent('Synthetic malformed archive');
        expect(screen.queryByText(/storageKey|sourceArtifact|manifest/i)).not.toBeInTheDocument();
    });

    it('keeps untrusted result and catalogue content as inert text', async () => {
        const payload = '<img src=x onerror=alert(42)>';
        vi.spyOn(globalThis, 'fetch').mockResolvedValue(
            response({
                schemaVersion: 1,
                submissionId: 14,
                token: 'xss-token',
                status: 'completed',
                locale: 'en',
                sourceType: 'UPLOAD',
                analysis: {
                    id: 15,
                    status: 'completed',
                    name: 'synthetic.sb3',
                    issues: [
                        finding({
                            id: 1,
                            finderId: 'synthetic-finder',
                            finderName: payload,
                            type: 'smell',
                            hint: payload,
                            sprite: payload,
                            blockId: 'block-1',
                            scratchblocks: payload,
                            currentCostume: -1,
                        }),
                    ],
                    relationships: [],
                    metrics: {},
                    catalogue: [
                        {
                            id: 'synthetic-finder',
                            title: payload,
                            description: payload,
                            locale: 'en',
                            fallback: true,
                            instruction: payload,
                            examples: [],
                            issueType: 'smell',
                            severity: 1,
                        },
                    ],
                    quiz: [],
                    assetRefs: [],
                },
                analyses: [],
                counts: { expected: 1, completed: 1, failed: 0 },
            }),
        );
        renderAt('/submissions/xss-token');

        await waitFor(() => expect(screen.getAllByText(payload).length).toBeGreaterThan(0));
        expect(document.querySelector('img[src="x"]')).toBeNull();
        expect(document.querySelector('[onerror]')).toBeNull();
    });

    /**
     * A costume is admitted on the understanding that it will be loaded as a picture and never parsed into this page.
     * That is not a property of the reference, it is a property of the element it is handed to, so the element is what
     * is asserted: an `img`, with the costume left as a `src` nobody read.
     */
    it('hands a costume reference to an image element and never to anything that parses it', () => {
        const hash = 'e'.repeat(64);
        render(
            <Thumbnail
                sprite="Cat"
                thumbnailRef={`/litterbox/api/v1/submissions/token/assets/${hash}`}
                label="Current costume for Cat"
                fallbackLabel="Fallback preview"
            />,
        );

        const costume = screen.getByRole('img', { name: 'Current costume for Cat' });
        expect(costume.tagName).toBe('IMG');
        expect(costume).toHaveAttribute('src', expect.stringContaining(hash));
        expect(document.querySelector('object, embed, iframe, svg')).toBeNull();
        expect(document.body.innerHTML).not.toContain('<svg');
    });

    it('accepts only exact same-origin asset capability paths', () => {
        const hash = 'a'.repeat(64);
        expect(safeAssetUrl(`/litterbox/api/v1/submissions/token/assets/${hash}`)).toContain(hash);
        expect(safeAssetUrl(`/litterbox/api/v1/submissions/token/assets/${hash}?download=1`)).toBe(
            undefined,
        );
        expect(safeAssetUrl(`/litterbox/api/v1/submissions/token/assets/${'x'.repeat(64)}`)).toBe(
            undefined,
        );
        expect(safeAssetUrl(`https://example.invalid/submissions/token/assets/${hash}`)).toBe(
            undefined,
        );
    });

    it('renders safe thumbnail references, preserves fallback safety, and resets failures', () => {
        const hash = 'b'.repeat(64);
        const validReference = `/litterbox/api/v1/submissions/token/assets/${hash}`;
        const view = render(
            <Thumbnail
                sprite="Cat"
                thumbnailRef={validReference}
                label="Current costume for Cat"
                fallbackLabel="Fallback preview"
            />,
        );
        expect(screen.getByRole('img', { name: 'Current costume for Cat' })).toHaveAttribute(
            'src',
            expect.stringContaining(hash),
        );
        fireEvent.error(screen.getByRole('img', { name: 'Current costume for Cat' }));
        expect(screen.getByText('Fallback preview')).toBeInTheDocument();

        view.rerender(
            <Thumbnail
                sprite="Cat"
                thumbnailRef={`${validReference.slice(0, -64)}${'c'.repeat(64)}`}
                label="Current costume for Cat"
                fallbackLabel="Fallback preview"
            />,
        );
        expect(screen.getByRole('img', { name: 'Current costume for Cat' })).toHaveAttribute(
            'src',
            expect.stringContaining('c'.repeat(64)),
        );

        for (const reference of [
            null,
            '/litterbox/api/v1/submissions/token/assets/not-a-hash',
            `${validReference}?download=1`,
            `https://example.invalid/submissions/token/assets/${hash}`,
        ]) {
            view.rerender(
                <Thumbnail
                    sprite="Cat"
                    thumbnailRef={reference}
                    label="Current costume for Cat"
                    fallbackLabel="Fallback preview"
                />,
            );
            expect(screen.getByText('Fallback preview')).toBeInTheDocument();
        }
    });

    it('enforces path nesting and releases validation data through the finished promise', async () => {
        const zip = new JSZip();
        zip.file('project.json', '{}');
        zip.file(`${'nested/'.repeat(MAX_PATH_DEPTH)}asset.txt`, 'synthetic');
        const bytes = await zip.generateAsync({ type: 'arraybuffer' });
        await expect(validateArchiveBuffer(bytes)).resolves.toMatchObject({
            valid: false,
            reason: 'too-deep',
        });
    });
});
