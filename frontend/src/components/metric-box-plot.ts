// SPDX-License-Identifier: EUPL-1.2
// SPDX-FileCopyrightText: 2026 LitterBox-Web contributors

export interface MetricBoxPlotBand {
    minimum: number;
    q1: number;
    median: number;
    q3: number;
    maximum: number;
}

export interface MetricBoxPlotMarker {
    value: number;
}

export const markerRangeState = (
    value: number,
    { minimum, maximum }: MetricBoxPlotBand,
): 'below' | 'within' | 'above' => {
    if (value < minimum) return 'below';
    if (value > maximum) return 'above';
    return 'within';
};

export const rangePosition = (value: number, minimum: number, maximum: number): number => {
    if (maximum <= minimum) return 50;
    return Math.max(0, Math.min(100, ((value - minimum) / (maximum - minimum)) * 100));
};
