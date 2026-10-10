// SPDX-License-Identifier: EUPL-1.2
// SPDX-FileCopyrightText: 2025 LitterBox-Web contributors

import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import JSZip from 'jszip';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { preflightArchive } from '../src/lib/archive-preflight';
import i18n from '../src/i18n';
import { recentProjects, rememberProject } from '../src/lib/recent-projects';
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

/** A completed project reporting only a computational-thinking level, id 3 excepted, so a class-overview panel's
 * project-set filter has something to narrow the report list by. */
const ctLevelAnalysis = (id: number, name: string) => ({
    id,
    name,
    status: 'completed',
    issues: [],
    relationships: [],
    metrics: id === 3 ? {} : { ct_score_flow_control: 2 },
    catalogue: [],
    quiz: [],
    assetRefs: [],
});

/** A completed class set, served from a submission page's two calls: the capabilities check, then the submission
 * itself. What every batch-workspace test needs from the network and nothing it does not. */
const mockBatchSubmission = (
    token: string,
    counts: { expected: number; completed: number; failed: number },
    analyses: readonly unknown[],
) =>
    vi.spyOn(globalThis, 'fetch').mockImplementation((input) =>
        Promise.resolve(
            String(input).includes('/capabilities')
                ? capabilitiesResponse(['teacher-archive'])
                : response({
                      token,
                      status: 'completed',
                      sourceType: 'TEACHER_BATCH',
                      counts,
                      analyses,
                  }),
        ),
    );

const openReports = async (user: ReturnType<typeof userEvent.setup>): Promise<HTMLElement> => {
    const heading = await screen.findByRole('heading', { name: 'All project reports' });
    const reports = heading.closest('details') as HTMLDetailsElement;
    if (!reports.open) await user.click(heading.closest('summary') as HTMLElement);
    return reports;
};

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
        expect(screen.queryByLabelText('Class set file (.zip or .txt)')).not.toBeInTheDocument();
        expect(screen.queryByLabelText('Scratch studio ID or URL')).not.toBeInTheDocument();
        expect(screen.queryByRole('link', { name: 'For teachers' })).not.toBeInTheDocument();
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('keeps teacher ZIP and studio workflows on the Teacher page', async () => {
        vi.spyOn(globalThis, 'fetch').mockResolvedValue(
            capabilitiesResponse(['teacher-archive', 'studio']),
        );
        renderAt('/teacher');

        await screen.findByLabelText('Class set file (.zip or .txt)');
        expect(screen.getByLabelText('Scratch studio ID or URL')).toBeInTheDocument();
        expect(screen.queryByLabelText('Your project file')).not.toBeInTheDocument();
        expect(screen.getByRole('link', { name: 'For teachers' })).toHaveAttribute(
            'aria-current',
            'page',
        );
        expect(screen.getByRole('heading', { level: 1, name: 'For teachers' })).toBeInTheDocument();
    });

    it('names the class-set question form for the set it makes rather than for a quiz', async () => {
        vi.spyOn(globalThis, 'fetch').mockResolvedValue(
            capabilitiesResponse(['teacher-archive', 'qlc']),
        );
        renderAt('/teacher');

        expect(
            await screen.findByRole('button', { name: 'Build a quiz from this project' }),
        ).toBeInTheDocument();
        expect(
            screen.queryByRole('button', { name: 'Ask me about this project' }),
        ).not.toBeInTheDocument();
    });

    it('reaches the teacher page for a service that offers question generation alone', async () => {
        vi.spyOn(globalThis, 'fetch').mockResolvedValue(capabilitiesResponse(['qlc']));
        renderAt('/teacher');

        expect(
            await screen.findByRole('button', { name: 'Build a quiz from this project' }),
        ).toBeInTheDocument();
        expect(screen.getByRole('link', { name: 'For teachers' })).toHaveAttribute(
            'aria-current',
            'page',
        );
        expect(screen.queryByLabelText('Class set file (.zip or .txt)')).not.toBeInTheDocument();
        expect(screen.queryByLabelText('Scratch studio ID or URL')).not.toBeInTheDocument();
    });

    it('offers question generation beside the other two workflows, not inside one of them', async () => {
        vi.spyOn(globalThis, 'fetch').mockResolvedValue(
            capabilitiesResponse(['single-project', 'teacher-archive', 'qlc']),
        );
        renderAt('/teacher');

        expect(await screen.findByRole('group', { name: 'Analyse a task' })).toBeInTheDocument();
        expect(screen.getByRole('group', { name: 'Quiz builder' })).toBeInTheDocument();
        expect(screen.getByRole('group', { name: 'Check a class set' })).toBeInTheDocument();
        expect(
            screen.getByRole('button', { name: 'Build a quiz from this project' }),
        ).toBeInTheDocument();
    });

    it('offers the quiz builder its own two lists: a project already checked, and a question set already built', async () => {
        rememberProject({
            token: 'checked-token',
            name: 'model-solution.sb3',
            kind: 'issues',
            analysisId: 5,
            at: Date.now() - 60_000,
        });
        rememberProject({
            token: 'quiz-token',
            name: 'model-solution.sb3',
            kind: 'questions',
            at: Date.now(),
        });
        vi.spyOn(globalThis, 'fetch').mockResolvedValue(capabilitiesResponse(['qlc']));
        renderAt('/teacher');

        await screen.findByRole('heading', { name: 'Projects analysed on this device', level: 2 });
        const quizReuseButton = screen.getByRole('button', {
            name: 'Build a quiz from model-solution.sb3',
        });
        expect(quizReuseButton).toBeInTheDocument();
        expect(quizReuseButton.closest('li')).toHaveTextContent('1 minute ago');
        expect(
            screen.getByRole('heading', { name: 'Question sets built on this device', level: 2 }),
        ).toBeInTheDocument();
        expect(screen.getByRole('link', { name: 'model-solution.sb3' })).toHaveAttribute(
            'href',
            '/teacher/questions/quiz-token',
        );
        expect(screen.getByText(/^Question set · /)).toBeInTheDocument();
        expect(screen.queryByText(/^Ask me ·/)).not.toBeInTheDocument();
        expect(screen.getAllByRole('button', { name: 'Forget these' })).toHaveLength(1);
        expect(screen.getAllByText('Kept on this device only.')).toHaveLength(1);
    });

    it('clears both quiz-builder lists together from their one shared forget button, and nothing else on the page', async () => {
        const user = userEvent.setup();
        rememberProject({
            token: 'checked-token',
            name: 'model-solution.sb3',
            kind: 'issues',
            analysisId: 5,
            at: Date.now(),
        });
        rememberProject({
            token: 'quiz-token',
            name: 'model-solution.sb3',
            kind: 'questions',
            at: Date.now(),
        });
        rememberProject({
            token: 'class-set-token',
            name: 'classset.zip',
            kind: 'batch',
            projects: 5,
            at: Date.now(),
        });
        vi.spyOn(globalThis, 'fetch').mockResolvedValue(
            capabilitiesResponse(['teacher-archive', 'qlc']),
        );
        renderAt('/teacher');

        await screen.findByRole('heading', { name: 'Projects analysed on this device' });
        screen.getByRole('heading', { name: 'Question sets built on this device' });
        screen.getByRole('heading', { name: 'Class sets analysed on this device' });

        const quizWorkflow = screen
            .getByRole('heading', { name: 'Question sets built on this device' })
            .closest<HTMLElement>('.teacher-workflow');
        if (!quizWorkflow) throw new Error('quiz-builder workflow section not found');
        await user.click(within(quizWorkflow).getByRole('button', { name: 'Forget these' }));

        expect(
            screen.queryByRole('heading', { name: 'Projects analysed on this device' }),
        ).not.toBeInTheDocument();
        expect(
            screen.queryByRole('heading', { name: 'Question sets built on this device' }),
        ).not.toBeInTheDocument();
        screen.getByRole('heading', { name: 'Class sets analysed on this device' });
        expect(recentProjects()).toEqual([
            expect.objectContaining({ token: 'class-set-token', kind: 'batch' }),
        ]);
    });

    it("forgetting the class-set tool's history leaves the task tool's and the quiz builder's histories on screen and in storage", async () => {
        const user = userEvent.setup();
        rememberProject({
            token: 'checked-token',
            name: 'model-solution.sb3',
            kind: 'issues',
            analysisId: 5,
            at: Date.now(),
        });
        rememberProject({
            token: 'quiz-token',
            name: 'model-solution.sb3',
            kind: 'questions',
            at: Date.now(),
        });
        rememberProject({
            token: 'class-set-token',
            name: 'classset.zip',
            kind: 'batch',
            projects: 5,
            at: Date.now(),
        });
        vi.spyOn(globalThis, 'fetch').mockResolvedValue(
            capabilitiesResponse(['single-project', 'teacher-archive', 'qlc']),
        );
        renderAt('/teacher');

        await screen.findByRole('heading', { name: 'Class sets analysed on this device' });
        expect(
            screen.getAllByRole('heading', { name: 'Projects analysed on this device' }),
        ).toHaveLength(2);
        screen.getByRole('heading', { name: 'Question sets built on this device' });

        const classSetSection = screen
            .getByRole('heading', { name: 'Class sets analysed on this device' })
            .closest('section');
        if (!classSetSection) throw new Error('class-set section not found');
        await user.click(within(classSetSection).getByRole('button', { name: 'Forget these' }));

        expect(
            screen.queryByRole('heading', { name: 'Class sets analysed on this device' }),
        ).not.toBeInTheDocument();
        expect(recentProjects().some((project) => project.kind === 'batch')).toBe(false);
        expect(
            screen.getAllByRole('heading', { name: 'Projects analysed on this device' }),
        ).toHaveLength(2);
        screen.getByRole('heading', { name: 'Question sets built on this device' });
        expect(
            recentProjects()
                .map((project) => project.token)
                .sort(),
        ).toEqual(['checked-token', 'quiz-token'].sort());
    });

    it('builds a quiz from a project this device already checked, without a second upload', async () => {
        const user = userEvent.setup();
        rememberProject({
            token: 'checked-token',
            name: 'cat-chase.sb3',
            kind: 'issues',
            analysisId: 5,
            at: Date.now(),
        });
        const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
            const url = String(input);
            if (url.includes('/capabilities'))
                return Promise.resolve(capabilitiesResponse(['qlc']));
            if (url.endsWith('/reuse'))
                return Promise.resolve(
                    response({ submissionId: 9, token: 'quiz-token', status: 'queued' }, 202),
                );
            return Promise.resolve(
                response({
                    schemaVersion: 1,
                    submissionId: 9,
                    token: 'quiz-token',
                    status: 'queued',
                    locale: 'en',
                    sourceType: 'QUESTION_UPLOAD',
                    analyses: [],
                    counts: { expected: 1, completed: 0, failed: 0 },
                }),
            );
        });
        renderAt('/teacher');

        await user.click(
            await screen.findByRole('button', { name: 'Build a quiz from cat-chase.sb3' }),
        );

        await waitFor(() => {
            const reuseCall = fetchMock.mock.calls.find(([requested]) =>
                String(requested).endsWith('/api/v1/submissions/checked-token/reuse'),
            );
            expect(reuseCall?.[1]).toEqual(
                expect.objectContaining({
                    method: 'POST',
                    body: JSON.stringify({ analysis: 'questions' }),
                }),
            );
        });
        expect(
            await screen.findByRole('link', { name: /\/teacher\/questions\/quiz-token$/ }),
        ).toBeInTheDocument();
    });

    it('shows neither quiz-builder list on a first visit, with nothing yet for this device to remember', async () => {
        vi.spyOn(globalThis, 'fetch').mockResolvedValue(capabilitiesResponse(['qlc']));
        renderAt('/teacher');

        await screen.findByRole('button', { name: 'Build a quiz from this project' });
        expect(
            screen.queryByRole('heading', { name: 'Projects analysed on this device' }),
        ).not.toBeInTheDocument();
        expect(
            screen.queryByRole('heading', { name: 'Question sets built on this device' }),
        ).not.toBeInTheDocument();
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

        // Scoped to the actions, because the
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

        await user.upload(await screen.findByLabelText('Class set file (.zip or .txt)'), file);
        await waitFor(() => expect(screen.getByRole('status')).toBeInTheDocument());
        await user.click(screen.getByRole('button', { name: 'Check the class set' }));

        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
        await waitFor(() => expect(fetchMock.mock.calls.length).toBeGreaterThan(1));
    });

    it('sends a validated text file of Scratch project URLs as a class set', async () => {
        const user = userEvent.setup();
        const file = new File(
            ['https://scratch.mit.edu/projects/123/\n', 'https://scratch.mit.edu/projects/456/'],
            'projects.txt',
            { type: 'text/plain' },
        );
        const fetchMock = vi
            .spyOn(globalThis, 'fetch')
            .mockResolvedValueOnce(capabilitiesResponse(['teacher-archive']))
            .mockResolvedValueOnce(
                response({ submissionId: 31, token: 'list-token', status: 'queued' }, 202),
            );
        renderAt('/teacher');

        await user.upload(await screen.findByLabelText('Class set file (.zip or .txt)'), file);
        expect(await screen.findByRole('status')).toHaveTextContent(
            '2 projects are ready to analyse.',
        );
        await user.click(screen.getByRole('button', { name: 'Check the class set' }));

        await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
        const submittedFile = (fetchMock.mock.calls[1]?.[1]?.body as FormData).get('file') as File;
        expect(submittedFile).toBeInstanceOf(File);
        expect(submittedFile.name).toBe('projects.txt');
        expect(submittedFile.size).toBe(file.size);
    });

    it('offers the way back to a class set this device already sent', async () => {
        rememberProject({
            token: 'batch-token',
            name: 'year-seven.zip',
            kind: 'batch',
            projects: 12,
            at: Date.now(),
        });
        rememberProject({ token: 'child-token', name: 'cat.sb3', kind: 'issues', at: Date.now() });
        vi.spyOn(globalThis, 'fetch').mockResolvedValue(capabilitiesResponse(['teacher-archive']));
        renderAt('/teacher');

        expect(await screen.findByRole('link', { name: 'year-seven.zip' })).toHaveAttribute(
            'href',
            '/submissions/batch-token',
        );
        expect(screen.getByText(/Class set . 12 projects/)).toBeInTheDocument();
        expect(screen.queryByRole('link', { name: 'cat.sb3' })).not.toBeInTheDocument();
    });

    it('keeps the way back to a class set when only another teacher workflow is available', async () => {
        rememberProject({
            token: 'batch-token',
            name: 'year-seven.zip',
            kind: 'batch',
            projects: 12,
            at: Date.now(),
        });
        vi.spyOn(globalThis, 'fetch').mockResolvedValue(capabilitiesResponse(['qlc']));
        renderAt('/teacher');

        expect(await screen.findByRole('link', { name: 'year-seven.zip' })).toHaveAttribute(
            'href',
            '/submissions/batch-token',
        );
        expect(
            screen.queryByRole('button', { name: 'Check the class set' }),
        ).not.toBeInTheDocument();
    });

    it('puts the task-analysis workflow first, each paired with its own recent list directly beneath it', async () => {
        rememberProject({
            token: 'task-token',
            name: 'model-solution.sb3',
            kind: 'issues',
            analysisId: 5,
            at: Date.now(),
        });
        rememberProject({
            token: 'batch-token',
            name: 'year-seven.zip',
            kind: 'batch',
            projects: 12,
            at: Date.now(),
        });
        vi.spyOn(globalThis, 'fetch').mockResolvedValue(
            capabilitiesResponse(['single-project', 'teacher-archive']),
        );
        const { container } = renderAt('/teacher');

        await screen.findByRole('heading', { name: 'Projects analysed on this device', level: 2 });
        expect(
            screen.getByRole('heading', { name: 'Class sets analysed on this device', level: 2 }),
        ).toBeInTheDocument();
        expect(
            screen.queryByRole('heading', { name: 'Your recent results' }),
        ).not.toBeInTheDocument();

        const order = Array.from(container.querySelectorAll('h1, h2, legend')).map(
            (node) => node.textContent,
        );
        expect(order).toEqual([
            'For teachers',
            'Analyse a task',
            'Projects analysed on this device',
            'Check a class set',
            'Class sets analysed on this device',
        ]);
    });

    it('draws no orphan heading for a workflow this deployment does not offer', async () => {
        rememberProject({
            token: 'task-token',
            name: 'model-solution.sb3',
            kind: 'issues',
            analysisId: 5,
            at: Date.now(),
        });
        vi.spyOn(globalThis, 'fetch').mockResolvedValue(capabilitiesResponse(['teacher-archive']));
        renderAt('/teacher');

        await screen.findByLabelText('Class set file (.zip or .txt)');
        expect(screen.queryByRole('group', { name: 'Analyse a task' })).not.toBeInTheDocument();
        expect(
            screen.queryByRole('heading', { name: 'Projects analysed on this device' }),
        ).not.toBeInTheDocument();
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

        const input = await screen.findByLabelText('Class set file (.zip or .txt)');
        await user.upload(input, file);
        await waitFor(() => expect(screen.getByRole('status')).toBeInTheDocument());
        await user.click(screen.getByRole('button', { name: 'Check the class set' }));

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
        mockBatchSubmission('batch-token', { expected: 1, completed: 1, failed: 0 }, [
            completedAnalysis(1, 'synthetic-first.sb3', 'A finding'),
        ]);
        renderAt('/submissions/batch-token');

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

        const input = await screen.findByLabelText('Class set file (.zip or .txt)');
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

        const summary = await screen.findByRole('heading', { name: 'Class set summary' });
        expect(screen.getByRole('link', { name: '← Back to teacher tools' })).toHaveAttribute(
            'href',
            '/teacher',
        );
        const summaryCard = summary.closest('.card');
        expect(summaryCard).not.toBeNull();
        expect(within(summaryCard as HTMLElement).getByText('Not analysed')).toBeInTheDocument();
        expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
        const reportsHeading = screen.getByRole('heading', { name: 'All project reports' });
        const reports = reportsHeading.closest('details') as HTMLDetailsElement;
        const reportsDisclosure = reportsHeading.closest('summary') as HTMLElement;
        expect(reports.open).toBe(false);
        await userEvent.setup().click(reportsDisclosure);
        expect(reports.open).toBe(true);
        expect(
            within(reports).queryByRole('table', {
                name: 'Project results',
            }),
        ).toBeInTheDocument();
        await userEvent.setup().click(reportsDisclosure);
        expect(reports.open).toBe(false);
        await userEvent.setup().click(reportsDisclosure);
        expect(screen.getAllByText('synthetic-failed.sb3')).toHaveLength(2);
        const rows = within(
            within(reports).getByRole('table', {
                name: 'Project results',
            }),
        )
            .getAllByRole('row')
            .slice(1);
        expect(rows).toHaveLength(4);
        expect(within(rows[1]!).getAllByText('—')).toHaveLength(4);
        expect(
            screen.queryByRole('columnheader', { name: /Other findings/ }),
        ).not.toBeInTheDocument();
        expect(within(rows[1]!).getByText('Analysis failed')).toBeInTheDocument();
        expect(within(rows[1]!).queryByText('Failed')).not.toBeInTheDocument();
        expect(
            within(rows[1]!).queryByRole('button', { name: /View project result/ }),
        ).not.toBeInTheDocument();

        const failures = screen.getByRole('heading', { name: '1 analysis did not finish' });
        const failureList = failures.parentElement as HTMLElement;
        expect(within(failureList).getByText('synthetic-failed.sb3')).toBeInTheDocument();
        expect(within(failureList).getByText('Failed')).toBeInTheDocument();

        expect(
            screen.queryByRole('heading', { name: 'First synthetic finding' }),
        ).not.toBeInTheDocument();
        await userEvent
            .setup()
            .click(within(rows[0]!).getByRole('button', { name: /synthetic-first\.sb3/ }));
        await waitFor(() =>
            expect(screen.getByRole('heading', { name: 'First synthetic finding' })).toBeVisible(),
        );
        await userEvent.setup().selectOptions(screen.getByLabelText('Switch project report'), '2');
        await waitFor(() =>
            expect(screen.getByRole('heading', { name: 'Second synthetic finding' })).toBeVisible(),
        );
    });

    it('loads the selected project code on demand from a class-set report', async () => {
        const analysis = {
            ...completedAnalysis(1, 'synthetic-first.sb3', 'A finding'),
            inputFormat: 'sb3',
        };
        const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
            const url = String(input);
            if (url.includes('/capabilities')) {
                return Promise.resolve(capabilitiesResponse(['teacher-archive', 'program-export']));
            }
            if (url.includes('/export-targets')) {
                return Promise.resolve(
                    response({
                        sprites: [{ name: 'Cat', stage: false }],
                        scripts: [
                            {
                                scriptId: 'script-1',
                                spriteName: 'Cat',
                                ordinal: 1,
                                scratchblocks: 'when green flag clicked\nmove (10) steps',
                            },
                        ],
                    }),
                );
            }
            return Promise.resolve(
                response({
                    token: 'batch-code-token',
                    status: 'completed',
                    sourceType: 'TEACHER_BATCH',
                    counts: { expected: 1, completed: 1, failed: 0 },
                    analyses: [analysis],
                }),
            );
        });
        renderAt('/submissions/batch-code-token');

        const user = userEvent.setup();
        const reports = await openReports(user);
        await user.click(
            within(reports).getByRole('button', { name: /synthetic-first.*View project result/ }),
        );
        const codeDisclosure = await screen.findByText('View project code');
        expect(
            screen.queryByText('Open the scripts for this report without leaving the class set.'),
        ).not.toBeVisible();

        await user.click(codeDisclosure);

        expect(
            await screen.findByText(
                'Open the scripts for this report without leaving the class set.',
            ),
        ).toBeVisible();
        expect(await screen.findByText(/when green flag clicked/)).toBeInTheDocument();
        expect(fetchMock).toHaveBeenCalledWith(
            expect.stringContaining('/submissions/batch-code-token/analyses/1/export-targets'),
            expect.anything(),
        );
    });

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

        await screen.findByRole('heading', { name: 'Class set summary' });
        await openReports(user);
        expect(
            screen.queryByRole('columnheader', { name: /Analysis status/ }),
        ).not.toBeInTheDocument();
        const table = screen.getByRole('table', { name: 'Project results' });
        expect(within(table).queryByText(/holds no project.json/)).not.toBeInTheDocument();

        const failures = screen.getByRole('heading', { name: '2 analyses did not finish' });
        const listed = within(failures.parentElement as HTMLElement);
        expect(listed.getByText('The archive holds no project.json')).toBeInTheDocument();
        expect(listed.getByText('synthetic-empty.sb3')).toBeInTheDocument();
        expect(listed.getAllByText('Analysis failed')).toHaveLength(1);

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

        await screen.findByRole('heading', { name: 'Class set summary' });
        await openReports(userEvent.setup());
        const headers = screen.getAllByRole('columnheader').map((cell) => cell.textContent ?? '');
        expect(headers.some((header) => header.startsWith('Sprites'))).toBe(true);
        expect(headers.some((header) => header.startsWith('Blocks'))).toBe(true);
        expect(headers.some((header) => header.startsWith('Scripts'))).toBe(false);
        expect(headers.some((header) => header.startsWith('Other findings'))).toBe(true);
        expect(headers.some((header) => header.startsWith('Analysis status'))).toBe(false);
        expect(
            within(screen.getByRole('table', { name: 'Project results' })).queryByText(
                'Analysis complete',
            ),
        ).toBeNull();
        expect(screen.queryByLabelText('Analysis status')).not.toBeInTheDocument();

        const rows = within(screen.getByRole('table', { name: 'Project results' }))
            .getAllByRole('row')
            .slice(1);
        // "blocks" and "block_count" are the same measurement under two names, so both land in one column.
        expect(within(rows[1]!).getByText('37')).toBeInTheDocument();
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

        await openReports(userEvent.setup());
        await userEvent
            .setup()
            .click(await screen.findByRole('button', { name: /View project result/ }));
        await screen.findByRole('heading', { name: 'A finding' });
        const card = document.querySelector('.issue-card-detailed');
        expect(card?.querySelector('.issue-technical')?.textContent).toContain('Severity level');
    });

    it('marks no project as being shown until a teacher opens one', async () => {
        vi.spyOn(globalThis, 'fetch').mockResolvedValue(
            response({
                token: 'unselected-token',
                status: 'completed',
                sourceType: 'TEACHER_BATCH',
                counts: { expected: 2, completed: 2, failed: 0 },
                analyses: [
                    completedAnalysis(1, 'synthetic-first.sb3', 'A finding'),
                    completedAnalysis(2, 'synthetic-second.sb3', 'A finding'),
                ],
            }),
        );
        renderAt('/submissions/unselected-token');

        await openReports(userEvent.setup());
        const first = await screen.findByRole('button', { name: /synthetic-first\.sb3/ });
        expect(first).toHaveAttribute('aria-pressed', 'false');
        expect(screen.queryByText('Showing this project result')).not.toBeInTheDocument();

        await userEvent.setup().click(first);

        await screen.findByRole('heading', { name: 'Project report' });
        await userEvent.setup().click(screen.getByRole('button', { name: /class set/i }));
        await openReports(userEvent.setup());
        expect(await screen.findByRole('button', { name: /synthetic-first\.sb3/ })).toHaveAttribute(
            'aria-pressed',
            'true',
        );
    });

    it('says the download failed when this browser cannot hand a file over at all', async () => {
        const user = userEvent.setup();
        vi.spyOn(globalThis, 'fetch').mockResolvedValue(
            response({
                token: 'no-blob-token',
                status: 'completed',
                sourceType: 'TEACHER_BATCH',
                counts: { expected: 1, completed: 1, failed: 0 },
                analyses: [completedAnalysis(1, 'synthetic-first.sb3', 'A finding')],
            }),
        );
        // jsdom has no `createObjectURL`, which is exactly the browser `downloadBlob` reports back about. It used
        // to be a silent no-op here: the button was pressed, nothing was saved, and nothing said so.
        delete (URL as Partial<typeof URL>).createObjectURL;

        renderAt('/submissions/no-blob-token');
        await user.click(await screen.findByRole('button', { name: 'Download CSV' }));

        expect(await screen.findByRole('alert')).toHaveTextContent(
            'The download could not be prepared. Please try again.',
        );
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
        // Neither of these exists in jsdom, and `downloadBlob` reports back rather than throwing without them.
        URL.createObjectURL = () => 'blob:synthetic';
        URL.revokeObjectURL = () => undefined;
        // The anchor is the point of the download; jsdom would try to navigate to the blob and complain.
        const clicks = vi
            .spyOn(HTMLAnchorElement.prototype, 'click')
            .mockImplementation(() => undefined);
        renderAt('/submissions/file-token');

        const dataset = await screen.findByRole('combobox', { name: 'Data to download' });
        expect(dataset).toHaveValue('matrix');
        expect(
            screen.getByText(/One row per completed project, with the columns selected/),
        ).toBeInTheDocument();
        expect(screen.getAllByRole('button', { name: 'Download CSV' })).toHaveLength(1);
        await user.click(screen.getByRole('button', { name: 'Download CSV' }));

        expect(clicks).toHaveBeenCalledTimes(1);
        expect((clicks.mock.instances[0] as unknown as HTMLAnchorElement).download).toBe(
            'file-token-feature-matrix.csv',
        );
        expect(written).toHaveLength(1);
        expect(written[0]).toContain('synthetic-first.sb3');
        expect(written[0]).not.toContain('Analysis complete');
        // A byte-order mark, so a spreadsheet reads the names as UTF-8 rather than guessing.
        expect(written[0]!.startsWith('\uFEFF')).toBe(true);

        await user.selectOptions(dataset, 'wide');
        expect(screen.getByText(/One row per project, with analysis status/)).toBeInTheDocument();
        await user.click(screen.getByRole('button', { name: 'Download CSV' }));
        expect((clicks.mock.instances[1] as unknown as HTMLAnchorElement).download).toBe(
            'file-token-projects.csv',
        );
        expect(written[1]).toContain('synthetic-first.sb3,Analysis complete');

        await user.selectOptions(dataset, 'all');
        expect(screen.getByRole('button', { name: 'Download ZIP' })).toBeInTheDocument();
        expect(screen.getByText(/A ZIP containing the feature matrix/)).toBeInTheDocument();
    });

    it('keeps cohort denominators stable when the project report list is filtered', async () => {
        const first = completedAnalysis(1, 'synthetic-first.sb3', 'First synthetic finding');
        const second = completedAnalysis(2, 'synthetic-second.sb3', 'Second synthetic finding');
        mockBatchSubmission('batch-filter-scope-token', { expected: 2, completed: 2, failed: 0 }, [
            first,
            second,
        ]);
        renderAt('/submissions/batch-filter-scope-token');

        const user = userEvent.setup();
        await openReports(user);
        const findingsHeading = screen.getByRole('heading', {
            name: 'Findings across the class',
        });
        await user.click(findingsHeading.closest('summary')!);
        expect(await screen.findByRole('heading', { name: /Bugs 2/ })).toBeInTheDocument();
        expect(screen.getAllByText('1 / 2 (50%)')).toHaveLength(2);
        await user.click(screen.getAllByRole('button', { name: 'Show projects' })[0]!);

        expect(screen.getByText('1 shown')).toBeInTheDocument();
        expect(screen.getByRole('heading', { name: /Bugs 2/ })).toBeInTheDocument();
        expect(screen.getAllByText('1 / 2 (50%)')).toHaveLength(2);
    });

    it('names an active project-set filter chosen from a class-overview panel, and clears it back through the source control', async () => {
        mockBatchSubmission(
            'batch-project-set-chip-token',
            { expected: 3, completed: 3, failed: 0 },
            [
                ctLevelAnalysis(1, 'synthetic-first.sb3'),
                ctLevelAnalysis(2, 'synthetic-second.sb3'),
                ctLevelAnalysis(3, 'synthetic-third.sb3'),
            ],
        );
        renderAt('/submissions/batch-project-set-chip-token');

        const user = userEvent.setup();
        await openReports(user);
        const ctSummary = screen
            .getByRole('heading', { name: 'Computational thinking across the class' })
            .closest('summary')!;
        await user.click(ctSummary);
        const ctHeading = await screen.findByRole('heading', {
            name: 'Computational thinking across the class',
        });
        const ctSection = ctHeading.closest('section') as HTMLElement;
        const flowControlRow = within(ctSection)
            .getByText('Flow control')
            .closest('tr') as HTMLElement;
        const levelButton = within(flowControlRow).getByRole('button');
        expect(levelButton).toHaveAttribute('aria-pressed', 'false');

        const table = screen.getByRole('table', { name: 'Project results' });
        expect(within(table).getByText('synthetic-third.sb3')).toBeInTheDocument();

        await user.click(levelButton);

        expect(levelButton).toHaveAttribute('aria-pressed', 'true');
        expect(screen.getByText('Showing: Flow control · Level 2')).toBeVisible();
        expect(within(table).getByText('synthetic-first.sb3')).toBeInTheDocument();
        expect(within(table).getByText('synthetic-second.sb3')).toBeInTheDocument();
        expect(within(table).queryByText('synthetic-third.sb3')).not.toBeInTheDocument();

        await user.click(
            screen.getByRole('button', { name: 'Flow control · Level 2 Clear filter' }),
        );

        expect(levelButton).toHaveAttribute('aria-pressed', 'false');
        expect(screen.queryByText('Showing: Flow control · Level 2')).not.toBeInTheDocument();
        expect(within(table).getByText('synthetic-third.sb3')).toBeInTheDocument();
    });

    it('reopens a folded report list when a class-overview panel narrows it, instead of filtering behind a closed chip', async () => {
        mockBatchSubmission('batch-folded-filter-token', { expected: 3, completed: 3, failed: 0 }, [
            ctLevelAnalysis(1, 'synthetic-first.sb3'),
            ctLevelAnalysis(2, 'synthetic-second.sb3'),
            ctLevelAnalysis(3, 'synthetic-third.sb3'),
        ]);
        // jsdom does not implement scrollIntoView at all; stubbing it is what makes the deferred call observable.
        Element.prototype.scrollIntoView = vi.fn();
        renderAt('/submissions/batch-folded-filter-token');

        const user = userEvent.setup();
        const reportsHeading = await screen.findByRole('heading', {
            name: 'All project reports',
        });
        const reports = reportsHeading.closest('details') as HTMLDetailsElement;
        const reportsDisclosure = reportsHeading.closest('summary') as HTMLElement;
        expect(reports.open).toBe(false);
        await user.click(reportsDisclosure);
        expect(reports.open).toBe(true);
        await user.click(reportsDisclosure);
        expect(reports.open).toBe(false);

        await user.click(
            screen
                .getByRole('heading', { name: 'Computational thinking across the class' })
                .closest('summary')!,
        );
        const ctHeading = screen.getByRole('heading', {
            name: 'Computational thinking across the class',
        });
        const flowControlRow = within(ctHeading.closest('section') as HTMLElement)
            .getByText('Flow control')
            .closest('tr') as HTMLElement;
        const levelButton = within(flowControlRow).getByRole('button');

        await user.click(levelButton);

        expect(reports.open).toBe(true);
        const table = within(reports).getByRole('table', { name: 'Project results' });
        expect(within(table).getByText('synthetic-first.sb3')).toBeInTheDocument();
        expect(within(table).getByText('synthetic-second.sb3')).toBeInTheDocument();
        expect(within(table).queryByText('synthetic-third.sb3')).not.toBeInTheDocument();

        // The scroll is deferred a frame so it measures the list after React has painted it open; it still lands.
        await waitFor(() => expect(Element.prototype.scrollIntoView).toHaveBeenCalled());

        await user.click(levelButton);
        expect(reports.open).toBe(true);
    });

    it.each([
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

        await screen.findByRole('heading', { name: 'Class set progress' });
        expect(screen.getByRole('progressbar')).toBeInTheDocument();
        await user.click(await screen.findByRole('button', { name: 'Cancel submission' }));
        const dialog = screen.getByRole('dialog');
        expect(dialog).toHaveTextContent('Cancel this submission?');
        await user.click(within(dialog).getByRole('button', { name: 'Cancel submission' }));
        await waitFor(() => expect(screen.getByText('Analysis cancelled')).toBeInTheDocument());
        expect(fetchMock.mock.calls[2]?.[0]).toContain('/cancel');
        expect(fetchMock.mock.calls[3]?.[0]).toContain('/cancel-token');
        expect(screen.queryByRole('button', { name: 'Cancel submission' })).not.toBeInTheDocument();
        expect(screen.getByRole('heading', { name: 'Class set summary' })).toBeInTheDocument();
        expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
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
