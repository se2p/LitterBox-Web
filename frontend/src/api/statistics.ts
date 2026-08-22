// SPDX-License-Identifier: EUPL-1.2
// SPDX-FileCopyrightText: 2026 LitterBox-Web contributors

import { BASE_URL } from '../lib/base-url';
import type {
    PublicStatisticsBlockCategoryDto,
    PublicStatisticsCurvePointDto,
    PublicStatisticsDistributionDto,
    PublicStatisticsDto,
    PublicStatisticsFindingDto,
    PublicStatisticsFindingGroupDto,
    PublicStatisticsTotalsDto,
} from './generated';
import {
    boundedNonblankString,
    hasExactKeys,
    isJsonContentType,
    nonnegativeSafeInteger,
    positiveSafeInteger,
    readBoundedText,
} from './validation';

export type StatisticsTotals = PublicStatisticsTotalsDto;
export type StatisticsCurvePoint = PublicStatisticsCurvePointDto;
export type StatisticsDistribution = PublicStatisticsDistributionDto;
export type StatisticsFinding = PublicStatisticsFindingDto;
export type StatisticsFindingGroup = PublicStatisticsFindingGroupDto;
export type StatisticsBlockCategory = PublicStatisticsBlockCategoryDto;
export type PublicStatistics = PublicStatisticsDto;

export const PUBLIC_STATISTICS_URL = `${BASE_URL}api/v1/statistics/public`;

const MAX_RESPONSE_BYTES = 1024 * 1024;
const MAX_TEXT_LENGTH = 160;
const isPrevalence = (value: unknown): value is number =>
    typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1;
const isDateTime = (value: unknown): value is string =>
    boundedNonblankString(value, MAX_TEXT_LENGTH) && Number.isFinite(Date.parse(value));

const isTotals = (value: unknown): value is StatisticsTotals =>
    hasExactKeys(value, ['projects', 'blocks', 'scripts', 'sprites']) &&
    nonnegativeSafeInteger(value.projects) &&
    nonnegativeSafeInteger(value.blocks) &&
    nonnegativeSafeInteger(value.scripts) &&
    nonnegativeSafeInteger(value.sprites);

const isCurvePoint = (value: unknown): value is StatisticsCurvePoint =>
    hasExactKeys(value, ['value', 'relativeDensity']) &&
    typeof value.value === 'number' &&
    Number.isFinite(value.value) &&
    value.value >= 0 &&
    isPrevalence(value.relativeDensity);

const isDistribution = (value: unknown): value is StatisticsDistribution => {
    if (
        !hasExactKeys(value, [
            'metric',
            'sampleSize',
            'minimum',
            'p25',
            'median',
            'p75',
            'p95',
            'displayMaximum',
            'zeroCount',
            'zeroPrevalence',
            'points',
        ]) ||
        !boundedNonblankString(value.metric, MAX_TEXT_LENGTH) ||
        !positiveSafeInteger(value.sampleSize) ||
        !nonnegativeSafeInteger(value.minimum) ||
        !nonnegativeSafeInteger(value.p25) ||
        !nonnegativeSafeInteger(value.median) ||
        !nonnegativeSafeInteger(value.p75) ||
        !nonnegativeSafeInteger(value.p95) ||
        !nonnegativeSafeInteger(value.displayMaximum) ||
        !nonnegativeSafeInteger(value.zeroCount) ||
        !isPrevalence(value.zeroPrevalence) ||
        !Array.isArray(value.points) ||
        value.points.length < 2 ||
        value.points.length > 200 ||
        !value.points.every(isCurvePoint)
    )
        return false;

    const distribution = value as unknown as StatisticsDistribution;
    return (
        distribution.minimum <= distribution.p25 &&
        distribution.p25 <= distribution.median &&
        distribution.median <= distribution.p75 &&
        distribution.p75 <= distribution.p95 &&
        distribution.p95 <= distribution.displayMaximum &&
        distribution.zeroCount <= distribution.sampleSize
    );
};

const isFinding = (value: unknown): value is StatisticsFinding =>
    hasExactKeys(value, ['finderId', 'name', 'projectsAffected', 'occurrences', 'prevalence']) &&
    boundedNonblankString(value.finderId, MAX_TEXT_LENGTH) &&
    boundedNonblankString(value.name, MAX_TEXT_LENGTH) &&
    nonnegativeSafeInteger(value.projectsAffected) &&
    nonnegativeSafeInteger(value.occurrences) &&
    isPrevalence(value.prevalence);

const isFindingGroup = (value: unknown): value is StatisticsFindingGroup =>
    hasExactKeys(value, ['type', 'findings']) &&
    boundedNonblankString(value.type, MAX_TEXT_LENGTH) &&
    Array.isArray(value.findings) &&
    value.findings.length <= 100 &&
    value.findings.every(isFinding);

const isBlockCategory = (value: unknown): value is StatisticsBlockCategory =>
    hasExactKeys(value, ['metric', 'projectsUsing', 'prevalence', 'blocks', 'blockShare']) &&
    boundedNonblankString(value.metric, MAX_TEXT_LENGTH) &&
    nonnegativeSafeInteger(value.projectsUsing) &&
    isPrevalence(value.prevalence) &&
    nonnegativeSafeInteger(value.blocks) &&
    isPrevalence(value.blockShare);

/** A public response is compact, but still treated as untrusted input before it can reach a chart. */
export const isPublicStatistics = (value: unknown): value is PublicStatistics => {
    if (
        !hasExactKeys(value, [
            'schemaVersion',
            'available',
            'generatedAt',
            'totals',
            'distributions',
            'findingGroups',
            'blockCategories',
        ]) ||
        value.schemaVersion !== 1 ||
        typeof value.available !== 'boolean' ||
        !isDateTime(value.generatedAt) ||
        !(value.totals === null || isTotals(value.totals)) ||
        !Array.isArray(value.distributions) ||
        value.distributions.length > 100 ||
        !value.distributions.every(isDistribution) ||
        !Array.isArray(value.findingGroups) ||
        value.findingGroups.length > 20 ||
        !value.findingGroups.every(isFindingGroup) ||
        !Array.isArray(value.blockCategories) ||
        value.blockCategories.length > 100 ||
        !value.blockCategories.every(isBlockCategory)
    )
        return false;

    const statistics = value as unknown as PublicStatistics;
    if (!statistics.available)
        return (
            statistics.totals === null &&
            statistics.distributions.length === 0 &&
            statistics.findingGroups.length === 0 &&
            statistics.blockCategories.length === 0
        );

    return statistics.totals !== null;
};

export async function fetchPublicStatistics(
    locale: string,
    signal?: AbortSignal,
): Promise<PublicStatistics> {
    const url = `${PUBLIC_STATISTICS_URL}?locale=${encodeURIComponent(locale)}`;
    const response = await fetch(url, {
        headers: { Accept: 'application/json' },
        signal,
    });
    if (!response.ok) throw new Error(`Public statistics request failed (${response.status})`);
    if (!isJsonContentType(response.headers.get('Content-Type')))
        throw new Error('Public statistics response was not JSON');
    const text = await readBoundedText(response, MAX_RESPONSE_BYTES, {
        tooLarge: () => new Error('Public statistics response was too large'),
    });
    let payload: unknown;
    try {
        payload = JSON.parse(text);
    } catch {
        throw new Error('Public statistics response was not valid JSON');
    }
    if (!isPublicStatistics(payload))
        throw new Error('Public statistics response did not match the API contract');
    return payload;
}
