// SPDX-License-Identifier: EUPL-1.2
// SPDX-FileCopyrightText: 2025 LitterBox-Web contributors

import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import type { CapabilityState } from '../lib/capabilities';
import { featureEnabled, teacherWorkflowEnabled } from '../lib/features';
import { submitFile, submitStudio, type SubmissionRequestOptions } from '../api/submissions';
import {
    parseScratchStudioId,
    preflightTeacherInput,
    type ArchivePreflightResult,
} from '../lib/archive-preflight';
import { Alert } from '../components/Alert';
import { Card } from '../components/Card';
import { Dialog } from '../components/Dialog';
import { FormField } from '../components/Form';
import { PageMain } from '../components/Page';
import { ErrorState } from '../components/States';
import { preflightMessageKey } from '../lib/archive-preflight-messages';
import { isAbortError } from '../lib/abort-error';
import {
    studioProjectCount,
    studioSubmittable,
    useStudioPreflight,
    type StudioPreflight,
} from '../lib/studio-preflight';
import { formatNumber } from '../i18n';
import { TASK_ANALYSIS_PATH } from '../lib/retained-analysis';
import { localeFrom, newIdempotencyKey } from '../lib/project-submission';
import { ProjectSubmissionForm } from '../components/single-project/ProjectSubmissionForm';
import { RecentResults } from '../components/single-project/RecentResults';
import { RecentAnalysesFooter } from '../components/RecentAnalysesSection';
import { TaskRecentAnalyses } from '../components/task-analysis/TaskRecentAnalyses';
import {
    rememberProject,
    useRecentProjects,
    type RecentAnalysisKind,
} from '../lib/recent-projects';
import { QuestionSubmissionForm } from '../components/questions/QuestionSubmissionForm';
import { QuizRecentAnalyses } from '../components/questions/QuizRecentAnalyses';
import { homeVisual } from '../assets/home-visual';

const LARGE_CLASS_SET = 50;

const QUIZ_HISTORY_KINDS: readonly RecentAnalysisKind[] = ['issues', 'questions'];

export type SubmissionMode = 'single-project' | 'teacher';
export type SubmissionPageKind = 'home' | 'submit' | 'teacher';

export interface SubmitPageProps {
    capabilityState: CapabilityState;
    onCapabilityRetry: () => void;
    mode?: SubmissionMode;
    page?: SubmissionPageKind;
}

export function SubmitPage({
    capabilityState,
    onCapabilityRetry,
    mode = 'single-project',
    page = 'submit',
}: SubmitPageProps) {
    const { t, i18n } = useTranslation();
    // One picture per language; English stands in for anything else the browser reports.
    const picture = homeVisual[i18n.language as keyof typeof homeVisual] ?? homeVisual.en;
    const navigate = useNavigate();
    const [teacherFile, setTeacherFile] = useState<File>();
    const [studio, setStudio] = useState('');
    const [teacherPreflight, setTeacherPreflight] = useState<ArchivePreflightResult>();
    const [preflightBusy, setPreflightBusy] = useState(false);
    const [busy, setBusy] = useState(false);
    const [confirmOpen, setConfirmOpen] = useState(false);
    const [error, setError] = useState('');
    const remembered = useRecentProjects();
    const preflightSequence = useRef(0);
    const preflightController = useRef<AbortController | undefined>(undefined);
    const submitController = useRef<AbortController | undefined>(undefined);
    const idempotencyKey = useRef<string | undefined>(undefined);
    const teacherFileInput = useRef<HTMLInputElement>(null);

    useEffect(
        () => () => {
            preflightController.current?.abort();
            submitController.current?.abort();
        },
        [],
    );

    useEffect(() => {
        idempotencyKey.current = undefined;
    }, [i18n.language]);

    const chooseTeacherFile = (candidate?: File) => {
        const sequence = ++preflightSequence.current;
        preflightController.current?.abort();
        idempotencyKey.current = undefined;
        setError('');
        setTeacherFile(candidate);
        setStudio('');
        setTeacherPreflight(undefined);
        if (!candidate) {
            setPreflightBusy(false);
            preflightController.current = undefined;
            return;
        }
        setPreflightBusy(true);
        const controller = new AbortController();
        preflightController.current = controller;
        void preflightTeacherInput(candidate, controller.signal)
            .then((result) => {
                if (preflightSequence.current === sequence) setTeacherPreflight(result);
            })
            .catch(() => {
                if (preflightSequence.current === sequence)
                    setTeacherPreflight({ valid: false, reason: 'invalid-archive', entries: 0 });
            })
            .finally(() => {
                if (preflightSequence.current === sequence) {
                    setPreflightBusy(false);
                    preflightController.current = undefined;
                }
            });
    };

    const chooseStudio = (value: string) => {
        preflightSequence.current++;
        preflightController.current?.abort();
        preflightController.current = undefined;
        idempotencyKey.current = undefined;
        setError('');
        setStudio(value);
        if (teacherFileInput.current) teacherFileInput.current.value = '';
        setTeacherFile(undefined);
        setTeacherPreflight(undefined);
        setPreflightBusy(false);
    };

    const studioId = parseScratchStudioId(studio.trim());
    const studioPreflight = useStudioPreflight(studioId);
    const teacherUsableProjects = Math.max(
        0,
        (teacherPreflight?.projects ?? 0) - (teacherPreflight?.childErrors?.length ?? 0),
    );

    const headingId = `${page}-heading`;
    const pageTitle =
        page === 'home'
            ? t('homeTitle')
            : page === 'teacher'
              ? t('teacherTitle')
              : t('submitTitle');
    const pageLead =
        page === 'home' ? t('homeLead') : page === 'teacher' ? t('teacherLead') : t('submitLead');

    if (capabilityState.status === 'loading' || capabilityState.status === 'idle')
        return (
            <PageMain className={page === 'home' ? 'home-page' : ''}>
                <section className="hero" aria-labelledby={headingId}>
                    <h1 id={headingId} className={page === 'home' ? 'visually-hidden' : undefined}>
                        {pageTitle}
                    </h1>
                    <p className="lead">{pageLead}</p>
                </section>
                <Card aria-busy="true">
                    <h2>{t('capabilitiesTitle')}</h2>
                    <p role="status">{t('submissionCapabilitiesLoading')}</p>
                </Card>
            </PageMain>
        );

    if (capabilityState.status === 'error')
        return (
            <PageMain className={page === 'home' ? 'home-page' : ''}>
                <ErrorState
                    heading={t('capabilitiesTitle')}
                    message={t('submissionCapabilitiesError')}
                    retryLabel={t('retry')}
                    onRetry={onCapabilityRetry}
                    level={1}
                />
            </PageMain>
        );

    if (capabilityState.status === 'incompatible')
        return (
            <PageMain className={page === 'home' ? 'home-page' : ''}>
                <ErrorState
                    heading={t('localeIncompatibilityTitle')}
                    message={t('localeSetIncompatibilityBody')}
                    retryLabel={t('retry')}
                    onRetry={onCapabilityRetry}
                    level={1}
                />
            </PageMain>
        );

    const features = capabilityState.value.enabledFeatures;
    const singleProjectEnabled = featureEnabled(features, 'single-project', 'single');
    const teacherArchiveEnabled = featureEnabled(features, 'teacher-archive');
    const studioEnabled = featureEnabled(features, 'studio');
    const questionsEnabled = featureEnabled(features, 'qlc');
    const workflowEnabled =
        mode === 'single-project' ? singleProjectEnabled : teacherWorkflowEnabled(features);
    const canSubmitBatch =
        !busy &&
        !preflightBusy &&
        Boolean(
            (teacherArchiveEnabled && teacherFile && teacherUsableProjects > 0) ||
            (studioEnabled && studioId && studioSubmittable(studioPreflight)),
        );
    const submittingStudio = !teacherFile && Boolean(studioId);
    const studioProjects = studioProjectCount(studioPreflight);
    const confirmLargeSet = submittingStudio
        ? studioProjects === undefined ||
          studioProjects === null ||
          studioProjects >= LARGE_CLASS_SET
        : teacherUsableProjects >= LARGE_CLASS_SET;

    const openSubmission = (token: string) => navigate(`/submissions/${encodeURIComponent(token)}`);

    const onSubmitBatch = (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        if (!canSubmitBatch) return;
        if (confirmLargeSet) {
            setConfirmOpen(true);
            return;
        }
        void startBatch();
    };

    const startBatch = async () => {
        setConfirmOpen(false);
        setError('');
        setBusy(true);
        const key = idempotencyKey.current ?? newIdempotencyKey();
        idempotencyKey.current = key;
        const controller = new AbortController();
        submitController.current = controller;
        const options: SubmissionRequestOptions = {
            idempotencyKey: key,
            locale: localeFrom(i18n.language),
            signal: controller.signal,
        };
        try {
            const accepted =
                teacherFile && teacherUsableProjects > 0
                    ? await submitFile(teacherFile, options)
                    : await submitStudio(studioId ?? '', options);
            if (!accepted.token) throw new Error(t('submissionTokenMissing'));
            rememberProject({
                token: accepted.token,
                name: teacherFile?.name ?? '',
                kind: 'batch',
            });
            openSubmission(accepted.token);
        } catch (failure) {
            if (!isAbortError(failure)) setError(t('submitErrorBody'));
        } finally {
            setBusy(false);
        }
    };

    const studioConfirmation = (projects: number | null | undefined) =>
        typeof projects === 'number'
            ? t('largeSetConfirmStudioCounted', {
                  count: projects,
                  formatted: formatNumber(projects),
              })
            : t('largeSetConfirmStudio');

    const renderStudioPreflight = (preflight: StudioPreflight) => {
        if (preflight.status === 'idle') return null;
        if (preflight.status === 'checking')
            return <p role="status">{t('studioPreflightChecking')}</p>;
        if (preflight.status === 'missing')
            return <p role="alert">{t('studioPreflightMissing')}</p>;
        if (preflight.status === 'unreachable')
            return <p role="status">{t('studioPreflightUnreachable')}</p>;
        const { title, readable, projects } = preflight.summary;
        if (!readable) return <p role="alert">{t('studioPreflightPrivate')}</p>;
        if (projects === null) return <p role="status">{t('studioPreflightUncounted')}</p>;
        if (projects === 0) return <p role="alert">{t('studioPreflightEmpty')}</p>;
        return (
            <p role="status">
                {title
                    ? t('studioPreflightNamed', {
                          count: projects,
                          formatted: formatNumber(projects),
                          title,
                      })
                    : t('studioPreflightReady', {
                          count: projects,
                          formatted: formatNumber(projects),
                      })}
            </p>
        );
    };

    const renderTeacherPreflight = (result: ArchivePreflightResult | undefined) => {
        if (!result) return null;
        if (result.valid)
            return (
                <p role="status">{t('teacherPreflightReady', { count: result.projects ?? 0 })}</p>
            );
        if (teacherUsableProjects > 0)
            return (
                <p role="status">{t('teacherPreflightMixed', { count: teacherUsableProjects })}</p>
            );
        return <p role="alert">{t(preflightMessageKey(result.reason ?? 'invalid-archive'))}</p>;
    };

    if (!workflowEnabled)
        return (
            <PageMain className={page === 'home' ? 'home-page' : ''}>
                <ErrorState
                    heading={pageTitle}
                    message={t('submissionFeatureUnavailable')}
                    retryLabel={t('retry')}
                    onRetry={onCapabilityRetry}
                    level={1}
                />
            </PageMain>
        );

    return (
        <PageMain className={page === 'home' ? 'home-page' : ''}>
            {page === 'home' ? (
                <section className="home-introduction" aria-labelledby={headingId}>
                    <div className="hero home-hero">
                        <h1 id={headingId} className="visually-hidden">
                            {pageTitle}
                        </h1>
                        <p className="lead">{pageLead}</p>
                        <p className="hint">{t('homeHint')}</p>
                    </div>
                    <div className="home-programming-visual">
                        {/* The same four blocks every visit, drawn once by scripts/home-visual.mjs and checked
                            in, rather than rendered live — the live renderer and its dictionaries cost 167 kB
                            for a picture that never varies. */}
                        <img
                            src={picture.source}
                            alt={t('homeVisualLabel')}
                            width={picture.width}
                            height={picture.height}
                        />
                    </div>
                </section>
            ) : (
                <section className="hero" aria-labelledby={headingId}>
                    <h1 id={headingId}>{pageTitle}</h1>
                    <p className="lead">{pageLead}</p>
                </section>
            )}
            {mode === 'single-project' && (
                <>
                    <ProjectSubmissionForm
                        className={page === 'home' ? 'home-analysis-form' : ''}
                        legend={t('primaryAnalysisChoices')}
                        submitLabel={t('submit')}
                        onAccepted={openSubmission}
                    />
                    <RecentResults kinds={['issues', 'questions']} />
                </>
            )}
            {mode === 'teacher' && singleProjectEnabled && (
                <section className="teacher-workflow">
                    <ProjectSubmissionForm
                        idPrefix="teacher-task-analysis-project"
                        className="teacher-task-analysis-entry"
                        legend={t('teacherTaskAnalysisChoiceTitle')}
                        description={t('teacherTaskAnalysisChoiceDescription')}
                        submitLabel={t('taskAnalysisAction')}
                        onAccepted={(token) =>
                            navigate(`/submissions/${encodeURIComponent(token)}`, {
                                state: { continueTo: TASK_ANALYSIS_PATH },
                            })
                        }
                    />
                    <TaskRecentAnalyses
                        headingId="teacher-task-recent-analyses-heading"
                        headingText={t('teacherRecentTaskProjectsHeading')}
                    />
                </section>
            )}
            {mode === 'teacher' && questionsEnabled && (
                <section className="teacher-workflow">
                    <QuestionSubmissionForm
                        variant="teacher"
                        idPrefix="teacher-questions-project"
                        className="teacher-questions-entry"
                        legend={t('teacherQuestionsChoiceTitle')}
                        description={t('teacherQuestionsChoiceDescription')}
                    />
                    <QuizRecentAnalyses
                        headingId="teacher-quiz-recent-analyses-heading"
                        headingText={t('teacherRecentQuizProjectsHeading')}
                        locale={localeFrom(i18n.language)}
                        onReused={(token) =>
                            navigate(`/teacher/questions/${encodeURIComponent(token)}`)
                        }
                    />
                    <RecentResults
                        kinds={['questions']}
                        headingId="teacher-recent-question-sets-heading"
                        headingText={t('teacherRecentQuestionSetsHeading')}
                        questionsPath="/teacher/questions"
                        detailLabelKeys={{ questions: 'recentResultQuestionSet' }}
                        footer={false}
                    />
                    {remembered.some((project) => QUIZ_HISTORY_KINDS.includes(project.kind)) && (
                        <RecentAnalysesFooter
                            kinds={QUIZ_HISTORY_KINDS}
                            className="recent-results quiz-recent-history-footer"
                        />
                    )}
                </section>
            )}
            {mode === 'teacher' && (
                <section className="teacher-workflow">
                    {(teacherArchiveEnabled || studioEnabled) && (
                        <form
                            className="submit-form"
                            onSubmit={(event) => void onSubmitBatch(event)}
                        >
                            <fieldset className="analysis-choice-group analysis-choice-group-secondary">
                                <legend>{t('teacherSubmissionChoices')}</legend>
                                <p className="choice-description">
                                    {t('teacherClassSetChoiceDescription')}
                                </p>
                                <div className="analysis-choice-grid">
                                    {teacherArchiveEnabled && (
                                        <div className="batch-choice-card">
                                            <FormField
                                                label={t('teacherUploadLabel')}
                                                labelFor="teacher-archive"
                                            >
                                                <input
                                                    ref={teacherFileInput}
                                                    id="teacher-archive"
                                                    type="file"
                                                    accept=".zip,.txt,application/zip,text/plain"
                                                    disabled={busy}
                                                    aria-describedby="teacher-archive-hint"
                                                    onChange={(
                                                        event: ChangeEvent<HTMLInputElement>,
                                                    ) => chooseTeacherFile(event.target.files?.[0])}
                                                />
                                                <p id="teacher-archive-hint" className="hint">
                                                    {t('teacherUploadHint')}
                                                </p>
                                                {renderTeacherPreflight(teacherPreflight)}
                                                {teacherPreflight?.childErrors && (
                                                    <ul
                                                        className="preflight-errors"
                                                        aria-label={t('teacherChildErrors')}
                                                    >
                                                        {teacherPreflight.childErrors.map(
                                                            (child) => (
                                                                <li key={child.name}>
                                                                    <strong>{child.name}:</strong>{' '}
                                                                    {t(
                                                                        preflightMessageKey(
                                                                            child.reason,
                                                                        ),
                                                                    )}
                                                                </li>
                                                            ),
                                                        )}
                                                    </ul>
                                                )}
                                            </FormField>
                                        </div>
                                    )}
                                    {studioEnabled && (
                                        <div className="batch-choice-card">
                                            <FormField
                                                label={t('studioLabel')}
                                                labelFor="studio-id"
                                            >
                                                <input
                                                    id="studio-id"
                                                    type="text"
                                                    inputMode="numeric"
                                                    value={studio}
                                                    disabled={busy}
                                                    aria-invalid={studio.trim() !== '' && !studioId}
                                                    aria-describedby="studio-id-hint"
                                                    onChange={(event) =>
                                                        chooseStudio(event.target.value)
                                                    }
                                                    placeholder="12345"
                                                />
                                                <p id="studio-id-hint" className="hint">
                                                    {t('studioHint')}
                                                </p>
                                                {renderStudioPreflight(studioPreflight)}
                                            </FormField>
                                        </div>
                                    )}
                                </div>
                            </fieldset>
                            {error && (
                                <Alert tone="error">
                                    <p>
                                        {t('submitError')}: {error}
                                    </p>
                                </Alert>
                            )}
                            <button
                                className="submit-analysis-button"
                                type="submit"
                                disabled={!canSubmitBatch}
                                aria-busy={busy}
                            >
                                {busy
                                    ? t('submitting')
                                    : error
                                      ? t('retry')
                                      : teacherFile
                                        ? t('submitBatch')
                                        : t('submitStudio')}
                            </button>
                            <Dialog
                                open={confirmOpen}
                                title={t('largeSetConfirmTitle')}
                                closeLabel={t('largeSetConfirmBack')}
                                onClose={() => setConfirmOpen(false)}
                            >
                                <p>
                                    {submittingStudio
                                        ? studioConfirmation(studioProjects)
                                        : t('largeSetConfirmArchive', {
                                              count: teacherUsableProjects,
                                              formatted: formatNumber(teacherUsableProjects),
                                          })}
                                </p>
                                <div className="dialog-actions">
                                    <button type="button" onClick={() => setConfirmOpen(false)}>
                                        {t('largeSetConfirmBack')}
                                    </button>
                                    <button type="button" onClick={() => void startBatch()}>
                                        {submittingStudio ? t('submitStudio') : t('submitBatch')}
                                    </button>
                                </div>
                            </Dialog>
                        </form>
                    )}
                    <RecentResults
                        kinds={['batch']}
                        headingId="recent-class-sets-heading"
                        headingText={t('teacherRecentClassSetsHeading')}
                    />
                </section>
            )}
        </PageMain>
    );
}
