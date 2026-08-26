// SPDX-License-Identifier: EUPL-1.2
// SPDX-FileCopyrightText: 2026 LitterBox-Web contributors

import { useEffect, useReducer, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation } from 'react-router';
import type { AnalysisReferenceDto } from '../api/generated';
import {
    cancelSubmission,
    submitFile,
    submitProjectUrl,
    type SubmissionRequestOptions,
} from '../api/submissions';
import { fetchDiff } from '../api/diffs';
import type { CapabilityState } from '../lib/capabilities';
import { Alert } from '../components/Alert';
import { Card } from '../components/Card';
import { ErrorState, LoadingState } from '../components/States';
import { PageMain } from '../components/Page';
import {
    ComparisonProgress,
    ComparisonSideField,
    type ComparisonInputMode,
    type ComparisonSide,
    type ComparisonSideInput,
    type ComparisonSideProgress,
} from '../components/capabilities/diff/ComparisonInputs';
import {
    comparisonReducer,
    initialComparisonState,
    resolvedReference,
    sideIsReady,
    type ProjectRequestState,
} from './comparison-machine';
import { DiffResult } from '../components/capabilities/diff/DiffResult';
import { ExpertComparison } from '../components/capabilities/diff/ExpertComparison';
import { preflightArchive } from '../lib/archive-preflight';
import { preflightMessageKey } from '../lib/archive-preflight-messages';
import { capabilityEnabled } from '../lib/features';
import { analysedProjects } from '../lib/recent-projects';
import { canonicalProjectUrl, localeFrom, newIdempotencyKey } from '../lib/project-submission';
import {
    analysedChoiceFrom,
    choiceKey,
    monitorSubmission,
    ProjectWorkflowError,
    projectErrorFrom,
    projectErrorKey,
    statusMessageKey,
    type AnalysedChoice,
} from './comparison-utils';

interface ComparisonLocationState {
    before?: unknown;
}

const SIDES = ['before', 'after'] as const;

/**
 * Everything a side's in-flight work needs to be found and stopped, held together so releasing a side is one
 * assignment instead of five separate ones that are easy to leave out of step.
 */
interface ComparisonSideRefs {
    sideController: AbortController | undefined;
    preflightController: AbortController | undefined;
    activeToken: string | undefined;
    cancellationController: AbortController | undefined;
    idempotencyKey: string | undefined;
}

const emptySideRefs = (): ComparisonSideRefs => ({
    sideController: undefined,
    preflightController: undefined,
    activeToken: undefined,
    cancellationController: undefined,
    idempotencyKey: undefined,
});

/**
 * Everything this device can compare without uploading anything: whatever result the reader arrived from, and the
 * ones it remembers analysing. Newest first, and the arrival leads, because that is the one being worked on.
 */
const analysedChoicesFor = (arrival?: AnalysedChoice): AnalysedChoice[] => {
    const remembered = analysedProjects().map((project) => ({
        token: project.token,
        analysisId: project.analysisId,
        name: project.name,
        at: project.at,
    }));
    const choices = arrival ? [arrival, ...remembered] : remembered;
    const seen = new Map<string, AnalysedChoice>();
    // The arrival leads and keeps its name, but the device knows when it was last open and the arrival does not.
    choices.forEach((choice) => {
        const key = choiceKey(choice);
        const kept = seen.get(key);
        if (!kept) seen.set(key, choice);
        else if (kept.at === undefined && choice.at !== undefined)
            seen.set(key, { ...kept, at: choice.at });
    });
    return [...seen.values()];
};

function CapabilityUnavailable({
    state,
    onRetry,
}: {
    state: CapabilityState;
    onRetry: () => void;
}) {
    const { t } = useTranslation();
    if (state.status === 'loading')
        return (
            <LoadingState
                heading={t('diffTitle')}
                message={t('diffCapabilitiesLoading')}
                level={1}
            />
        );
    if (state.status === 'error')
        return (
            <ErrorState
                heading={t('diffTitle')}
                message={t('diffCapabilitiesError')}
                retryLabel={t('retry')}
                onRetry={onRetry}
                level={1}
            />
        );
    return (
        <Card aria-labelledby="diff-unavailable-heading">
            <h1 id="diff-unavailable-heading">{t('diffTitle')}</h1>
            <Alert tone="warning">
                <p>{t('diffUnavailable')}</p>
            </Alert>
            <button type="button" onClick={onRetry}>
                {t('retry')}
            </button>
        </Card>
    );
}

export function ComparisonPage({
    capabilityState = { status: 'idle' },
    onCapabilityRetry = () => undefined,
}: {
    capabilityState?: CapabilityState;
    onCapabilityRetry?: () => void;
}) {
    const { t, i18n } = useTranslation();
    const location = useLocation();
    const arrivalState = location.state as ComparisonLocationState | undefined;
    const [arrival] = useState(() => analysedChoiceFrom(arrivalState?.before, t('diffBefore')));
    const [analysedChoices] = useState(() => analysedChoicesFor(arrival));
    const [state, dispatch] = useReducer(comparisonReducer, arrival, initialComparisonState);
    const { inputs: projectInputs, progress: projectProgress, request: projectRequest } = state;
    // The reducer decides what is true; these hold what can only be done, not described. Every asynchronous
    // step reads the current identity off this ref, because a callback closes over the state it started with.
    const current = useRef(state);
    useEffect(() => {
        current.current = state;
    });
    const sideRefs = useRef<Record<ComparisonSide, ComparisonSideRefs>>({
        before: emptySideRefs(),
        after: emptySideRefs(),
    });
    const projectDiffController = useRef<AbortController | undefined>(undefined);
    const projectStatusHeadingRef = useRef<HTMLHeadingElement>(null);

    useEffect(
        () => () => {
            Object.values(sideRefs.current).forEach((refs) => {
                refs.sideController?.abort();
                refs.preflightController?.abort();
                refs.cancellationController?.abort();
            });
            projectDiffController.current?.abort();
        },
        [],
    );

    // The two ways into a comparison end the same way, so they land the reader in the same place.
    useEffect(() => {
        if (projectRequest.status === 'success' || projectRequest.status === 'error') {
            projectStatusHeadingRef.current?.focus({ preventScroll: true });
        }
    }, [projectRequest.status]);

    // Whatever a side was doing stops mattering the moment it is given something else to be.
    const releaseSide = (side: ComparisonSide) => {
        const refs = sideRefs.current[side];
        refs.preflightController?.abort();
        refs.sideController?.abort();
        refs.cancellationController?.abort();
        sideRefs.current[side] = emptySideRefs();
    };

    const chooseMode = (side: ComparisonSide, mode: ComparisonInputMode) => {
        releaseSide(side);
        dispatch({ type: 'choose-mode', side, mode, fallback: analysedChoices[0] });
    };

    const chooseAnalysed = (side: ComparisonSide, choice?: AnalysedChoice) => {
        releaseSide(side);
        dispatch({ type: 'choose-analysed', side, choice });
    };

    const chooseUrl = (side: ComparisonSide, url: string) => {
        releaseSide(side);
        dispatch({ type: 'choose-url', side, url });
    };

    const chooseFile = (side: ComparisonSide, file?: File) => {
        releaseSide(side);
        dispatch({ type: 'choose-file', side, file });
        if (!file) return;
        const controller = new AbortController();
        // The identity the reducer will check this answer against. A file chosen after this one bumps it.
        const inputId = current.current.inputIds[side] + 1;
        sideRefs.current[side].preflightController = controller;
        void preflightArchive(file, controller.signal)
            .then((result) => dispatch({ type: 'preflight-settled', side, inputId, result }))
            .catch(() =>
                dispatch({
                    type: 'preflight-settled',
                    side,
                    inputId,
                    result: { valid: false, reason: 'invalid-archive', entries: 0 },
                }),
            )
            .finally(() => {
                if (sideRefs.current[side].preflightController === controller)
                    sideRefs.current[side].preflightController = undefined;
            });
    };

    const sourceUrl = (side: ComparisonSide): string | undefined =>
        canonicalProjectUrl(projectInputs[side].url);

    const sourceReady = (side: ComparisonSide): boolean =>
        sideIsReady(projectInputs[side], (value) => Boolean(canonicalProjectUrl(value)));

    const startSide = async (
        side: ComparisonSide,
        input: ComparisonSideInput,
        runId: number,
    ): Promise<AnalysisReferenceDto> => {
        const controller = new AbortController();
        sideRefs.current[side].sideController = controller;
        const report = (progress: ComparisonSideProgress) =>
            dispatch({ type: 'side-progress', side, runId, progress });
        report({ status: 'submitting', message: t('submitting') });
        try {
            if (input.mode === 'upload') {
                if (!input.file || input.preflightBusy || !input.preflight?.valid)
                    throw new ProjectWorkflowError('validation');
            } else {
                if (!canonicalProjectUrl(input.url)) throw new ProjectWorkflowError('validation');
            }
            const key = sideRefs.current[side].idempotencyKey ?? newIdempotencyKey();
            sideRefs.current[side].idempotencyKey = key;
            const options: SubmissionRequestOptions = {
                signal: controller.signal,
                idempotencyKey: key,
                locale: localeFrom(i18n.language),
            };
            const accepted =
                input.mode === 'upload'
                    ? await submitFile(input.file as File, options)
                    : await submitProjectUrl(canonicalProjectUrl(input.url) as string, options);
            if (typeof accepted.token !== 'string' || accepted.token.trim().length === 0)
                throw new ProjectWorkflowError('malformed');
            sideRefs.current[side].activeToken = accepted.token;
            report({ status: 'queued', message: t('statusQueued') });
            const reference = await monitorSubmission(
                accepted.token,
                controller.signal,
                (status) => {
                    if (status.toLowerCase() !== 'completed')
                        report({
                            status: status.toLowerCase() === 'queued' ? 'queued' : 'processing',
                            message: t(statusMessageKey(status)),
                        });
                },
            );
            if (runId !== current.current.runId) throw new ProjectWorkflowError('canceled');
            // The reference rides on the progress: a retry of the other side must not analyse this one again.
            report({ status: 'completed', message: t('statusCompleted'), reference });
            return reference;
        } catch (error) {
            const mapped = projectErrorFrom(error, 'submit');
            report({
                status: mapped.category === 'canceled' ? 'cancelled' : 'failed',
                message: t(projectErrorKey(mapped.category)),
            });
            throw mapped;
        } finally {
            if (sideRefs.current[side].sideController === controller)
                sideRefs.current[side].sideController = undefined;
            sideRefs.current[side].activeToken = undefined;
        }
    };

    const runProjectComparison = async () => {
        const runId = current.current.runId;
        const settle = (request: ProjectRequestState) =>
            dispatch({ type: 'run-settled', runId, request });
        if (!capabilityEnabled(capabilityState, 'single-project', 'single')) {
            settle({ status: 'error', category: 'disabled' });
            return;
        }
        if (!sourceReady('before') || !sourceReady('after')) {
            settle({ status: 'error', category: 'validation' });
            return;
        }
        // A side this service already holds, or that an earlier attempt analysed, is not submitted again.
        const references: Record<ComparisonSide, AnalysisReferenceDto | undefined> = {
            before: resolvedReference(projectInputs.before, projectProgress.before),
            after: resolvedReference(projectInputs.after, projectProgress.after),
        };
        const sides: ComparisonSide[] = SIDES.filter((side) => references[side] === undefined);
        dispatch({ type: 'run-started', runId });
        let diffController: AbortController | undefined;
        try {
            const outcomes = await Promise.allSettled(
                sides.map(async (side) => ({
                    side,
                    reference: await startSide(side, projectInputs[side], runId),
                })),
            );
            let failed: ProjectWorkflowError | undefined;
            outcomes.forEach((outcome) => {
                if (outcome.status === 'fulfilled')
                    references[outcome.value.side] = outcome.value.reference;
                else if (!failed) failed = projectErrorFrom(outcome.reason, 'status');
            });
            if (runId !== current.current.runId) return;
            if (failed) {
                settle({ status: 'error', category: failed.category });
                return;
            }
            if (!references.before || !references.after) {
                settle({ status: 'error', category: 'unresolved' });
                return;
            }
            diffController = new AbortController();
            projectDiffController.current = diffController;
            const value = await fetchDiff(
                { before: references.before, after: references.after },
                diffController.signal,
            );
            settle({ status: 'success', value });
        } catch (error) {
            settle({ status: 'error', category: projectErrorFrom(error, 'diff').category });
        } finally {
            // Only this run's own controller: an abandoned run must not disown the one that replaced it.
            if (projectDiffController.current === diffController)
                projectDiffController.current = undefined;
        }
    };

    const cancelProjectComparison = () => {
        Object.values(sideRefs.current).forEach((refs) => refs.sideController?.abort());
        projectDiffController.current?.abort();
        Object.entries(sideRefs.current).forEach(([side, refs]) => {
            const comparisonSide = side as ComparisonSide;
            const token = refs.activeToken;
            if (token) {
                const controller = new AbortController();
                sideRefs.current[comparisonSide].cancellationController = controller;
                void cancelSubmission(token, controller.signal)
                    .catch(() => undefined)
                    .finally(() => {
                        if (sideRefs.current[comparisonSide].cancellationController === controller)
                            sideRefs.current[comparisonSide].cancellationController = undefined;
                    });
            }
        });
        dispatch({ type: 'run-cancelled', message: t('diffErrorCanceled') });
    };

    const projectEnabled = capabilityEnabled(capabilityState, 'single-project', 'single');
    // An empty box is not yet wrong, so it is left alone until something has been typed into it.
    const urlValid = (side: ComparisonSide): boolean =>
        projectInputs[side].url.trim().length === 0 || Boolean(sourceUrl(side));

    const preflightMessage = (side: ComparisonSide): string | undefined => {
        const preflight = projectInputs[side].preflight;
        if (!preflight) return undefined;
        return preflight.valid
            ? t('preflightReady')
            : t(preflightMessageKey(preflight.reason ?? 'invalid-archive'));
    };

    // Read off the reducer rather than a ref: cancelling has to re-enable the form there and then, and a ref
    // that a superseded run clears on its way out changes nothing anybody can see.
    const projectRunning = projectRequest.status === 'loading';
    const canCompareProjects =
        projectEnabled && sourceReady('before') && sourceReady('after') && !projectRunning;
    const projectDisabledReason = !projectEnabled
        ? t('diffProjectCapabilityDisabled')
        : projectInputs.before.preflightBusy || projectInputs.after.preflightBusy
          ? t('diffProjectValidating')
          : !sourceReady('before') || !sourceReady('after')
            ? t('diffProjectUnresolved')
            : t('diffProjectReady');

    if (
        capabilityState.status !== 'ready' ||
        !capabilityState.value.enabledFeatures.includes('semantic-diff')
    ) {
        return (
            <PageMain>
                <CapabilityUnavailable state={capabilityState} onRetry={onCapabilityRetry} />
            </PageMain>
        );
    }

    return (
        <PageMain className="comparison-page">
            <section className="hero comparison-hero" aria-labelledby="diff-title">
                <h1 id="diff-title">{t('diffTitle')}</h1>
                <p className="lead">{t('diffLead')}</p>
            </section>

            <Card className="diff-project-card" aria-labelledby="diff-project-heading">
                <h2 id="diff-project-heading">{t('diffProjectWorkflowTitle')}</h2>
                <p>{t('diffProjectLead')}</p>
                <form
                    onSubmit={(event) => {
                        event.preventDefault();
                        void runProjectComparison();
                    }}
                    noValidate
                >
                    <div className="diff-project-input-grid">
                        {SIDES.map((side) => (
                            <ComparisonSideField
                                key={side}
                                side={side}
                                value={projectInputs[side]}
                                progress={projectProgress[side]}
                                urlValid={urlValid(side)}
                                preflightMessage={preflightMessage(side)}
                                disabled={projectRunning}
                                analysedChoices={analysedChoices}
                                onModeChange={(mode) => chooseMode(side, mode)}
                                onFileChange={(file) => chooseFile(side, file)}
                                onUrlChange={(url) => chooseUrl(side, url)}
                                onAnalysedChange={(choice) => chooseAnalysed(side, choice)}
                                onRetry={() => void runProjectComparison()}
                            />
                        ))}
                    </div>
                    <ComparisonProgress
                        before={projectProgress.before}
                        after={projectProgress.after}
                        disabled={projectRunning}
                        canCompare={canCompareProjects}
                        disabledReason={projectDisabledReason}
                        onSubmit={() => void runProjectComparison()}
                        onCancel={cancelProjectComparison}
                    />
                </form>
            </Card>

            {projectRequest.status === 'error' && (
                <Card className="diff-request-error" aria-labelledby="diff-project-status-heading">
                    <h2
                        id="diff-project-status-heading"
                        ref={projectStatusHeadingRef}
                        tabIndex={-1}
                    >
                        {t('diffProjectRequestFailed')}
                    </h2>
                    <Alert tone="error">
                        <p>{t(projectErrorKey(projectRequest.category))}</p>
                    </Alert>
                    <button type="button" onClick={() => void runProjectComparison()}>
                        {t('retry')}
                    </button>
                </Card>
            )}
            {projectRequest.status === 'success' && (
                <section aria-labelledby="diff-project-result-heading">
                    <h2
                        id="diff-project-result-heading"
                        ref={projectStatusHeadingRef}
                        tabIndex={-1}
                        className="diff-result-heading"
                    >
                        {t('diffResultTitle')}
                    </h2>
                    <DiffResult value={projectRequest.value} />
                </section>
            )}

            <ExpertComparison />
        </PageMain>
    );
}
