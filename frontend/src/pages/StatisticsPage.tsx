// SPDX-License-Identifier: EUPL-1.2
// SPDX-FileCopyrightText: 2026 LitterBox-Web contributors

import { useTranslation } from 'react-i18next';
import {
    fetchPublicStatistics,
    type StatisticsDistribution,
    type StatisticsFindingGroup,
} from '../api/statistics';
import { FindingPrevalenceSection } from '../components/statistics/FindingPrevalenceSection';
import { DistributionPlot } from '../components/statistics/DistributionPlot';
import { BlockComposition } from '../components/statistics/BlockComposition';
import { StatisticsTotals } from '../components/statistics/StatisticsTotals';
import { Card } from '../components/Card';
import { LoadingState, ErrorState } from '../components/States';
import { PageMain } from '../components/Page';
import { useAsync } from '../lib/useAsync';
import { formatDateTime, type Locale } from '../i18n';

interface StatisticsPageProps {
    applicationLocale: Locale;
}

const SIZE_DISTRIBUTIONS = [
    { metric: 'block_count', label: 'statisticsDistributionBlocks' },
    { metric: 'script_count', label: 'statisticsDistributionScripts' },
    { metric: 'sprite_count', label: 'statisticsDistributionSprites' },
] as const;

const BURDEN_DISTRIBUTIONS = [
    { metric: 'bug_count', label: 'statisticsDistributionBugs' },
    { metric: 'smell_count', label: 'statisticsDistributionSmells' },
    { metric: 'perfume_count', label: 'statisticsDistributionPerfumes' },
] as const;

const COMPLEXITY_DISTRIBUTIONS = [
    {
        metric: 'interprocedural_cyclomatic_complexity',
        label: 'statisticsDistributionCyclomaticComplexity',
    },
    { metric: 'most_complex_script', label: 'statisticsDistributionMostComplexScript' },
    { metric: 'max_nested_block_count', label: 'statisticsDistributionNestedBlocks' },
    { metric: 'length_longest_script', label: 'statisticsDistributionLongestScript' },
    { metric: 'procedure_count', label: 'statisticsDistributionProcedures' },
    { metric: 'variable_count', label: 'statisticsDistributionVariables' },
] as const;

const distributionFor = (metric: string, distributions: StatisticsDistribution[]) =>
    distributions.find((distribution) => distribution.metric === metric);

const findingGroupFor = (type: string, groups: StatisticsFindingGroup[]) =>
    groups.find((group) => group.type === type);

/** Cumulative, anonymous summaries of analyses that were voluntarily submitted to this service. */
export function StatisticsPage({ applicationLocale }: StatisticsPageProps) {
    const { t } = useTranslation();
    const { state, reload } = useAsync(
        (signal) => fetchPublicStatistics(applicationLocale, signal),
        [applicationLocale],
    );
    return (
        <PageMain className="statistics-page">
            <section className="hero statistics-hero" aria-labelledby="statistics-heading">
                <h1 id="statistics-heading">{t('statisticsTitle')}</h1>
                <p className="lead">{t('statisticsLead')}</p>
                {state.status === 'ready' && state.value.available && (
                    <p className="statistics-updated">
                        {t('statisticsUpdated', {
                            formatted: formatDateTime(state.value.generatedAt, applicationLocale),
                        })}
                    </p>
                )}
            </section>

            {state.status === 'loading' && (
                <LoadingState heading={t('statisticsTitle')} message={t('statisticsLoading')} />
            )}
            {state.status === 'error' && (
                <ErrorState
                    heading={t('statisticsTitle')}
                    message={t('statisticsError')}
                    technicalDetail={state.error}
                    retryLabel={t('statisticsRetry')}
                    onRetry={reload}
                />
            )}
            {state.status === 'ready' && !state.value.available && (
                <Card
                    className="statistics-unavailable"
                    aria-labelledby="statistics-unavailable-heading"
                >
                    <h2 id="statistics-unavailable-heading">{t('statisticsUnavailableTitle')}</h2>
                    <p>{t('statisticsUnavailableBody')}</p>
                </Card>
            )}
            {state.status === 'ready' && state.value.available && (
                <div className="statistics-content">
                    {state.value.totals && (
                        <StatisticsTotals totals={state.value.totals} locale={applicationLocale} />
                    )}
                    <section
                        className="statistics-section"
                        aria-labelledby="statistics-distributions-heading"
                    >
                        <h2 id="statistics-distributions-heading" tabIndex={-1}>
                            {t('statisticsDistributionsHeading')}
                        </h2>
                        <p className="statistics-section-lead">
                            {t('statisticsDistributionsLead')}
                        </p>
                        <div className="statistics-chart-grid">
                            {SIZE_DISTRIBUTIONS.map(({ metric, label }) => (
                                <DistributionPlot
                                    key={metric}
                                    label={t(label)}
                                    locale={applicationLocale}
                                    distribution={distributionFor(
                                        metric,
                                        state.value.distributions,
                                    )}
                                />
                            ))}
                        </div>
                    </section>
                    <section
                        className="statistics-section"
                        aria-labelledby="statistics-burden-heading"
                    >
                        <h2 id="statistics-burden-heading" tabIndex={-1}>
                            {t('statisticsBurdenHeading')}
                        </h2>
                        <p className="statistics-section-lead">{t('statisticsBurdenLead')}</p>
                        <div className="statistics-chart-grid">
                            {BURDEN_DISTRIBUTIONS.map(({ metric, label }) => (
                                <DistributionPlot
                                    key={metric}
                                    label={t(label)}
                                    locale={applicationLocale}
                                    showZeroShare
                                    distribution={distributionFor(
                                        metric,
                                        state.value.distributions,
                                    )}
                                />
                            ))}
                        </div>
                    </section>
                    <section
                        className="statistics-section"
                        aria-labelledby="statistics-findings-heading"
                    >
                        <h2 id="statistics-findings-heading" tabIndex={-1}>
                            {t('statisticsFindingsHeading')}
                        </h2>
                        <p className="statistics-section-lead">{t('statisticsFindingsLead')}</p>
                        <div className="statistics-finding-grid">
                            {(['bug', 'smell', 'perfume'] as const).map((type) => (
                                <FindingPrevalenceSection
                                    key={type}
                                    type={type}
                                    locale={applicationLocale}
                                    findings={
                                        findingGroupFor(type, state.value.findingGroups)
                                            ?.findings ?? []
                                    }
                                />
                            ))}
                        </div>
                    </section>
                    <BlockComposition
                        categories={state.value.blockCategories}
                        locale={applicationLocale}
                    />
                    <section
                        className="statistics-section"
                        aria-labelledby="statistics-complexity-heading"
                    >
                        <h2 id="statistics-complexity-heading" tabIndex={-1}>
                            {t('statisticsComplexityHeading')}
                        </h2>
                        <p className="statistics-section-lead">{t('statisticsComplexityLead')}</p>
                        <div className="statistics-chart-grid">
                            {COMPLEXITY_DISTRIBUTIONS.map(({ metric, label }) => (
                                <DistributionPlot
                                    key={metric}
                                    label={t(label)}
                                    locale={applicationLocale}
                                    distribution={distributionFor(
                                        metric,
                                        state.value.distributions,
                                    )}
                                />
                            ))}
                        </div>
                    </section>
                    <p className="statistics-scope-note">{t('statisticsScopeNote')}</p>
                </div>
            )}
        </PageMain>
    );
}
