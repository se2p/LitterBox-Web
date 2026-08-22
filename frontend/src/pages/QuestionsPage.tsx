// SPDX-License-Identifier: EUPL-1.2
// SPDX-FileCopyrightText: 2025 LitterBox-Web contributors

import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useHistory, useParams } from 'react-router-dom';
import type { CapabilityState } from '../lib/capabilities';
import { Alert } from '../components/Alert';
import { Card } from '../components/Card';
import { Dialog } from '../components/Dialog';
import { PageMain } from '../components/Page';
import { ErrorState, LoadingState } from '../components/States';
import { OriginResultLink } from '../components/single-project/OriginResultLink';
import { ResultLink } from '../components/single-project/ResultLink';
import { ReuseProjectButton } from '../components/single-project/ReuseProjectButton';
import { useDeclaredNavigation } from '../lib/active-navigation';
import { latestProject, rememberProject } from '../lib/recent-projects';
import {
    QuestionSubmissionForm,
    type QuestionsVariant,
} from '../components/questions/QuestionSubmissionForm';
import {
    cancelSubmission,
    type BatchAnalysis,
    type SubmissionStatusResponse,
} from '../api/submissions';
import {
    TERMINAL_STATUSES,
    statusLabel,
    statusTone,
    useSubmission,
} from '../components/questions/submission-status';
import {
    learnerQuizQuestions,
    normalizeQuizQuestion,
    type QuizQuestion,
} from '../components/questions/quiz-question';
import { LearnerQuiz } from '../components/questions/LearnerQuiz';
import { TeacherQuestionOverview } from '../components/questions/TeacherQuestionOverview';
import { exportEligible } from '../lib/export-eligibility';
import { localeFrom } from '../lib/project-submission';
import { analysisCandidates, analysisIsCompleted } from './submission-utils';

const QUESTION_SOURCES = new Set(['QUESTION_UPLOAD', 'QUESTION_SCRATCH_URL']);
const MAX_QUESTIONS = 10;

const questionSource = (value: SubmissionStatusResponse): boolean =>
    QUESTION_SOURCES.has(value.sourceType);

const questionAnalysis = (value: SubmissionStatusResponse): BatchAnalysis | undefined =>
    analysisCandidates(value).find((analysis) => analysisIsCompleted(analysis, value.status));

const quizQuestions = (analysis: BatchAnalysis | undefined): QuizQuestion[] =>
    (Array.isArray(analysis?.quiz) ? analysis.quiz : [])
        .map(normalizeQuizQuestion)
        .filter((question): question is QuizQuestion => question !== undefined);

function QuestionsUnavailable({ onRetry }: { onRetry: () => void }) {
    const { t } = useTranslation();
    return (
        <PageMain>
            <ErrorState
                heading={t('questionsTitle')}
                message={t('questionsUnavailable')}
                retryLabel={t('retry')}
                onRetry={onRetry}
                level={1}
            />
        </PageMain>
    );
}

function InvalidQuestionToken({ onRetry }: { onRetry: () => void }) {
    const { t } = useTranslation();
    return (
        <PageMain>
            <ErrorState
                heading={t('questionsStatusTitle')}
                message={t('invalidToken')}
                retryLabel={t('retry')}
                onRetry={onRetry}
                level={1}
            />
        </PageMain>
    );
}

function QuestionsEntryPage({ variant }: { variant: QuestionsVariant }) {
    const { t, i18n } = useTranslation();
    const history = useHistory();
    // Only what this device did last, and only as one press: the page a child arrives at gains a shortcut, not a
    // second way of doing things.
    const [recent] = useState(latestProject);
    return (
        <PageMain className="questions-page">
            <section className="hero" aria-labelledby="questions-heading">
                <h1 id="questions-heading">
                    {variant === 'teacher' ? t('teacherQuestionsTitle') : t('questionsTitle')}
                </h1>
                <p className="lead">
                    {variant === 'teacher' ? t('teacherQuestionsLead') : t('questionsLead')}
                </p>
            </section>
            {recent &&
                (recent.kind === 'questions' ? (
                    <p className="recent-project-offer">
                        <Link
                            className="action-button"
                            to={`${variant === 'teacher' ? '/teacher/questions' : '/questions'}/${encodeURIComponent(recent.token)}`}
                        >
                            {t('reuseOpenQuestions', { project: recent.name })}
                        </Link>
                    </p>
                ) : (
                    <ReuseProjectButton
                        className="recent-project-offer"
                        token={recent.token}
                        originKind={recent.kind}
                        projectName={recent.name}
                        analysis="questions"
                        locale={localeFrom(i18n.language)}
                        label={t('reuseQuestionsNamed', { project: recent.name })}
                        onReused={(next) =>
                            history.push(
                                `${variant === 'teacher' ? '/teacher/questions' : '/questions'}/${encodeURIComponent(next)}`,
                            )
                        }
                    />
                ))}
            <QuestionSubmissionForm variant={variant} legend={t('questionsInputChoices')} />
        </PageMain>
    );
}

function QuestionsStatusBanner({
    value,
    variant,
    sseState,
    onCancel,
    cancelling,
}: {
    value: SubmissionStatusResponse;
    variant: QuestionsVariant;
    sseState: 'connected' | 'disconnected' | 'unavailable' | 'connecting';
    onCancel: () => void;
    cancelling: boolean;
}) {
    const { t } = useTranslation();
    const terminal = TERMINAL_STATUSES.has(value.status.toLowerCase());
    return (
        <>
            <section className="hero analysis-identity" aria-labelledby="questions-status-heading">
                <h1 id="questions-status-heading">{t('questionsStatusTitle')}</h1>
                {value.analysis?.name && (
                    <p className="analysis-project-name">
                        <span>{t('analysedProject')}:</span> {value.analysis.name}
                    </p>
                )}
                <div className={`status-line status-${statusTone(value.status)}`}>
                    <span className="status-dot" aria-hidden="true" />
                    <span>{statusLabel(value.status, t)}</span>
                </div>
                {/* Not a token to keep somewhere — there is nowhere to type one in. What this page hands back
                    is its own address. */}
                {value.token && (
                    <ResultLink
                        path={`${variant === 'teacher' ? 'teacher/questions' : 'questions'}/${encodeURIComponent(value.token)}`}
                    />
                )}
                {/* Asking about a project that had already been checked made a second result; this is the way
                    back to the first one, which is otherwise only in the reader's history. */}
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

function QuestionResult({
    value,
    token,
    variant,
    exportEnabled,
}: {
    value: SubmissionStatusResponse;
    token: string;
    variant: QuestionsVariant;
    /** Whether the deployment advertises the capability that can hand the project's scripts back. */
    exportEnabled: boolean;
}) {
    const { t, i18n } = useTranslation();
    const running = !TERMINAL_STATUSES.has(value.status.toLowerCase());
    const analysis = questionAnalysis(value);
    const allQuestions = quizQuestions(analysis);
    // The analysis carries every question it could generate. A teacher wants all of them; a learner wants a handful
    // that still spans the block model, and only of a kind whose marking can be trusted.
    const questions =
        variant === 'teacher' ? allQuestions : learnerQuizQuestions(allQuestions, MAX_QUESTIONS);
    // Questions were generated, but none of them can be put to a learner. Saying nothing was generated would be
    // untrue, and it is not the teacher's view that is short of anything.
    const noneForLearner =
        variant === 'learner' && allQuestions.length > 0 && questions.length === 0;
    const failed = String(value.status).toLowerCase() === 'failed';
    const cancelled = String(value.status).toLowerCase() === 'cancelled';
    const analysisId = analysis?.id;
    const canAnswer =
        typeof analysisId === 'number' && Number.isSafeInteger(analysisId) && analysisId > 0;
    const locale = localeFrom(value.locale || i18n.language);

    return (
        <>
            {running && (
                <Card aria-busy="true" aria-labelledby="questions-processing-heading">
                    <h2 id="questions-processing-heading">{t('questionsPreparingTitle')}</h2>
                    <p role="status">{t('questionsProcessing')}</p>
                </Card>
            )}
            {failed && (
                <Alert tone="error">
                    <p>{t('questionsFailed')}</p>
                </Alert>
            )}
            {cancelled && (
                <Alert tone="warning">
                    <p>{t('questionsCancelled')}</p>
                </Alert>
            )}
            {value.status.toLowerCase() === 'partial' && (
                <Alert tone="warning" role="status">
                    <p>{t('questionsPartial')}</p>
                </Alert>
            )}
            {!running &&
                !failed &&
                !cancelled &&
                canAnswer &&
                questions.length > 0 &&
                variant === 'teacher' && (
                    <TeacherQuestionOverview
                        questions={questions}
                        analysisId={analysisId}
                        token={token}
                        locale={locale}
                    />
                )}
            {!running &&
                !failed &&
                !cancelled &&
                canAnswer &&
                questions.length > 0 &&
                variant === 'learner' && (
                    <LearnerQuiz
                        questions={questions}
                        analysisId={analysisId}
                        token={token}
                        locale={locale}
                        showProjectCode={exportEligible(
                            exportEnabled,
                            analysisId,
                            analysis?.inputFormat,
                        )}
                    />
                )}
            {!running && !failed && !cancelled && (!canAnswer || questions.length === 0) && (
                <Card className="questions-empty-state">
                    <h2>
                        {noneForLearner
                            ? t('questionsNoneCheckableTitle')
                            : t('questionsEmptyTitle')}
                    </h2>
                    <p>
                        {noneForLearner ? t('questionsNoneCheckableBody') : t('questionsEmptyBody')}
                    </p>
                </Card>
            )}
        </>
    );
}

function QuestionResultPage({
    token,
    variant,
    exportEnabled,
}: {
    token: string;
    variant: QuestionsVariant;
    exportEnabled: boolean;
}) {
    const { t } = useTranslation();
    const { state, sseState, load } = useSubmission(token, true);
    const [cancelOpen, setCancelOpen] = useState(false);
    const [cancelling, setCancelling] = useState(false);
    const [cancelError, setCancelError] = useState(false);
    const terminal =
        state.status === 'ready' && TERMINAL_STATUSES.has(state.value.status.toLowerCase());

    useEffect(() => {
        if (terminal) {
            setCancelOpen(false);
            setCancelError(false);
        }
    }, [terminal]);

    // Remembered on this device, so the reader can come back to these questions without keeping the link.
    useEffect(() => {
        if (!terminal || state.status !== 'ready') return;
        const analysis = questionAnalysis(state.value);
        if (!analysis) return;
        rememberProject({
            token,
            name: analysis.name?.trim() || token,
            kind: 'questions',
        });
    }, [state, terminal, token]);

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
                <LoadingState
                    heading={t('questionsStatusTitle')}
                    message={t('statusLoading')}
                    level={1}
                />
            </PageMain>
        );

    if (state.status === 'error')
        return (
            <PageMain>
                <ErrorState
                    heading={t('questionsStatusTitle')}
                    message={state.tokenInvalid ? t('invalidToken') : t('statusError')}
                    retryLabel={t('retry')}
                    onRetry={() => void load(undefined, true)}
                    level={1}
                />
            </PageMain>
        );

    if (state.tokenInvalid)
        return <InvalidQuestionToken onRetry={() => void load(undefined, true)} />;

    if (!questionSource(state.value))
        return (
            <PageMain>
                <ErrorState
                    heading={t('questionsStatusTitle')}
                    message={t('questionsWrongSource')}
                    retryLabel={t('retry')}
                    onRetry={() => void load(undefined, true)}
                    level={1}
                />
            </PageMain>
        );

    return (
        <PageMain className="questions-page questions-result-page">
            <QuestionsStatusBanner
                value={state.value}
                variant={variant}
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
            <QuestionResult
                value={state.value}
                token={token}
                variant={variant}
                exportEnabled={exportEnabled}
            />
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

export function QuestionsPage({
    capabilityState,
    onCapabilityRetry,
    variant = 'learner',
}: {
    capabilityState: CapabilityState;
    onCapabilityRetry: () => void;
    variant?: QuestionsVariant;
}) {
    const { t } = useTranslation();
    const { token } = useParams<{ token?: string }>();
    const questionsEnabled =
        capabilityState.status === 'ready' && capabilityState.value.enabledFeatures.includes('qlc');
    const exportEnabled =
        capabilityState.status === 'ready' &&
        capabilityState.value.enabledFeatures.includes('program-export');
    const hasToken = typeof token === 'string' && token.trim().length > 0;
    // The teacher's question set lives under /teacher/questions, which is no menu entry of its own; it belongs to
    // the class-set page the form that made it sits on.
    useDeclaredNavigation(variant === 'teacher' ? '/teacher' : undefined);

    if (capabilityState.status === 'loading' || capabilityState.status === 'idle')
        return (
            <PageMain>
                <LoadingState
                    heading={t('questionsTitle')}
                    message={t('questionsCapabilitiesLoading')}
                    level={1}
                />
            </PageMain>
        );

    if (capabilityState.status === 'error' || capabilityState.status === 'incompatible')
        return <QuestionsUnavailable onRetry={onCapabilityRetry} />;

    if (!questionsEnabled) return <QuestionsUnavailable onRetry={onCapabilityRetry} />;
    if (hasToken)
        return <QuestionResultPage token={token} variant={variant} exportEnabled={exportEnabled} />;
    if (token !== undefined) return <InvalidQuestionToken onRetry={onCapabilityRetry} />;
    return <QuestionsEntryPage variant={variant} />;
}
