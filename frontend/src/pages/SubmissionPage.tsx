// SPDX-License-Identifier: EUPL-1.2
// SPDX-FileCopyrightText: 2025 LitterBox-Web contributors

import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate, useParams } from 'react-router';
import { formatNumber } from '../i18n';
import type { CapabilityState } from '../lib/capabilities';
import { ErrorState, LoadingState } from '../components/States';
import { Alert } from '../components/Alert';
import { Card } from '../components/Card';
import { PageMain } from '../components/Page';
import {
    cancelSubmission,
    type BatchAnalysis,
    type SubmissionStatusResponse,
} from '../api/submissions';
import { FindingGroup } from '../components/single-project/FindingGroup';
import { groupFindings } from '../components/single-project/finding-groups';
import {
    buildCatalogueLookup,
    catalogueForFinder,
} from '../components/single-project/catalogue-lookup';
import type { IssueCardLabels } from '../components/single-project/IssueCard';
import { IssueFilters } from '../components/single-project/IssueFilters';
import {
    familyTranslations,
    FAMILY_EXPLAINER_KEYS,
    FAMILY_LABEL_KEYS,
} from '../components/single-project/issue-family';
import { useIssueFilters } from '../components/single-project/use-issue-filters';
import { Dialog } from '../components/Dialog';
import { BatchEmptyState } from '../components/batch/BatchEmptyState';
import { BatchDashboard } from '../components/batch/BatchDashboard';
import { safeFailureMessage } from '../components/batch/batch-utils';
import { MetricsGraphControls } from '../components/capabilities/metrics/MetricsGraphControls';
import { ExportControls } from '../components/capabilities/export/ExportControls';
import { InjectionControls } from '../components/capabilities/injection/InjectionControls';
import { BasicStatistics } from '../components/single-project/BasicStatistics';
import { FamilyIcon } from '../components/single-project/FamilyIcon';
import {
    AdvancedAnalysisAction,
    AskQuestionsAction,
    IssueSummary,
    ProjectReportAction,
    SubmissionStatusBanner,
    ToolsForProject,
} from '../components/single-project/SubmissionSummarySections';
import {
    ADVANCED_ANALYSIS_PATH,
    MODIFICATION_PATH,
    retainedAnalysisDestination,
} from '../lib/retained-analysis';
import { useDeclaredNavigation } from '../lib/active-navigation';
import { rememberProject } from '../lib/recent-projects';
import { capabilityEnabled } from '../lib/features';
import { localeFrom } from '../lib/project-submission';
import { TERMINAL_STATUSES, useSubmission } from '../components/questions/submission-status';
import {
    reportedAnalyses,
    submissionAnalyses,
    analysisIsCompleted,
    DEFAULT_ISSUE_FILTERS,
    focusToolFromHash,
    isBatchSubmission,
    positiveAnalysisId,
    primaryAnalysis,
    rememberAnalysedProject,
    validToolFormat,
    type IssueSort,
} from './submission-utils';

/**
 * The findings of one analysis and the catalogue that describes them. Kept out of the component so the analysis they
 * belong to arrives as an argument: everything below is then held against that one analysis, and moving to another in
 * a class set is the only thing that rebuilds it.
 */
function useAnalysisContent(analysis: BatchAnalysis | undefined, value: SubmissionStatusResponse) {
    const issues = useMemo(
        () => analysis?.issues ?? value.issues ?? [],
        [analysis?.issues, value.issues],
    );
    // The analysis ships the catalogue for the patterns it reported, so the result page has it on hand rather
    // than fetching it again.
    const catalogue = useMemo(
        () => buildCatalogueLookup(analysis?.catalogue ?? value.catalogueEntries ?? []),
        [analysis?.catalogue, value.catalogueEntries],
    );
    return { issues, catalogue };
}

function SubmissionResult({
    value,
    token,
    capabilityState,
    askAiAvailable,
}: {
    value: SubmissionStatusResponse;
    token: string;
    capabilityState: CapabilityState;
    askAiAvailable: boolean;
}) {
    const { t, i18n } = useTranslation();
    const graphCapabilityEnabled = capabilityEnabled(capabilityState, 'metrics-graphs');
    const diffCapabilityEnabled = capabilityEnabled(capabilityState, 'semantic-diff');
    const exportCapabilityEnabled = capabilityEnabled(capabilityState, 'program-export');
    const injectionCapabilityEnabled = capabilityEnabled(capabilityState, 'fault-injection');
    const questionsCapabilityEnabled = capabilityEnabled(capabilityState, 'qlc');
    const baseAnalysis = primaryAnalysis(value);
    const analyses = reportedAnalyses(value);
    const isBatch = isBatchSubmission(value);
    const completedEntries = analyses
        .map((item, index) => ({ item, index }))
        .filter(({ item }) => analysisIsCompleted(item, value.status));
    const completedAnalyses = completedEntries.map(({ item }) => item);
    const completedIds = completedEntries
        .map(({ item, index }) => String(item.id ?? index))
        .join('|');
    const firstCompletedId = completedEntries[0]
        ? String(completedEntries[0].item.id ?? completedEntries[0].index)
        : undefined;
    const [chosenId, setChosenId] = useState<string>();
    // Which analysis of a class set is on screen. Whatever the reader last opened, unless it is not among the
    // completed ones — nothing opened yet, or a set that has moved on — in which case the first that is.
    const selectedId =
        isBatch && !completedIds.split('|').includes(chosenId ?? '') ? firstCompletedId : chosenId;
    const analysis = isBatch
        ? completedEntries.find(({ item, index }) => String(item.id ?? index) === selectedId)?.item
        : baseAnalysis;
    const { issues, catalogue } = useAnalysisContent(analysis, value);
    const analysisKey = analysis
        ? `${token}:${isBatch ? (selectedId ?? 'batch') : 'single'}:${String(analysis.id ?? 'unknown')}`
        : 'none';
    const locale = localeFrom(analysis?.locale ?? value.locale ?? i18n.language);
    // Over every finding, not only the visible ones: a relationship may point at one the reader has filtered out.
    const findingNames = useMemo(
        () => new Map(issues.map((issue) => [issue.id, issue.finderName])),
        [issues],
    );
    const findingName = (id: number) => findingNames.get(id)?.trim() || undefined;
    const failedAnalysis = analyses.find((item) => String(item.status).toLowerCase() === 'failed');
    const running = !TERMINAL_STATUSES.has(value.status.toLowerCase());
    const issueLabels: IssueCardLabels = {
        severity: (level: number) => `${t('catalogueSeverity')} ${formatNumber(level)}`,
        affectedSprite: t('affectedSprite'),
        refactoringComparison: t('refactoringComparison'),
        currentCode: t('currentCode'),
        suggestedRefactoring: t('suggestedRefactoring'),
        scratchblocks: t('scratchblocks'),
        textAlternative: t('textAlternative'),
        thumbnail: (sprite: string) => t('currentCostumeFor', { sprite }),
        thumbnailFallback: t('fallbackPreview'),
    };
    const familyLabels = useMemo(() => familyTranslations(FAMILY_LABEL_KEYS, t), [t]);
    const familyExplainers = useMemo(() => familyTranslations(FAMILY_EXPLAINER_KEYS, t), [t]);
    const {
        types,
        finders,
        spriteOptions,
        severities,
        familyOptions,
        sortOptions,
        activeFilters,
        updateFilters,
        visibleIssues,
        groupedIssues,
        displayedFamilies,
        familyOpen,
        openFamilies,
    } = useIssueFilters(issues, analysisKey, t);

    return (
        <>
            {running && (
                <Card aria-busy="true" aria-labelledby="processing-heading">
                    <h2 id="processing-heading">{t('statusTitle')}</h2>
                    <p role="status">{t('statusLoading')}</p>
                </Card>
            )}

            {!isBatch &&
                (value.status === 'failed' || value.status === 'cancelled' || failedAnalysis) && (
                    <Alert tone="error">
                        <p>
                            {safeFailureMessage(
                                failedAnalysis?.failureMessage,
                                t(value.status === 'cancelled' ? 'cancelledBody' : 'statusFailed'),
                            )}
                        </p>
                    </Alert>
                )}
            {value.status === 'partial' && (
                <Alert tone="warning" role={failedAnalysis ? 'status' : 'alert'}>
                    <p>{t('statusPartial')}</p>
                </Alert>
            )}
            {isBatch && (
                <BatchDashboard value={value} selectedId={selectedId} onSelect={setChosenId} />
            )}
            {isBatch && !running && completedAnalyses.length === 0 && (
                <BatchEmptyState
                    allFailed={
                        analyses.length > 0 &&
                        analyses.every((item) => String(item.status).toLowerCase() === 'failed')
                    }
                />
            )}
            {analysis && analysisIsCompleted(analysis, value.status) && (
                <>
                    {isBatch ? (
                        <IssueSummary
                            issues={issues}
                            metrics={analysis.metrics}
                            name={analysis.name}
                            locale={locale}
                        />
                    ) : (
                        <BasicStatistics metrics={analysis.metrics} locale={locale} />
                    )}
                    <section
                        className="result-card card analysis-findings"
                        aria-labelledby="findings-heading"
                    >
                        <div className="section-heading">
                            <h2 id="findings-heading">{t('issuesTitle')}</h2>
                            <IssueFilters
                                spriteThumbnailLabel={issueLabels.thumbnail}
                                thumbnailFallbackLabel={issueLabels.thumbnailFallback}
                                formatSeverity={issueLabels.severity}
                                familyOptions={familyOptions}
                                spriteOptions={spriteOptions}
                                types={types}
                                finders={finders}
                                severities={severities}
                                sortOptions={sortOptions}
                                family={activeFilters.family}
                                type={activeFilters.type}
                                finder={activeFilters.finder}
                                sprite={activeFilters.sprite}
                                severity={activeFilters.severity}
                                sort={activeFilters.sort}
                                onFamilyChange={(value) => updateFilters({ family: value })}
                                onTypeChange={(value) => updateFilters({ type: value })}
                                onFinderChange={(value) => updateFilters({ finder: value })}
                                onSpriteChange={(value) => updateFilters({ sprite: value })}
                                onSeverityChange={(value) => updateFilters({ severity: value })}
                                onSortChange={(value) =>
                                    updateFilters({ sort: value as IssueSort })
                                }
                                onReset={() => updateFilters(DEFAULT_ISSUE_FILTERS)}
                            />
                        </div>
                        <p className="issue-filter-status" role="status" aria-live="polite">
                            {t('issueFilterShowing', {
                                visible: formatNumber(visibleIssues.length),
                                total: formatNumber(issues.length),
                            })}
                        </p>
                        {visibleIssues.length > 0 ? (
                            <div className="issue-family-list">
                                {displayedFamilies.map((family) => {
                                    const familyIssues = groupedIssues.get(family) ?? [];
                                    return (
                                        // A fold apiece, as the advanced workspace folds its capabilities: the
                                        // three parts and their counts are visible at a glance, and a reader
                                        // unrolls the one they are working through.
                                        <details
                                            key={family}
                                            className={`issue-family issue-family-${family}`}
                                            open={familyOpen(family)}
                                            onToggle={(event) => {
                                                openFamilies.current[family] =
                                                    event.currentTarget.open;
                                            }}
                                        >
                                            <summary className="issue-family-heading">
                                                <h3 id={`issue-family-${family}`}>
                                                    <FamilyIcon family={family} />
                                                    {familyLabels[family]}
                                                </h3>
                                                <span className="issue-family-count">
                                                    {formatNumber(familyIssues.length)}
                                                </span>
                                            </summary>
                                            <p className="issue-family-explainer">
                                                {familyExplainers[family]}
                                            </p>
                                            {familyIssues.length > 0 ? (
                                                <div className="finding-group-list">
                                                    {groupFindings(familyIssues).map((group) => (
                                                        <FindingGroup
                                                            key={group.key}
                                                            group={group}
                                                            entry={catalogueForFinder(
                                                                group.finderId,
                                                                catalogue,
                                                            )}
                                                            analysisId={analysis.id}
                                                            analysisKey={analysisKey}
                                                            showTechnical={isBatch}
                                                            findingName={findingName}
                                                            token={token}
                                                            locale={locale}
                                                            labels={issueLabels}
                                                            askAiAvailable={askAiAvailable}
                                                        />
                                                    ))}
                                                </div>
                                            ) : (
                                                <p className="issue-family-empty">
                                                    {t('issueFamilyEmpty', {
                                                        family: familyLabels[family],
                                                    })}
                                                </p>
                                            )}
                                        </details>
                                    );
                                })}
                            </div>
                        ) : (
                            <div className="empty-state">
                                <p>{t('noIssues')}</p>
                            </div>
                        )}
                    </section>
                    {/* A teacher who picked a project out of the table came for its findings. The tools are
                        for the analysis they end up on, so they follow it rather than standing between the
                        table and the result. */}
                    {isBatch && (
                        <details className="result-card card batch-advanced-tools">
                            <summary>
                                <h2>{t('resultToolsTitle')}</h2>
                            </summary>
                            <ProjectReportAction token={token} analysis={analysis} heading={3} />
                            <ToolsForProject
                                token={token}
                                analysis={analysis}
                                graphCapabilityEnabled={graphCapabilityEnabled}
                                diffCapabilityEnabled={diffCapabilityEnabled}
                                exportCapabilityEnabled={exportCapabilityEnabled}
                                injectionCapabilityEnabled={injectionCapabilityEnabled}
                            />
                            <MetricsGraphControls
                                enabled={
                                    graphCapabilityEnabled &&
                                    positiveAnalysisId(analysis.id) &&
                                    validToolFormat(analysis.inputFormat)
                                }
                                token={token}
                                analysisId={analysis.id}
                                locale={locale}
                            />
                            <ExportControls
                                enabled={exportCapabilityEnabled}
                                token={token}
                                analysisId={analysis.id}
                                inputFormat={analysis.inputFormat}
                                locale={locale}
                            />
                            <InjectionControls
                                enabled={injectionCapabilityEnabled}
                                token={token}
                                analysisId={analysis.id}
                                analysisStatus={analysis.status}
                                inputFormat={analysis.inputFormat}
                                locale={locale}
                            />
                        </details>
                    )}
                    {/* The project is here and analysed; the other thing this site does with it is one press
                        away, rather than another trip through the upload form. */}
                    {!isBatch && (
                        <AskQuestionsAction
                            token={token}
                            analysis={analysis}
                            locale={locale}
                            enabled={questionsCapabilityEnabled}
                        />
                    )}
                    {!isBatch && <ProjectReportAction token={token} analysis={analysis} />}
                    {/* The offer to dig deeper follows the findings; leading with it made the results look like a
                        detour on the way to a second, more technical analysis. */}
                    {!isBatch && (
                        <AdvancedAnalysisAction
                            token={token}
                            analysis={analysis}
                            graphCapabilityEnabled={graphCapabilityEnabled}
                            diffCapabilityEnabled={diffCapabilityEnabled}
                            exportCapabilityEnabled={exportCapabilityEnabled}
                        />
                    )}
                </>
            )}
            {!isBatch && !running && !analysis && analyses.length === 0 && (
                <div className="empty-state">
                    <p>{t('noIssues')}</p>
                </div>
            )}
        </>
    );
}

/**
 * Where the reader is to be returned once the analysis finishes, set by the page that started it. Only the two
 * pages that can start one this way are accepted, so a crafted history entry cannot redirect anywhere else.
 */
const continuationDestination = (
    state: unknown,
): typeof ADVANCED_ANALYSIS_PATH | typeof MODIFICATION_PATH | undefined => {
    if (typeof state !== 'object' || state === null) return undefined;
    const { continueTo } = state as { continueTo?: unknown };
    if (continueTo === ADVANCED_ANALYSIS_PATH) return ADVANCED_ANALYSIS_PATH;
    if (continueTo === MODIFICATION_PATH) return MODIFICATION_PATH;
    return undefined;
};

export function SubmissionPage({
    capabilityState = { status: 'idle' },
    askAiAvailable = false,
}: {
    capabilityState?: CapabilityState;
    askAiAvailable?: boolean;
}) {
    const { token = '' } = useParams();
    const location = useLocation();
    const navigate = useNavigate();
    const { t } = useTranslation();
    const { state, sseState, load } = useSubmission(token);
    const [cancelOpen, setCancelOpen] = useState(false);
    const [cancelling, setCancelling] = useState(false);
    const [cancelError, setCancelError] = useState(false);
    const terminal =
        state.status === 'ready' && TERMINAL_STATUSES.has(state.value.status.toLowerCase());
    // One address serves both journeys. A class set belongs to the page a teacher sent it from, and marking the
    // child's form instead told a teacher they were somewhere they had never been.
    useDeclaredNavigation(
        state.status === 'ready' && isBatchSubmission(state.value) ? '/teacher' : '/',
    );

    useEffect(() => {
        if (state.status !== 'ready') return;
        focusToolFromHash(location.hash);
    }, [location.hash, state.status]);

    // Nothing left to cancel once the analysis has finished, so the dialogue and its failure go with it.
    const [wasTerminal, setWasTerminal] = useState(terminal);
    if (wasTerminal !== terminal) {
        setWasTerminal(terminal);
        if (terminal) {
            setCancelOpen(false);
            setCancelError(false);
        }
    }

    // The device remembers where this result is, so the reader can come back to it, or put the same project
    // through another analysis, without keeping the link themselves.
    useEffect(() => {
        if (!terminal || state.status !== 'ready') return;
        // A class set is remembered under its own kind, with however many projects it turned out to hold. The name
        // came from the page that sent it, if this device is the one that did; an empty name leaves what is
        // already known alone rather than overwriting it.
        if (isBatchSubmission(state.value)) {
            const analyses = submissionAnalyses(state.value);
            rememberProject({
                token,
                name: '',
                kind: 'batch',
                ...(analyses.length > 0 ? { projects: analyses.length } : {}),
            });
            return;
        }
        rememberAnalysedProject(token, state.value);
    }, [state, terminal, token]);

    useEffect(() => {
        if (!terminal || state.status !== 'ready') return;
        const continuation = continuationDestination(location.state);
        if (!continuation) return;
        const analysis = primaryAnalysis(state.value);
        if (!analysis || !analysisIsCompleted(analysis, state.value.status)) return;
        if (!positiveAnalysisId(analysis.id)) return;
        const destination = retainedAnalysisDestination(continuation, {
            submissionToken: token,
            analysisId: analysis.id,
        });
        navigate(destination.pathname, { replace: true, state: destination.state });
    }, [navigate, location.state, state, terminal, token]);

    const requestCancellation = async () => {
        setCancelling(true);
        setCancelError(false);
        try {
            await cancelSubmission(token);
            setCancelOpen(false);
        } catch {
            setCancelError(true);
        } finally {
            await load();
            setCancelling(false);
        }
    };

    if (state.status === 'loading')
        return (
            <PageMain>
                <LoadingState heading={t('statusTitle')} message={t('statusLoading')} level={1} />
            </PageMain>
        );

    if (state.status === 'error')
        return (
            <PageMain>
                <ErrorState
                    heading={t('statusTitle')}
                    message={state.tokenInvalid ? t('invalidToken') : t('statusError')}
                    retryLabel={t('retry')}
                    onRetry={() => {
                        void load(undefined, true);
                    }}
                    level={1}
                />
            </PageMain>
        );

    return (
        <PageMain>
            <SubmissionStatusBanner
                value={state.value}
                sseState={sseState}
                onCancel={() => {
                    setCancelError(false);
                    setCancelOpen(true);
                }}
                cancelling={cancelling}
            />
            {cancelError && (
                <Alert tone="error">
                    <p>{t('cancelError')}</p>
                    <button type="button" onClick={() => setCancelOpen(true)}>
                        {t('retry')}
                    </button>
                </Alert>
            )}
            {state.refreshError && !state.tokenInvalid && (
                <Alert tone="error">
                    <p>{t('statusError')}</p>
                    <button type="button" onClick={() => void load(undefined, false)}>
                        {t('retry')}
                    </button>
                </Alert>
            )}
            {state.tokenInvalid ? (
                <Alert tone="error" aria-label={t('invalidToken')}>
                    <p>{t('invalidToken')}</p>
                </Alert>
            ) : (
                <SubmissionResult
                    value={state.value}
                    token={token}
                    capabilityState={capabilityState}
                    askAiAvailable={askAiAvailable}
                />
            )}
            <Dialog
                open={cancelOpen}
                title={t('cancelDialogTitle')}
                closeLabel={t('cancelKeep')}
                onClose={() => {
                    if (!cancelling) setCancelOpen(false);
                }}
            >
                <p>{t('cancelDialogBody')}</p>
                <div className="dialog-actions">
                    <button
                        type="button"
                        onClick={() => setCancelOpen(false)}
                        disabled={cancelling}
                    >
                        {t('cancelKeep')}
                    </button>
                    <button
                        type="button"
                        className="button-danger"
                        onClick={() => void requestCancellation()}
                        disabled={cancelling}
                    >
                        {cancelling ? t('cancelInProgress') : t('cancelConfirm')}
                    </button>
                </div>
            </Dialog>
        </PageMain>
    );
}
