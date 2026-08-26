// SPDX-License-Identifier: EUPL-1.2
// SPDX-FileCopyrightText: 2026 LitterBox-Web contributors

import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../src/App';
import i18n from '../src/i18n';
import { capabilitiesResponse, issue, response } from './helpers';

const renderSubmission = (token = 'synthetic-acceptance-token') =>
    render(
        <MemoryRouter initialEntries={[`/submissions/${token}`]}>
            <App />
        </MemoryRouter>,
    );

const batchPayload = (status: string = 'partial') => ({
    token: 'synthetic-acceptance-token',
    status,
    sourceType: 'TEACHER_BATCH',
    locale: 'en',
    counts: { expected: 5, completed: 2, failed: 1 },
    analyses: [
        {
            id: 'successful-sb3',
            name: 'successful.sb3',
            status: 'completed',
            issues: [
                issue({
                    id: 1,
                    finderName: 'Synthetic finding',
                    finderId: 'synthetic-finding',
                    hint: 'Synthetic hint',
                    currentCostume: -1,
                }),
            ],
        },
        {
            id: 'successful-mblock',
            name: `dense-${'synthetic-'.repeat(20)}.mblock`,
            status: 'completed',
            issues: [],
        },
        {
            id: 'failed-child',
            name: 'failed.sb3',
            status: 'failed',
            failureMessage: 'raw upstream error: manifest storageKey private artifact username',
        },
        { id: 'running-child', name: 'running.sb3', status: 'running', issues: [] },
        { id: 'queued-child', name: 'queued.mblock', status: 'queued', issues: [] },
    ],
    author_username: 'synthetic-private-user',
    manifest: 'synthetic-private-manifest',
    storageKey: 'synthetic-private-storage-key',
    sourceManifest: 'synthetic-private-manifest',
    privateArtifact: 'synthetic-private-artifact',
});

describe('batch acceptance surface', () => {
    beforeEach(async () => {
        await i18n.changeLanguage('en');
        vi.restoreAllMocks();
        vi.stubGlobal('EventSource', undefined);
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('renders authoritative counts, preserves successful children, and redacts private failure data', async () => {
        vi.spyOn(globalThis, 'fetch').mockImplementation((input) =>
            Promise.resolve(
                String(input).includes('/capabilities')
                    ? capabilitiesResponse()
                    : response(batchPayload()),
            ),
        );
        renderSubmission();

        expect(
            await screen.findByText('3 of 5 projects have finished processing.'),
        ).toBeInTheDocument();
        expect(screen.getByText('successful.sb3')).toBeInTheDocument();
        expect(screen.getByText(/dense-synthetic-.*\.mblock/)).toBeInTheDocument();
        // Twice: as its row in the table, and again in the list of what did not finish.
        expect(screen.getAllByText('failed.sb3')).toHaveLength(2);
        // A message carrying anything private is not shown at all; the fact of the failure still is.
        expect(screen.getAllByText('Analysis failed').length).toBeGreaterThanOrEqual(1);
        expect(screen.queryByText(/raw upstream error|synthetic-private/)).not.toBeInTheDocument();

        const denseProject = screen
            .getByRole('rowheader', { name: /dense-synthetic-.*\.mblock/ })
            .closest('tr');
        expect(denseProject).not.toBeNull();
        // The project's name is the control now; what pressing it does is still part of the accessible name.
        const select = within(denseProject!).getByRole('button', { name: /View project result/ });
        select.focus();
        await userEvent.setup().keyboard('{Enter}');
        await waitFor(() => expect(select).toHaveAttribute('aria-pressed', 'true'));
        expect(screen.getAllByText('No findings were reported for this project.')).not.toHaveLength(
            0,
        );
        // The summary above the findings used to be headed "Findings" as well, so the drill-down carried two
        // headings of the same name and neither told a teacher which one they were reading.
        expect(screen.getAllByRole('heading', { name: 'Findings' })).toHaveLength(1);
        // Which project, not "this project": the row it was chosen from is thirty rows up the page.
        expect(
            screen.getByRole('heading', { name: /^dense-synthetic-.*\.mblock at a glance$/ }),
        ).toBeInTheDocument();
        expect(
            screen.queryByRole('heading', { name: 'This project at a glance' }),
        ).not.toBeInTheDocument();
    });

    it.each([
        ['en', 'Analysis partly complete', 'Batch progress'],
        ['de', 'Analyse teilweise abgeschlossen', 'Sammelfortschritt'],
        ['es', 'Análisis parcialmente completado', 'Progreso del lote'],
        ['nl', 'Analyse gedeeltelijk voltooid', 'Batchvoortgang'],
    ])(
        'keeps the partial batch state available after a reload in %s',
        async (locale, label, heading) => {
            await i18n.changeLanguage(locale);
            vi.spyOn(globalThis, 'fetch').mockImplementation((input) =>
                Promise.resolve(
                    String(input).includes('/capabilities')
                        ? capabilitiesResponse()
                        : response(batchPayload()),
                ),
            );
            renderSubmission(`synthetic-${locale}`);

            expect(await screen.findAllByText(label)).not.toHaveLength(0);
            expect(screen.getByRole('heading', { name: heading })).toBeInTheDocument();
            expect(screen.getByRole('progressbar')).toHaveAttribute('max', '5');
        },
    );

    it('keeps cancellation accessible while resuming the authoritative terminal state', async () => {
        const user = userEvent.setup();
        // Dispatched by URL rather than by call order: the page fetches what it needs when it needs it, and a
        // queue of responses makes every test a hostage to the order it happens to ask in.
        const submissions = [
            response(batchPayload('processing')),
            response(undefined, 204),
            response({
                ...batchPayload('cancelled'),
                counts: { expected: 5, completed: 1, failed: 1 },
            }),
        ];
        const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
            const url = String(input);
            if (url.includes('/capabilities')) return Promise.resolve(capabilitiesResponse());
            if (url.includes('/metrics/reference'))
                return Promise.resolve(response({ metrics: [] }));
            return Promise.resolve(submissions.shift() ?? response(batchPayload('cancelled')));
        });
        renderSubmission('synthetic-cancel-token');

        await user.click(await screen.findByRole('button', { name: 'Cancel submission' }));
        const dialog = screen.getByRole('dialog');
        expect(dialog).toContainElement(document.activeElement as HTMLElement | null);
        await user.click(within(dialog).getByRole('button', { name: 'Cancel submission' }));
        await waitFor(() => expect(screen.getByText('Analysis cancelled')).toBeInTheDocument());
        expect(screen.queryByRole('button', { name: 'Cancel submission' })).not.toBeInTheDocument();
        const requested = fetchMock.mock.calls.map(([target]) => String(target));
        expect(requested.some((url) => url.includes('/cancel'))).toBe(true);
        expect(
            requested.filter((url) => url.includes('synthetic-cancel-token')).length,
        ).toBeGreaterThan(1);
    });
});
