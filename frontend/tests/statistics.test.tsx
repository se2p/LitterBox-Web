// SPDX-License-Identifier: EUPL-1.2
// SPDX-FileCopyrightText: 2026 LitterBox-Web contributors

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchPublicStatistics } from '../src/api/statistics';
import i18n from '../src/i18n';
import { StatisticsPage } from '../src/pages/StatisticsPage';
import { response } from './helpers';

const statistics = {
    schemaVersion: 1,
    available: true,
    generatedAt: '2026-08-14T12:00:00Z',
    totals: { projects: 12, blocks: 240, scripts: 36, sprites: 18 },
    distributions: [
        {
            metric: 'block_count',
            sampleSize: 12,
            minimum: 0,
            p25: 10,
            median: 20,
            p75: 40,
            p95: 80,
            displayMaximum: 100,
            zeroCount: 1,
            zeroPrevalence: 1 / 12,
            points: [
                { value: 0, relativeDensity: 0.1 },
                { value: 20, relativeDensity: 0.4 },
                { value: 50, relativeDensity: 0.2 },
                { value: 100, relativeDensity: 0.05 },
            ],
        },
        {
            metric: 'script_count',
            sampleSize: 12,
            minimum: 0,
            p25: 2,
            median: 4,
            p75: 6,
            p95: 10,
            displayMaximum: 12,
            zeroCount: 1,
            zeroPrevalence: 1 / 12,
            points: [
                { value: 0, relativeDensity: 0.5 },
                { value: 12, relativeDensity: 0.1 },
            ],
        },
        {
            metric: 'sprite_count',
            sampleSize: 12,
            minimum: 1,
            p25: 1,
            median: 2,
            p75: 3,
            p95: 5,
            displayMaximum: 6,
            zeroCount: 0,
            zeroPrevalence: 0,
            points: [
                { value: 1, relativeDensity: 0.5 },
                { value: 6, relativeDensity: 0.1 },
            ],
        },
        ...[
            'bug_count',
            'smell_count',
            'perfume_count',
            'interprocedural_cyclomatic_complexity',
            'most_complex_script',
            'max_nested_block_count',
            'length_longest_script',
            'procedure_count',
            'variable_count',
        ].map((metric) => ({
            metric,
            sampleSize: 12,
            minimum: 0,
            p25: 1,
            median: 2,
            p75: 4,
            p95: 8,
            displayMaximum: 10,
            zeroCount: 2,
            zeroPrevalence: 1 / 6,
            points: [
                { value: 0, relativeDensity: 0.25 },
                { value: 5, relativeDensity: 1 },
                { value: 10, relativeDensity: 0.1 },
            ],
        })),
    ],
    findingGroups: [
        {
            type: 'bug',
            findings: [
                {
                    finderId: 'synthetic-bug',
                    name: 'Synthetic bug',
                    projectsAffected: 6,
                    occurrences: 9,
                    prevalence: 0.5,
                },
                ...Array.from({ length: 9 }, (_, index) => ({
                    finderId: `less-common-${index + 1}`,
                    name: `Less common ${index + 1}`,
                    projectsAffected: 1,
                    occurrences: 1,
                    prevalence: 1 / 12,
                })),
            ],
        },
        { type: 'SMELL', findings: [] },
        { type: 'PERFUME', findings: [] },
    ],
    blockCategories: [
        {
            metric: 'motion_block_count',
            projectsUsing: 8,
            prevalence: 2 / 3,
            blocks: 120,
            blockShare: 0.5,
        },
        {
            metric: 'looks_block_count',
            projectsUsing: 4,
            prevalence: 1 / 3,
            blocks: 60,
            blockShare: 0.25,
        },
        {
            metric: 'sound_block_count',
            projectsUsing: 1,
            prevalence: 1 / 12,
            blocks: 12,
            blockShare: 0.05,
        },
        {
            metric: 'other_block_count',
            projectsUsing: 2,
            prevalence: 1 / 6,
            blocks: 48,
            blockShare: 0.2,
        },
    ],
};

describe('public statistics', () => {
    beforeEach(async () => {
        vi.restoreAllMocks();
        await i18n.changeLanguage('en');
    });

    it('renders accessible curves, finding prevalence, and block composition', async () => {
        vi.spyOn(globalThis, 'fetch').mockResolvedValue(response(statistics));
        render(<StatisticsPage applicationLocale="en" />);
        expect(
            await screen.findByRole('heading', { name: 'Scratch project insights' }),
        ).toBeInTheDocument();
        expect(screen.getByText('Synthetic bug')).toBeVisible();
        expect(
            screen.getByText(
                'Percentages are based only on projects with detailed finding reports.',
            ),
        ).toBeVisible();
        expect(screen.getAllByText('Projects with this pattern')).toHaveLength(10);
        expect(screen.queryByText('Projects affected')).not.toBeInTheDocument();
        expect(screen.getByText('Motion')).toBeVisible();
        expect(screen.getByText('Other block family')).toBeVisible();
        expect(screen.getAllByRole('img')).toHaveLength(13);
        expect(document.querySelectorAll('.statistics-median-marker')).toHaveLength(
            statistics.distributions.length,
        );
        expect(
            screen.queryByRole('navigation', { name: 'Explore by topic' }),
        ).not.toBeInTheDocument();
        expect(screen.getByText(/Data last updated/)).toBeVisible();
        expect(document.querySelector('.statistics-hero .statistics-updated')).not.toBeNull();
        expect(screen.getByRole('heading', { name: 'Finding burden per project' })).toBeVisible();
        expect(screen.getByRole('heading', { name: 'Complexity profile' })).toBeVisible();
        expect(screen.getByRole('heading', { name: 'Block-family composition' })).toBeVisible();
        expect(screen.getByText('Longest script length')).toBeVisible();
        expect(screen.getAllByText('50% of blocks (120) · used by 66.7% of projects')).toHaveLength(
            2,
        );
        expect(
            screen.getByText(
                'These statistics summarise projects submitted to LitterBox and may not represent all Scratch projects.',
            ),
        ).toBeVisible();
        expect(screen.queryByText('Methodology and scope')).not.toBeInTheDocument();
        expect(screen.queryByText('Prevalence versus repetition')).not.toBeInTheDocument();
        expect(document.querySelectorAll('.statistics-page [style]')).toHaveLength(0);
        expect(screen.getAllByRole('progressbar')).toHaveLength(10);
        expect(screen.getByRole('progressbar', { name: /Synthetic bug: 50%/ })).toBeInTheDocument();
        const spriteFigure = screen
            .getByRole('heading', { name: 'Sprites per project' })
            .closest('figure');
        const curvePath = spriteFigure?.querySelector('.statistics-curve-line')?.getAttribute('d');
        const axisStart = spriteFigure?.querySelector('.statistics-axis')?.getAttribute('x1');
        expect(curvePath?.match(/^M ([^ ]+)/)?.[1]).toBe(axisStart);
        expect(curvePath).not.toContain('Q');
        expect(spriteFigure?.querySelectorAll('.statistics-axis')).toHaveLength(1);
        expect(document.querySelector('.statistics-gridline')).toBeNull();
        for (const { target } of [
            { target: 'statistics-totals-heading' },
            { target: 'statistics-distributions-heading' },
            { target: 'statistics-burden-heading' },
            { target: 'statistics-findings-heading' },
            { target: 'statistics-composition-heading' },
            { target: 'statistics-complexity-heading' },
        ]) {
            expect(document.getElementById(target)).toHaveAttribute('tabindex', '-1');
        }
        expect(document.querySelector('.statistics-composition rect')).toHaveClass(
            'statistics-composition-motion',
        );
        expect(document.querySelector('.statistics-composition rect:last-child')).toHaveClass(
            'statistics-composition-other',
        );
    });

    it('suppresses all public detail while the minimum sample has not been reached', async () => {
        vi.spyOn(globalThis, 'fetch').mockResolvedValue(
            response({
                ...statistics,
                available: false,
                totals: null,
                distributions: [],
                findingGroups: [],
                blockCategories: [],
            }),
        );
        render(<StatisticsPage applicationLocale="en" />);
        expect(await screen.findByText('Statistics are not available yet')).toBeInTheDocument();
        expect(screen.queryByText('Synthetic bug')).not.toBeInTheDocument();
    });

    it('draws an all-zero distribution without invalid SVG coordinates', async () => {
        vi.spyOn(globalThis, 'fetch').mockResolvedValue(
            response({
                ...statistics,
                distributions: statistics.distributions.map((distribution) =>
                    distribution.metric === 'block_count'
                        ? {
                              ...distribution,
                              minimum: 0,
                              p25: 0,
                              median: 0,
                              p75: 0,
                              p95: 0,
                              displayMaximum: 0,
                              zeroCount: 12,
                              zeroPrevalence: 1,
                              points: [
                                  { value: 0, relativeDensity: 0 },
                                  { value: 0, relativeDensity: 0 },
                              ],
                          }
                        : distribution,
                ),
            }),
        );
        render(<StatisticsPage applicationLocale="en" />);
        await screen.findByRole('heading', { name: 'Scratch project insights' });
        expect(document.querySelector('.statistics-curve path')?.getAttribute('d')).not.toMatch(
            /NaN|Infinity/,
        );
    });

    it('uses sparse, round ticks for distributions with wide labels', async () => {
        vi.spyOn(globalThis, 'fetch').mockResolvedValue(
            response({
                ...statistics,
                distributions: statistics.distributions.map((distribution) =>
                    distribution.metric === 'block_count'
                        ? {
                              ...distribution,
                              minimum: 10_000,
                              p25: 20_000,
                              median: 50_000,
                              p75: 100_000,
                              p95: 300_000,
                              displayMaximum: 390_000,
                              zeroCount: 0,
                              zeroPrevalence: 0,
                              points: [
                                  { value: 10_000, relativeDensity: 0.2 },
                                  { value: 50_000, relativeDensity: 1 },
                                  { value: 390_000, relativeDensity: 0.1 },
                              ],
                          }
                        : distribution,
                ),
            }),
        );
        render(<StatisticsPage applicationLocale="en" />);
        const figure = (await screen.findByRole('heading', { name: 'Blocks per project' })).closest(
            'figure',
        );
        expect(
            [...(figure?.querySelectorAll('.statistics-axis-label') ?? [])].map(
                (label) => label.textContent,
            ),
        ).toEqual(['10,000', '50,000', '200,000']);
        expect(figure?.querySelector('.statistics-axis-label')).toHaveAttribute(
            'text-anchor',
            'start',
        );
    });

    it('offers retry after a failed request', async () => {
        const user = userEvent.setup();
        vi.spyOn(globalThis, 'fetch')
            .mockRejectedValueOnce(new Error('network unavailable'))
            .mockResolvedValueOnce(response(statistics));
        render(<StatisticsPage applicationLocale="en" />);
        expect(
            await screen.findByText('Public statistics could not be loaded.'),
        ).toBeInTheDocument();
        await user.click(screen.getByRole('button', { name: 'Try again' }));
        expect(await screen.findByText('Synthetic bug')).toBeVisible();
    });

    it('uses the current locale in the public endpoint URL and rejects malformed data', async () => {
        const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(response(statistics));
        await fetchPublicStatistics('de');
        expect(String(fetchMock.mock.calls[0][0])).toContain('api/v1/statistics/public?locale=de');
        fetchMock.mockResolvedValueOnce(
            response({
                ...statistics,
                distributions: [
                    ...statistics.distributions,
                    { ...statistics.distributions[0], metric: 'future_metric' },
                ],
                blockCategories: [
                    ...statistics.blockCategories,
                    { ...statistics.blockCategories[0], metric: 'future_category' },
                ],
            }),
        );
        await expect(fetchPublicStatistics('en')).resolves.toBeDefined();
        fetchMock.mockResolvedValueOnce(response({ ...statistics, totals: null }));
        await expect(fetchPublicStatistics('en')).rejects.toThrow('API contract');
    });
});
