// SPDX-License-Identifier: EUPL-1.2
// SPDX-FileCopyrightText: 2026 LitterBox-Web contributors

import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import '../src/i18n';
import { squarifiedTreemap, tileLabelTier } from '../src/components/task-analysis/treemap-layout';
import type { TileLabelTier, TreemapTile } from '../src/components/task-analysis/treemap-layout';
import { TaskConceptCoverage } from '../src/components/task-analysis/TaskConceptCoverage';

const renderCoverage = (metrics: unknown) =>
    render(<TaskConceptCoverage metrics={metrics} locale="en" />);

const tiles = (container: HTMLElement) =>
    Array.from(container.querySelectorAll<HTMLElement>('.task-blocks-tile'));

describe('squarifiedTreemap', () => {
    it('gives every value a tile in the order the caller passed them, whatever size they are', () => {
        // Sorting largest-first is what the algorithm needs; it is not something a caller should have to do, and a
        // tile that came back in sorted order would be drawn in the wrong colour under the wrong name.
        const laid = squarifiedTreemap([1, 40, 9]);
        expect(laid).toHaveLength(3);
        expect(laid[1].width * laid[1].height).toBeGreaterThan(laid[2].width * laid[2].height);
        expect(laid[2].width * laid[2].height).toBeGreaterThan(laid[0].width * laid[0].height);
    });

    it('gives each tile an area in proportion to its value', () => {
        const laid = squarifiedTreemap([50, 25, 25]);
        const areas = laid.map((tile) => (tile.width / 100) * (tile.height / 100));
        expect(areas[0]).toBeCloseTo(0.5, 5);
        expect(areas[1]).toBeCloseTo(0.25, 5);
        expect(areas[2]).toBeCloseTo(0.25, 5);
    });

    it('fills the box exactly, leaving no strip of it unaccounted for', () => {
        const laid = squarifiedTreemap([13, 8, 5, 3, 2, 1, 1, 1]);
        const covered = laid.reduce(
            (total, tile) => total + (tile.width / 100) * (tile.height / 100),
            0,
        );
        expect(covered).toBeCloseTo(1, 5);
        for (const tile of laid) {
            expect(tile.x).toBeGreaterThanOrEqual(-0.001);
            expect(tile.y).toBeGreaterThanOrEqual(-0.001);
            expect(tile.x + tile.width).toBeLessThanOrEqual(100.001);
            expect(tile.y + tile.height).toBeLessThanOrEqual(100.001);
        }
    });

    it('lays a single value across the whole box', () => {
        expect(squarifiedTreemap([7])).toEqual([{ x: 0, y: 0, width: 100, height: 100 }]);
    });

    it('draws nothing at all rather than dividing by a total of zero', () => {
        expect(squarifiedTreemap([])).toEqual([]);
        expect(squarifiedTreemap([0, 0])).toEqual([]);
    });

    it('keeps a one-percent value visible rather than rounding it out of existence', () => {
        const laid = squarifiedTreemap([99, 1]);
        expect(laid[1].width).toBeGreaterThan(0);
        expect(laid[1].height).toBeGreaterThan(0);
        expect(tileLabelTier(laid[1], 'Sound', '1 (1%)')).toBe('none');
    });
});

describe('tileLabelTier', () => {
    const whole = { x: 0, y: 0, width: 100, height: 100 };

    it('lets a tile with the whole box to itself carry its name and its figures', () => {
        expect(tileLabelTier(whole, 'Custom blocks', '34 (21%)')).toBe('full');
    });

    it('asks for room in proportion to the name, not one threshold for all nine categories', () => {
        const narrow = { x: 0, y: 0, width: 21, height: 40 };
        expect(tileLabelTier(narrow, 'Events', '6 (4%)')).not.toBe('none');
        expect(tileLabelTier(narrow, 'Variables', '6 (4%)')).toBe('none');
    });

    it('drops the figures rather than the name when only one of the two fits', () => {
        const shallow = { x: 0, y: 0, width: 100, height: 12 };
        expect(tileLabelTier(shallow, 'Motion', '34 (21%)')).toBe('name');
    });

    it('refuses a tile too narrow for figures it could not wrap', () => {
        // The figures are set on one line and never break, so a tile as wide as the name but not as wide as
        // "1,024 (100%)" would have clipped them mid-number. The name survives; the figures do not.
        const slim = { x: 0, y: 0, width: 25, height: 100 };
        expect(tileLabelTier(slim, 'Motion', '1,024 (100%)')).toBe('name');
    });

    it('refuses a tile too short for the name at all', () => {
        expect(tileLabelTier({ x: 0, y: 0, width: 100, height: 3 }, 'Motion', '1 (1%)')).toBe(
            'none',
        );
    });

    it('leaves room for a second line when the name is two words', () => {
        const twoLinesTall = { x: 0, y: 0, width: 100, height: 21 };
        expect(tileLabelTier(twoLinesTall, 'Motion', '4 (100%)')).toBe('full');
        expect(tileLabelTier(twoLinesTall, 'Custom blocks', '4 (100%)')).toBe('name');
    });

    // The box below is 100x100, which makes a tile's width and height percentages equal to CSS pixels — the
    // arithmetic in these tests reads directly off the constants instead of through a scaling factor.
    const square = { width: 100, height: 100 };

    it('carries the name at its larger size once the tile is roomy enough for that and the figures too', () => {
        // A `full` tile sets its name a full 2.7px larger than a `name` tile does, and it is that bigger name —
        // not the smaller one this tile could also have held — that has to fit alongside the figures here.
        const roomy = { x: 0, y: 0, width: 80, height: 45 };
        expect(tileLabelTier(roomy, 'Motion', '34 (21%)', square)).toBe('full');
    });

    it('falls back to the smaller name-only size when the tile fits that but not the larger full-tier name', () => {
        // Wide and tall enough for "Motion" set at the `name` size, but short of what the same word needs at the
        // larger `full` size plus a line for "34 (21%)" beneath it — so the name is drawn, alone, at the smaller
        // size, rather than clipped trying to hold both at the size a roomier tile would have used.
        const middling = { x: 0, y: 0, width: 60, height: 30 };
        expect(tileLabelTier(middling, 'Motion', '34 (21%)', square)).toBe('name');
    });

    it('refuses a tile too small for the name even at the smaller of its two sizes', () => {
        const cramped = { x: 0, y: 0, width: 40, height: 15 };
        expect(tileLabelTier(cramped, 'Motion', '34 (21%)', square)).toBe('none');
    });

    it('holds the full tier to the larger name size rather than to the size a name-only tile would use', () => {
        const tooShort = { x: 0, y: 0, width: 76, height: 39 };
        expect(tileLabelTier(tooShort, 'Motion', '34 (21%)', square)).toBe('name');

        const tooNarrow = { x: 0, y: 0, width: 85, height: 60 };
        expect(tileLabelTier(tooNarrow, 'Operators', '6 (3%)', square)).toBe('name');
    });

    it('never answers a bigger tile with a worse tier than a smaller one', () => {
        const rank: Record<TileLabelTier, number> = { none: 0, name: 1, full: 2 };
        const growingByStep = (boxes: TreemapTile[], name: string, value: string) => {
            let previous = -Infinity;
            for (const box of boxes) {
                const tier = tileLabelTier(box, name, value, square);
                expect(rank[tier]).toBeGreaterThanOrEqual(previous);
                previous = rank[tier];
            }
        };

        growingByStep(
            [
                { x: 0, y: 0, width: 40, height: 15 },
                { x: 0, y: 0, width: 60, height: 30 },
                { x: 0, y: 0, width: 80, height: 45 },
                { x: 0, y: 0, width: 100, height: 100 },
            ],
            'Motion',
            '34 (21%)',
        );

        growingByStep(
            [
                { x: 0, y: 0, width: 40, height: 15 },
                { x: 0, y: 0, width: 60, height: 40 },
                { x: 0, y: 0, width: 80, height: 65 },
                { x: 0, y: 0, width: 120, height: 120 },
            ],
            'Custom blocks',
            '4 (100%)',
        );
    });
});

describe('block categories in a task', () => {
    it('writes the count and the share into every tile with room for them', () => {
        const { container } = renderCoverage({
            motion_block_count: 60,
            looks_block_count: 30,
            control_block_count: 9,
            sound_block_count: 1,
        });

        const drawn = tiles(container);
        expect(drawn).toHaveLength(4);
        const labelled = drawn.filter((tile) => tile.classList.contains('task-blocks-tile-full'));
        expect(labelled.length).toBeGreaterThan(0);
        expect(labelled[0]).toHaveTextContent('Motion');
        expect(labelled[0]).toHaveTextContent('60 (60%)');
        expect(drawn.some((tile) => tile.classList.contains('task-blocks-tile-none'))).toBe(true);
        for (const tile of drawn) {
            expect(tile.getAttribute('title')).toMatch(/.+: .+/);
        }
    });

    it('names under the drawing exactly what the drawing did not name itself', () => {
        const { container } = renderCoverage({
            motion_block_count: 60,
            looks_block_count: 30,
            control_block_count: 9,
            sound_block_count: 1,
            sensing_block_count: 0,
        });

        const named = Array.from(
            container.querySelectorAll('.task-blocks-unnamed-entry .task-blocks-unnamed-name'),
        ).map((entry) => entry.textContent);
        expect(named).toContain('Sound');
        expect(named).toContain('Sensing');
        expect(named).not.toContain('Motion');

        const sound = container.querySelector('.task-blocks-unnamed-entry') as HTMLElement;
        expect(sound).toBeTruthy();
        // Hidden from a screen reader, which is handed the whole table instead — this line exists to spare a
        // sighted reader a lookup, not to be read out ahead of the categories that matter.
        expect(container.querySelector('.task-blocks-unnamed')).toHaveAttribute(
            'aria-hidden',
            'true',
        );
    });

    it('keeps the whole table for a reader who cannot use the drawing at all', () => {
        // Taken off the screen, not out of the page: the treemap is one `role="img"` whose tiles are hidden, so
        // without this the figures would exist only as coloured rectangles.
        const { container } = renderCoverage({ motion_block_count: 60, looks_block_count: 20 });
        const table = container.querySelector('.task-blocks-table') as HTMLElement;
        // Hidden by its wrapper rather than by a class on the table itself: a table's used width is never less
        // than its min-content width, so `.visually-hidden` on the table would have left a 300px table on the
        // page at a 320px viewport, shrunk to a pixel in name only.
        expect(table.parentElement).toHaveClass('visually-hidden');
        expect(
            within(screen.getByRole('row', { name: /Motion/ })).getByText('75%'),
        ).toBeInTheDocument();
    });

    it('announces the drawing once rather than as nine positioned boxes', () => {
        const { container } = renderCoverage({ motion_block_count: 4 });
        screen.getByRole('img', { name: /Block categories, drawn as areas/ });
        for (const tile of tiles(container)) {
            expect(tile).toHaveAttribute('aria-hidden', 'true');
        }
    });

    it('keeps an unmeasured category out of the drawing and names it in words instead', () => {
        const { container } = renderCoverage({ motion_block_count: 4, looks_block_count: 0 });
        expect(tiles(container)).toHaveLength(1);

        const looks = screen.getByRole('row', { name: /Looks/ });
        expect(within(looks).getByText('0')).toBeInTheDocument();
        const sensing = screen.getByRole('row', { name: /Sensing/ });
        expect(within(sensing).getByText('Not reported')).toBeInTheDocument();
        expect(within(looks).getByText('0%')).toBeInTheDocument();
        expect(within(sensing).getByText('—')).toBeInTheDocument();
    });

    it('takes a share against the categories that were measured, not against every block in the project', () => {
        renderCoverage({ block_count: 400, motion_block_count: 30, looks_block_count: 10 });
        const motion = screen.getByRole('row', { name: /Motion/ });
        expect(within(motion).getByText('75%')).toBeInTheDocument();
    });

    it('says so plainly when no category was measured at all', () => {
        const { container } = renderCoverage({ ct_score: 11 });
        expect(tiles(container)).toHaveLength(0);
        expect(screen.getByText(/nothing to draw here/)).toBeInTheDocument();
    });
});

describe('programming concepts in a task', () => {
    const partialConceptMetrics = {
        boolean_operation_count: 0,
        variables_block_count: 6,
        list_block_count_only_direct_list: 0,
        my_blocks_block_count: 2,
    };

    const conceptGrids = (container: HTMLElement) =>
        Array.from(container.querySelectorAll<HTMLElement>('.task-concept-grid'));

    it('keeps curriculum context folded and includes a German curriculum example', () => {
        renderCoverage(partialConceptMetrics);

        const context = screen
            .getByText('Teaching context')
            .closest('details') as HTMLDetailsElement;
        expect(context.open).toBe(false);
        expect(
            within(context).getByRole('link', { name: 'German curriculum example (Bavaria)' }),
        ).toHaveAttribute('href', 'https://www.lehrplanplus.bayern.de/serviceinformation/l315104');
    });

    it('keeps positive and zero counts together under curriculum headings', () => {
        const { container } = renderCoverage(partialConceptMetrics);
        const [control, data, unmeasured] = conceptGrids(container);
        const row = (grid: HTMLElement, name: string) =>
            within(grid).getByText(name).closest('li') as HTMLElement;

        const booleanOperators = row(control, 'Boolean operators');
        const variables = row(data, 'Variables');
        const lists = row(data, 'Lists');
        const loops = row(unmeasured, 'Loops');
        expect(
            screen.getByRole('heading', { name: 'Repetition and decisions' }),
        ).toBeInTheDocument();
        expect(within(booleanOperators).getByText('0')).toBeInTheDocument();
        expect(within(variables).getByText('6')).toBeInTheDocument();
        expect(within(lists).getByText('0')).toBeInTheDocument();
        expect(within(loops).queryByText('Not reported')).not.toBeInTheDocument();
        expect(container.querySelector('#task-concepts-zero')).toBeNull();
        expect(
            (container.querySelector('#task-concepts-unmeasured') as HTMLDetailsElement).open,
        ).toBe(false);
        expect(container.querySelectorAll('.task-concept')).toHaveLength(10);
    });

    it('keeps unreported concepts in their own closed fold', () => {
        const { container } = renderCoverage(partialConceptMetrics);
        const fold = container.querySelector('#task-concepts-unmeasured') as HTMLDetailsElement;

        expect(fold.open).toBe(false);
        expect(
            within(fold).getByRole('heading', { name: 'Not reported in this analysis (6)' }),
        ).toBeInTheDocument();
        expect(
            [...fold.querySelectorAll('.task-concept-name')].map((name) => name.textContent),
        ).toEqual([
            'Sequences',
            'Event-triggered scripts',
            'Loops',
            'Conditionals',
            'Messages',
            'Clones',
        ]);
        const [control, data] = conceptGrids(container);
        expect(control.querySelectorAll('.task-concept')).toHaveLength(1);
        expect(data.querySelectorAll('.task-concept')).toHaveLength(3);
    });

    it('has no unmeasured group at all when the report carries every concept', () => {
        const { container } = renderCoverage({
            ...partialConceptMetrics,
            sequence_count: 1,
            loop_count: 0,
            conditional_count: 0,
            hat_count: 1,
            broadcast_count: 0,
            clone_count: 0,
        });

        expect(container.querySelector('#task-concepts-unmeasured')).toBeNull();
        expect(conceptGrids(container)).toHaveLength(4);
        expect(container.querySelectorAll('.task-concept')).toHaveLength(10);
    });

    it('shows variables and custom blocks in both readings, which is the point of splitting them', () => {
        const { container } = renderCoverage({
            variables_block_count: 6,
            my_blocks_block_count: 2,
        });
        const table = container.querySelector('.task-blocks-table') as HTMLElement;
        const grid = container.querySelector('.task-concept-grid') as HTMLElement;
        for (const name of ['Variables', 'Custom blocks']) {
            expect(within(table).getByText(name)).toBeInTheDocument();
            expect(within(grid).getByText(name)).toBeInTheDocument();
        }
        expect(within(grid).getByText('6')).toBeInTheDocument();
        expect(within(table).getByText('6')).toBeInTheDocument();
    });
});
