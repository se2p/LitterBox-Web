// SPDX-License-Identifier: EUPL-1.2
// SPDX-FileCopyrightText: 2026 LitterBox-Web contributors

import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const scratchblocksMocks = vi.hoisted(() => ({
    loadScratchblocks: vi.fn(),
    loadScratchblocksStyles: vi.fn(),
    loadScratchblocksLanguages: vi.fn(),
    createScratchblocksRenderer: vi.fn(),
    parse: vi.fn(),
    render: vi.fn(),
}));

vi.mock('../src/lib/dynamic-libraries', () => ({
    loadScratchblocks: scratchblocksMocks.loadScratchblocks,
    loadScratchblocksStyles: scratchblocksMocks.loadScratchblocksStyles,
    loadScratchblocksLanguages: scratchblocksMocks.loadScratchblocksLanguages,
    createScratchblocksRenderer: scratchblocksMocks.createScratchblocksRenderer,
}));

import { ScratchblocksPreview } from '../src/components/single-project/ScratchblocksPreview';

const preview = (source: string, inline = false) =>
    render(
        <ScratchblocksPreview
            source={source}
            locale="de"
            label="Scratchblocks"
            textAlternativeLabel="Text alternative"
            inline={inline}
        />,
    );

describe('ScratchblocksPreview', () => {
    beforeEach(() => {
        scratchblocksMocks.loadScratchblocks.mockResolvedValue({});
        scratchblocksMocks.loadScratchblocksStyles.mockResolvedValue('.scratchblocks {}');
        scratchblocksMocks.loadScratchblocksLanguages.mockResolvedValue({});
        scratchblocksMocks.parse.mockImplementation((source: string) => ({ source }));
        scratchblocksMocks.render.mockImplementation(() => {
            const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
            svg.setAttribute('width', '100');
            svg.setAttribute('height', '32');
            const group = document.createElementNS('http://www.w3.org/2000/svg', 'g');
            group.setAttribute('style', 'transform: scale(0.675)');
            svg.appendChild(group);
            return svg;
        });
        scratchblocksMocks.createScratchblocksRenderer.mockImplementation(() => ({
            parse: scratchblocksMocks.parse,
            render: scratchblocksMocks.render,
        }));
    });

    it('normalizes transport wrappers for parsing and text alternatives', async () => {
        preview('[scratchblocks]\nmove (10) steps\n[/scratchblocks]');

        await waitFor(() => expect(screen.getByText('move (10) steps')).toBeInTheDocument());
        expect(scratchblocksMocks.parse).toHaveBeenCalledWith(
            'move (10) steps',
            // English is always the fallback: LitterBox emits opcodes in English whatever the report locale.
            expect.objectContaining({ inline: false, languages: ['de', 'en'] }),
        );
        expect(screen.queryByText('[scratchblocks]')).not.toBeInTheDocument();
        expect(screen.getByRole('region')).toHaveAttribute('aria-label', 'Scratchblocks');
    });

    it('moves renderer transforms to CSP-compatible SVG attributes', async () => {
        preview('move (10) steps');

        await waitFor(() =>
            expect(document.querySelector('.scratchblocks-rendered')).toHaveAttribute(
                'data-render-state',
                'ready',
            ),
        );
        const group = document.querySelector('.scratchblocks-rendered svg g');
        expect(group).toHaveAttribute('transform', 'scale(0.675)');
        expect(group).not.toHaveAttribute('style');
    });

    it('keeps an inline text fallback when rendering fails', async () => {
        scratchblocksMocks.createScratchblocksRenderer.mockImplementationOnce(() => {
            throw new Error('synthetic renderer failure');
        });
        preview('when green flag clicked', true);

        await waitFor(() =>
            expect(document.querySelector('.scratchblocks-inline-rendered')).toHaveAttribute(
                'data-render-state',
                'error',
            ),
        );
        expect(screen.getByText('when green flag clicked')).toHaveClass(
            'scratchblocks-inline-fallback',
        );
        expect(screen.getByLabelText('Scratchblocks: when green flag clicked')).toBeInTheDocument();
    });
});
