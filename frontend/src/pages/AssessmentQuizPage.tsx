// SPDX-License-Identifier: EUPL-1.2
// SPDX-FileCopyrightText: 2026 LitterBox-Web contributors

import { useRef, useState, type ComponentProps } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router';
import {
    AssessmentApiError,
    fetchAssessment,
    fetchAssessmentCode,
    startAssessmentAttempt,
    submitAssessmentAnswer,
    type AssessmentAnswerVerdict,
    type AssessmentLearnerQuestion,
    type AssessmentLearnerView,
} from '../api/assessments';
import type { AssessmentLimits } from '../api/capabilities';
import type { ExportTargets } from '../api/exports';
import { PageMain } from '../components/Page';
import { ErrorState, LoadingState } from '../components/States';
import { AssessmentCapabilityGate } from '../components/questions/AssessmentCapabilityGate';
import { LearnerQuiz } from '../components/questions/LearnerQuiz';
import {
    QuizAttemptsExhaustedError,
    QuizClosedError,
    type QuizVerdict,
    type SubmitQuizAnswer,
} from '../components/questions/quiz-answer';
import type { QuizQuestion } from '../components/questions/quiz-question';
import type { CapabilityState } from '../lib/capabilities';
import { assessmentLimits, capabilityEnabled } from '../lib/features';
import {
    forgetQuizAttempt,
    rememberQuizAnswer,
    rememberQuizAttempt,
    storedQuizAttempt,
} from '../lib/quiz-attempts';
import { useAsync } from '../lib/useAsync';

const toQuizQuestion = (question: AssessmentLearnerQuestion): QuizQuestion => ({
    questionId: question.questionId,
    question: question.questionText,
    options: question.options,
    questionType: question.questionType ?? 'FREE_TEXT',
    typeDeclared: question.questionType !== null,
    sprite: question.sprite ?? undefined,
    scratchBlocks: question.scratchBlocks ?? undefined,
    hint: question.hint ?? undefined,
    programDimension: question.programDimension ?? undefined,
    scopeOfFocus: question.scopeOfFocus ?? undefined,
    expectedAnswers: question.expectedAnswers ?? 1,
});

const isStaleAttempt = (error: unknown): boolean =>
    error instanceof AssessmentApiError && error.category === 'not_found';

const loadQuizCode = async (publicToken: string): Promise<ExportTargets | undefined> => {
    try {
        return await fetchAssessmentCode(publicToken);
    } catch (error) {
        if (
            error instanceof AssessmentApiError &&
            (error.category === 'not_found' || error.category === 'gone')
        )
            return undefined;
        throw error;
    }
};

const asQuizError = (error: unknown): unknown => {
    if (!(error instanceof AssessmentApiError)) return error;
    if (error.category === 'exhausted') return new QuizAttemptsExhaustedError();
    if (error.category === 'gone') return new QuizClosedError();
    return error;
};

function useAttemptSubmitter(
    publicToken: string,
    limits: AssessmentLimits,
): { submitAnswer: SubmitQuizAnswer; restartCount: number } {
    const resumed = useState<Promise<string> | undefined>(() => {
        const resumable = storedQuizAttempt(publicToken)?.attemptId;
        return resumable === undefined ? undefined : Promise.resolve(resumable);
    })[0];
    const attempt = useRef(resumed);
    const [restartCount, setRestartCount] = useState(0);
    const openAttempt = (): Promise<string> =>
        startAssessmentAttempt(publicToken)
            .then((created) => {
                rememberQuizAttempt(publicToken, created.attemptId);
                return created.attemptId;
            })
            .catch((error: unknown) => {
                throw asQuizError(error);
            });
    const ensureAttempt = (): Promise<string> => {
        attempt.current ??= openAttempt().catch((error: unknown) => {
            attempt.current = undefined;
            throw error;
        });
        return attempt.current;
    };
    const submitAnswer: SubmitQuizAnswer = async (questionId, answer, signal) => {
        let attemptId = await ensureAttempt();
        const send = () =>
            submitAssessmentAnswer(
                publicToken,
                attemptId,
                { questionId, answer },
                limits,
                signal,
            ).catch((error: unknown) => {
                throw asQuizError(error);
            });
        let verdict: AssessmentAnswerVerdict;
        let restarted = false;
        try {
            verdict = await send();
        } catch (error) {
            if (!isStaleAttempt(error)) throw error;
            forgetQuizAttempt(publicToken);
            attempt.current = undefined;
            attemptId = await ensureAttempt();
            verdict = await send();
            restarted = true;
        }
        const outcome =
            verdict.correct === null
                ? undefined
                : { correct: verdict.correct, correctAnswers: verdict.correctAnswers };
        rememberQuizAnswer(publicToken, attemptId, questionId, outcome);
        if (restarted) setRestartCount((count) => count + 1);
        return outcome;
    };
    return { submitAnswer, restartCount };
}

function AssessmentQuizContent({
    token,
    view,
    codeAvailable,
    limits,
}: {
    token: string;
    view: AssessmentLearnerView;
    codeAvailable: boolean;
    limits: AssessmentLimits;
}) {
    const { t } = useTranslation();
    const { submitAnswer, restartCount } = useAttemptSubmitter(token, limits);
    const questions = view.questions.map(toQuizQuestion);
    return (
        <>
            <section className="hero" aria-labelledby="assessment-quiz-heading">
                <h1 id="assessment-quiz-heading">{view.title}</h1>
                {view.instructions.trim() && <p className="lead">{view.instructions}</p>}
            </section>
            {restartCount > 0 && (
                <p className="hint" role="status">
                    {t('assessmentQuizAttemptRestarted')}
                </p>
            )}
            <AttemptQuiz
                key={restartCount}
                token={token}
                questions={questions}
                locale={view.locale}
                submitAnswer={submitAnswer}
                heading={t('assessmentQuizQuestionsTitle')}
                lead={t('assessmentQuizQuestionsLead')}
                maxAnswerLength={limits.maxAnswerLength}
                loadProjectCode={codeAvailable ? () => loadQuizCode(token) : undefined}
            />
        </>
    );
}

function AttemptQuiz({
    token,
    ...quiz
}: { token: string } & Omit<ComponentProps<typeof LearnerQuiz>, 'initialAnswers'>) {
    const [initialAnswers] = useState<Record<string, QuizVerdict | undefined>>(() =>
        Object.fromEntries(
            (storedQuizAttempt(token)?.answers ?? []).map((answer) => [
                answer.questionId,
                answer.verdict ?? undefined,
            ]),
        ),
    );
    return <LearnerQuiz {...quiz} initialAnswers={initialAnswers} />;
}

function AssessmentQuizLoader({
    token,
    codeAvailable,
    limits,
}: {
    token: string;
    codeAvailable: boolean;
    limits: AssessmentLimits;
}) {
    const { t } = useTranslation();
    const { state, reload } = useAsync<AssessmentLearnerView, unknown>(
        (signal) => fetchAssessment(token, limits, signal),
        [token, limits],
        { toError: (reason) => reason },
    );

    if (state.status === 'loading' || state.status === 'idle')
        return (
            <PageMain>
                <LoadingState
                    heading={t('assessmentQuizTitle')}
                    message={t('assessmentQuizLoading')}
                    level={1}
                />
            </PageMain>
        );

    if (state.status === 'error') {
        const notFound =
            state.error instanceof AssessmentApiError &&
            (state.error.category === 'not_found' || state.error.category === 'validation');
        const gone = state.error instanceof AssessmentApiError && state.error.category === 'gone';
        return (
            <PageMain>
                <ErrorState
                    heading={t('assessmentQuizTitle')}
                    message={
                        gone
                            ? t('assessmentQuizGoneBody')
                            : notFound
                              ? t('assessmentQuizNotFoundBody')
                              : t('statusError')
                    }
                    retryLabel={gone || notFound ? undefined : t('retry')}
                    onRetry={gone || notFound ? undefined : reload}
                    level={1}
                />
            </PageMain>
        );
    }

    return (
        <PageMain className="questions-page questions-result-page">
            <AssessmentQuizContent
                token={token}
                view={state.value}
                codeAvailable={codeAvailable}
                limits={limits}
            />
        </PageMain>
    );
}

export function AssessmentQuizPage({
    capabilityState,
    onCapabilityRetry,
}: {
    capabilityState: CapabilityState;
    onCapabilityRetry: () => void;
}) {
    const { t } = useTranslation();
    const { token = '' } = useParams();
    const codeAvailable = capabilityEnabled(capabilityState, 'program-export');

    return (
        <AssessmentCapabilityGate
            capabilityState={capabilityState}
            onCapabilityRetry={onCapabilityRetry}
            heading={t('assessmentQuizTitle')}
        >
            <AssessmentQuizLoader
                token={token}
                codeAvailable={codeAvailable}
                limits={assessmentLimits(capabilityState)}
            />
        </AssessmentCapabilityGate>
    );
}
