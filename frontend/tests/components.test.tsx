// SPDX-License-Identifier: EUPL-1.2
// SPDX-FileCopyrightText: 2025 LitterBox-Web contributors
import { useState } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import i18n from '../src/i18n';
import { ApplicationShell } from '../src/components/ApplicationShell';
import { Card } from '../src/components/Card';
import { Dialog } from '../src/components/Dialog';
import { FeedbackControls } from '../src/components/FeedbackControls';
import { FormField } from '../src/components/Form';
import { PageMain } from '../src/components/Page';
import { StatusIndicator } from '../src/components/Status';
import { DataTable } from '../src/components/Table';

function renderShell(children: React.ReactNode = <PageMain>Content</PageMain>) {
    return render(
        <MemoryRouter>
            <ApplicationShell
                brandLabel="LitterBox"
                currentPath="/"
                footerNavigationLabel="Footer navigation"
                navigationLabel="Main navigation"
                navigationItems={[
                    { path: '/', label: 'Home' },
                    { path: '/submit', label: 'Submit project' },
                ]}
                footerLinks={[{ path: '/privacy', label: 'Privacy' }]}
                skipLinkLabel="Skip to main content"
            >
                {children}
            </ApplicationShell>
        </MemoryRouter>,
    );
}

describe('shared application primitives', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    it('names every language in itself, whichever language the page is in', async () => {
        for (const locale of ['en', 'de', 'es', 'nl']) {
            await i18n.changeLanguage(locale);
            const { container, unmount } = renderShell();
            const picker = container.querySelector<HTMLSelectElement>('#language-select');
            // The label around it is translated; the languages it offers are not.
            expect(
                Array.from(
                    picker?.options ?? [],
                    (option) => `${option.value}:${option.textContent}:${option.lang}`,
                ),
            ).toEqual(['de:Deutsch:de', 'en:English:en', 'es:Español:es', 'nl:Nederlands:nl']);
            unmount();
        }
        await i18n.changeLanguage('en');
    });

    it('provides landmarks, a skip link, accessible names, and keyboard focus hooks', async () => {
        const user = userEvent.setup();
        renderShell();

        expect(screen.getByRole('banner')).toBeInTheDocument();
        expect(screen.getByRole('navigation', { name: 'Main navigation' })).toBeInTheDocument();
        expect(screen.getByRole('main')).toBeInTheDocument();
        expect(screen.getByRole('contentinfo')).toBeInTheDocument();
        expect(screen.getByLabelText('Language')).toBeInTheDocument();

        const skipLink = screen.getByRole('link', { name: 'Skip to main content' });
        expect(skipLink).toHaveClass('skip-link');
        expect(screen.getByRole('main')).toHaveAttribute('id', 'main-content');
        expect(screen.getByRole('main')).toHaveAttribute('tabindex', '-1');
        expect(screen.queryByRole('link', { name: 'LitterBox' })).not.toBeInTheDocument();
        await user.tab();
        expect(skipLink).toHaveFocus();
        await user.tab();
        expect(screen.getByRole('button', { name: 'Menu' })).toHaveFocus();
        await user.tab();
        expect(screen.getByRole('link', { name: 'Home' })).toHaveFocus();
        expect(screen.getByRole('link', { name: 'Home' })).toHaveAttribute('aria-current', 'page');

        const appShell = document.querySelector('.app-shell');
        expect(appShell).toHaveClass('motion-safe');
    });

    it('keeps navigation keyboard discoverable and provides local image fallbacks', async () => {
        const user = userEvent.setup();
        renderShell(
            <PageMain>
                <h1>Keyboard fixture</h1>
            </PageMain>,
        );

        const homeLink = screen.getByRole('link', { name: 'Home' });
        const submitLink = screen.getByRole('link', { name: 'Submit project' });
        expect(homeLink).toHaveAttribute('aria-current', 'page');
        expect(submitLink).not.toHaveAttribute('aria-current');

        await user.tab();
        await user.tab();
        await user.tab();
        expect(homeLink).toHaveFocus();
        await user.tab();
        expect(submitLink).toHaveFocus();

        const bannerImage = document.querySelector('.site-banner img');
        const brandImage = document.querySelector('.brand-image-slot img');
        const universityImage = document.querySelector('.footer-university-slot img');
        expect(bannerImage).not.toBeNull();
        expect(brandImage).not.toBeNull();
        expect(universityImage).not.toBeNull();

        fireEvent.error(bannerImage!);
        fireEvent.error(brandImage!);
        fireEvent.error(universityImage!);

        expect(document.querySelector('.site-banner-slot')).toHaveClass('image-slot-fallback');
        expect(document.querySelector('.brand-image-slot')).toHaveClass('image-slot-fallback');
        expect(document.querySelector('.footer-university-slot')).toHaveClass(
            'image-slot-fallback',
        );
        expect(document.querySelector('.site-banner-slot .image-slot-text')).toHaveTextContent(
            'LitterBox',
        );
    });

    it('keeps status meaning in text and shape classes in addition to color', () => {
        render(
            <>
                <StatusIndicator tone="processing" label="Processing" />
                <StatusIndicator tone="failed" label="Failed" role="alert" />
            </>,
        );

        expect(screen.getByRole('status')).toHaveClass('status-processing');
        expect(screen.getByRole('status')).toHaveTextContent('Processing');
        expect(screen.getByRole('alert')).toHaveClass('status-failed');
        expect(screen.getByRole('alert')).toHaveTextContent('Failed');
        expect(document.querySelectorAll('.status-dot')).toHaveLength(2);
    });

    it('keeps long translated content inside semantic page and card primitives', () => {
        const longContent = 'Long translated issue content '.repeat(80);
        renderShell(
            <PageMain>
                <h1>Long-content fixture</h1>
                <Card>
                    <p>{longContent}</p>
                </Card>
            </PageMain>,
        );

        expect(screen.getByRole('main')).toHaveClass('page-content');
        const longText = document.querySelector('.card p');
        expect(longText).not.toBeNull();
        expect(longText?.textContent).toBe(longContent);
        expect(longText?.parentElement).toHaveClass('card');
    });

    it('connects form labels to controls without requiring visual cues', () => {
        renderShell(
            <PageMain>
                <FormField label="Project archive" labelFor="archive-input" hint="Synthetic only">
                    <input id="archive-input" type="file" />
                </FormField>
            </PageMain>,
        );

        expect(screen.getByLabelText('Project archive')).toHaveAttribute('id', 'archive-input');
        expect(screen.getByText('Synthetic only')).toBeInTheDocument();
    });

    it('provides a labelled, horizontally contained semantic table', () => {
        renderShell(
            <PageMain>
                <DataTable caption="Synthetic findings">
                    <thead>
                        <tr>
                            <th scope="col">Finding</th>
                            <th scope="col">Severity</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr>
                            <td>Dead code</td>
                            <td>Warning</td>
                        </tr>
                    </tbody>
                </DataTable>
            </PageMain>,
        );

        expect(screen.getByRole('region', { name: 'Synthetic findings' })).toHaveClass(
            'table-region',
        );
        expect(screen.getByRole('table', { name: 'Synthetic findings' })).toBeInTheDocument();
        expect(screen.getByRole('columnheader', { name: 'Finding' })).toBeInTheDocument();
    });

    it('traps dialog focus, closes with Escape, and restores focus', async () => {
        const user = userEvent.setup();
        const onClose = vi.fn();

        function DialogFixture() {
            const [open, setOpen] = useState(false);
            return (
                <>
                    <button type="button" onClick={() => setOpen(true)}>
                        Open dialog
                    </button>
                    <Dialog
                        open={open}
                        title="Synthetic dialog"
                        closeLabel="Close dialog"
                        onClose={() => {
                            onClose();
                            setOpen(false);
                        }}
                    >
                        <a href="#synthetic">First dialog action</a>
                        <button type="button">Last dialog action</button>
                    </Dialog>
                </>
            );
        }

        render(<DialogFixture />);
        const opener = screen.getByRole('button', { name: 'Open dialog' });
        await user.click(opener);
        expect(screen.getByRole('dialog', { name: 'Synthetic dialog' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Close dialog' })).toHaveFocus();

        await user.keyboard('{Shift>}{Tab}{/Shift}');
        expect(screen.getByRole('button', { name: 'Last dialog action' })).toHaveFocus();
        await user.keyboard('{Tab}');
        expect(screen.getByRole('button', { name: 'Close dialog' })).toHaveFocus();
        await user.keyboard('{Escape}');
        expect(onClose).toHaveBeenCalledOnce();
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
        expect(opener).toHaveFocus();
    });

    it('keeps feedback controls keyboard and screen-reader friendly', async () => {
        const user = userEvent.setup();
        const onReact = vi.fn().mockResolvedValue(undefined);
        render(
            <MemoryRouter>
                <FeedbackControls
                    label="Finding feedback"
                    helpfulLabel="Helpful"
                    notHelpfulLabel="Not helpful"
                    savingMessage="Saving feedback…"
                    savedMessage="Feedback saved."
                    errorMessage="Feedback failed."
                    onReact={onReact}
                />
            </MemoryRouter>,
        );

        const helpful = screen.getByRole('button', { name: 'Helpful' });
        expect(helpful).toHaveAttribute('aria-pressed', 'false');
        await user.click(helpful);
        await waitFor(() => expect(helpful).toHaveAttribute('aria-pressed', 'true'));
        expect(onReact).toHaveBeenCalledWith('helpful');
        expect(screen.getByRole('status')).toHaveTextContent('Feedback saved.');
    });
});
