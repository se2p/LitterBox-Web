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
            await screen.findByRole('heading', { name: 'Class set summary' }),
        ).toBeInTheDocument();
        expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
        const reportsHeading = screen.getByRole('heading', { name: 'All project reports' });
        await userEvent.setup().click(reportsHeading.closest('summary') as HTMLElement);
        expect(screen.getAllByText('successful.sb3').length).toBeGreaterThanOrEqual(1);
        expect(screen.getAllByText(/dense-synthetic-.*\.mblock/).length).toBeGreaterThanOrEqual(1);
        expect(screen.getAllByText('failed.sb3')).toHaveLength(2);
        // A message carrying anything private is not shown at all; the fact of the failure still is.
        expect(screen.getAllByText('Analysis failed').length).toBeGreaterThanOrEqual(1);
        expect(screen.queryByText(/raw upstream error|synthetic-private/)).not.toBeInTheDocument();

        // Scoped to the report list: the feature matrix in the folded metrics workspace names every completed
        // project too, so an unscoped row lookup finds the same project twice.
        const denseProject = within(screen.getByRole('table', { name: 'Project results' }))
            .getByRole('rowheader', { name: /dense-synthetic-.*\.mblock/ })
            .closest('tr');
        expect(denseProject).not.toBeNull();
        const select = within(denseProject!).getByRole('button', { name: /View project result/ });
        select.focus();
        await userEvent.setup().keyboard('{Enter}');
        expect(await screen.findByRole('heading', { name: 'Project report' })).toBeInTheDocument();
        expect(screen.getByLabelText('Switch project report')).toHaveValue('successful-mblock');
        expect(screen.getAllByText('No findings were reported for this project.')).not.toHaveLength(
            0,
        );
        expect(screen.getAllByRole('heading', { name: 'Findings' })).toHaveLength(1);
        expect(
            screen.getByRole('heading', { name: /^dense-synthetic-.*\.mblock at a glance$/ }),
        ).toBeInTheDocument();
        expect(
            screen.queryByRole('heading', { name: 'This project at a glance' }),
        ).not.toBeInTheDocument();
    });

    it.each([
        ['en', 'Analysis partly complete', 'Class set summary'],
        ['de', 'Analyse teilweise abgeschlossen', 'Zusammenfassung des Klassensatzes'],
        ['es', 'Análisis parcialmente completado', 'Resumen del conjunto de clase'],
        ['nl', 'Analyse gedeeltelijk voltooid', 'Overzicht van de klassenset'],
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
            expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
        },
    );

    it('keeps cancellation accessible while resuming the authoritative terminal state', async () => {
        const user = userEvent.setup();
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
