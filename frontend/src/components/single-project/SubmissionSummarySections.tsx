// SPDX-License-Identifier: EUPL-1.2
// SPDX-FileCopyrightText: 2026 LitterBox-Web contributors

import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router';
import { formatNumber } from '../../i18n';
import type { SupportedLocale } from '../../api/capabilities';
import {
    analysisReportUrl,
    type AnalysisIssue,
    type BatchAnalysis,
    type SubmissionStatusResponse,
} from '../../api/submissions';
import { DefinitionList } from '../DataList';
import { StatusIndicator } from '../Status';
import { MetricSummary } from '../capabilities/metrics/MetricSummary';
import { OriginResultLink } from './OriginResultLink';
import { ResultLink } from './ResultLink';
import { ReuseProjectButton } from './ReuseProjectButton';
import { ADVANCED_ANALYSIS_PATH, retainedAnalysisDestination } from '../../lib/retained-analysis';
import {
    focusToolFromHash,
    isBatchSubmission,
    positiveAnalysisId,
    primaryAnalysis,
    validToolFormat,
} from '../../pages/submission-utils';
import { statusLabel, statusTone, TERMINAL_STATUSES } from '../questions/submission-status';

type SseState = 'connected' | 'disconnected' | 'unavailable' | 'connecting';

export function SubmissionStatusBanner({
    value,
    sseState,
    onCancel,
    cancelling,
}: {
    value: SubmissionStatusResponse;
    sseState: SseState;
    onCancel: () => void;
    cancelling: boolean;
}) {
    const { t } = useTranslation();
    const terminal = TERMINAL_STATUSES.has(value.status.toLowerCase());
    // What counts as a class set is decided once, in submission-utils, so this banner cannot drift from the rest
    // of the app on the question by growing its own copy of the source-type list.
    const projectName = isBatchSubmission(value) ? undefined : primaryAnalysis(value)?.name;
    return (
        <>
            <section className="hero analysis-identity" aria-labelledby="status-heading">
                {/* The heading and the line under it were saying the same thing twice — what this page is, and then
                    which project it is about. One sentence answers both and gives the findings a screen's start. */}
                <h1 id="status-heading">
                    {projectName ? t('statusTitleFor', { project: projectName }) : t('statusTitle')}
                </h1>
                <StatusIndicator
                    tone={statusTone(value.status)}
                    label={statusLabel(value.status, t)}
                />
                {/* The address of this result, spelled out: what a submission hands back is a link, and there is
                    nowhere on this site to type a code back in. */}
                {terminal && value.token && (
                    <ResultLink path={`submissions/${encodeURIComponent(value.token)}`} />
                )}
                {/* Checking a project that had already been asked about made a second result; this is the way
                    back to the first one. */}
                {value.token && <OriginResultLink token={value.token} />}
                {!terminal && (
                    <button
                        type="button"
                        className="cancel-submission-button"
                        onClick={onCancel}
                        disabled={cancelling}
                    >
                        {cancelling ? t('cancelInProgress') : t('cancelSubmission')}
                    </button>
                )}
            </section>
            {!terminal && (
                <p className="hint" role="status">
                    {sseState === 'connected' ? t('statusLive') : t('statusPolling')}
                </p>
            )}
        </>
    );
}

export function IssueSummary({
    issues,
    metrics,
    name,
    locale,
}: {
    issues: AnalysisIssue[];
    metrics: unknown;
    /** Which project this is. A class set has thirty of them and one heading between the table and this panel. */
    name?: string | null;
    locale: SupportedLocale;
}) {
    const { t } = useTranslation();
    const typeCount = new Set(issues.map((issue) => issue.type)).size;
    const severityCount = new Set(issues.map((issue) => issue.severity)).size;
    const project = name?.trim();
    return (
        <section
            className="result-card card issue-summary analysis-summary"
            aria-labelledby="summary-heading"
        >
            {/* Not "Findings": the findings themselves are further down under that name, and two headings
                reading the same thing on one page read as a mistake.
                "This project" is one of thirty rows in the table above, and by the time a teacher has scrolled
                to the panel the row they chose is off the screen. So the heading says which one. */}
            <h2 id="summary-heading">
                {project ? t('issueSummaryTitleFor', { project }) : t('issueSummaryTitle')}
            </h2>
            <p>
                {t('batchFindings', {
                    count: issues.length,
                    formatted: formatNumber(issues.length),
                })}
            </p>
            <DefinitionList
                className="result-counts"
                items={[
                    { label: t('totalFindings'), value: formatNumber(issues.length) },
                    { label: t('issueTypes'), value: formatNumber(typeCount) },
                    { label: t('severityLevels'), value: formatNumber(severityCount) },
                ]}
            />
            {/* Every measurement the analysis reported, and there are dozens: unrolled, the table pushed the
                counts above it off the screen and stood between the class set and the findings it was chosen
                for. It is a reference, so it waits to be asked. */}
            <details className="analysis-measurements">
                <summary>{t('metricsTitle')}</summary>
                <MetricSummary metrics={metrics} locale={locale} headingHidden />
            </details>
        </section>
    );
}

export function ToolsForProject({
    token,
    analysis,
    graphCapabilityEnabled,
    diffCapabilityEnabled,
    exportCapabilityEnabled,
    injectionCapabilityEnabled,
}: {
    token: string;
    analysis: BatchAnalysis;
    graphCapabilityEnabled: boolean;
    diffCapabilityEnabled: boolean;
    exportCapabilityEnabled: boolean;
    injectionCapabilityEnabled: boolean;
}) {
    const { t } = useTranslation();
    const validReference = token.trim().length > 0 && positiveAnalysisId(analysis.id);
    const validFormat = validToolFormat(analysis.inputFormat);
    const tools = [
        diffCapabilityEnabled && validReference ? 'compare' : null,
        graphCapabilityEnabled && validReference && validFormat ? 'graphs' : null,
        exportCapabilityEnabled && validReference && validFormat ? 'export' : null,
        injectionCapabilityEnabled &&
        validReference &&
        String(analysis.status ?? '').toLowerCase() === 'completed' &&
        validFormat
            ? 'modification'
            : null,
    ].filter((tool): tool is 'compare' | 'graphs' | 'export' | 'modification' => tool !== null);

    if (tools.length === 0) return null;

    return (
        <section className="result-card card result-tools" aria-labelledby="result-tools-heading">
            <h2 id="result-tools-heading">{t('resultToolsTitle')}</h2>
            <p className="hint">{t('resultToolsLead')}</p>
            <ul className="result-tools-list">
                {tools.map((tool) => (
                    <li key={tool}>
                        {tool === 'compare' ? (
                            <Link
                                className="action-button"
                                to="/compare"
                                state={{
                                    before: {
                                        submissionToken: token,
                                        analysisId: analysis.id,
                                        name: analysis.name ?? undefined,
                                    },
                                }}
                            >
                                {t('compareFromSubmission')}
                            </Link>
                        ) : (
                            <a
                                className="action-button"
                                href={`#${tool === 'graphs' ? 'metrics-graphs-heading' : tool === 'export' ? 'export-heading' : 'injection-heading'}`}
                                onClick={() =>
                                    focusToolFromHash(
                                        `#${tool === 'graphs' ? 'metrics-graphs-heading' : tool === 'export' ? 'export-heading' : 'injection-heading'}`,
                                    )
                                }
                            >
                                {t(
                                    tool === 'graphs'
                                        ? 'toolsProgramStructureTitle'
                                        : tool === 'export'
                                          ? 'toolsExportTitle'
                                          : 'toolsModifiedProjectTitle',
                                )}
                            </a>
                        )}
                    </li>
                ))}
            </ul>
        </section>
    );
}

/**
 * The project is already here and already parsed, so the other thing this site can do with it is one press away.
 * A reader who has just had their project checked should not have to find the file again to be asked about it.
 */
export function AskQuestionsAction({
    token,
    analysis,
    locale,
    enabled,
}: {
    token: string;
    analysis: BatchAnalysis;
    locale: SupportedLocale;
    enabled: boolean;
}) {
    const { t } = useTranslation();
    const navigate = useNavigate();
    if (!enabled || token.trim().length === 0 || !positiveAnalysisId(analysis.id)) return null;
    if (String(analysis.status ?? '').toLowerCase() !== 'completed') return null;

    return (
        <section
            className="result-card card result-ask-questions"
            aria-labelledby="result-ask-questions-heading"
        >
            <h2 id="result-ask-questions-heading">{t('navQuestions')}</h2>
            <p className="hint">{t('reuseQuestionsLead')}</p>
            <ReuseProjectButton
                token={token}
                originKind="issues"
                projectName={analysis.name?.trim() || token}
                analysis="questions"
                locale={locale}
                label={t('reuseQuestionsAction')}
                onReused={(next) => navigate(`/questions/${encodeURIComponent(next)}`)}
            />
        </section>
    );
}

/**
 * LitterBox's own report, as it has always written it: every finding placed in the code it came from, in one page a
 * reader can keep, print or send on. The service has been able to produce it all along and nothing here linked it.
 *
 * A plain link, because the service sends it as an attachment; fetching it into memory first would buy nothing and
 * would put a ten-megabyte page through this tab to no purpose.
 */
export function ProjectReportAction({
    token,
    analysis,
    heading = 2,
}: {
    token: string;
    analysis: BatchAnalysis;
    /** The batch panel already sits under a heading of its own, so it asks for the level below. */
    heading?: 2 | 3;
}) {
    const { t } = useTranslation();
    if (token.trim().length === 0 || !positiveAnalysisId(analysis.id)) return null;
    if (String(analysis.status ?? '').toLowerCase() !== 'completed') return null;
    const Heading = heading === 3 ? 'h3' : 'h2';

    return (
        <section className="result-card card result-report" aria-labelledby="result-report-heading">
            <Heading id="result-report-heading">{t('reportDownloadTitle')}</Heading>
            <p className="hint">{t('reportDownloadLead')}</p>
            <a
                className="action-button"
                href={analysisReportUrl(token, analysis.id)}
                download
                rel="noopener"
            >
                {t('reportDownloadAction')}
            </a>
        </section>
    );
}

export function AdvancedAnalysisAction({
    token,
    analysis,
    graphCapabilityEnabled,
    diffCapabilityEnabled,
    exportCapabilityEnabled,
}: {
    token: string;
    analysis: BatchAnalysis;
    graphCapabilityEnabled: boolean;
    diffCapabilityEnabled: boolean;
    exportCapabilityEnabled: boolean;
}) {
    const { t } = useTranslation();
    const validReference = token.trim().length > 0 && positiveAnalysisId(analysis.id);
    const validFormat = validToolFormat(analysis.inputFormat);
    // Fault injection is not among them: it is offered on the teacher's pages, and a service that only has
    // that one turned on has nothing to show in the advanced workspace.
    const advancedAvailable =
        (diffCapabilityEnabled && validReference) ||
        (graphCapabilityEnabled && validReference && validFormat) ||
        (exportCapabilityEnabled && validReference && validFormat);

    if (!advancedAvailable) return null;

    // The analysis travels in navigation state, which is its own prop now rather than part of the address.
    const destination = retainedAnalysisDestination(ADVANCED_ANALYSIS_PATH, {
        submissionToken: token,
        analysisId: analysis.id,
    });

    return (
        <section
            className="result-card card result-advanced-analysis"
            aria-labelledby="result-advanced-analysis-heading"
        >
            <h2 id="result-advanced-analysis-heading">{t('advancedAnalysisTitle')}</h2>
            <p className="hint">{t('advancedAnalysisResultLead')}</p>
            <Link className="action-button" to={destination.pathname} state={destination.state}>
                {t('advancedAnalysisAction')}
            </Link>
        </section>
    );
}
