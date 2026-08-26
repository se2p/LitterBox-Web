// SPDX-License-Identifier: EUPL-1.2
// SPDX-FileCopyrightText: 2025 LitterBox-Web contributors

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../src/App';
import i18n from '../src/i18n';
import type { CatalogueEntry } from '../src/api/submissions';
import { response } from './helpers';

const capabilities = {
    schemaVersion: 1,
    litterboxVersion: 'synthetic-catalogue',
    supportedLocales: ['de', 'en', 'es', 'nl'],
    enabledFeatures: ['catalogue'],
};

const entry = (overrides: Partial<CatalogueEntry> = {}): CatalogueEntry => ({
    id: 'dead-code',
    title: 'Dead code',
    description: 'Remove unreachable blocks.',
    locale: 'en',
    fallback: false,
    instruction: 'Check the script path before deleting blocks.',
    examples: [{ label: 'Synthetic example', scratchblocks: 'move (10) steps' }],
    issueType: 'smell',
    ...overrides,
});

/**
 * An entry builds its body when it is first opened, and jsdom does not act on a click to a summary, so the fold is
 * opened the way the browser would and the toggle it would raise is raised by hand.
 */
const openEntry = (title: string) => {
    const entry = screen.getByRole('group', { name: title }) as HTMLDetailsElement;
    entry.open = true;
    fireEvent(entry, new Event('toggle'));
    return entry;
};

const renderCatalogue = async (entries: CatalogueEntry[], locale = 'en') => {
    await i18n.changeLanguage(locale);
    vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
        const url = String(input);
        if (url.includes('/capabilities')) return Promise.resolve(response(capabilities));
        return Promise.resolve(response(entries));
    });
    render(
        <MemoryRouter initialEntries={['/catalogue']}>
            <App />
        </MemoryRouter>,
    );
    const catalogueHeading = { en: 'Catalogue', nl: 'Catalogus', de: 'Katalog', es: 'Catálogo' };
    await screen.findByRole('heading', {
        name: catalogueHeading[locale as keyof typeof catalogueHeading] ?? 'Catalogue',
    });
    await waitFor(() => expect(document.querySelector('.catalogue-panel')).toBeInTheDocument());
};

const entryTitles = (): string[] =>
    Array.from(document.querySelectorAll('.catalogue-entry-title')).map(
        (element) => element.textContent ?? '',
    );

describe('catalogue page', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
        window.localStorage.clear();
        vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
            measureText: () => ({ width: 10 }),
        } as unknown as CanvasRenderingContext2D);
    });

    it('searches and orders deterministic entries', async () => {
        const user = userEvent.setup();
        await renderCatalogue([
            entry({ id: 'zeta', title: 'Zeta', issueType: 'bug' }),
            entry({ id: 'alpha', title: 'Alpha', issueType: 'smell' }),
        ]);

        expect(entryTitles()).toEqual(['Alpha', 'Zeta']);
        await user.type(screen.getByRole('searchbox', { name: 'Search catalogue' }), 'zeta');
        expect(entryTitles()).toEqual(['Zeta']);

        await user.clear(screen.getByRole('searchbox', { name: 'Search catalogue' }));
        await user.click(screen.getByRole('button', { name: /Smells/ }));
        expect(entryTitles()).toEqual(['Alpha']);

        await user.click(screen.getByRole('button', { name: /All patterns/ }));
        expect(entryTitles()).toEqual(['Alpha', 'Zeta']);
    });

    /*
     * The list is ordered by the name a reader knows, and by nothing else. It once offered its finder ids as a
     * second order, sorting on a string the page does not show.
     */
    it('orders by the name a reader knows, whatever the identifiers say', async () => {
        await renderCatalogue([
            entry({ id: 'aaa-first-by-id', title: 'Zebra', issueType: 'bug' }),
            entry({ id: 'zzz-last-by-id', title: 'Antelope', issueType: 'smell' }),
        ]);

        expect(entryTitles()).toEqual(['Antelope', 'Zebra']);
        expect(screen.queryByRole('combobox', { name: 'Order results' })).not.toBeInTheDocument();
    });

    // The id belongs to the analyser, not to anyone reading about the pattern. It stays searchable, so an id
    // copied out of a report still lands on the entry that explains it.
    it('finds an entry by its identifier without ever printing one', async () => {
        const user = userEvent.setup();
        await renderCatalogue([
            entry({ id: 'aaa-first-by-id', title: 'Zebra', issueType: 'bug' }),
            entry({ id: 'zzz-last-by-id', title: 'Antelope', issueType: 'smell' }),
        ]);

        openEntry('Zebra');
        expect(screen.queryByText('aaa-first-by-id')).not.toBeInTheDocument();
        await user.type(
            screen.getByRole('searchbox', { name: 'Search catalogue' }),
            'zzz-last-by-id',
        );
        expect(entryTitles()).toEqual(['Antelope']);
    });

    /*
     * Two entries currently arrive under the name "Turn off LED Matrix", and closed they are the same line twice.
     * The id says which is which, and it is what a finding would have named, so it is printed exactly where the
     * title stops being an answer — and nowhere else.
     */
    it('tells apart two entries that arrive under the same name', async () => {
        await renderCatalogue([
            entry({ id: 'matrix_off_script', title: 'Turn off LED Matrix', issueType: 'perfume' }),
            entry({
                id: 'rocky_light_off_script',
                title: 'Turn off LED Matrix',
                issueType: 'perfume',
            }),
            entry({ id: 'dead-code', title: 'Dead code' }),
        ]);

        expect(screen.getByText('matrix_off_script')).toBeInTheDocument();
        expect(screen.getByText('rocky_light_off_script')).toBeInTheDocument();
        // The entry whose name is its own still shows nothing but its name.
        expect(screen.queryByText('dead-code')).not.toBeInTheDocument();
        // And the two are separately addressable, which a shared accessible name would not have made them.
        expect(
            screen.getByRole('group', { name: 'Turn off LED Matrix (matrix_off_script)' }),
        ).toBeInTheDocument();
    });

    // 173 entries, each holding parsed prose and rendered blocks, is a page nobody asked to be built.
    it('builds an entry body only once the entry has been opened', async () => {
        await renderCatalogue([
            entry({
                id: 'dead-code',
                title: 'Dead code',
                description: 'Remove unreachable blocks.',
            }),
        ]);

        expect(screen.queryByText('Remove unreachable blocks.')).not.toBeInTheDocument();
        expect(document.querySelectorAll('.catalogue-entry-body')).toHaveLength(0);

        openEntry('Dead code');

        expect(screen.getByText('Remove unreachable blocks.')).toBeInTheDocument();
        expect(document.querySelectorAll('.catalogue-entry-body')).toHaveLength(1);
    });

    it('offers a way out of filters that matched nothing', async () => {
        const user = userEvent.setup();
        await renderCatalogue([entry({ id: 'dead-code', title: 'Dead code' })]);

        await user.type(
            screen.getByRole('searchbox', { name: 'Search catalogue' }),
            'nothing here',
        );
        expect(screen.getByText('No catalogue entries match these controls.')).toBeInTheDocument();

        await user.click(screen.getByRole('button', { name: 'Clear all filters' }));

        expect(entryTitles()).toEqual(['Dead code']);
        expect(screen.getByRole('searchbox', { name: 'Search catalogue' })).toHaveValue('');
    });

    it('filters with recognisable issue-family controls', async () => {
        const user = userEvent.setup();
        await renderCatalogue([
            entry({ id: 'bug-entry', title: 'Bug entry', issueType: 'bug' }),
            entry({ id: 'smell-entry', title: 'Smell entry', issueType: 'smell' }),
            entry({ id: 'perfume-entry', title: 'Perfume entry', issueType: 'perfume' }),
            entry({ id: 'unknown-entry', title: 'Unknown entry', issueType: undefined }),
        ]);

        const bugs = screen.getByRole('button', { name: 'Bugs' });
        expect(bugs).toHaveAttribute('aria-pressed', 'false');
        await user.click(bugs);
        expect(bugs).toHaveAttribute('aria-pressed', 'true');
        expect(entryTitles()).toEqual(['Bug entry']);

        await user.click(screen.getByRole('button', { name: 'Other findings' }));
        expect(entryTitles()).toEqual(['Unknown entry']);
        // Colour alone would not say which family a row belongs to.
        expect(screen.getByText('Unclassified')).toBeInTheDocument();
    });

    it('fills the finding placeholders and drops entries that only repeat their id', async () => {
        const user = userEvent.setup();
        await renderCatalogue(
            [
                entry({
                    id: 'uninitialised',
                    title: 'Nicht initialisiert',
                    description:
                        'In dieser Figur wird die Variable %VARIABLE nicht initialisiert, und %SPRITE sendet [sbi]sende (%MESSAGE v) an alle[/sbi].',
                    locale: 'de',
                    issueType: 'bug',
                }),
                // An umbrella finder: the catalogue answers with the bare id because its variants carry the text.
                entry({
                    id: 'busy_waiting',
                    title: 'Aktives Warten',
                    description: 'busy_waiting',
                    locale: 'de',
                    issueType: 'bug',
                }),
            ],
            'de',
        );

        expect(entryTitles()).toEqual(['Nicht initialisiert']);
        await user.click(screen.getByText('Nicht initialisiert'));
        expect(screen.getByText(/Variable meine Variable nicht initialisiert/)).toBeInTheDocument();
        expect(screen.getByText(/eine Figur sendet/)).toBeInTheDocument();
        expect(document.body.textContent).not.toContain('%VARIABLE');
        expect(document.body.textContent).not.toContain('%MESSAGE');
    });

    it('offers only controls that can change the result', async () => {
        await renderCatalogue([
            entry({ id: 'bug-entry', title: 'Bug entry', issueType: 'bug' }),
            entry({ id: 'smell-entry', title: 'Smell entry', issueType: 'smell' }),
        ]);

        // No entry is a perfume or unclassified.
        expect(screen.queryByRole('button', { name: /Perfumes/ })).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'Other findings' })).not.toBeInTheDocument();
        // How bad an occurrence is belongs to the occurrence, so the catalogue does not offer it as a filter.
        expect(screen.queryByRole('combobox', { name: 'Severity' })).not.toBeInTheDocument();
        // The issue type of these entries is only their family spelled out, which the buttons already offer.
        expect(screen.queryByRole('combobox', { name: 'Issue type' })).not.toBeInTheDocument();
    });

    it('shows visible block-set badges and independently filters all three ecosystems', async () => {
        const user = userEvent.setup();
        await renderCatalogue([
            entry({
                id: 'scratch-entry',
                title: 'Scratch entry',
                issueType: 'bug',
                blockSet: 'scratch',
            }),
            entry({
                id: 'quantum-entry',
                title: 'Quantum entry',
                issueType: 'smell',
                blockSet: 'qscratch',
            }),
            entry({
                id: 'robot-entry',
                title: 'Robot entry',
                issueType: 'perfume',
                blockSet: 'mblock',
            }),
        ]);

        const blocks = screen.getByRole('combobox', { name: 'Blocks' });
        expect(blocks).toHaveTextContent('All blocks (3)');
        expect(blocks).toHaveTextContent('Scratch (1)');
        expect(blocks).toHaveTextContent('Quantum / QScratch (1)');
        expect(blocks).toHaveTextContent('mBlock robot (1)');

        const badges = Array.from(document.querySelectorAll('.catalogue-block-set-badge'));
        expect(badges.map((badge) => badge.textContent)).toEqual(
            expect.arrayContaining(['Scratch', 'Quantum / QScratch', 'mBlock robot']),
        );
        expect(badges).toHaveLength(3);
        expect(
            badges.every((badge) => {
                const icon = badge.querySelector('svg');
                return (
                    icon?.getAttribute('aria-hidden') === 'true' &&
                    icon?.getAttribute('focusable') === 'false'
                );
            }),
        ).toBe(true);

        await user.selectOptions(blocks, 'scratch');
        expect(entryTitles()).toEqual(['Scratch entry']);

        await user.selectOptions(blocks, 'qscratch');
        expect(entryTitles()).toEqual(['Quantum entry']);

        await user.selectOptions(blocks, 'mblock');
        expect(entryTitles()).toEqual(['Robot entry']);

        await user.selectOptions(blocks, 'all');
        expect(entryTitles()).toEqual(['Quantum entry', 'Robot entry', 'Scratch entry']);
    });

    it('counts family and block-set filters against one another', async () => {
        const user = userEvent.setup();
        await renderCatalogue([
            entry({
                id: 'scratch-smell',
                title: 'Scratch smell',
                issueType: 'smell',
                blockSet: 'scratch',
            }),
            entry({
                id: 'quantum-bug',
                title: 'Quantum bug',
                issueType: 'bug',
                blockSet: 'qscratch',
            }),
            entry({ id: 'robot-bug', title: 'Robot bug', issueType: 'bug', blockSet: 'mblock' }),
            entry({
                id: 'robot-smell',
                title: 'Robot smell',
                issueType: 'smell',
                blockSet: 'mblock',
            }),
        ]);

        expect(screen.getByRole('button', { name: /Bugs/ })).toHaveTextContent('2');
        expect(screen.getByRole('button', { name: /Smells/ })).toHaveTextContent('2');

        const blocks = screen.getByRole('combobox', { name: 'Blocks' });
        await user.selectOptions(blocks, 'mblock');
        expect(screen.getByRole('button', { name: /Bugs/ })).toHaveTextContent('1');
        expect(screen.getByRole('button', { name: /Smells/ })).toHaveTextContent('1');

        await user.click(screen.getByRole('button', { name: /Bugs/ }));
        expect(entryTitles()).toEqual(['Robot bug']);
        expect(blocks).toHaveTextContent('Scratch (0)');
        expect(blocks).toHaveTextContent('Quantum / QScratch (1)');
        expect(blocks).toHaveTextContent('mBlock robot (1)');
    });

    it('resolves explicit block sets and preserves legacy platform compatibility', async () => {
        await renderCatalogue([
            entry({ id: 'legacy-robot', title: 'Legacy robot', platform: 'mblock' }),
            entry({ id: 'legacy-scratch', title: 'Legacy Scratch' }),
            entry({
                id: 'unknown-block-set',
                title: 'Unknown block set',
                blockSet: 'quantum',
                platform: 'scratch',
            }),
            entry({
                id: 'explicit-quantum',
                title: 'Explicit Quantum',
                blockSet: 'qscratch',
                platform: 'mblock',
            }),
        ]);

        const badgeText = (title: string) =>
            screen.getByRole('group', { name: title }).querySelector('.catalogue-block-set-badge')
                ?.textContent;
        expect(badgeText('Legacy robot')).toBe('mBlock robot');
        expect(badgeText('Legacy Scratch')).toBe('Scratch');
        expect(badgeText('Unknown block set')).toBe('Scratch');
        expect(badgeText('Explicit Quantum')).toBe('Quantum / QScratch');
    });

    it('hides the Blocks control when every pattern resolves to one block set', async () => {
        await renderCatalogue([
            entry({ id: 'bug-entry', title: 'Bug entry', issueType: 'bug', blockSet: 'scratch' }),
            // Missing blockSet and platform remains Scratch for older API responses.
            entry({ id: 'smell-entry', title: 'Smell entry', issueType: 'smell' }),
        ]);

        expect(screen.queryByRole('combobox', { name: 'Blocks' })).not.toBeInTheDocument();
        expect(entryTitles()).toEqual(['Bug entry', 'Smell entry']);
    });

    it('clears the block-set and family selections together with the other filters', async () => {
        const user = userEvent.setup();
        await renderCatalogue([
            entry({
                id: 'scratch-entry',
                title: 'Scratch entry',
                issueType: 'bug',
                blockSet: 'scratch',
            }),
            entry({
                id: 'robot-entry',
                title: 'Robot entry',
                issueType: 'smell',
                blockSet: 'mblock',
            }),
        ]);

        await user.selectOptions(screen.getByRole('combobox', { name: 'Blocks' }), 'mblock');
        await user.click(screen.getByRole('button', { name: /Smells/ }));
        await user.type(screen.getByRole('searchbox', { name: 'Search catalogue' }), 'no match');
        await user.click(screen.getByRole('button', { name: 'Clear all filters' }));

        expect(screen.getByRole('combobox', { name: 'Blocks' })).toHaveValue('all');
        expect(screen.getByRole('button', { name: /All patterns/ })).toHaveAttribute(
            'aria-pressed',
            'true',
        );
        expect(entryTitles()).toEqual(['Robot entry', 'Scratch entry']);
    });

    it.each([
        ['en', 'Blocks', 'Quantum / QScratch', 'mBlock robot'],
        ['de', 'Blöcke', 'Quantum / QScratch', 'mBlock-Roboter'],
        ['es', 'Bloques', 'Quantum / QScratch', 'Robot mBlock'],
        ['nl', 'Blokken', 'Quantum / QScratch', 'mBlock-robot'],
    ])('localises block-set controls and badges in %s', async (locale, label, quantum, robot) => {
        await renderCatalogue(
            [
                entry({ id: 'scratch-entry', title: 'Scratch entry', blockSet: 'scratch' }),
                entry({ id: 'quantum-entry', title: 'Quantum entry', blockSet: 'qscratch' }),
                entry({ id: 'robot-entry', title: 'Robot entry', blockSet: 'mblock' }),
            ],
            locale,
        );

        expect(screen.getByRole('combobox', { name: label })).toBeInTheDocument();
        expect(screen.getByText(quantum)).toBeInTheDocument();
        expect(screen.getByText(robot)).toBeInTheDocument();
    });

    it('makes resolved block-set terms searchable', async () => {
        const user = userEvent.setup();
        await renderCatalogue([
            entry({ id: 'quantum-entry', title: 'Quantum entry', blockSet: 'qscratch' }),
            entry({ id: 'robot-entry', title: 'Robot entry', blockSet: 'mblock' }),
        ]);

        await user.type(screen.getByRole('searchbox', { name: 'Search catalogue' }), 'quantum');
        expect(entryTitles()).toEqual(['Quantum entry']);
        await user.clear(screen.getByRole('searchbox', { name: 'Search catalogue' }));
        await user.type(screen.getByRole('searchbox', { name: 'Search catalogue' }), 'robot');
        expect(entryTitles()).toEqual(['Robot entry']);
    });

    it('keeps the issue-type control when a type says more than its family', async () => {
        await renderCatalogue([
            entry({ id: 'bug-entry', title: 'Bug entry', issueType: 'bug' }),
            entry({ id: 'timing', title: 'Timing entry', issueType: 'timing bug' }),
        ]);

        expect(screen.getByRole('combobox', { name: 'Issue type' })).toBeInTheDocument();
    });

    it('shows Dutch core fields and honest fallback and unavailable-field states', async () => {
        await renderCatalogue(
            [
                entry({
                    id: 'nl-core',
                    title: 'Nederlandse naam',
                    description: 'Nederlandse hint',
                    locale: 'nl',
                    fallback: true,
                    instruction: '',
                    examples: [],
                }),
                entry({
                    id: 'english-fallback',
                    title: 'English name',
                    description: 'English hint',
                    locale: 'en',
                    fallback: true,
                    instruction: '',
                    examples: [],
                }),
            ],
            'nl',
        );

        expect(entryTitles()).toEqual(['English name', 'Nederlandse naam']);
        openEntry('Nederlandse naam');
        expect(screen.getByText('Nederlandse hint')).toBeInTheDocument();
        // Every entry is a fallback of some kind, so only the one that changed language says so.
        expect(screen.getByText('Engelse alternatieve inhoud')).toBeInTheDocument();
        expect(screen.queryByText(/instructie, voorbeelden/i)).not.toBeInTheDocument();
        // A section that would only say "not supplied" is left out instead.
        expect(screen.queryByText('Instructie')).not.toBeInTheDocument();
        expect(screen.queryByText('Voorbeelden')).not.toBeInTheDocument();
    });

    it.each([
        ['loading', 'Loading catalogue entries…'],
        ['empty', 'No catalogue entries match these controls.'],
        ['error', 'The catalogue could not be loaded.'],
    ])('renders the %s state accessibly', async (state, expected) => {
        await i18n.changeLanguage('en');
        let resolveCatalogue: ((value: Response) => void) | undefined;
        vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
            if (String(input).includes('/capabilities'))
                return Promise.resolve(response(capabilities));
            if (state === 'loading')
                return new Promise((resolve) => {
                    resolveCatalogue = resolve;
                });
            return Promise.resolve(
                state === 'error' ? response({ error: 'synthetic failure' }, 503) : response([]),
            );
        });
        render(
            <MemoryRouter initialEntries={['/catalogue']}>
                <App />
            </MemoryRouter>,
        );

        if (state === 'loading') {
            expect(await screen.findByRole('status')).toHaveTextContent(expected);
            resolveCatalogue?.(response([]));
        } else {
            expect(await screen.findByText(expected)).toBeInTheDocument();
        }
        await waitFor(() =>
            expect(
                screen.getByRole('heading', { name: 'Catalogue', level: 1 }),
            ).toBeInTheDocument(),
        );
    });

    it('does not silently load the catalogue when server locale capabilities differ', async () => {
        const fetchMock = vi
            .spyOn(globalThis, 'fetch')
            .mockResolvedValue(response({ ...capabilities, supportedLocales: ['en'] }));
        render(
            <MemoryRouter initialEntries={['/catalogue']}>
                <App />
            </MemoryRouter>,
        );

        expect(await screen.findByText(/different language sets/i)).toBeInTheDocument();
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('checks capabilities before loading after navigation from a static page', async () => {
        const user = userEvent.setup();
        const fetchMock = vi
            .spyOn(globalThis, 'fetch')
            .mockResolvedValue(response({ ...capabilities, supportedLocales: ['en'] }));
        render(
            <MemoryRouter initialEntries={['/about']}>
                <App />
            </MemoryRouter>,
        );

        await screen.findByRole('heading', { name: 'About LitterBox' });
        await user.click(screen.getByRole('link', { name: 'Catalogue' }));

        expect(await screen.findByText(/different language sets/i)).toBeInTheDocument();
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });
});
