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
    preflightTeacherArchive,
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
import { MODIFICATION_PATH } from '../lib/retained-analysis';
import { localeFrom, newIdempotencyKey } from '../lib/project-submission';
import { ProjectSubmissionForm } from '../components/single-project/ProjectSubmissionForm';
import { RecentResults } from '../components/single-project/RecentResults';
import { rememberProject } from '../lib/recent-projects';
import { QuestionSubmissionForm } from '../components/questions/QuestionSubmissionForm';
import { homeVisual } from '../assets/home-visual';

/**
 * How many projects make a class set worth confirming. Below it the run is a moment and a second press is friction;
 * above it a mistaken archive costs a teacher a long wait and the service a long job.
 */
const LARGE_CLASS_SET = 50;

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
    // Drawn ahead of time, one per language; English stands in for anything else the browser reports.
    const picture = homeVisual[i18n.language as keyof typeof homeVisual] ?? homeVisual.en;
    const navigate = useNavigate();
    const [teacherFile, setTeacherFile] = useState<File>();
    const [studio, setStudio] = useState('');
    const [teacherPreflight, setTeacherPreflight] = useState<ArchivePreflightResult>();
    const [preflightBusy, setPreflightBusy] = useState(false);
    const [busy, setBusy] = useState(false);
    const [confirmOpen, setConfirmOpen] = useState(false);
    const [error, setError] = useState('');
    const preflightSequence = useRef(0);
    const preflightController = useRef<AbortController | undefined>(undefined);
    const submitController = useRef<AbortController | undefined>(undefined);
    const idempotencyKey = useRef<string | undefined>(undefined);
    const teacherFileInput = useRef<HTMLInputElement>(null);

    // A submission that outlives its form has nobody left to tell: letting it finish would take a teacher who
    // has since gone elsewhere and drop them on a class set they did not ask to see.
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
        void preflightTeacherArchive(candidate, controller.signal)
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
    const injectionEnabled = featureEnabled(features, 'fault-injection');
    // The page is not only the class set, so a service offering only one of the other two workflows still
    // has something to put here. The same predicate decides the menu entry in App.
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
    /**
     * Either kind of set is confirmed only once it is large enough that the run is a commitment rather than a
     * moment. A studio whose size could not be read counts as large, since the alternative is finding out from a
     * progress bar.
     */
    const confirmLargeSet = submittingStudio
        ? studioProjects === undefined ||
          studioProjects === null ||
          studioProjects >= LARGE_CLASS_SET
        : teacherUsableProjects >= LARGE_CLASS_SET;

    const openSubmission = (token: string) => navigate(`/submissions/${encodeURIComponent(token)}`);

    const onSubmitBatch = (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        if (!canSubmitBatch) return;
        // A class set runs until it is done and no single project can be taken back out of it. This is the last
        // cheap moment to notice that the wrong archive was picked, or that the studio is somebody's whole year.
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
            // Remembered here rather than on the result page, because this is the only place that knows what the
            // set was called. A class set has no project name to fall back on, and a teacher who closed the tab
            // had no way back to a thirty-project run at all.
            rememberProject({
                token: accepted.token,
                name: teacherFile?.name ?? '',
                kind: 'batch',
            });
            openSubmission(accepted.token);
        } catch (failure) {
            // Us dropping the request is not the service failing to answer it.
            if (!isAbortError(failure)) setError(t('submitErrorBody'));
        } finally {
            setBusy(false);
        }
    };

    /**
     * The dialog names the size whenever the size is known. Where it is not, it says so instead of implying that
     * nobody could have looked.
     */
    const studioConfirmation = (projects: number | null | undefined) =>
        typeof projects === 'number'
            ? t('largeSetConfirmStudioCounted', {
                  count: projects,
                  formatted: formatNumber(projects),
              })
            : t('largeSetConfirmStudio');

    /** The studio's own answer, in the place the archive puts the contents of a ZIP. */
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
        // Naming the studio catches the mistake a number never could: the right count in the wrong studio.
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
                        {/* The banner wordmark is the page title, as on the legacy page. */}
                        <h1 id={headingId} className="visually-hidden">
                            {pageTitle}
                        </h1>
                        <p className="lead">{pageLead}</p>
                        <p className="hint">{t('homeHint')}</p>
                    </div>
                    <div className="home-programming-visual">
                        {/* An illustration of what the site is about, not evidence anybody has to read: it keeps
                            its accessible name and loses the caption and the transcript that went with it.

                            The same four blocks every visit, so they are drawn once by scripts/home-visual.mjs
                            and checked in. Drawing them here instead meant every home visitor fetched the block
                            renderer and its dictionaries — 167 kB — for a picture that never varies. */}
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
                    {/* The way back to what this browser already had analysed. Nothing is added to the form
                        itself; the list is only there once there is something in it. */}
                    <RecentResults kinds={['issues', 'questions']} />
                </>
            )}
            {mode === 'teacher' && (teacherArchiveEnabled || studioEnabled) && (
                <form className="submit-form" onSubmit={(event) => void onSubmitBatch(event)}>
                    <fieldset className="analysis-choice-group analysis-choice-group-secondary">
                        {/* The section is named for what it does rather than for the page it is on, so the
                            page's own lead does not need repeating word for word underneath it. */}
                        <legend>{t('teacherSubmissionChoices')}</legend>
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
                                            accept=".zip,application/zip"
                                            disabled={busy}
                                            aria-describedby="teacher-archive-hint"
                                            onChange={(event: ChangeEvent<HTMLInputElement>) =>
                                                chooseTeacherFile(event.target.files?.[0])
                                            }
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
                                                {teacherPreflight.childErrors.map((child) => (
                                                    <li key={child.name}>
                                                        <strong>{child.name}:</strong>{' '}
                                                        {t(preflightMessageKey(child.reason))}
                                                    </li>
                                                ))}
                                            </ul>
                                        )}
                                    </FormField>
                                </div>
                            )}
                            {studioEnabled && (
                                <div className="batch-choice-card">
                                    <FormField label={t('studioLabel')} labelFor="studio-id">
                                        <input
                                            id="studio-id"
                                            type="text"
                                            inputMode="numeric"
                                            value={studio}
                                            disabled={busy}
                                            aria-invalid={studio.trim() !== '' && !studioId}
                                            aria-describedby="studio-id-hint"
                                            onChange={(event) => chooseStudio(event.target.value)}
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
                            {/* The same words the form's own button used, so pressing this is plainly the
                                thing that was already asked for. */}
                            <button type="button" onClick={() => void startBatch()}>
                                {submittingStudio ? t('submitStudio') : t('submitBatch')}
                            </button>
                        </div>
                    </Dialog>
                </form>
            )}
            {/* The way back to a class set already sent. A run over thirty projects is not something to repeat
                because the tab was closed, and its link would otherwise be only in the teacher's own history. */}
            {mode === 'teacher' && (
                <RecentResults kinds={['batch']} headingId="recent-class-sets-heading" />
            )}
            {/* A batch tells a teacher what a class got wrong; the question set tells them what they can ask. It is
                one project and the same two ways in, so it is asked for here rather than behind a link to a page
                that would hold nothing but this form. */}
            {mode === 'teacher' && questionsEnabled && (
                <QuestionSubmissionForm
                    variant="teacher"
                    idPrefix="teacher-questions-project"
                    className="teacher-questions-entry"
                    legend={t('teacherQuestionsChoiceTitle')}
                    description={t('teacherQuestionsChoiceDescription')}
                />
            )}
            {/* Injecting a fault does not read a project, it makes another one: a copy with a known bug in it, for a
                class to find. That is lesson preparation, not analysis, so it is asked for here rather than beside
                the measurements and graphs of the advanced workspace. */}
            {mode === 'teacher' && injectionEnabled && (
                <ProjectSubmissionForm
                    idPrefix="teacher-modification-project"
                    className="teacher-modification-entry"
                    legend={t('teacherModificationChoiceTitle')}
                    description={t('teacherModificationChoiceDescription')}
                    submitLabel={t('modificationAction')}
                    onAccepted={(token) =>
                        navigate(`/submissions/${encodeURIComponent(token)}`, {
                            state: { continueTo: MODIFICATION_PATH },
                        })
                    }
                />
            )}
        </PageMain>
    );
}
