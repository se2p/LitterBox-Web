// SPDX-License-Identifier: EUPL-1.2
// SPDX-FileCopyrightText: 2025 LitterBox-Web contributors

import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import JSZip from 'jszip';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { preflightArchive } from '../src/lib/archive-preflight';
import i18n from '../src/i18n';
import { capabilitiesResponse, issue, response } from './helpers';
import { renderAt } from './render';

const asArrayBuffer = (bytes: Uint8Array): ArrayBuffer =>
    bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;

const teacherArchive = async (): Promise<File> => {
    const validProject = new JSZip();
    validProject.file('project.json', '{}');
    const invalidProject = new JSZip();
    invalidProject.file('assets.txt', 'synthetic');
    const outer = new JSZip();
    outer.file(
        'valid.sb3',
        (await validProject.generateAsync({ type: 'uint8array' })) as unknown as ArrayBuffer,
    );
    outer.file(
        'needs-attention.mblock',
        (await invalidProject.generateAsync({ type: 'uint8array' })) as unknown as ArrayBuffer,
    );
    const bytes = await outer.generateAsync({ type: 'uint8array' });
    return new File([asArrayBuffer(bytes)], 'synthetic-teacher.zip');
};

const completedAnalysis = (id: number, name: string, finderName: string) => ({
    id,
    name,
    status: 'completed',
    issues: [
        issue({
            id,
            finderId: `synthetic-${id}`,
            finderName,
            hint: 'Synthetic hint',
            currentCostume: -1,
        }),
    ],
    relationships: [],
    metrics: {},
    catalogue: [],
    quiz: [],
    assetRefs: [],
});

describe('batch workflows', () => {
    beforeEach(async () => {
        await i18n.changeLanguage('en');
        window.localStorage.clear();
        vi.restoreAllMocks();
        vi.stubGlobal('EventSource', undefined);
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('gates collection choices behind enabled capabilities', async () => {
        const fetchMock = vi
            .spyOn(globalThis, 'fetch')
            .mockResolvedValue(capabilitiesResponse(['single-project']));
        renderAt('/submit');

        await screen.findByLabelText('Your project file');
        expect(screen.queryByLabelText('Teacher batch archive (.zip)')).not.toBeInTheDocument();
        expect(screen.queryByLabelText('Scratch studio ID or URL')).not.toBeInTheDocument();
        expect(screen.queryByRole('link', { name: 'For teachers' })).not.toBeInTheDocument();
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('keeps teacher ZIP and studio workflows on the Teacher page', async () => {
        vi.spyOn(globalThis, 'fetch').mockResolvedValue(
            capabilitiesResponse(['teacher-archive', 'studio']),
        );
        renderAt('/teacher');

        await screen.findByLabelText('Teacher batch archive (.zip)');
        expect(screen.getByLabelText('Scratch studio ID or URL')).toBeInTheDocument();
        expect(screen.queryByLabelText('Your project file')).not.toBeInTheDocument();
        expect(screen.getByRole('link', { name: 'For teachers' })).toHaveAttribute(
            'aria-current',
            'page',
        );
        // The link and the page it leads to say the same thing. The page holds three unrelated jobs now, so it is
        // named for the reader it is for rather than for the class set that used to be all of it.
        expect(screen.getByRole('heading', { level: 1, name: 'For teachers' })).toBeInTheDocument();
    });

    it('names the class-set question form for the set it makes rather than for a quiz', async () => {
        vi.spyOn(globalThis, 'fetch').mockResolvedValue(
            capabilitiesResponse(['teacher-archive', 'qlc']),
        );
        renderAt('/teacher');

        // The learner's form asks a reader a handful of questions. This one lays the whole set out against the
        // block model, and borrowing the learner's label made it sound like the teacher was about to be quizzed.
        expect(
            await screen.findByRole('button', { name: 'Generate all questions for this project' }),
        ).toBeInTheDocument();
        expect(
            screen.queryByRole('button', { name: 'Ask me about this project' }),
        ).not.toBeInTheDocument();
    });

    /*
     * The page carries three unrelated jobs, and question generation is one of them. A service that offers only
     * that one still has a teacher page worth naming.
     */
    it('reaches the teacher page for a service that offers question generation alone', async () => {
        vi.spyOn(globalThis, 'fetch').mockResolvedValue(capabilitiesResponse(['qlc']));
        renderAt('/teacher');

        expect(
            await screen.findByRole('button', { name: 'Generate all questions for this project' }),
        ).toBeInTheDocument();
        expect(screen.getByRole('link', { name: 'For teachers' })).toHaveAttribute(
            'aria-current',
            'page',
        );
        // Nothing else is offered, so nothing else is drawn.
        expect(screen.queryByLabelText('Teacher batch archive (.zip)')).not.toBeInTheDocument();
        expect(screen.queryByLabelText('Scratch studio ID or URL')).not.toBeInTheDocument();
    });

    it('asks again before sending a large studio, and says how large it is', async () => {
        const user = userEvent.setup();
        const fetchMock = vi
            .spyOn(globalThis, 'fetch')
            .mockImplementation(async (input: RequestInfo | URL) => {
                const url = String(input);
                if (url.includes('/api/v1/studios/'))
                    return response({
                        studioId: '12345',
                        title: 'Whole year',
                        readable: true,
                        projects: 240,
                    });
                if (url.includes('/api/v1/capabilities')) return capabilitiesResponse(['studio']);
                return response({ submissionId: 30, token: 'studio-token', status: 'queued' }, 202);
            });
        renderAt('/teacher');

        await user.type(await screen.findByLabelText('Scratch studio ID or URL'), '12345');
        // The studio is read before it is sent, so the second press can name what is about to happen.
        await screen.findByText('“Whole year” holds 240 projects, ready to analyse.');
        const submissions = () =>
            fetchMock.mock.calls.filter(
                (call) =>
                    String(call[0]).endsWith('/api/v1/submissions') &&
                    (call[1]?.method ?? 'GET') === 'POST',
            ).length;

        await user.click(screen.getByRole('button', { name: 'Check the studio' }));

        const dialog = screen.getByRole('dialog');
        expect(dialog).toHaveTextContent(/240 projects are fetched from the studio/);
        expect(submissions()).toBe(0);

        // Going back leaves the form exactly as it was, with nothing sent. Scoped to the actions, because the
        // dialog's own dismiss cross carries the same label for a screen reader.
        const actions = within(dialog.querySelector('.dialog-actions') as HTMLElement);
        await user.click(actions.getByRole('button', { name: 'Go back' }));
        await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
        expect(submissions()).toBe(0);

        await user.click(screen.getByRole('button', { name: 'Check the studio' }));
        await user.click(
            within(screen.getByRole('dialog')).getByRole('button', { name: 'Check the studio' }),
        );
        await waitFor(() => expect(submissions()).toBe(1));
        const sent = fetchMock.mock.calls.find(
            (call) =>
                String(call[0]).endsWith('/api/v1/submissions') &&
                (call[1]?.method ?? 'GET') === 'POST',
        );
        expect(JSON.parse(String(sent?.[1]?.body))).toEqual({ studioId: '12345' });
    });

    it('sends a class-sized studio without asking twice, now that its size is known', async () => {
        const user = userEvent.setup();
        const fetchMock = vi
            .spyOn(globalThis, 'fetch')
            .mockImplementation(async (input: RequestInfo | URL) => {
                const url = String(input);
                if (url.includes('/api/v1/studios/'))
                    return response({
                        studioId: '12345',
                        title: 'Klasse 8b',
                        readable: true,
                        projects: 24,
                    });
                if (url.includes('/api/v1/capabilities')) return capabilitiesResponse(['studio']);
                return response({ submissionId: 32, token: 'studio-token', status: 'queued' }, 202);
            });
        renderAt('/teacher');

        await user.type(await screen.findByLabelText('Scratch studio ID or URL'), '12345');
        await screen.findByText('“Klasse 8b” holds 24 projects, ready to analyse.');
        await user.click(screen.getByRole('button', { name: 'Check the studio' }));

        // Twenty-four projects is a lesson, not a commitment: a set this small is sent without being asked twice.
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
        await waitFor(() =>
            expect(
                fetchMock.mock.calls.some(
                    (call) =>
                        String(call[0]).endsWith('/api/v1/submissions') &&
                        (call[1]?.method ?? 'GET') === 'POST',
                ),
            ).toBe(true),
        );
    });

    it('sends a small archive without asking twice', async () => {
        const user = userEvent.setup();
        const file = await teacherArchive();
        const fetchMock = vi
            .spyOn(globalThis, 'fetch')
            .mockResolvedValueOnce(capabilitiesResponse(['teacher-archive']))
            .mockResolvedValueOnce(
                response({ submissionId: 31, token: 'small-token', status: 'queued' }, 202),
            )
            .mockResolvedValue(response({ token: 'small-token', status: 'queued' }));
        renderAt('/teacher');

        await user.upload(await screen.findByLabelText('Teacher batch archive (.zip)'), file);
        await waitFor(() => expect(screen.getByRole('status')).toBeInTheDocument());
        await user.click(screen.getByRole('button', { name: 'Check the class set' }));

        // One project is not a commitment, and a second press for it is friction with nothing behind it.
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
        await waitFor(() => expect(fetchMock.mock.calls.length).toBeGreaterThan(1));
    });

    it('offers the way back to a class set this device already sent', async () => {
        window.localStorage.setItem(
            'litterbox.recent-projects',
            JSON.stringify([
                {
                    token: 'batch-token',
                    name: 'year-seven.zip',
                    kind: 'batch',
                    projects: 12,
                    at: Date.now(),
                },
                { token: 'child-token', name: 'cat.sb3', kind: 'issues', at: Date.now() },
            ]),
        );
        vi.spyOn(globalThis, 'fetch').mockResolvedValue(capabilitiesResponse(['teacher-archive']));
        renderAt('/teacher');

        // A run over a whole class is not something to repeat because a tab was closed, and its link was
        // previously nowhere but the teacher's own history.
        expect(await screen.findByRole('link', { name: 'year-seven.zip' })).toHaveAttribute(
            'href',
            '/submissions/batch-token',
        );
        expect(screen.getByText(/Class set . 12 projects/)).toBeInTheDocument();
        // One project a child checked is not a class set and has no business on this page.
        expect(screen.queryByRole('link', { name: 'cat.sb3' })).not.toBeInTheDocument();
    });

    it('remembers a class set under its archive name when one is sent', async () => {
        const user = userEvent.setup();
        const file = await teacherArchive();
        vi.spyOn(globalThis, 'fetch')
            .mockResolvedValueOnce(capabilitiesResponse(['teacher-archive']))
            .mockResolvedValueOnce(
                response({ submissionId: 21, token: 'remembered-token', status: 'queued' }, 202),
            )
            .mockResolvedValue(response({ token: 'remembered-token', status: 'queued' }));
        renderAt('/teacher');

        const input = await screen.findByLabelText('Teacher batch archive (.zip)');
        await user.upload(input, file);
        await waitFor(() => expect(screen.getByRole('status')).toBeInTheDocument());
        await user.click(screen.getByRole('button', { name: 'Check the class set' }));

        // The name comes from here or from nowhere: a class set has no project name to fall back on, and the
        // result page it lands on never learns what the archive was called.
        await waitFor(() =>
            expect(
                JSON.parse(window.localStorage.getItem('litterbox.recent-projects') ?? '[]'),
            ).toContainEqual(
                expect.objectContaining({
                    token: 'remembered-token',
                    name: 'synthetic-teacher.zip',
                    kind: 'batch',
                }),
            ),
        );
    });

    it('marks the class set in the menu while a class-set result is on screen', async () => {
        vi.spyOn(globalThis, 'fetch').mockImplementation((input) =>
            Promise.resolve(
                String(input).includes('/capabilities')
                    ? capabilitiesResponse(['teacher-archive'])
                    : response({
                          token: 'batch-token',
                          status: 'completed',
                          sourceType: 'TEACHER_BATCH',
                          counts: { expected: 1, completed: 1, failed: 0 },
                          analyses: [completedAnalysis(1, 'synthetic-first.sb3', 'A finding')],
                      }),
            ),
        );
        renderAt('/submissions/batch-token');

        // One address serves both journeys, and it used to mark the child's form for both of them.
        await waitFor(() =>
            expect(screen.getByRole('link', { name: 'For teachers' })).toHaveAttribute(
                'aria-current',
                'page',
            ),
        );
        expect(screen.getByRole('link', { name: 'Check my project' })).not.toHaveAttribute(
            'aria-current',
        );
    });

    it('shows an honest empty state when no submission capability is advertised', async () => {
        vi.spyOn(globalThis, 'fetch').mockResolvedValue(capabilitiesResponse([]));
        renderAt('/');

        await screen.findByRole('heading', { name: 'LitterBox' });
        expect(
            await screen.findByText('No compatible submission workflow is enabled by the service.'),
        ).toBeInTheDocument();
        expect(screen.queryByLabelText('Your project file')).not.toBeInTheDocument();
        expect(screen.queryByRole('link', { name: 'For teachers' })).not.toBeInTheDocument();
    });

    it('shows mixed teacher-child errors while allowing usable projects to submit', async () => {
        const user = userEvent.setup();
        const file = await teacherArchive();
        const fetchMock = vi
            .spyOn(globalThis, 'fetch')
            .mockResolvedValueOnce(capabilitiesResponse(['teacher-archive']))
            .mockResolvedValueOnce(
                response({ submissionId: 20, token: 'teacher-token', status: 'queued' }, 202),
            )
            .mockResolvedValue(response({ token: 'teacher-token', status: 'queued' }));
        renderAt('/teacher');

        const input = await screen.findByLabelText('Teacher batch archive (.zip)');
        await user.upload(input, file);
        await waitFor(() =>
            expect(screen.getByRole('status')).toHaveTextContent(
                'Projects ready for submission: 1',
            ),
        );
        expect(screen.getByRole('list', { name: 'Project archive errors' })).toHaveTextContent(
            'needs-attention.mblock',
        );
        await user.click(screen.getByRole('button', { name: 'Check the class set' }));
        await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
        expect(fetchMock.mock.calls[1]?.[1]?.body).toBeInstanceOf(FormData);
    });

    it('terminates a stale archive worker when the preflight is aborted', async () => {
        const workers: Array<{
            onmessage: ((event: MessageEvent<unknown>) => void) | null;
            onerror: (() => void) | null;
            postMessage: ReturnType<typeof vi.fn>;
            terminate: ReturnType<typeof vi.fn>;
        }> = [];
        class SyntheticWorker {
            public onmessage: ((event: MessageEvent<unknown>) => void) | null = null;
            public onerror: (() => void) | null = null;
            public postMessage = vi.fn();
            public terminate = vi.fn();

            public constructor() {
                workers.push(this);
            }
        }
        vi.stubGlobal('Worker', SyntheticWorker);
        const controller = new AbortController();
        const pending = preflightArchive(new File(['synthetic'], 'project.sb3'), controller.signal);
        await waitFor(() => expect(workers[0]?.postMessage).toHaveBeenCalled());
        controller.abort();

        await expect(pending).resolves.toMatchObject({ valid: false });
        expect(workers[0]?.terminate).toHaveBeenCalledTimes(1);
        expect(workers[0]?.onmessage).toBeNull();
        expect(workers[0]?.onerror).toBeNull();
    });

    it('renders exact mixed counts and lets users select a completed child', async () => {
        const second = completedAnalysis(2, 'synthetic-second.sb3', 'Second synthetic finding');
        const first = completedAnalysis(1, 'synthetic-first.sb3', 'First synthetic finding');
        vi.spyOn(globalThis, 'fetch').mockResolvedValue(
            response({
                token: 'batch-token',
                status: 'partial',
                sourceType: 'TEACHER_BATCH',
                counts: { expected: 4, completed: 2, failed: 1 },
                analyses: [
                    first,
                    {
                        id: 3,
                        name: 'synthetic-failed.sb3',
                        status: 'failed',
                        failureMessage: 'Failed',
                    },
                    { id: 4, name: 'synthetic-running.sb3', status: 'running' },
                    second,
                ],
            }),
        );
        renderAt('/submissions/batch-token');

        const progress = await screen.findByRole('heading', { name: 'Batch progress' });
        const progressCard = progress.closest('.card');
        expect(progressCard).not.toBeNull();
        expect(within(progressCard as HTMLElement).getByText('4')).toBeInTheDocument();
        expect(screen.getByText('3 of 4 projects have finished processing.')).toBeInTheDocument();
        // Twice: as its row in the table, and again in the list of what did not finish.
        expect(screen.getAllByText('synthetic-failed.sb3')).toHaveLength(2);
        // Four rows, one per analysis, with counts only for the two that finished.
        const rows = screen.getAllByRole('row').slice(1);
        expect(rows).toHaveLength(4);
        // Bugs, smells, perfumes and the total. Nothing in this set fell outside the three families and no
        // analysis measured anything, so neither earns a column.
        expect(within(rows[1]!).getAllByText('—')).toHaveLength(4);
        expect(
            screen.queryByRole('columnheader', { name: /Other findings/ }),
        ).not.toBeInTheDocument();
        // Where the analysis got to rides under the name; the reason it got no further is a sentence, and it is
        // gathered above the table where a sentence has the width of the card to be read in.
        expect(within(rows[1]!).getByText('Analysis failed')).toBeInTheDocument();
        expect(within(rows[1]!).queryByText('Failed')).not.toBeInTheDocument();
        expect(
            within(rows[1]!).queryByRole('button', { name: /View project result/ }),
        ).not.toBeInTheDocument();

        const failures = screen.getByRole('heading', { name: '1 analysis did not finish' });
        const failureList = failures.parentElement as HTMLElement;
        expect(within(failureList).getByText('synthetic-failed.sb3')).toBeInTheDocument();
        expect(within(failureList).getByText('Failed')).toBeInTheDocument();

        // The first completed analysis is selected for us; choosing the other shows its findings instead.
        await waitFor(() =>
            expect(screen.getByRole('heading', { name: 'First synthetic finding' })).toBeVisible(),
        );
        await userEvent
            .setup()
            .click(within(rows[3]!).getByRole('button', { name: /View project result/ }));
        await waitFor(() =>
            expect(screen.getByRole('heading', { name: 'Second synthetic finding' })).toBeVisible(),
        );
    });

    /*
     * A failure reason is a sentence. Beside every row it was the widest column in the table, and it squeezed the
     * project names — the one column a teacher scans by — down to their floor. It belongs above the table, where
     * it is read as a short list of projects to look at again.
     */
    it('keeps the table to what it counts and gathers the failures above it', async () => {
        const user = userEvent.setup();
        vi.spyOn(globalThis, 'fetch').mockResolvedValue(
            response({
                token: 'failure-token',
                status: 'partial',
                sourceType: 'SCRATCH_STUDIO',
                counts: { expected: 3, completed: 1, failed: 2 },
                analyses: [
                    completedAnalysis(1, 'synthetic-first.sb3', 'First synthetic finding'),
                    {
                        id: 2,
                        name: 'synthetic-torn.sb3',
                        status: 'failed',
                        failureMessage: 'The archive holds no project.json',
                    },
                    { id: 3, name: 'synthetic-empty.sb3', status: 'failed', failureMessage: null },
                ],
            }),
        );
        renderAt('/submissions/failure-token');

        await screen.findByRole('heading', { name: 'Batch progress' });
        // No column of its own: it read "Analysis complete" down almost every row, and there is nothing to sort.
        expect(
            screen.queryByRole('columnheader', { name: /Analysis status/ }),
        ).not.toBeInTheDocument();
        const table = screen.getByRole('table', { name: 'Project results' });
        expect(within(table).queryByText(/holds no project.json/)).not.toBeInTheDocument();

        const failures = screen.getByRole('heading', { name: '2 analyses did not finish' });
        const listed = within(failures.parentElement as HTMLElement);
        expect(listed.getByText('The archive holds no project.json')).toBeInTheDocument();
        // Nothing usable came back about the second one, so it is named with the fact of the failure alone.
        expect(listed.getByText('synthetic-empty.sb3')).toBeInTheDocument();
        expect(listed.getAllByText('Analysis failed')).toHaveLength(1);

        // How many projects went wrong is a fact about the submission, not about the rows currently on screen.
        await user.selectOptions(
            screen.getByRole('combobox', { name: 'Filter by analysis status' }),
            'completed',
        );
        expect(within(table).queryByText('synthetic-torn.sb3')).not.toBeInTheDocument();
        expect(
            screen.getByRole('heading', { name: '2 analyses did not finish' }),
        ).toBeInTheDocument();
    });

    it('gives the table a column per measurement the set reported, and one for findings it could not place', async () => {
        const measured = (id: number, name: string, metrics: Record<string, number>) => ({
            ...completedAnalysis(id, name, `Finding ${id}`),
            metrics,
        });
        const unplaced = {
            ...completedAnalysis(3, 'synthetic-third.sb3', 'Unplaced finding'),
            metrics: {},
        };
        unplaced.issues[0]!.type = 'novelty';
        vi.spyOn(globalThis, 'fetch').mockResolvedValue(
            response({
                token: 'measured-token',
                status: 'completed',
                sourceType: 'TEACHER_BATCH',
                counts: { expected: 3, completed: 3, failed: 0 },
                analyses: [
                    measured(1, 'synthetic-first.sb3', { sprite_count: 4, block_count: 120 }),
                    measured(2, 'synthetic-second.sb3', { blocks: 37 }),
                    unplaced,
                ],
            }),
        );
        renderAt('/submissions/measured-token');

        await screen.findByRole('heading', { name: 'Batch progress' });
        const headers = screen.getAllByRole('columnheader').map((cell) => cell.textContent ?? '');
        // Only what this set measured: no analysis reported a script count or a CT score, so neither is a
        // column of dashes.
        expect(headers.some((header) => header.startsWith('Sprites'))).toBe(true);
        expect(headers.some((header) => header.startsWith('Blocks'))).toBe(true);
        expect(headers.some((header) => header.startsWith('Scripts'))).toBe(false);
        // One finding fell outside the three families, so the group that holds it is worth a column now.
        expect(headers.some((header) => header.startsWith('Other findings'))).toBe(true);
        // Every analysis finished, so a status column would read "Analysis complete" all the way down.
        expect(headers.some((header) => header.startsWith('Analysis status'))).toBe(false);
        expect(
            within(screen.getByRole('table', { name: 'Project results' })).queryByText(
                'Analysis complete',
            ),
        ).toBeNull();
        // And there is nothing for a status filter to narrow.
        expect(screen.queryByLabelText('Analysis status')).not.toBeInTheDocument();

        const rows = screen.getAllByRole('row').slice(1);
        // "blocks" and "block_count" are the same measurement under two names, so both land in one column.
        expect(within(rows[1]!).getByText('37')).toBeInTheDocument();
        // A measurement this report did not carry is absent rather than nought: nought sprites is a claim.
        expect(within(rows[2]!).getAllByText('—')).toHaveLength(2);
    });

    it('keeps the analyser’s own numbers for whoever is checking the analysis', async () => {
        vi.spyOn(globalThis, 'fetch').mockResolvedValue(
            response({
                token: 'technical-token',
                status: 'completed',
                sourceType: 'TEACHER_BATCH',
                counts: { expected: 1, completed: 1, failed: 0 },
                analyses: [completedAnalysis(1, 'synthetic-first.sb3', 'A finding')],
            }),
        );
        renderAt('/submissions/technical-token');

        // A child working through their own project has no use for a severity number; a teacher looking at one
        // project out of a class set is checking what the tool said, and does.
        await screen.findByRole('heading', { name: 'A finding' });
        const card = document.querySelector('.issue-card-detailed');
        expect(card?.querySelector('.issue-technical')?.textContent).toContain('Severity level');
    });

    it('hands the class set over as a file without asking the service for it', async () => {
        const user = userEvent.setup();
        vi.spyOn(globalThis, 'fetch').mockResolvedValue(
            response({
                token: 'file-token',
                status: 'completed',
                sourceType: 'TEACHER_BATCH',
                counts: { expected: 1, completed: 1, failed: 0 },
                analyses: [completedAnalysis(1, 'synthetic-first.sb3', 'A finding')],
            }),
        );
        // jsdom's Blob cannot be read back, so the parts are captured as they are handed over.
        const written: string[] = [];
        class CapturingBlob {
            public constructor(parts: string[]) {
                written.push(parts.join(''));
            }
        }
        vi.stubGlobal('Blob', CapturingBlob);
        // Neither of these exists in jsdom, and the component checks for the first before it builds anything.
        URL.createObjectURL = () => 'blob:synthetic';
        URL.revokeObjectURL = () => undefined;
        // The anchor is the point of the download; jsdom would try to navigate to the blob and complain.
        const clicks = vi
            .spyOn(HTMLAnchorElement.prototype, 'click')
            .mockImplementation(() => undefined);
        renderAt('/submissions/file-token');

        await user.click(await screen.findByText('Download as a table'));
        await user.click(screen.getByRole('button', { name: 'Download CSV' }));

        expect(clicks).toHaveBeenCalledTimes(1);
        expect((clicks.mock.instances[0] as unknown as HTMLAnchorElement).download).toBe(
            'file-token.csv',
        );
        // Built here from the table already on screen: nothing about a class goes back to the service for it.
        expect(written).toHaveLength(1);
        expect(written[0]).toContain('synthetic-first.sb3,Analysis complete');
        // A byte-order mark, so a spreadsheet reads the names as UTF-8 rather than guessing.
        expect(written[0]!.startsWith('\uFEFF')).toBe(true);
    });

    it.each([
        // What completed or failed is the analysis. The project is a file a child made; it has no status.
        ['empty', [], 'No completed analyses yet'],
        [
            'all failed',
            [{ id: 1, name: 'failed.sb3', status: 'failed', failureMessage: 'Failed' }],
            'All analyses failed',
        ],
    ])('renders the %s batch state', async (_name, analyses, heading) => {
        vi.spyOn(globalThis, 'fetch').mockResolvedValue(
            response({
                token: 'empty-token',
                status: 'completed',
                sourceType: 'SCRATCH_STUDIO',
                counts: { expected: analyses.length, completed: 0, failed: analyses.length },
                analyses,
            }),
        );
        renderAt('/submissions/empty-token');
        expect(await screen.findByRole('heading', { name: heading })).toBeInTheDocument();
    });

    it('confirms cancellation and refreshes the authoritative terminal state', async () => {
        const user = userEvent.setup();
        const fetchMock = vi
            .spyOn(globalThis, 'fetch')
            .mockResolvedValueOnce(
                response({
                    token: 'cancel-token',
                    status: 'processing',
                    sourceType: 'TEACHER_BATCH',
                }),
            )
            .mockResolvedValueOnce(capabilitiesResponse(['single-project']))
            .mockResolvedValueOnce(response(undefined, 204))
            .mockResolvedValueOnce(
                response({
                    token: 'cancel-token',
                    status: 'cancelled',
                    sourceType: 'TEACHER_BATCH',
                    counts: { expected: 2, completed: 1, failed: 0 },
                    analyses: [],
                }),
            );
        renderAt('/submissions/cancel-token');

        await user.click(await screen.findByRole('button', { name: 'Cancel submission' }));
        const dialog = screen.getByRole('dialog');
        expect(dialog).toHaveTextContent('Cancel this submission?');
        await user.click(within(dialog).getByRole('button', { name: 'Cancel submission' }));
        await waitFor(() => expect(screen.getByText('Analysis cancelled')).toBeInTheDocument());
        expect(fetchMock.mock.calls[2]?.[0]).toContain('/cancel');
        expect(fetchMock.mock.calls[3]?.[0]).toContain('/cancel-token');
        expect(screen.queryByRole('button', { name: 'Cancel submission' })).not.toBeInTheDocument();
        // The one analysis that finished is finished, whether or not its report is among the rows yet, and the
        // one that was stopped is not still running: a cancelled set that says "0 of 2" and "2 still processing"
        // describes a run nobody cancelled.
        expect(screen.getByText('1 of 2 projects have finished processing.')).toBeInTheDocument();
        expect(screen.queryByText('Still processing')).not.toBeInTheDocument();
        expect(screen.getByText('Not analysed').nextElementSibling).toHaveTextContent('1');
    });

    it('accepts a terminal refresh when cancellation loses a completion race', async () => {
        const user = userEvent.setup();
        vi.spyOn(globalThis, 'fetch')
            .mockResolvedValueOnce(
                response({
                    token: 'cancel-race-token',
                    status: 'processing',
                    sourceType: 'TEACHER_BATCH',
                }),
            )
            .mockResolvedValueOnce(capabilitiesResponse(['single-project']))
            .mockResolvedValueOnce(response({ error: 'already terminal' }, 409))
            .mockResolvedValueOnce(
                response({
                    token: 'cancel-race-token',
                    status: 'completed',
                    sourceType: 'TEACHER_BATCH',
                    counts: { expected: 0, completed: 0, failed: 0 },
                    analyses: [],
                }),
            );
        renderAt('/submissions/cancel-race-token');

        await user.click(await screen.findByRole('button', { name: 'Cancel submission' }));
        await user.click(
            within(screen.getByRole('dialog')).getByRole('button', {
                name: 'Cancel submission',
            }),
        );

        // The result arriving and the dialog closing are two updates. Waiting only for the first sometimes read the
        // page between them and found the dialog still standing.
        await waitFor(() => {
            expect(screen.getAllByText('Analysis complete').length).toBeGreaterThan(0);
            expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
        });
        expect(
            screen.queryByText(
                'The submission could not be cancelled. Its status is still being checked.',
            ),
        ).not.toBeInTheDocument();
    });
});
