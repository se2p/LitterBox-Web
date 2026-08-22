// SPDX-License-Identifier: EUPL-1.2
// SPDX-FileCopyrightText: 2026 LitterBox-Web contributors

import { render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../src/App';
import i18n from '../src/i18n';
import { forgetProjects, rememberProject } from '../src/lib/recent-projects';
import { capabilitiesResponse, response } from './helpers';

const token = 'synthetic-modification-token';
const analysisId = 7;

const submission = {
    schemaVersion: 1,
    submissionId: 3,
    token,
    status: 'completed',
    locale: 'en',
    sourceType: 'UPLOAD',
    analysis: {
        id: analysisId,
        status: 'completed',
        name: 'synthetic-modification.sb3',
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
};

const injectors = [
    {
        injectorId: 'injector-first',
        finderId: 'finder-first',
        name: 'First synthetic injector',
        description: 'A bounded educational description.',
    },
];

const serve = (features: readonly string[]) =>
    vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
        const url = String(input);
        if (url.includes('/capabilities')) return Promise.resolve(capabilitiesResponse(features));
        if (url.includes('/injector-catalogue'))
            return Promise.resolve(
                response({
                    injectors,
                    maxSelectedInjectors: 8,
                    allSelectionSupported: true,
                }),
            );
        return Promise.resolve(response(submission));
    });

const retained = {
    pathname: '/teacher/modify',
    state: { retainedAnalysis: { submissionToken: token, analysisId } },
};

describe('making a modified project', () => {
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

    it('offers the injectors on the teacher page rather than in the advanced workspace', async () => {
        serve(['single-project', 'teacher-archive', 'fault-injection']);
        render(
            <MemoryRouter initialEntries={['/teacher']}>
                <App />
            </MemoryRouter>,
        );

        // Injecting a fault makes a second project for a class to find the bug in: lesson preparation, asked for
        // where a teacher's other preparation is.
        expect(
            await screen.findByRole('group', { name: 'Create buggy versions of a project' }),
        ).toBeInTheDocument();
        expect(
            screen.getByRole('button', { name: 'Prepare a modified project' }),
        ).toBeInTheDocument();
    });

    it('says nothing about modified projects when the service cannot make one', async () => {
        serve(['single-project', 'teacher-archive']);
        render(
            <MemoryRouter initialEntries={['/teacher']}>
                <App />
            </MemoryRouter>,
        );

        await screen.findByLabelText('Teacher batch archive (.zip)');
        expect(
            screen.queryByRole('group', { name: 'Create buggy versions of a project' }),
        ).not.toBeInTheDocument();
    });

    it('names the teacher page in the menu even when the class-set workflows are off', async () => {
        serve(['single-project', 'fault-injection']);
        render(
            <MemoryRouter initialEntries={['/']}>
                <App />
            </MemoryRouter>,
        );

        const navigation = screen.getByRole('navigation', { name: 'Main navigation' });
        expect(
            await within(navigation).findByRole('link', { name: 'For teachers' }),
        ).toBeInTheDocument();
    });

    it('opens the injector chooser for a retained analysis', async () => {
        serve(['single-project', 'fault-injection']);
        render(
            <MemoryRouter initialEntries={[retained]}>
                <App />
            </MemoryRouter>,
        );

        expect(await screen.findByRole('heading', { name: 'Fault injection' })).toBeInTheDocument();
        await waitFor(() =>
            expect(
                screen.getByRole('checkbox', { name: /First synthetic injector/ }),
            ).toBeInTheDocument(),
        );
        // The address says /teacher/modify, which no menu entry claims, so the page says which one it belongs to.
        expect(screen.getByRole('link', { name: 'For teachers' })).toHaveAttribute(
            'aria-current',
            'page',
        );
    });

    it('asks for a project when it is reached without one, and offers the last one analysed', async () => {
        serve(['single-project', 'fault-injection']);
        rememberProject({
            token,
            name: 'synthetic-modification.sb3',
            kind: 'issues',
            analysisId,
        });
        render(
            <MemoryRouter initialEntries={['/teacher/modify']}>
                <App />
            </MemoryRouter>,
        );

        expect(
            await screen.findByRole('heading', { name: 'Make a modified project', level: 1 }),
        ).toBeInTheDocument();
        expect(
            screen.getByRole('link', {
                name: 'Make a modified copy of synthetic-modification.sb3',
            }),
        ).toBeInTheDocument();
        expect(screen.getByLabelText('Your project file')).toBeInTheDocument();
    });
});
