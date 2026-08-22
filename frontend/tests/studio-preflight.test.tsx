// SPDX-License-Identifier: EUPL-1.2
// SPDX-FileCopyrightText: 2026 LitterBox-Web contributors

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../src/App';
import i18n from '../src/i18n';
import { response, capabilitiesResponse } from './helpers';

/** Every studio lookup answers the same way; nothing else on the teacher page is asked for. */
const serviceAnswering = (studio: () => Response) =>
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes('/api/v1/studios/')) return studio();
        if (url.includes('/api/v1/capabilities')) return capabilitiesResponse(['studio']);
        return response({ submissionId: 40, token: 'studio-token', status: 'queued' }, 202);
    });

const summary = (fields: Record<string, unknown>) =>
    response({ studioId: '12345', title: null, readable: true, projects: null, ...fields });

const typeStudioId = async () => {
    const user = userEvent.setup();
    render(
        <MemoryRouter initialEntries={['/teacher']}>
            <App />
        </MemoryRouter>,
    );
    await user.type(await screen.findByLabelText('Scratch studio ID or URL'), '12345');
    return user;
};

const studioButton = () => screen.getByRole('button', { name: 'Check the studio' });

describe('reading a studio before it is sent', () => {
    beforeEach(async () => {
        window.localStorage.clear();
        await i18n.changeLanguage('en');
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('counts the projects, so the teacher is not asked to trust a number nobody named', async () => {
        serviceAnswering(() => summary({ projects: 24 }));
        await typeStudioId();

        expect(await screen.findByText('24 projects are ready to analyse.')).toBeInTheDocument();
        await waitFor(() => expect(studioButton()).toBeEnabled());
    });

    /*
     * The three answers that mean the run would produce nothing. Sending anyway costs a teacher the wait and
     * teaches them only that something was wrong, so the form says which one it was and holds the button.
     */
    it.each([
        ['an empty studio', () => summary({ projects: 0 }), 'This studio has no projects in it.'],
        [
            'a studio that is not public',
            () => summary({ readable: false }),
            'This studio is not public, so the service cannot read it.',
        ],
        [
            'an id that names nothing',
            () => response({ detail: 'No such Scratch studio' }, 404),
            'No studio has this ID.',
        ],
    ])('refuses to send %s', async (_case, studio, message) => {
        const fetchMock = serviceAnswering(studio);
        await typeStudioId();

        expect(await screen.findByText(new RegExp(message))).toBeInTheDocument();
        await waitFor(() => expect(studioButton()).toBeDisabled());
        expect(
            fetchMock.mock.calls.filter(
                (call) =>
                    String(call[0]).endsWith('/api/v1/submissions') &&
                    (call[1]?.method ?? 'GET') === 'POST',
            ),
        ).toEqual([]);
    });

    it('still lets a studio be sent when the lookup itself fails', async () => {
        serviceAnswering(() => response({ detail: 'upstream' }, 502));
        const user = await typeStudioId();

        expect(
            await screen.findByText(/The studio could not be looked up just now/),
        ).toBeInTheDocument();
        await waitFor(() => expect(studioButton()).toBeEnabled());

        // Falling back to the warning that names no number, rather than to no warning at all.
        await user.click(studioButton());
        expect(screen.getByRole('dialog')).toHaveTextContent(/could not be established beforehand/);
    });

    it('warns without a count for a studio too large to measure beforehand', async () => {
        serviceAnswering(() => summary({ readable: true, projects: null }));
        const user = await typeStudioId();

        expect(
            await screen.findByText(/holds more projects than can be counted before sending it/),
        ).toBeInTheDocument();
        await user.click(studioButton());
        expect(screen.getByRole('dialog')).toHaveTextContent(/could not be established beforehand/);
    });

    /*
     * The answer belongs to the studio it was asked about. A teacher who corrects the id has a different studio a
     * keystroke later, and the previous studio's count is on screen for as long as the debounce lasts; a submission
     * made in that gap would send the new studio on the old studio's word.
     */
    it('drops what it knows the moment the id becomes a different studio', async () => {
        const fetchMock = vi
            .spyOn(globalThis, 'fetch')
            .mockImplementation(async (input: RequestInfo | URL) => {
                const url = String(input);
                if (url.includes('/api/v1/studios/123456'))
                    return summary({ studioId: '123456', projects: 0 });
                if (url.includes('/api/v1/studios/')) return summary({ projects: 24 });
                if (url.includes('/api/v1/capabilities')) return capabilitiesResponse(['studio']);
                return response({ submissionId: 40, token: 'studio-token', status: 'queued' }, 202);
            });
        const user = await typeStudioId();
        await screen.findByText('24 projects are ready to analyse.');
        await waitFor(() => expect(studioButton()).toBeEnabled());

        await user.type(screen.getByLabelText('Scratch studio ID or URL'), '6');

        // Before the second lookup has even been made, let alone answered.
        expect(screen.queryByText('24 projects are ready to analyse.')).not.toBeInTheDocument();
        expect(studioButton()).toBeDisabled();
        expect(
            fetchMock.mock.calls.filter((call) => String(call[0]).includes('/studios/123456')),
        ).toEqual([]);

        // And the studio that is now in the box is the one the form ends up talking about.
        expect(await screen.findByText(/This studio has no projects in it/)).toBeInTheDocument();
        expect(studioButton()).toBeDisabled();
    });

    it('asks the service once for a studio id typed one digit at a time', async () => {
        const fetchMock = serviceAnswering(() => summary({ projects: 24 }));
        await typeStudioId();

        await screen.findByText('24 projects are ready to analyse.');
        expect(
            fetchMock.mock.calls.filter((call) => String(call[0]).includes('/api/v1/studios/')),
        ).toHaveLength(1);
    });
});
