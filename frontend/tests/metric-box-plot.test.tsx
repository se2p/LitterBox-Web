// SPDX-License-Identifier: EUPL-1.2
// SPDX-FileCopyrightText: 2026 LitterBox-Web contributors

import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { MetricBoxPlot } from '../src/components/MetricBoxPlot';
import { markerRangeState, type MetricBoxPlotBand } from '../src/components/metric-box-plot';

const band: MetricBoxPlotBand = { minimum: 0, q1: 25, median: 50, q3: 75, maximum: 100 };

describe('markerRangeState', () => {
    it('tells a value inside the band from one that overshot either end', () => {
        expect(markerRangeState(50, band)).toBe('within');
        expect(markerRangeState(0, band)).toBe('within');
        expect(markerRangeState(100, band)).toBe('within');
        expect(markerRangeState(-1, band)).toBe('below');
        expect(markerRangeState(101, band)).toBe('above');
    });
});

describe('MetricBoxPlot', () => {
    it('draws the box and whisker from the band alone, with no marker when none is given', () => {
        const { container } = render(
            <MetricBoxPlot
                band={band}
                ariaLabel="Median 50; middle half 25 to 75; range 0 to 100."
            />,
        );
        const plot = screen.getByRole('img', {
            name: 'Median 50; middle half 25 to 75; range 0 to 100.',
        });
        expect(plot.style.getPropertyValue('--box-plot-q1')).toBe('25%');
        expect(plot.style.getPropertyValue('--box-plot-median')).toBe('50%');
        expect(plot.style.getPropertyValue('--box-plot-q3')).toBe('75%');
        expect(container.querySelector('.metric-box-plot-marker')).not.toBeInTheDocument();
    });

    it('places a marker within the band at its own position, unclamped', () => {
        const { container } = render(
            <MetricBoxPlot band={band} ariaLabel="plot" marker={{ value: 90 }} />,
        );
        const plot = screen.getByRole('img', { name: 'plot' });
        expect(plot.style.getPropertyValue('--box-plot-marker')).toBe('90%');
        const marker = container.querySelector('.metric-box-plot-marker');
        expect(marker).toBeInTheDocument();
        expect(marker).not.toHaveClass('metric-box-plot-marker-clamped');
    });

    it('clamps a marker below the minimum to the low end of the plot rather than drawing it off the axis', () => {
        const { container } = render(
            <MetricBoxPlot band={band} ariaLabel="plot" marker={{ value: -40 }} />,
        );
        const plot = screen.getByRole('img', { name: 'plot' });
        expect(plot.style.getPropertyValue('--box-plot-marker')).toBe('0%');
        expect(container.querySelector('.metric-box-plot-marker')).toHaveClass(
            'metric-box-plot-marker-clamped',
        );
    });

    it('clamps a marker above the maximum to the high end of the plot rather than drawing it off the axis', () => {
        const { container } = render(
            <MetricBoxPlot band={band} ariaLabel="plot" marker={{ value: 500 }} />,
        );
        const plot = screen.getByRole('img', { name: 'plot' });
        expect(plot.style.getPropertyValue('--box-plot-marker')).toBe('100%');
        expect(container.querySelector('.metric-box-plot-marker')).toHaveClass(
            'metric-box-plot-marker-clamped',
        );
    });

    it('centres every tick when the band has no width at all, rather than dividing by zero', () => {
        const flat: MetricBoxPlotBand = { minimum: 5, q1: 5, median: 5, q3: 5, maximum: 5 };
        const { container } = render(
            <MetricBoxPlot band={flat} ariaLabel="plot" marker={{ value: 5 }} />,
        );
        const plot = screen.getByRole('img', { name: 'plot' });
        expect(plot.style.getPropertyValue('--box-plot-q1')).toBe('50%');
        expect(plot.style.getPropertyValue('--box-plot-median')).toBe('50%');
        expect(plot.style.getPropertyValue('--box-plot-q3')).toBe('50%');
        expect(plot.style.getPropertyValue('--box-plot-marker')).toBe('50%');
        expect(container.querySelector('.metric-box-plot-marker')).not.toHaveClass(
            'metric-box-plot-marker-clamped',
        );
    });
});
