// SPDX-License-Identifier: EUPL-1.2
// SPDX-FileCopyrightText: 2026 LitterBox-Web contributors

import { describe, expect, it } from 'vitest';
import {
    BLOCK_CATEGORY_ORDER,
    blockCategoryShares,
    CONCEPT_ORDER,
    CONCEPT_PALETTE_COLOUR,
    CT_DIMENSION_ORDER,
    CT_DIMENSIONS,
    PROGRAMMING_CONCEPT_ORDER,
    conceptCoverage,
    ctProfile,
    ctTotal,
    ctTotalBand,
} from '../src/lib/program-concepts';

describe('conceptCoverage', () => {
    it('reports undefined, never zero, for a metric the report never carried', () => {
        const coverage = conceptCoverage({ motion_block_count: 4 });
        const loops = coverage.find((entry) => entry.id === 'loops');
        expect(loops).toEqual({ id: 'loops', count: undefined, present: false });
    });

    it('keeps a reported zero distinct from an absent metric', () => {
        const coverage = conceptCoverage({ pen_block_count: 0 });
        const pen = coverage.find((entry) => entry.id === 'pen');
        expect(pen).toEqual({ id: 'pen', count: 0, present: false });
    });

    it('reports a positive count as present', () => {
        const coverage = conceptCoverage({ motion_block_count: 12 });
        const motion = coverage.find((entry) => entry.id === 'motion');
        expect(motion).toEqual({ id: 'motion', count: 12, present: true });
    });

    it('uses script-starting hats rather than the Scratch palette count for events', () => {
        const coverage = conceptCoverage({ hat_count: 2, events_block_count: 1 });
        expect(coverage.find((entry) => entry.id === 'eventTriggers')?.count).toBe(2);
        expect(coverage.find((entry) => entry.id === 'events')?.count).toBe(1);
    });

    it('falls back through the alias list for custom blocks', () => {
        const byMyBlocks = conceptCoverage({ my_blocks_block_count: 3 });
        expect(byMyBlocks.find((entry) => entry.id === 'customBlocks')).toEqual({
            id: 'customBlocks',
            count: 3,
            present: true,
        });

        const byProcedureCount = conceptCoverage({ procedure_count: 2 });
        expect(byProcedureCount.find((entry) => entry.id === 'customBlocks')).toEqual({
            id: 'customBlocks',
            count: 2,
            present: true,
        });

        const both = conceptCoverage({ my_blocks_block_count: 5, procedure_count: 9 });
        expect(both.find((entry) => entry.id === 'customBlocks')?.count).toBe(5);
    });

    it('covers every declared concept exactly once, in the declared order', () => {
        const coverage = conceptCoverage({});
        expect(coverage.map((entry) => entry.id)).toEqual(CONCEPT_ORDER);
    });

    it('treats a completely malformed report as carrying nothing', () => {
        for (const malformed of [
            null,
            undefined,
            [],
            'not an object',
            42,
            { motion_block_count: NaN },
        ]) {
            const coverage = conceptCoverage(malformed);
            expect(coverage.every((entry) => entry.count === undefined && !entry.present)).toBe(
                true,
            );
        }
    });
});

describe('the three groups a concept can belong to', () => {
    it('places every declared concept in at least one group', () => {
        const grouped = new Set<string>([
            ...BLOCK_CATEGORY_ORDER,
            'pen',
            'music',
            'textToSpeech',
            'translate',
            ...PROGRAMMING_CONCEPT_ORDER,
        ]);
        expect([...CONCEPT_ORDER].filter((id) => !grouped.has(id))).toEqual([]);
    });

    it('keeps variables and custom blocks in two groups, and only those two', () => {
        const counts = new Map<string, number>();
        for (const id of [
            ...BLOCK_CATEGORY_ORDER,
            'pen',
            'music',
            'textToSpeech',
            'translate',
            ...PROGRAMMING_CONCEPT_ORDER,
        ]) {
            counts.set(id, (counts.get(id) ?? 0) + 1);
        }
        const inTwoGroups = [...counts.entries()]
            .filter(([, count]) => count > 1)
            .map(([id]) => id)
            .sort();
        expect(inTwoGroups).toEqual(['customBlocks', 'variables']);
    });

    it('draws the nine palette categories and nothing else in the treemap group', () => {
        expect([...BLOCK_CATEGORY_ORDER]).toHaveLength(9);
        // Lists are not a tenth palette category: Scratch keeps list blocks in the Variables palette, and giving
        // them a tile of their own would count the same corner of the palette twice.
        expect([...BLOCK_CATEGORY_ORDER]).not.toContain('lists');
        for (const id of BLOCK_CATEGORY_ORDER) {
            expect(CONCEPT_PALETTE_COLOUR[id]).toBeDefined();
        }
    });

    it('draws every extension in the one green Scratch gives them all', () => {
        for (const id of ['pen', 'music', 'textToSpeech', 'translate'] as const) {
            expect(CONCEPT_PALETTE_COLOUR[id]).toBe('extension');
        }
    });
});

describe('blockCategoryShares', () => {
    it('takes a share against the categories that were reported, not against the project total', () => {
        // `block_count` counts list blocks, extension blocks and everything else no category above breaks out, so
        // dividing by it would give nine shares that quietly fail to add up.
        const { categories, counted } = blockCategoryShares({
            block_count: 400,
            motion_block_count: 30,
            looks_block_count: 10,
        });
        expect(counted).toBe(40);
        expect(categories.find((entry) => entry.id === 'motion')?.share).toBeCloseTo(0.75, 6);
        expect(categories.find((entry) => entry.id === 'looks')?.share).toBeCloseTo(0.25, 6);
    });

    it('gives a reported zero a share of zero and an unreported category no share at all', () => {
        const { categories } = blockCategoryShares({ motion_block_count: 4, looks_block_count: 0 });
        expect(categories.find((entry) => entry.id === 'looks')).toMatchObject({
            count: 0,
            share: 0,
        });
        expect(categories.find((entry) => entry.id === 'sensing')).toMatchObject({
            count: undefined,
            share: undefined,
        });
    });

    it('reports every category, in the drawing order, even when nothing was measured', () => {
        const { categories, counted } = blockCategoryShares({});
        expect(categories.map((entry) => entry.id)).toEqual([...BLOCK_CATEGORY_ORDER]);
        expect(counted).toBe(0);
        expect(categories.every((entry) => entry.share === undefined)).toBe(true);
    });

    it('never divides by a total of zero when every category came back zero', () => {
        const { categories } = blockCategoryShares({ motion_block_count: 0, looks_block_count: 0 });
        expect(categories.every((entry) => entry.share === undefined || entry.share === 0)).toBe(
            true,
        );
        expect(categories.every((entry) => !Number.isNaN(entry.share ?? 0))).toBe(true);
    });
});

describe('ctProfile', () => {
    it('leaves the level undefined when the dimension metric is absent', () => {
        const profile = ctProfile({});
        const flowControl = profile.find((entry) => entry.id === 'flowControl');
        expect(flowControl).toEqual({ id: 'flowControl', level: undefined });
    });

    it.each([0, 1, 2, 3] as const)('reads every reported level, including %i', (level) => {
        const profile = ctProfile({ ct_score_flow_control: level });
        expect(profile.find((entry) => entry.id === 'flowControl')?.level).toBe(level);
    });

    it('maps every dimension to its own metric name', () => {
        for (const id of CT_DIMENSION_ORDER) {
            const metric = CT_DIMENSIONS[id].metric;
            const profile = ctProfile({ [metric]: 2 });
            const entry = profile.find((candidate) => candidate.id === id);
            expect(entry?.level).toBe(2);

            for (const other of profile) {
                if (other.id !== id) expect(other.level).toBeUndefined();
            }
        }
    });

    it('clamps an out-of-range level defensively instead of trusting the report', () => {
        expect(ctProfile({ ct_score_logic: -5 }).find((entry) => entry.id === 'logic')?.level).toBe(
            0,
        );
        expect(ctProfile({ ct_score_logic: 99 }).find((entry) => entry.id === 'logic')?.level).toBe(
            3,
        );
        expect(
            ctProfile({ ct_score_logic: 1.6 }).find((entry) => entry.id === 'logic')?.level,
        ).toBe(2);
    });

    it('ignores a non-finite dimension score', () => {
        const profile = ctProfile({ ct_score_logic: NaN });
        expect(profile.find((entry) => entry.id === 'logic')?.level).toBeUndefined();
    });

    it('treats a completely malformed report as carrying no dimension at all', () => {
        for (const malformed of [null, undefined, [], 'not an object', 42]) {
            const profile = ctProfile(malformed);
            expect(profile.every((entry) => entry.level === undefined)).toBe(true);
        }
    });
});

describe('ctTotal', () => {
    it('is undefined when the report never carried a total score', () => {
        expect(ctTotal({})).toEqual({ score: undefined, max: 21 });
    });

    it('reads the reported total against a fixed maximum of 21', () => {
        expect(ctTotal({ ct_score: 15 })).toEqual({ score: 15, max: 21 });
    });

    it('keeps a reported zero total distinct from a report that never carried one', () => {
        expect(ctTotal({ ct_score: 0 })).toEqual({ score: 0, max: 21 });
    });
});

describe('ctTotalBand', () => {
    it('reads a total against the same three bands Dr. Scratch itself draws the boundary at', () => {
        expect(ctTotalBand(0)).toBe('narrow');
        expect(ctTotalBand(7)).toBe('narrow');
        expect(ctTotalBand(8)).toBe('moderate');
        expect(ctTotalBand(14)).toBe('moderate');
        expect(ctTotalBand(15)).toBe('broad');
        expect(ctTotalBand(21)).toBe('broad');
    });
});
