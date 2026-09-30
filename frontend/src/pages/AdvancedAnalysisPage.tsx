// SPDX-License-Identifier: EUPL-1.2
// SPDX-FileCopyrightText: 2026 LitterBox-Web contributors

import { useMemo, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useLocation } from 'react-router';
import type { CapabilityState } from '../lib/capabilities';
import { Card } from '../components/Card';
import { PageMain } from '../components/Page';
import { FoldSection } from '../components/FoldSection';
import { SectionNav } from '../components/SectionCard';
import { MetricSummary } from '../components/capabilities/metrics/MetricSummary';
import { AnalysisContext } from '../components/single-project/AnalysisContext';
import { MetricsGraphControls } from '../components/capabilities/metrics/MetricsGraphControls';
import { ExportControls } from '../components/capabilities/export/ExportControls';
import { InjectionControls } from '../components/capabilities/injection/InjectionControls';
import { injectionEligible } from '../components/capabilities/injection/injection-utils';
import {
    ADVANCED_ANALYSIS_PATH,
    readRetainedAnalysis,
    retainedAnalysisDestination,
} from '../lib/retained-analysis';
import { capabilityEnabled } from '../lib/features';
import { localeFrom } from '../lib/project-submission';
import { retainedAnalysisGate, useRetainedAnalysis } from './retained-analysis-page';
import { validToolFormat } from './submission-utils';

const hasUsableMetrics = (metrics: unknown): boolean =>
    Boolean(
        metrics &&
        typeof metrics === 'object' &&
        !Array.isArray(metrics) &&
        Object.values(metrics as Record<string, unknown>).some(
            (value) => typeof value === 'number' && Number.isFinite(value),
        ),
    );

export function AdvancedAnalysisPage({
    capabilityState = { status: 'idle' },
    onCapabilityRetry = () => undefined,
}: {
    capabilityState?: CapabilityState;
    onCapabilityRetry?: () => void;
}) {
    const { t, i18n } = useTranslation();
    const location = useLocation();
    const selection = useMemo(() => readRetainedAnalysis(location.state), [location.state]);
    const { state } = useRetainedAnalysis(selection);
    // Five capabilities open at once made this page metres long, so only one is unfolded at a time and the menu
    // below the hero is how the others are reached. undefined until the reader picks: the address decides which
    // one stands open, and the first available section is what it decides when the address says nothing. null once
    // they fold everything shut.
    const [openSection, setOpenSection] = useState<string | null>();

    const gate = retainedAnalysisGate({
        selection,
        state,
        capabilityState,
        onCapabilityRetry,
        t,
        pageClassName: 'advanced-analysis-page',
        heroClassName: 'hero advanced-analysis-hero',
        titleId: 'advanced-entry-title',
        idPrefix: 'advanced-project',
        continueTo: ADVANCED_ANALYSIS_PATH,
        destination: (selection) => retainedAnalysisDestination(ADVANCED_ANALYSIS_PATH, selection),
        copy: {
            title: t('advancedAnalysisTitle'),
            lead: t('advancedAnalysisLead'),
            loading: t('advancedAnalysisLoading'),
            recoveryBody: t('advancedAnalysisRecoveryBody'),
            reuseNamed: (project) => t('reuseAdvancedNamed', { project }),
            entryTitle: t('advancedAnalysisEntryTitle'),
            entryLead: t('advancedAnalysisEntryLead'),
            entryAction: t('advancedAnalysisAction'),
        },
    });
    if (!gate.ready) return gate.fallback;

    const { analysis, selection: retainedSelection } = gate.value;
    const locale = localeFrom(analysis.locale ?? i18n.language);
    const graphCapabilityEnabled = capabilityEnabled(capabilityState, 'metrics-graphs');
    const comparisonCapabilityEnabled = capabilityEnabled(capabilityState, 'semantic-diff');
    const exportCapabilityEnabled = capabilityEnabled(capabilityState, 'program-export');
    // Metrics were computed when the analysis ran and are read back from it; drawing them asks nothing of the
    // graph service, so an installation with graphs turned off still has its numbers.
    const hasMetrics = hasUsableMetrics(analysis.metrics);
    const hasGraphs = graphCapabilityEnabled && validToolFormat(analysis.inputFormat);
    const hasExport = exportCapabilityEnabled && validToolFormat(analysis.inputFormat);
    const hasComparison = comparisonCapabilityEnabled;
    // The one capability here that makes a project instead of reading one. It answers to the same eligibility the
    // controls themselves check, so the menu can never name a section that draws nothing.
    const hasInjection = injectionEligible(
        capabilityEnabled(capabilityState, 'fault-injection'),
        retainedSelection.analysisId,
        analysis.status,
        analysis.inputFormat,
    );
    const sections: Array<{ id: string; title: string; content: ReactNode }> = [];
    if (hasMetrics)
        sections.push({
            id: 'advanced-metrics',
            title: t('advancedMetricsTitle'),
            content: <MetricSummary metrics={analysis.metrics} locale={locale} />,
        });
    if (hasGraphs)
        sections.push({
            id: 'advanced-graphs',
            title: t('metricsGraphsTitle'),
            content: (
                <MetricsGraphControls
                    enabled
                    headingHidden
                    token={retainedSelection.submissionToken}
                    analysisId={retainedSelection.analysisId}
                    locale={locale}
                />
            ),
        });
    if (hasExport)
        sections.push({
            id: 'advanced-export',
            title: t('exportTitle'),
            content: (
                <ExportControls
                    enabled
                    headingHidden
                    token={retainedSelection.submissionToken}
                    analysisId={retainedSelection.analysisId}
                    inputFormat={analysis.inputFormat}
                    locale={locale}
                />
            ),
        });
    if (hasComparison)
        sections.push({
            id: 'advanced-comparison',
            title: t('advancedComparisonTitle'),
            content: (
                <div className="advanced-comparison-section">
                    <p>{t('advancedComparisonLead')}</p>
                    <Link
                        className="action-button action-button-primary"
                        to="/compare"
                        // Named, so the comparison can offer this project as one of its sources instead of
                        // asking for the identifier of an analysis the reader is already looking at.
                        state={{
                            before: { ...retainedSelection, name: analysis.name ?? undefined },
                        }}
                    >
                        {t('advancedComparisonAction')}
                    </Link>
                </div>
            ),
        });
    // Last of the list: everything above reads the analysis in hand, and this leaves with a different project.
    if (hasInjection)
        sections.push({
            id: 'advanced-injection',
            title: t('injectionTitle'),
            content: (
                <InjectionControls
                    enabled
                    headingHidden
                    token={retainedSelection.submissionToken}
                    analysisId={retainedSelection.analysisId}
                    analysisStatus={analysis.status}
                    inputFormat={analysis.inputFormat}
                    locale={locale}
                />
            ),
        });

    // The old fault-injection address redirects here naming its section in the hash, so a link written when that
    // was a page of its own still opens the thing it was written for. A hash naming a section this analysis does
    // not have — the capability is off, or its format is not one injection reads — is no reason to open nothing.
    const requestedSection = location.hash.slice(1);
    const defaultSection = sections.some((section) => section.id === requestedSection)
        ? requestedSection
        : sections[0]?.id;
    const activeSection = openSection === undefined ? defaultSection : (openSection ?? undefined);
    // A section only closes itself. Opening another one closes this one on the way, and that report must not
    // undo the opening it was caused by.
    const changeSection = (id: string, open: boolean) =>
        setOpenSection((current) => (open ? id : current === id ? null : current));
    const revealSection = (id: string) => {
        setOpenSection(id);
        document.getElementById(id)?.scrollIntoView?.({ block: 'start' });
    };

    return (
        <PageMain className="advanced-analysis-page">
            <section
                className="hero advanced-analysis-hero"
                aria-labelledby="advanced-analysis-title"
            >
                <h1 id="advanced-analysis-title">{t('advancedAnalysisTitle')}</h1>
                <p className="lead">{t('advancedAnalysisLead')}</p>
                {analysis.name && (
                    <p className="analysis-project-name">
                        <span>{t('analysedProject')}:</span> {analysis.name}
                    </p>
                )}
            </section>

            {/* Context, not a reading of the result, so it sits before the capabilities and folded away. */}
            <AnalysisContext analysis={analysis} />

            {sections.length === 0 && (
                <Card aria-labelledby="advanced-analysis-unavailable-heading">
                    <h2 id="advanced-analysis-unavailable-heading">
                        {t('advancedAnalysisUnavailableTitle')}
                    </h2>
                    <p>{t('advancedAnalysisUnavailableBody')}</p>
                    <Link className="action-button action-button-primary" to="/">
                        {t('advancedAnalysisHome')}
                    </Link>
                </Card>
            )}

            {sections.length > 1 && (
                <SectionNav
                    label={t('advancedSectionMenu')}
                    sections={sections}
                    isOpen={(id) => activeSection === id}
                    onSelect={revealSection}
                />
            )}

            <div className="section-cards">
                {sections.map((section, index) => (
                    <FoldSection
                        key={section.id}
                        id={section.id}
                        number={index + 1}
                        title={<span className="fold-section-title">{section.title}</span>}
                        open={activeSection === section.id}
                        onToggle={changeSection}
                    >
                        {section.content}
                    </FoldSection>
                ))}
            </div>
        </PageMain>
    );
}
