// SPDX-License-Identifier: EUPL-1.2
// SPDX-FileCopyrightText: 2026 LitterBox-Web contributors

import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate, useParams } from 'react-router';
import type { SupportedLocale } from '../api/capabilities';
import { Alert } from '../components/Alert';
import { Card } from '../components/Card';
import { PageMain } from '../components/Page';
import { StatusIndicator } from '../components/Status';
import { ErrorState, LoadingState } from '../components/States';
import { Breadcrumb, type Crumb } from '../components/ask-ai/Breadcrumb';
import { Conversation } from '../components/ask-ai/Conversation';
import { findingLinkParams, scopeForLink } from '../components/ask-ai/finding-link';
import { useCatalogue, type CataloguePlace } from '../components/ask-ai/goal-catalogue';
import { PlaceChip } from '../components/ask-ai/PlaceChip';
import { askAiProjectName } from '../components/ask-ai/project-name';
import {
    chooserLabels,
    chooserSteps,
    stepDecoration,
    type ChooserPosition,
} from '../components/ask-ai/trail';
import { QuestionsChooser } from '../components/ask-ai/QuestionsChooser';
import { ProjectSubmissionForm } from '../components/single-project/ProjectSubmissionForm';
import { RecentResults } from '../components/single-project/RecentResults';
import { RichHint } from '../components/single-project/RichHint';
import { richHintPlainText } from '../components/single-project/rich-hint';
import { statusLabel, statusTone, useSubmission } from '../components/questions/submission-status';
import { useDeclaredNavigation } from '../lib/active-navigation';
import { localeFrom } from '../lib/project-submission';
import { type ConversationScope } from './ask-ai-machine';
import { useAskAiService } from './ask-ai-service';
import {
    analysisIsCompleted,
    analysisStatus,
    isBatchSubmission,
    primaryAnalysis,
    positiveAnalysisId,
    rememberAnalysedProject,
} from './submission-utils';

function AskAiWorkspace({
    token,
    analysisId,
    locale,
    projectName,
}: {
    token: string;
    analysisId: number;
    locale: SupportedLocale;
    projectName: string;
}) {
    const { t } = useTranslation();
    const service = useAskAiService({ token, analysisId, locale });
    const { state, questions, openScope } = service;
    const [askedLast, setAskedLast] = useState<string>();
    const [askedFromChoice, setAskedFrom] = useState<ChooserPosition>();
    const [askedAbout, setAskedAbout] = useState<CataloguePlace>();
    const [movedTo, setMovedTo] = useState<ChooserPosition>();

    const conversationHeading = useRef<HTMLHeadingElement>(null);
    const catalogue = useCatalogue(questions);

    // Focus the new screen without moving focus on reply updates.
    useEffect(() => {
        conversationHeading.current?.focus();
    }, [state.conversation?.scope.selector]);

    const location = useLocation();
    const [link] = useState(() => findingLinkParams(location.search));
    const hasLink = Boolean(link.finder || link.finding);
    const linkScope = useMemo(
        () => (questions ? scopeForLink(questions, link, locale) : undefined),
        [questions, link, locale],
    );
    // Trail back to the chooser screen the catalogue files a linked finding under.
    const linkTrail: ChooserPosition = useMemo(() => {
        const asked =
            linkScope?.kind === 'finding'
                ? catalogue.questions.find((q) => q.scope.selector === linkScope.selector)
                : undefined;
        return linkScope?.kind === 'finding'
            ? { goal: 'problems', place: asked?.place ?? null }
            : {};
    }, [linkScope, catalogue]);
    const askedFrom = askedFromChoice ?? linkTrail;
    const linkOpened = useRef(false);
    useEffect(() => {
        if (!linkScope || linkOpened.current) return;
        linkOpened.current = true;
        openScope(linkScope);
    }, [linkScope, openScope]);
    // A link that names no single finding still opens the chooser where such findings are listed.
    const openAt = movedTo ?? (hasLink && !linkScope ? { goal: 'problems' } : undefined);

    const returnToChooser = (to?: ChooserPosition) => {
        setMovedTo(to ?? askedFrom);
        setAskedLast(state.conversation?.scope.selector);
        service.leaveConversation();
    };

    const conversationTrail = (scope: ConversationScope): Crumb[] => {
        if (!questions) return [];
        const steps = chooserSteps(catalogue, askedFrom, chooserLabels(t, locale));
        const named = steps[steps.length - 1]?.place?.key;
        const isFinding = scope.kind === 'finding';
        return [
            ...steps.map((step) => ({
                key: step.key,
                label: step.label,
                ...stepDecoration(step),
                onNavigate: () => returnToChooser(step.to),
            })),
            {
                key: 'question',
                label: isFinding ? t('askAboutFinding') : richHintPlainText(scope.label, locale),
                content: (
                    <>
                        <span className="ask-ai-trail-words">
                            {isFinding ? (
                                t('askAboutFinding')
                            ) : (
                                <RichHint
                                    value={scope.label}
                                    locale={locale}
                                    scratchblocksLabel={t('scratchblocks')}
                                    textAlternativeLabel={t('textAlternative')}
                                />
                            )}
                        </span>
                        {askedAbout && askedAbout.key !== named && (
                            <PlaceChip place={askedAbout} locale={locale} />
                        )}
                    </>
                ),
            },
        ];
    };

    if (state.questions.status === 'loading' && !questions)
        return (
            <LoadingState
                heading={t('askAiChooserTitle', { project: projectName })}
                message={t('statusLoading')}
                level={2}
            />
        );

    if (state.questions.status === 'failed' && (!questions || !state.conversation))
        return (
            <ErrorState
                heading={t('askAiChooserTitle', { project: projectName })}
                message={t('askAiQuestionsUnavailable')}
                retryLabel={t('retry')}
                onRetry={service.loadQuestions}
                level={2}
            />
        );

    // Hold the chooser back until a finding link has been opened, so it mounts at the right screen.
    if (!questions || (linkScope && !state.conversation && movedTo === undefined)) return null;

    return (
        <>
            {!state.conversation ? (
                <QuestionsChooser
                    catalogue={catalogue}
                    project={projectName}
                    locale={locale}
                    onSelect={(scope, from, about) => {
                        setAskedFrom(from);
                        setAskedAbout(about);
                        openScope(scope);
                    }}
                    onMove={(to) => {
                        setMovedTo(to);
                        setAskedLast(undefined);
                    }}
                    restoreFocusTo={askedLast}
                    openAt={openAt}
                />
            ) : (
                <>
                    <Breadcrumb
                        crumbs={conversationTrail(state.conversation.scope)}
                        headingLevel={2}
                        headingRef={conversationHeading}
                    />
                    <Conversation
                        conversation={state.conversation}
                        questions={questions}
                        locale={locale}
                        onFollowUp={service.sendFollowUp}
                        onRetry={service.retryLastSend}
                        onChangeScope={() => returnToChooser()}
                    />
                </>
            )}
            <p className="ask-ai-answer-note">{t('askAiAnswerNote')}</p>
        </>
    );
}

function AskAiResultPage({ token }: { token: string }) {
    const { t, i18n } = useTranslation();
    const { state, load, terminal } = useSubmission(token, true);
    useDeclaredNavigation('/ask-ai');

    useEffect(() => {
        if (state.status === 'ready' && terminal) rememberAnalysedProject(token, state.value);
    }, [state, terminal, token]);

    if (state.status === 'loading')
        return (
            <PageMain>
                <LoadingState
                    heading={t('askAiResultTitle')}
                    message={t('statusLoading')}
                    level={1}
                />
            </PageMain>
        );

    if (state.status === 'error' || state.tokenInvalid)
        return (
            <PageMain>
                <ErrorState
                    heading={t('askAiResultTitle')}
                    message={state.tokenInvalid ? t('invalidToken') : t('statusError')}
                    retryLabel={t('retry')}
                    onRetry={() => void load(undefined, true)}
                    level={1}
                />
            </PageMain>
        );

    const value = state.value;
    const running = !terminal;
    const analysis = primaryAnalysis(value);
    const analysisName = analysis?.name?.trim();
    const analysisFailed =
        String(value.status).toLowerCase() === 'failed' ||
        (analysis !== undefined && analysisStatus(analysis) === 'failed');
    const analysisCancelled = String(value.status).toLowerCase() === 'cancelled';
    const ready =
        terminal &&
        !isBatchSubmission(value) &&
        analysis !== undefined &&
        analysisIsCompleted(analysis, value.status) &&
        positiveAnalysisId(analysis.id);

    return (
        <PageMain className="ask-ai-page ask-ai-result-page">
            <section className="hero analysis-identity" aria-labelledby="ask-ai-result-heading">
                <h1 id="ask-ai-result-heading">{t('askAiResultTitle')}</h1>
                {analysisName && (
                    <p className="analysis-project-name">
                        <span>{t('analysedProject')}:</span> {analysisName}
                    </p>
                )}
            </section>
            {running && (
                <Card aria-busy="true" aria-labelledby="ask-ai-processing-heading">
                    <h2 id="ask-ai-processing-heading">{t('askAiPreparingTitle')}</h2>
                    <StatusIndicator
                        tone={statusTone(value.status)}
                        label={statusLabel(value.status, t)}
                    />
                    <p role="status">{t('askAiProcessing')}</p>
                </Card>
            )}
            {!running && analysisFailed && (
                <Alert tone="error">
                    <p>{t('askAiAnalysisFailed')}</p>
                </Alert>
            )}
            {!running && !analysisFailed && analysisCancelled && (
                <Alert tone="warning">
                    <p>{t('askAiAnalysisCancelled')}</p>
                </Alert>
            )}
            {!running && !ready && !analysisFailed && !analysisCancelled && (
                <Alert tone="error">
                    <p>{t('askAiNoAnalysisBody')}</p>
                </Alert>
            )}
            {ready && analysis && (
                <AskAiWorkspace
                    token={token}
                    analysisId={analysis.id}
                    locale={localeFrom(i18n.language)}
                    projectName={askAiProjectName(analysis.name, t('askAiThisProject'))}
                />
            )}
        </PageMain>
    );
}

function AskAiIntake() {
    const { t } = useTranslation();
    const navigate = useNavigate();
    return (
        <PageMain className="ask-ai-page">
            <section className="hero" aria-labelledby="ask-ai-heading">
                <h1 id="ask-ai-heading">{t('askAiTitle')}</h1>
                <p className="lead">{t('askAiLead')}</p>
            </section>
            <ProjectSubmissionForm
                idPrefix="ask-ai"
                legend={t('primaryAnalysisChoices')}
                submitLabel={t('askAiSubmitLabel')}
                onAccepted={(token) => navigate(`/ask-ai/submissions/${encodeURIComponent(token)}`)}
            />
            <RecentResults
                kinds={['issues']}
                headingId="ask-ai-recent-heading"
                heading="askAiRecentTitle"
                linkTo={(project) => `/ask-ai/submissions/${encodeURIComponent(project.token)}`}
            />
        </PageMain>
    );
}

export function AskAiPage() {
    const { token } = useParams<{ token?: string }>();
    if (typeof token === 'string' && token.trim().length > 0)
        return <AskAiResultPage key={token} token={token} />;
    return <AskAiIntake />;
}
