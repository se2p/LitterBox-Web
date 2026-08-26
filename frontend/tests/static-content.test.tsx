// SPDX-License-Identifier: EUPL-1.2
// SPDX-FileCopyrightText: 2025 LitterBox-Web contributors

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../src/App';
import i18n from '../src/i18n';

const capabilities = {
    schemaVersion: 1,
    litterboxVersion: 'synthetic-static',
    supportedLocales: ['de', 'en', 'es', 'nl'],
    enabledFeatures: [],
};

describe('static content', () => {
    beforeEach(async () => {
        await i18n.changeLanguage('en');
        vi.restoreAllMocks();
        vi.spyOn(globalThis, 'fetch').mockResolvedValue(
            new Response(JSON.stringify(capabilities), {
                status: 200,
                headers: { 'Content-Type': 'application/json' },
            }),
        );
    });

    it('navigates to institutional static pages without a contact form', async () => {
        const user = userEvent.setup();
        render(
            <MemoryRouter initialEntries={['/']}>
                <App />
            </MemoryRouter>,
        );

        await user.click(screen.getByRole('link', { name: 'Contact' }));
        expect(await screen.findByRole('heading', { name: 'Contact' })).toBeInTheDocument();
        expect(screen.getByRole('article', { name: 'Contact' })).toHaveClass('static-page');
        expect(screen.getAllByText(/University of Passau/).length).toBeGreaterThan(0);
        expect(screen.queryByRole('textbox')).not.toBeInTheDocument();

        await user.click(screen.getByRole('link', { name: 'FAQ' }));
        expect(
            await screen.findByRole('heading', { name: 'Frequently asked questions' }),
        ).toBeInTheDocument();
        expect(screen.getByText('What can I have analysed?')).toBeInTheDocument();
        expect(screen.getByText('How do I get back to my results?')).toBeInTheDocument();
        // The questions a reader actually arrives with, not two placeholders standing in for a page.
        expect(screen.getByText('What are bugs, smells and perfumes?')).toBeInTheDocument();
        expect(screen.getByText('Does LitterBox mark my project?')).toBeInTheDocument();
        expect(screen.getAllByRole('heading', { level: 2 }).length).toBeGreaterThanOrEqual(8);

        await user.click(screen.getByRole('link', { name: 'Privacy' }));
        expect(await screen.findByRole('heading', { name: 'Privacy' })).toBeInTheDocument();
        expect(screen.getByText('Data sent for analysis')).toBeInTheDocument();
    });

    it.each(['de', 'en', 'es', 'nl'] as const)('renders the imprint in %s', async (locale) => {
        await i18n.changeLanguage(locale);
        render(
            <MemoryRouter initialEntries={['/imprint']}>
                <App />
            </MemoryRouter>,
        );
        expect(
            await screen.findByRole('heading', {
                name: i18n.t('imprintTitle'),
            }),
        ).toBeInTheDocument();
        // The publisher, the legal form and who represents the university: the three things an imprint must state.
        expect(
            screen.getByRole('heading', { name: i18n.t('imprintPublisherHeading') }),
        ).toBeInTheDocument();
        expect(screen.getByText(i18n.t('addressStreet'))).toBeInTheDocument();
        expect(screen.getByText(i18n.t('addressEmail'))).toBeInTheDocument();
        expect(screen.getByText(i18n.t('imprintLegalFormBody'))).toBeInTheDocument();
        expect(screen.getByText(i18n.t('imprintRepresentationBody'))).toBeInTheDocument();
    });

    it.each(['de', 'en', 'es', 'nl'] as const)('renders the about page in %s', async (locale) => {
        await i18n.changeLanguage(locale);
        render(
            <MemoryRouter initialEntries={['/about']}>
                <App />
            </MemoryRouter>,
        );
        expect(
            await screen.findByRole('heading', { name: i18n.t('aboutTitle') }),
        ).toBeInTheDocument();
        expect(screen.getByText(i18n.t('aboutWhatBody'))).toBeInTheDocument();
        // Five numbered steps, not a screenshot of a page that no longer looks like that.
        expect(screen.getAllByRole('listitem').length).toBeGreaterThanOrEqual(5);
        expect(screen.getByRole('link', { name: i18n.t('aboutSourceLink') })).toHaveAttribute(
            'href',
            'https://github.com/se2p/LitterBox',
        );
        expect(screen.getByText(/01JA2021/)).toBeInTheDocument();
        expect(screen.getByText(/FR 2955\/3-1/)).toBeInTheDocument();
        expect(screen.getByRole('link', { name: i18n.t('fundingBmbfName') })).toBeInTheDocument();
        expect(screen.getByRole('link', { name: i18n.t('fundingDfgName') })).toBeInTheDocument();
    });

    it('states what happens to an uploaded project before the institutional privacy text', async () => {
        render(
            <MemoryRouter initialEntries={['/privacy']}>
                <App />
            </MemoryRouter>,
        );
        const headings = (await screen.findAllByRole('heading', { level: 2 })).map(
            (heading) => heading.textContent,
        );
        expect(headings.slice(0, 2)).toEqual([
            i18n.t('privacyDataHeading'),
            i18n.t('privacyUploadHeading'),
        ]);
        expect(headings).toContain(i18n.t('privacyRightsHeading'));
        expect(screen.getByText('datenschutz@uni-passau.de')).toBeInTheDocument();
    });

    it('renders Dutch institutional contact copy in Dutch', async () => {
        await i18n.changeLanguage('nl');
        render(
            <MemoryRouter initialEntries={['/contact']}>
                <App />
            </MemoryRouter>,
        );

        await screen.findByRole('heading', { name: i18n.t('contactTitle') });
        expect(screen.getAllByText(/Universiteit van Passau/).length).toBeGreaterThan(0);
        expect(screen.queryByText(/Universidad de Passau/)).not.toBeInTheDocument();
    });

    it.each(['de', 'en', 'es', 'nl'] as const)(
        'offers reachable contacts in %s',
        async (locale) => {
            await i18n.changeLanguage(locale);
            render(
                <MemoryRouter initialEntries={['/contact']}>
                    <App />
                </MemoryRouter>,
            );
            await screen.findByRole('heading', { name: i18n.t('contactTitle') });

            // The address the legacy site advertised does not exist, so nothing on the page may still offer it.
            expect(document.body.textContent).not.toContain('info@scratch.fim.uni-passau.de');
            expect(
                screen.getByRole('link', { name: i18n.t('contactSoftwareEngineeringLink') }),
            ).toHaveAttribute(
                'href',
                'https://www.fim.uni-passau.de/lehrstuhl-fuer-software-engineering-ii',
            );
            expect(
                screen.getByRole('link', { name: i18n.t('contactComputingEducationLink') }),
            ).toHaveAttribute('href', 'https://www.ddi.fim.uni-passau.de');
            expect(screen.getByRole('link', { name: i18n.t('contactIssuesLink') })).toHaveAttribute(
                'href',
                'https://github.com/se2p/LitterBox/issues',
            );
            expect(screen.getByText(i18n.t('addressEmail'))).toBeInTheDocument();
        },
    );
});
