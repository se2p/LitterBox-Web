// SPDX-License-Identifier: EUPL-1.2
// SPDX-FileCopyrightText: 2026 LitterBox-Web contributors

import type { CSSProperties } from 'react';
import {
    markerRangeState,
    rangePosition,
    type MetricBoxPlotBand,
    type MetricBoxPlotMarker,
} from './metric-box-plot';

export function MetricBoxPlot({
    band,
    ariaLabel,
    marker,
}: {
    band: MetricBoxPlotBand;
    ariaLabel: string;
    marker?: MetricBoxPlotMarker;
}) {
    const { minimum, q1, median, q3, maximum } = band;
    const clamped = marker !== undefined && markerRangeState(marker.value, band) !== 'within';
    const style = {
        '--box-plot-q1': `${rangePosition(q1, minimum, maximum)}%`,
        '--box-plot-median': `${rangePosition(median, minimum, maximum)}%`,
        '--box-plot-q3': `${rangePosition(q3, minimum, maximum)}%`,
        ...(marker && { '--box-plot-marker': `${rangePosition(marker.value, minimum, maximum)}%` }),
    } as CSSProperties;

    return (
        <div className="metric-box-plot" style={style} role="img" aria-label={ariaLabel}>
            <span className="metric-box-plot-line" />
            <span className="metric-box-plot-box" />
            <span className="metric-box-plot-median" />
            {marker && (
                <span
                    className={
                        clamped
                            ? 'metric-box-plot-marker metric-box-plot-marker-clamped'
                            : 'metric-box-plot-marker'
                    }
                    aria-hidden="true"
                />
            )}
        </div>
    );
}
