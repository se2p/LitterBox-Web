// SPDX-License-Identifier: EUPL-1.2
// SPDX-FileCopyrightText: 2026 LitterBox-Web contributors

import { BASE_URL } from '../lib/base-url';
import type { MetricBandDto, MetricReferenceDto } from './generated';

export const METRIC_REFERENCE_URL = `${BASE_URL}api/v1/metrics/reference`;

export type MetricBand = MetricBandDto;

/**
 * A band has to be able to divide something into thirds before it can say which third a value is in. Two ways it
 * cannot: drawn from no projects at all, or with its boundaries the wrong way round, which would put every value
 * in the outer thirds and none in the middle. Both would otherwise render as a confident comparison.
 */
const isBand = (value: unknown): value is MetricBand => {
    if (!value || typeof value !== 'object') return false;
    const candidate = value as Record<string, unknown>;
    const finite = (field: unknown): field is number =>
        typeof field === 'number' && Number.isFinite(field);
    return (
        typeof candidate.name === 'string' &&
        finite(candidate.sampleSize) &&
        candidate.sampleSize > 0 &&
        finite(candidate.lowerBound) &&
        finite(candidate.upperBound) &&
        candidate.lowerBound <= candidate.upperBound
    );
};

export async function fetchMetricReference(signal?: AbortSignal): Promise<MetricBand[]> {
    const response = await fetch(METRIC_REFERENCE_URL, {
        headers: { Accept: 'application/json' },
        signal,
    });
    if (!response.ok) {
        throw new Error(`Metric reference request failed (${response.status})`);
    }
    const payload: unknown = await response.json();
    const metrics = (payload as MetricReferenceDto | null)?.metrics;
    if (!Array.isArray(metrics)) {
        throw new Error('Metric reference response did not match the API contract');
    }
    return metrics.filter(isBand);
}
