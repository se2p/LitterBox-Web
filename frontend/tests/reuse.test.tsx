// SPDX-License-Identifier: EUPL-1.2
// SPDX-FileCopyrightText: 2026 LitterBox-Web contributors

import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import i18n from '../src/i18n';
import {
    forgetProjects,
    latestProject,
    recentProjects,
    rememberProject,
} from '../src/lib/recent-projects';
import { response, capabilitiesResponse } from './helpers';
import { renderAt } from './render';

const completedResult = (token: string) =>
    response({
        schemaVersion: 1,
        submissionId: 7,
        token,
        status: 'completed',
        locale: 'en',
        sourceType: 'UPLOAD',
        analysis: {
            id: 12,
            status: 'completed',
            name: 'cat-chase.sb3',
            issues: [],
            metrics: { blocks: 4 },
        },
        analyses: [],
        counts: { expected: 1, completed: 1, failed: 0 },
    });

describe('reusing a project that is already here', () => {
    beforeEach(async () => {
        await i18n.changeLanguage('en');
        vi.restoreAllMocks();
        vi.stubGlobal('EventSource', undefined);
        forgetProjects();
    });

    afterEach(() => {
        vi.unstubAllGlobals();
        forgetProjects();
    });

    it('keeps only the newest few projects and refuses anything that is not one', () => {
        for (const index of [1, 2, 3, 4, 5, 6])
            rememberProject({ token: `token-${index}`, name: `Project ${index}`, kind: 'issues' });

        expect(recentProjects().map((project) => project.token)).toEqual([
            'token-6',
            'token-5',
            'token-4',
            'token-3',
            'token-2',
        ]);
        rememberProject({ token: 'token-2', name: 'Project 2', kind: 'questions' });
        expect(recentProjects().filter((project) => project.token === 'token-2')).toHaveLength(1);
        expect(latestProject()).toMatchObject({
            token: 'token-2',
            name: 'Project 2',
            kind: 'questions',
        });
        expect(latestProject()?.at).toBeGreaterThan(0);

        window.localStorage.setItem(
            'litterbox.recent-projects',
            JSON.stringify([
                { token: 'good', name: 'Kept', kind: 'issues', analysisId: 3 },
                { token: 'bad-kind', name: 'Dropped', kind: 'everything' },
                { token: '', name: 'Dropped', kind: 'issues' },
                'not an entry',
            ]),
        );
        expect(recentProjects()).toEqual([
            { token: 'good', name: 'Kept', kind: 'issues', analysisId: 3 },
        ]);

        window.localStorage.setItem('litterbox.recent-projects', 'not json at all');
        expect(recentProjects()).toEqual([]);
    });

    it('forgets only the kinds it is told to, leaving the rest readable', () => {
        rememberProject({ token: 'a', name: 'Kept project', kind: 'issues', analysisId: 1 });
        rememberProject({ token: 'b', name: 'Kept question set', kind: 'questions' });
        rememberProject({ token: 'c', name: 'classset.zip', kind: 'batch', projects: 3 });

        forgetProjects(['batch']);

        expect(
            recentProjects()
                .map((project) => project.token)
                .sort(),
        ).toEqual(['a', 'b']);
        expect(recentProjects().some((project) => project.kind === 'batch')).toBe(false);

        forgetProjects(['issues', 'questions']);

        expect(recentProjects()).toEqual([]);
        expect(window.localStorage.getItem('litterbox.recent-projects')).toBeNull();
    });

    it('asks questions about the analysed project without a second upload', async () => {
        const user = userEvent.setup();
        const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
            const url = String(input);
            if (url.includes('/capabilities'))
                return Promise.resolve(capabilitiesResponse(['single-project', 'qlc']));
            if (url.endsWith('/reuse'))
                return Promise.resolve(
                    response(
                        {
                            submissionId: 8,
                            token: 'asked-token',
                            status: 'queued',
                            location: '/questions/asked-token',
                        },
                        202,
                    ),
                );
            if (url.includes('/submissions/checked-token'))
                return Promise.resolve(completedResult('checked-token'));
            return Promise.resolve(
                response({
                    schemaVersion: 1,
                    submissionId: 8,
                    token: 'asked-token',
                    status: 'queued',
                    locale: 'en',
                    sourceType: 'QUESTION_UPLOAD',
                    analyses: [],
                    counts: { expected: 1, completed: 0, failed: 0 },
                }),
            );
        });

        renderAt('/submissions/checked-token');
        const ask = await screen.findByRole('button', { name: 'Ask me about this project' });
        await user.click(ask);

        await waitFor(() => {
            const reuseCall = fetchMock.mock.calls.find(([input]) =>
                String(input).endsWith('/api/v1/submissions/checked-token/reuse'),
            );
            expect(reuseCall?.[1]).toEqual(
                expect.objectContaining({
                    method: 'POST',
                    body: JSON.stringify({ analysis: 'questions' }),
                }),
            );
        });
        await waitFor(() =>
            expect(screen.getAllByRole('heading', { name: 'Ask me' })).not.toHaveLength(0),
        );
        expect(
            await screen.findByRole('link', { name: 'Back to the check of cat-chase.sb3' }),
        ).toBeInTheDocument();
        expect(recentProjects()[0]?.origin).toEqual({
            token: 'checked-token',
            kind: 'issues',
        });
    });

    it('keeps knowing where a result came from once that result names itself', () => {
        rememberProject({
            token: 'asked-token',
            name: 'cat-chase.sb3',
            kind: 'questions',
            origin: { token: 'checked-token', kind: 'issues' },
        });
        rememberProject({ token: 'asked-token', name: 'Cat chase (renamed)', kind: 'questions' });

        expect(recentProjects()[0]).toMatchObject({
            token: 'asked-token',
            name: 'Cat chase (renamed)',
            kind: 'questions',
            origin: { token: 'checked-token', kind: 'issues' },
        });

        window.localStorage.setItem(
            'litterbox.recent-projects',
            JSON.stringify([
                {
                    token: 'a',
                    name: 'Circular',
                    kind: 'issues',
                    origin: { token: 'a', kind: 'issues' },
                },
                {
                    token: 'b',
                    name: 'Bad kind',
                    kind: 'issues',
                    origin: { token: 'c', kind: 'nope' },
                },
            ]),
        );
        expect(recentProjects().map((project) => project.origin)).toEqual([undefined, undefined]);
    });

    it('says a project that is no longer kept has to be uploaded again', async () => {
        const user = userEvent.setup();
        vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
            const url = String(input);
            if (url.includes('/capabilities'))
                return Promise.resolve(capabilitiesResponse(['single-project', 'qlc']));
            if (url.endsWith('/reuse')) return Promise.resolve(response({}, 410));
            return Promise.resolve(completedResult('checked-token'));
        });

        renderAt('/submissions/checked-token');
        await user.click(await screen.findByRole('button', { name: 'Ask me about this project' }));

        expect(
            await screen.findByText('That project is no longer kept here. Upload it once more.'),
        ).toBeInTheDocument();
    });

    it('shows the result as a link to keep, and offers the way back to it on the start page', async () => {
        const user = userEvent.setup();
        vi.spyOn(globalThis, 'fetch').mockImplementation((input) =>
            Promise.resolve(
                String(input).includes('/capabilities')
                    ? capabilitiesResponse(['single-project'])
                    : completedResult('checked-token'),
            ),
        );

        const result = renderAt('/submissions/checked-token');
        await waitFor(() => expect(screen.getByText('Link to this result:')).toBeInTheDocument());
        expect(
            screen.getByRole('link', { name: /\/submissions\/checked-token$/ }),
        ).toBeInTheDocument();
        expect(screen.queryByText('Token:')).not.toBeInTheDocument();
        result.unmount();

        renderAt('/');
        expect(
            await screen.findByRole('heading', { name: 'Your recent results' }),
        ).toBeInTheDocument();
        expect(screen.getByRole('link', { name: 'cat-chase.sb3' })).toBeInTheDocument();
        expect(screen.getByText(/^Check · /)).toBeInTheDocument();
        await user.click(screen.getByRole('button', { name: 'Forget these' }));
        expect(
            screen.queryByRole('heading', { name: 'Your recent results' }),
        ).not.toBeInTheDocument();
        expect(recentProjects()).toEqual([]);
    });

    it('opens remembered issue results in Ask AI', async () => {
        rememberProject({
            token: 'askable-token',
            name: 'Cat project',
            kind: 'issues',
            analysisId: 12,
        });
        rememberProject({ token: 'missing-analysis', name: 'Old project', kind: 'issues' });
        vi.spyOn(globalThis, 'fetch').mockImplementation((input) =>
            String(input).includes('/capabilities')
                ? Promise.resolve(capabilitiesResponse(['ask-ai']))
                : Promise.resolve(response({ schemaVersion: 1, available: true })),
        );

        renderAt('/ask-ai');

        expect(await screen.findByRole('link', { name: 'Cat project' })).toHaveAttribute(
            'href',
            '/ask-ai/submissions/askable-token',
        );
        expect(screen.getByRole('link', { name: 'Old project' })).toHaveAttribute(
            'href',
            '/ask-ai/submissions/missing-analysis',
        );
    });
});
