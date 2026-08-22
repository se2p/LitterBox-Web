// SPDX-License-Identifier: EUPL-1.2
// SPDX-FileCopyrightText: 2026 LitterBox-Web contributors

import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BasicStatistics } from '../src/components/single-project/BasicStatistics';
import i18n from '../src/i18n';

const metrics = {
    sprite_count: 3,
    script_count: 40,
    block_count: 120,
    ct_score: 9,
};

const referenceResponse = (bands: unknown[]) =>
    new Response(JSON.stringify({ metrics: bands }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
    });

// Every band puts the values above at a different place in the distribution: three sprites is under the lower
// tercile, forty scripts is between the two, a hundred and twenty blocks is over the upper one, and the score is
// under its own lower tercile.
const syntheticBands = [
    { name: 'sprite_count', sampleSize: 640, lowerBound: 4, upperBound: 11 },
    { name: 'script_count', sampleSize: 640, lowerBound: 12, upperBound: 55 },
    { name: 'block_count', sampleSize: 512, lowerBound: 20, upperBound: 90 },
    { name: 'ct_score', sampleSize: 640, lowerBound: 12, upperBound: 17 },
];

describe('project measurements', () => {
    beforeEach(async () => {
        await i18n.changeLanguage('en');
        vi.restoreAllMocks();
    });

    it('says where among the analysed projects each measurement falls', async () => {
        vi.spyOn(globalThis, 'fetch').mockResolvedValue(referenceResponse(syntheticBands));
        render(<BasicStatistics metrics={metrics} locale="en" />);

        // Two values below their lower bound, one between the bounds, one above the upper one.
        expect(await screen.findAllByText('(lower than most)')).toHaveLength(2);
        expect(screen.getByText('(around the middle)')).toBeInTheDocument();
        expect(screen.getByText('(higher than most)')).toBeInTheDocument();
    });

    it('puts a value on either boundary around the middle', async () => {
        vi.spyOn(globalThis, 'fetch').mockResolvedValue(
            referenceResponse([
                { name: 'sprite_count', sampleSize: 640, lowerBound: 3, upperBound: 11 },
                { name: 'block_count', sampleSize: 640, lowerBound: 20, upperBound: 120 },
            ]),
        );
        // The bounds are the edges of the middle third, not of the outer ones, so both sit inside it.
        render(<BasicStatistics metrics={{ sprite_count: 3, block_count: 120 }} locale="en" />);

        expect(await screen.findAllByText('(around the middle)')).toHaveLength(2);
    });

    it('says that a position in the distribution is not a rating', async () => {
        vi.spyOn(globalThis, 'fetch').mockResolvedValue(referenceResponse(syntheticBands));
        render(<BasicStatistics metrics={metrics} locale="en" />);

        expect(await screen.findByText(/It is not a rating of the project\./)).toBeInTheDocument();
    });

    it('says how many projects the comparison was drawn from', async () => {
        vi.spyOn(globalThis, 'fetch').mockResolvedValue(referenceResponse(syntheticBands));
        render(<BasicStatistics metrics={metrics} locale="en" />);

        // The smallest sample behind any of the four, because that is the weakest claim on the line.
        expect(
            await screen.findByText(/Compared with 512 projects analysed here before\./),
        ).toBeInTheDocument();
    });

    it('reports the measurements unqualified when the service knows of no comparison', async () => {
        vi.spyOn(globalThis, 'fetch').mockResolvedValue(referenceResponse([]));
        render(<BasicStatistics metrics={metrics} locale="en" />);

        expect(await screen.findByText('Sprites')).toBeInTheDocument();
        expect(screen.getByText('120')).toBeInTheDocument();
        expect(screen.queryByText('(higher than most)')).not.toBeInTheDocument();
        expect(screen.queryByText(/Compared with/)).not.toBeInTheDocument();
    });

    it('keeps the measurements when the comparison cannot be fetched at all', async () => {
        vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('synthetic network failure'));
        render(<BasicStatistics metrics={metrics} locale="en" />);

        expect(await screen.findByText('Blocks')).toBeInTheDocument();
        expect(screen.getByText('120')).toBeInTheDocument();
        await waitFor(() => expect(screen.queryByText(/Compared with/)).not.toBeInTheDocument());
    });

    it('qualifies only the measurements the service has a distribution for', async () => {
        vi.spyOn(globalThis, 'fetch').mockResolvedValue(
            referenceResponse([
                { name: 'block_count', sampleSize: 88, lowerBound: 20, upperBound: 90 },
            ]),
        );
        render(<BasicStatistics metrics={metrics} locale="en" />);

        expect(await screen.findByText('(higher than most)')).toBeInTheDocument();
        expect(screen.queryByText('(lower than most)')).not.toBeInTheDocument();
        expect(
            screen.getByText(/Compared with 88 projects analysed here before\./),
        ).toBeInTheDocument();
    });

    it.each([
        ['drawn from no projects', { sampleSize: 0, lowerBound: 20, upperBound: 90 }],
        ['drawn from a negative count', { sampleSize: -4, lowerBound: 20, upperBound: 90 }],
        ['bounded the wrong way round', { sampleSize: 88, lowerBound: 90, upperBound: 20 }],
    ])('reports the measurement alone when the distribution is %s', async (_name, band) => {
        vi.spyOn(globalThis, 'fetch').mockResolvedValue(
            referenceResponse([{ name: 'block_count', ...band }]),
        );
        render(<BasicStatistics metrics={metrics} locale="en" />);

        // The number is still the number. What is missing is any claim about where it sits.
        expect(await screen.findByText('120')).toBeInTheDocument();
        expect(screen.queryByText('(higher than most)')).not.toBeInTheDocument();
        expect(screen.queryByText('(lower than most)')).not.toBeInTheDocument();
        expect(screen.queryByText(/Compared with/)).not.toBeInTheDocument();
    });

    it('matches a measurement to its distribution under either of the names it goes by', async () => {
        vi.spyOn(globalThis, 'fetch').mockResolvedValue(referenceResponse(syntheticBands));
        // The same three measurements under the report's shorter names. What the stored distribution calls a
        // measurement and what a report calls it need not be the same word.
        render(<BasicStatistics metrics={{ sprites: 3, scripts: 40, blocks: 120 }} locale="en" />);

        expect(await screen.findByText('(lower than most)')).toBeInTheDocument();
        expect(screen.getByText('(around the middle)')).toBeInTheDocument();
        expect(screen.getByText('(higher than most)')).toBeInTheDocument();
    });
});
