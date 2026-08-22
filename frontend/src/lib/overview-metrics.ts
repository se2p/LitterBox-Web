// SPDX-License-Identifier: EUPL-1.2
// SPDX-FileCopyrightText: 2026 LitterBox-Web contributors

/**
 * The four measurements a reader is most likely to be looking for, and every name each of them goes by.
 *
 * A report may call a measurement "blocks" where the stored distribution calls it "block_count", so a value is looked
 * up by the whole set of names rather than by whichever one happened to match first. The table lives here because
 * three screens ask the same question of it — the result page's summary line, the metric explorer, and the class-set
 * table — and three copies of an alias list is three chances for them to disagree about what a project measures.
 */
export const OVERVIEW_METRIC_NAMES = {
    metricSprites: ['sprite_count', 'sprites'],
    metricScripts: ['script_count', 'scripts'],
    metricBlocks: ['block_count', 'blocks'],
    metricCtScore: ['ct_score', 'computational_thinking_score'],
} as const satisfies Record<string, readonly string[]>;

/** Also the translation key for the measurement's name, which is why the keys read the way they do. */
export type OverviewMetric = keyof typeof OVERVIEW_METRIC_NAMES;

export const OVERVIEW_METRIC_ORDER: readonly OverviewMetric[] = [
    'metricSprites',
    'metricScripts',
    'metricBlocks',
    'metricCtScore',
];

export const overviewMetricNames = (metric: OverviewMetric): readonly string[] =>
    OVERVIEW_METRIC_NAMES[metric];

/** The first of the names this report actually carries a finite number for, if any of them. */
export const metricValue = (metrics: unknown, names: readonly string[]): number | undefined => {
    if (!metrics || typeof metrics !== 'object' || Array.isArray(metrics)) return undefined;
    const values = metrics as Record<string, unknown>;
    return names
        .map((name) => values[name])
        .find(
            (candidate): candidate is number =>
                typeof candidate === 'number' && Number.isFinite(candidate),
        );
};

export const overviewMetricValue = (metrics: unknown, metric: OverviewMetric): number | undefined =>
    metricValue(metrics, overviewMetricNames(metric));
