// SPDX-License-Identifier: EUPL-1.2
// SPDX-FileCopyrightText: 2026 LitterBox-Web contributors

import { BASE_URL } from '../lib/base-url';
import type { MetricBandDto, MetricReferenceDto } from './generated';

export const METRIC_REFERENCE_URL = `${BASE_URL}api/v1/metrics/reference`;

export type MetricBand = MetricBandDto;

const DISTRIBUTION_FIELDS = ['minimum', 'q1', 'median', 'q3', 'maximum'] as const;

const finite = (field: unknown): field is number =>
    typeof field === 'number' && Number.isFinite(field);

const isBand = (value: unknown): value is MetricBand => {
    if (!value || typeof value !== 'object') return false;
    const candidate = value as Record<string, unknown>;
    if (
        typeof candidate.name !== 'string' ||
        !finite(candidate.sampleSize) ||
        candidate.sampleSize <= 0 ||
        !finite(candidate.lowerBound) ||
        !finite(candidate.upperBound) ||
        candidate.lowerBound > candidate.upperBound
    ) {
        return false;
    }
    const present = DISTRIBUTION_FIELDS.filter((field) => candidate[field] !== undefined);
    if (present.length === 0) return true;
    if (present.length !== DISTRIBUTION_FIELDS.length) return false;
    const values = DISTRIBUTION_FIELDS.map((field) => candidate[field]);
    return (
        values.every(finite) &&
        values.every(
            (field, index) => index === 0 || (values[index - 1] as number) <= (field as number),
        )
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
