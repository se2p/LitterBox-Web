// SPDX-License-Identifier: EUPL-1.2
// SPDX-FileCopyrightText: 2025 LitterBox-Web contributors

import type { MetricBand } from '../../../api/metric-reference';
import type { TranslationKey } from '../../../i18n/locales';
import {
    OVERVIEW_METRIC_ORDER,
    overviewMetricNames,
    type OverviewMetric,
} from '../../../lib/overview-metrics';

export interface MetricEntry {
    id: string;
    label: string;
    value: number;
    /** False when the label was derived from the identifier rather than translated. */
    translated: boolean;
}

export interface MetricEntries {
    entries: MetricEntry[];
    invalidCount: number;
    hasInput: boolean;
}

/** The overview measurements and their aliases, in the order they are shown. */
export const OVERVIEW_METRICS: ReadonlyArray<{
    labelKey: OverviewMetric;
    names: readonly string[];
}> = OVERVIEW_METRIC_ORDER.map((labelKey) => ({ labelKey, names: overviewMetricNames(labelKey) }));

const TRANSLATED_LABELS: Readonly<Record<string, TranslationKey>> = {
    block_count: 'metricBlocks',
    script_count: 'metricScripts',
    sprite_count: 'metricSprites',
    statement_count: 'metricStatements',
    variable_count: 'metricVariables',
    variable_use_count: 'metricVariableUses',
    ct_score: 'metricCtScore',
    avg_line_width: 'metricAverageLineWidth',
};

const compareCodePointOrder = (left: string, right: string): number =>
    left < right ? -1 : left > right ? 1 : 0;

const readableMetricId = (id: string): string => {
    const words = id
        .replace(/([a-z])([A-Z])/g, '$1 $2')
        .replace(/[_-]+/g, ' ')
        .trim();
    return words ? words.charAt(0).toUpperCase() + words.slice(1) : id;
};

const metricLabel = (
    id: string,
    translate: (key: TranslationKey) => string,
): { label: string; translated: boolean } => {
    const translationKey = TRANSLATED_LABELS[id];
    if (translationKey) return { label: translate(translationKey), translated: true };
    return { label: readableMetricId(id), translated: false };
};

/** The same translated or human-readable name used by the metric explorer, for consumers that only need a label. */
export const metricDisplayName = (id: string, translate: (key: TranslationKey) => string): string =>
    metricLabel(id, translate).label;

/**
 * Every measurement the analysis reported, in one flat list ordered by its own identifier. Nothing in the report says
 * which group a measurement belongs to, so none is invented here: a group guessed from the spelling of a name puts
 * `ct_score` under "learning", presenting an arithmetic score as a statement about what a child has learnt.
 */
export function metricEntries(
    metrics: unknown,
    translate: (key: TranslationKey) => string,
): MetricEntries {
    const hasInput = metrics !== null && metrics !== undefined;
    if (!hasInput || typeof metrics !== 'object' || Array.isArray(metrics)) {
        return { entries: [], invalidCount: hasInput ? 1 : 0, hasInput };
    }
    const entries: MetricEntry[] = [];
    let invalidCount = 0;
    Object.entries(metrics as Record<string, unknown>).forEach(([id, value]) => {
        if (!id.trim() || typeof value !== 'number' || !Number.isFinite(value)) {
            invalidCount += 1;
            return;
        }
        const { label, translated } = metricLabel(id, translate);
        entries.push({ id, label, value, translated });
    });
    entries.sort((left, right) => compareCodePointOrder(left.id, right.id));
    return { entries, invalidCount, hasInput };
}

/** The overview measurements this analysis actually carries, in the order they are listed above. */
export const overviewEntries = (
    entries: readonly MetricEntry[],
    translate: (key: TranslationKey) => string,
): MetricEntry[] =>
    OVERVIEW_METRICS.flatMap(({ labelKey, names }) => {
        const found = names
            .map((name) => entries.find((entry) => entry.id === name))
            .find((entry) => entry !== undefined);
        return found === undefined ? [] : [{ ...found, label: translate(labelKey) }];
    });

/** Matching is on the metric's own name, or on the alias the overview already declares for it. Never on a guess. */
export const bandFor = (
    entry: MetricEntry,
    reference: readonly MetricBand[],
): MetricBand | undefined => {
    const aliases = OVERVIEW_METRICS.find(({ names }) => names.includes(entry.id))?.names ?? [
        entry.id,
    ];
    return reference.find((band) => aliases.includes(band.name));
};

/**
 * Which third of the reference distribution a value falls in. The two bounds are the edges of the middle third, so a
 * value on either boundary is in it.
 */
export const tercile = (value: number, band: MetricBand): 'lower' | 'middle' | 'upper' => {
    if (value < band.lowerBound) return 'lower';
    if (value > band.upperBound) return 'upper';
    return 'middle';
};

/** The translation key for each third `tercile` can return, kept beside it rather than copied out to every screen
 * that reads a value against a band. */
export const BAND_LABEL_KEYS = {
    lower: 'metricBandLowerThird',
    middle: 'metricBandMiddleThird',
    upper: 'metricBandUpperThird',
} as const satisfies Record<'lower' | 'middle' | 'upper', TranslationKey>;

/** Matches the raw identifier as well as the label, because one of them is what a researcher has in mind. */
export const searchMetrics = (entries: readonly MetricEntry[], query: string): MetricEntry[] => {
    const needle = query.trim().toLocaleLowerCase();
    if (!needle) return [...entries];
    return entries.filter(
        (entry) =>
            entry.id.toLocaleLowerCase().includes(needle) ||
            entry.label.toLocaleLowerCase().includes(needle),
    );
};
