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
        // Remembering the same result again moves it to the front instead of listing it twice.
        rememberProject({ token: 'token-2', name: 'Project 2', kind: 'questions' });
        expect(recentProjects().filter((project) => project.token === 'token-2')).toHaveLength(1);
        expect(latestProject()).toMatchObject({
            token: 'token-2',
            name: 'Project 2',
            kind: 'questions',
        });
        // Every entry is stamped with when it was last open, which is what tells two results of one project apart.
        expect(latestProject()?.at).toBeGreaterThan(0);

        // The store is a place anything could have written to, so only entries of exactly this shape survive.
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
        // The reader is taken to the questions for the same project, under their own result link.
        await waitFor(() =>
            expect(screen.getAllByRole('heading', { name: 'Ask me' })).not.toHaveLength(0),
        );
        // The two results have different links, so the question set carries the way back to the check it was
        // made from rather than leaving it to the reader's history.
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
        // The result page remembers itself as soon as it loads, knowing its own name and nothing else. That must
        // add to what is already known about it, not replace it.
        rememberProject({ token: 'asked-token', name: 'Cat chase (renamed)', kind: 'questions' });

        expect(recentProjects()[0]).toMatchObject({
            token: 'asked-token',
            name: 'Cat chase (renamed)',
            kind: 'questions',
            origin: { token: 'checked-token', kind: 'issues' },
        });

        // A result may not claim to have come from itself, and an origin is held to the same standard as an entry.
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
        // The address, not the code inside it: there is nowhere on this site to type a token in.
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
        // The name is the filename, so a check and a set of questions about one project read the same. What each
        // entry is, and when it was last open, is what separates them.
        expect(screen.getByText(/^Check · /)).toBeInTheDocument();
        // A shared classroom machine can be told to forget what it has seen.
        await user.click(screen.getByRole('button', { name: 'Forget these' }));
        expect(
            screen.queryByRole('heading', { name: 'Your recent results' }),
        ).not.toBeInTheDocument();
        expect(recentProjects()).toEqual([]);
    });
});
