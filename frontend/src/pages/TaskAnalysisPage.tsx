// SPDX-License-Identifier: EUPL-1.2
// SPDX-FileCopyrightText: 2026 LitterBox-Web contributors

import { useMemo } from 'react';
import { useIdSet } from '../lib/useIdSet';
import { useTranslation } from 'react-i18next';
import { Link, useLocation } from 'react-router';
import type { CapabilityState } from '../lib/capabilities';
import { PageMain } from '../components/Page';
import { FoldSection } from '../components/FoldSection';
import { SectionNav } from '../components/SectionCard';
import { TaskFindingsOverview } from '../components/task-analysis/TaskFindingsOverview';
import { TaskThinkingProfile } from '../components/task-analysis/TaskThinkingProfile';
import { TaskConceptCoverage } from '../components/task-analysis/TaskConceptCoverage';
import { TaskSizeContext } from '../components/task-analysis/TaskSizeContext';
import { TaskRecentAnalyses } from '../components/task-analysis/TaskRecentAnalyses';
import { ProjectCodeViewer } from '../components/questions/ProjectCode';
import { fetchExportTargets } from '../api/exports';
import { useDeclaredNavigation } from '../lib/active-navigation';
import { exportEligible } from '../lib/export-eligibility';
import { capabilityEnabled } from '../lib/features';
import {
    TASK_ANALYSIS_PATH,
    readRetainedAnalysis,
    retainedAnalysisDestination,
} from '../lib/retained-analysis';
import { localeFrom } from '../lib/project-submission';
import { retainedAnalysisGate, useRetainedAnalysis } from './retained-analysis-page';
import '../styles/pages/task-analysis.css';

const DEFAULT_OPEN_SECTIONS = [
    'task-findings',
    'task-ct-profile',
    'task-concept-coverage',
    'task-size-context',
];

export function TaskAnalysisPage({
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
    useDeclaredNavigation('/teacher');

    const openSections = useIdSet(DEFAULT_OPEN_SECTIONS);
    const toggleSection = openSections.set;
    const gate = retainedAnalysisGate({
        selection,
        state,
        capabilityState,
        onCapabilityRetry,
        t,
        pageClassName: 'task-analysis-page',
        heroClassName: 'hero',
        titleId: 'task-analysis-entry-title',
        idPrefix: 'task-analysis-project',
        continueTo: TASK_ANALYSIS_PATH,
        destination: (selection) => retainedAnalysisDestination(TASK_ANALYSIS_PATH, selection),
        entryExtra: <TaskRecentAnalyses />,
        backLink: <Link to="/teacher">{t('backToTeacher')}</Link>,
        copy: {
            title: t('taskAnalysisTitle'),
            lead: t('taskAnalysisLead'),
            loading: t('taskAnalysisLoading'),
            recoveryBody: t('taskAnalysisRecoveryBody'),
            reuseNamed: (project) => t('reuseTaskAnalysisNamed', { project }),
            entryTitle: t('taskAnalysisEntryTitle'),
            entryLead: t('taskAnalysisEntryLead'),
            entryAction: t('taskAnalysisAction'),
        },
    });
    if (!gate.ready) return gate.fallback;

    const { analysis, selection: retainedSelection } = gate.value;
    const locale = localeFrom(analysis.locale ?? i18n.language);
    const projectCodeAvailable = exportEligible(
        capabilityEnabled(capabilityState, 'program-export'),
        retainedSelection.analysisId,
        analysis.inputFormat,
    );
    const sections = [
        {
            id: 'task-findings',
            navTitle: t('taskFindingsNav'),
            title: t('taskFindingsTitle'),
            description: t('taskFindingsLead'),
            body: (
                <TaskFindingsOverview
                    issues={analysis.issues ?? []}
                    catalogueEntries={analysis.catalogue ?? []}
                    token={retainedSelection.submissionToken}
                    locale={locale}
                />
            ),
        },
        {
            id: 'task-ct-profile',
            navTitle: t('ctProfileNav'),
            title: t('ctProfileTitle'),
            description: t('ctProfileLead'),
            body: (
                <TaskThinkingProfile key={analysis.id} metrics={analysis.metrics} locale={locale} />
            ),
        },
        {
            id: 'task-concept-coverage',
            navTitle: t('conceptCoverageNav'),
            title: t('conceptCoverageTitle'),
            description: t('conceptCoverageLead'),
            body: <TaskConceptCoverage metrics={analysis.metrics} locale={locale} />,
        },
        {
            id: 'task-size-context',
            navTitle: t('taskSizeNav'),
            title: t('taskSizeTitle'),
            description: t('taskSizeLead'),
            body: <TaskSizeContext metrics={analysis.metrics} locale={locale} />,
        },
        ...(projectCodeAvailable
            ? [
                  {
                      id: 'task-project-code',
                      navTitle: t('taskProjectCodeNav'),
                      title: t('taskProjectCodeTitle'),
                      description: t('taskProjectCodeLead'),
                      body: openSections.has('task-project-code') && (
                          <ProjectCodeViewer
                              loadCode={() =>
                                  fetchExportTargets(
                                      retainedSelection.submissionToken,
                                      retainedSelection.analysisId,
                                  )
                              }
                              locale={locale}
                          />
                      ),
                  },
              ]
            : []),
    ];
    const revealSection = (id: string) => {
        toggleSection(id, true);
        document.getElementById(id)?.scrollIntoView?.({ block: 'start' });
    };

    return (
        <PageMain className="task-analysis-page">
            <section className="hero" aria-labelledby="task-analysis-title">
                <p>
                    <Link to="/teacher">{t('backToTeacher')}</Link>
                </p>
                <h1 id="task-analysis-title">{t('taskAnalysisTitle')}</h1>
                <p className="lead">{t('taskAnalysisLead')}</p>
                {analysis.name && (
                    <p className="analysis-project-name">
                        <span>{t('analysedProject')}:</span> {analysis.name}
                    </p>
                )}
            </section>
            <SectionNav
                label={t('taskAnalysisSectionMenu')}
                sections={sections.map(({ id, navTitle }) => ({ id, title: navTitle }))}
                isOpen={openSections.has}
                onSelect={revealSection}
            />
            <div className="section-cards">
                {sections.map((section, index) => (
                    <FoldSection
                        key={section.id}
                        id={section.id}
                        className={`${section.id} fold-section`}
                        number={index + 1}
                        description={section.description}
                        title={
                            <h2 id={`${section.id}-heading`} className="fold-section-title">
                                {section.title}
                            </h2>
                        }
                        open={openSections.has(section.id)}
                        onToggle={toggleSection}
                    >
                        {section.body}
                    </FoldSection>
                ))}
            </div>
        </PageMain>
    );
}
