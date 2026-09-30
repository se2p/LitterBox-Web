// SPDX-License-Identifier: EUPL-1.2
// SPDX-FileCopyrightText: 2026 LitterBox-Web contributors

import { useMemo, useState, type ReactNode } from 'react';
import { useIdSet } from '../../lib/useIdSet';
import { useTranslation } from 'react-i18next';
import type { CatalogueLookup } from '../single-project/catalogue-lookup';
import { FoldSection } from '../FoldSection';
import { SectionCard, SectionNav } from '../SectionCard';
import type { BatchRow, FinderFrequency } from './batch-summary';
import { BatchCommonFindings } from './BatchCommonFindings';
import { BatchConceptCoverage } from './BatchConceptCoverage';
import { BatchCtProfile } from './BatchCtProfile';
import { BatchMetricPanels } from './BatchMetricPanels';
import { BatchProjectTriage } from './BatchProjectTriage';
import { BatchReferenceComparison } from './BatchReferenceComparison';
import {
    ProjectSetFilterProvider,
    type ProjectSetFilter,
    type ProjectSetFilterHandler,
} from './project-set-filter';
import {
    commonIssues,
    findingColumns,
    metricColumnDefaults,
    metricDistributions,
    projectTriage,
    type FeatureMatrix,
} from './batch-analytics';

export function BatchAnalyticsWorkspace({
    rows,
    finders,
    matrix,
    catalogue,
    activeFinder,
    onFinderFilter,
    activeProjectFilter,
    onProjectSetFilter,
    onProjectInspect,
    projects,
    exportContent,
}: {
    rows: readonly BatchRow[];
    finders: readonly FinderFrequency[];
    matrix: FeatureMatrix;
    catalogue?: CatalogueLookup;
    activeFinder?: string;
    onFinderFilter?: (finderId: string) => void;
    activeProjectFilter?: string;
    onProjectSetFilter?: ProjectSetFilterHandler;
    onProjectInspect?: (id: string) => void;
    projects: ReactNode;
    exportContent: (selectedColumns: readonly string[]) => ReactNode;
}) {
    const { t } = useTranslation();
    const catalogueLookup: CatalogueLookup = catalogue ?? new Map();
    const projectSetFilter = useMemo<ProjectSetFilter | undefined>(
        () => onProjectSetFilter && { activeKey: activeProjectFilter, toggle: onProjectSetFilter },
        [activeProjectFilter, onProjectSetFilter],
    );
    const distributions = useMemo(() => metricDistributions(matrix), [matrix]);
    const metricColumns = useMemo(
        () => distributions.map((distribution) => distribution.column),
        [distributions],
    );
    const issues = useMemo(() => commonIssues(rows, finders), [rows, finders]);
    const triage = useMemo(() => projectTriage(matrix), [matrix]);

    const openFolds = useIdSet();
    const fold = (id: string, title: string) => ({
        id,
        open: openFolds.has(id),
        onToggle: openFolds.set,
        title: (
            <h5 id={`${id}-heading`} className="fold-section-title">
                {title}
            </h5>
        ),
    });

    const [includeFindingColumns, setIncludeFindingColumns] = useState(false);
    const [chosenMetricColumns, setChosenMetricColumns] = useState<ReadonlySet<string>>();
    const selectedMetricColumns = useMemo<ReadonlySet<string>>(() => {
        if (chosenMetricColumns === undefined) return new Set(metricColumnDefaults(metricColumns));
        return new Set(metricColumns.filter((column) => chosenMetricColumns.has(column)));
    }, [chosenMetricColumns, metricColumns]);

    const includeFindingsInMatrix = metricColumns.length === 0 || includeFindingColumns;
    const selectedMatrixColumns = [
        ...metricColumns.filter((column) => selectedMetricColumns.has(column)),
        ...(includeFindingsInMatrix ? findingColumns(matrix) : []),
    ];
    const hasCompleted = matrix.rows.length > 0;

    const folds = {
        findings: fold('batch-findings', t('batchCommonFindings')),
        metrics: fold('batch-metrics', t('batchMetricsWorkspace')),
        concepts: fold('batch-concepts', t('batchConceptCoverageTitle')),
        ctProfile: fold('batch-ct-profile', t('batchCtProfileTitle')),
        reference: fold('batch-reference', t('batchReferenceTitle')),
        triage: fold('batch-triage', t('batchTriageTitle')),
    };

    return (
        <ProjectSetFilterProvider value={projectSetFilter}>
            <section className="batch-workspace" aria-labelledby="batch-workspace-heading">
                <h3 id="batch-workspace-heading">{t('batchWorkspaceTitle')}</h3>
                <p className="batch-workspace-lead">{t('batchWorkspaceLead')}</p>
                {!hasCompleted ? (
                    <>
                        <p role="status">{t('batchCohortEmpty')}</p>
                        <section id="batch-projects" aria-labelledby="batch-projects-heading">
                            <h4 id="batch-projects-heading">{t('batchWorkspaceProjects')}</h4>
                            {projects}
                        </section>
                    </>
                ) : (
                    <>
                        <SectionNav
                            label={t('batchWorkspaceNavigation')}
                            sections={[
                                { id: 'batch-overview', title: t('batchWorkspaceOverview') },
                                { id: 'batch-projects', title: t('batchWorkspaceProjects') },
                                { id: 'batch-export', title: t('batchWorkspaceExport') },
                            ]}
                        />
                        <div className="section-cards">
                            <SectionCard
                                id="batch-overview"
                                number={1}
                                title={t('batchWorkspaceOverview')}
                                description={t('batchAnalyticsScope')}
                                headingLevel="h4"
                            >
                                {issues.length > 0 && (
                                    <FoldSection {...folds.findings}>
                                        {folds.findings.open && (
                                            <BatchCommonFindings
                                                issues={issues}
                                                matrix={matrix}
                                                catalogueLookup={catalogueLookup}
                                                activeFinder={activeFinder}
                                                onFinderFilter={onFinderFilter}
                                            />
                                        )}
                                    </FoldSection>
                                )}
                                {matrix.columns.length > 0 && (
                                    <FoldSection {...folds.metrics}>
                                        {folds.metrics.open && (
                                            <BatchMetricPanels
                                                matrix={matrix}
                                                distributions={distributions}
                                                finders={finders}
                                                selectedMetricColumns={selectedMetricColumns}
                                                onSelectedMetricColumnsChange={
                                                    setChosenMetricColumns
                                                }
                                                includeFindingColumns={includeFindingColumns}
                                                onIncludeFindingColumnsChange={
                                                    setIncludeFindingColumns
                                                }
                                                selectedMatrixColumns={selectedMatrixColumns}
                                            />
                                        )}
                                    </FoldSection>
                                )}
                                <FoldSection {...folds.concepts}>
                                    {folds.concepts.open && <BatchConceptCoverage rows={rows} />}
                                </FoldSection>
                                <FoldSection {...folds.ctProfile}>
                                    {folds.ctProfile.open && <BatchCtProfile rows={rows} />}
                                </FoldSection>
                                <FoldSection {...folds.reference}>
                                    {folds.reference.open && (
                                        <BatchReferenceComparison rows={rows} />
                                    )}
                                </FoldSection>
                            </SectionCard>
                            <SectionCard
                                id="batch-projects"
                                number={2}
                                title={t('batchWorkspaceProjects')}
                                description={t('batchProjectsHint')}
                                headingLevel="h4"
                            >
                                {triage.entries.length > 0 && (
                                    <FoldSection {...folds.triage}>
                                        {folds.triage.open && (
                                            <BatchProjectTriage
                                                triage={triage}
                                                onProjectInspect={onProjectInspect}
                                            />
                                        )}
                                    </FoldSection>
                                )}
                                {projects}
                            </SectionCard>
                            <SectionCard
                                id="batch-export"
                                number={3}
                                title={t('batchWorkspaceExport')}
                                description={t('batchCsvLead')}
                                headingLevel="h4"
                            >
                                {exportContent(selectedMatrixColumns)}
                            </SectionCard>
                        </div>
                    </>
                )}
            </section>
        </ProjectSetFilterProvider>
    );
}
