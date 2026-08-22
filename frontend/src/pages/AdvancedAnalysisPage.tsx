// SPDX-License-Identifier: EUPL-1.2
// SPDX-FileCopyrightText: 2026 LitterBox-Web contributors

import { useMemo, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useLocation } from 'react-router-dom';
import type { CapabilityState } from '../lib/capabilities';
import { Card } from '../components/Card';
import { PageMain } from '../components/Page';
import { MetricSummary } from '../components/capabilities/metrics/MetricSummary';
import { AnalysisContext } from '../components/single-project/AnalysisContext';
import { MetricsGraphControls } from '../components/capabilities/metrics/MetricsGraphControls';
import { ExportControls } from '../components/capabilities/export/ExportControls';
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

/**
 * One foldable part of the workspace. Five capabilities open at once made a page metres long, so only one is unfolded
 * at a time and the menu above is how the others are reached.
 */
function AdvancedSection({
    id,
    title,
    open,
    onOpen,
    children,
}: {
    id: string;
    title: string;
    open: boolean;
    onOpen: (id: string, open: boolean) => void;
    children: ReactNode;
}) {
    return (
        // Not a card: cards hold each other a whole step apart, and a list of folds reads as a list.
        <details
            id={id}
            className="advanced-section"
            open={open}
            onToggle={(event) => onOpen(id, event.currentTarget.open)}
        >
            <summary className="advanced-section-summary">
                <span className="advanced-section-title">{title}</span>
            </summary>
            <div className="advanced-section-body">{children}</div>
        </details>
    );
}

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
    const state = useRetainedAnalysis(selection);
    // undefined until the reader picks: the first available section stands open. null once they fold everything shut.
    const [openSection, setOpenSection] = useState<string | null>();
    const menuRef = useRef<HTMLElement>(null);

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
                        to={{
                            pathname: '/compare',
                            // Named, so the comparison can offer this project as one of its sources instead of
                            // asking for the identifier of an analysis the reader is already looking at.
                            state: {
                                before: { ...retainedSelection, name: analysis.name ?? undefined },
                            },
                        }}
                    >
                        {t('advancedComparisonAction')}
                    </Link>
                </div>
            ),
        });

    const activeSection = openSection === undefined ? sections[0]?.id : (openSection ?? undefined);
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
                <nav
                    ref={menuRef}
                    className="advanced-section-menu"
                    aria-label={t('advancedSectionMenu')}
                >
                    <ul>
                        {sections.map((section) => (
                            <li key={section.id}>
                                <button
                                    type="button"
                                    aria-expanded={activeSection === section.id}
                                    aria-controls={section.id}
                                    onClick={() => revealSection(section.id)}
                                >
                                    {section.title}
                                </button>
                            </li>
                        ))}
                    </ul>
                </nav>
            )}

            {sections.map((section) => (
                <AdvancedSection
                    key={section.id}
                    id={section.id}
                    title={section.title}
                    open={activeSection === section.id}
                    onOpen={changeSection}
                >
                    {section.content}
                </AdvancedSection>
            ))}
        </PageMain>
    );
}
