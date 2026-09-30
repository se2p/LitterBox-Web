// SPDX-License-Identifier: EUPL-1.2
// SPDX-FileCopyrightText: 2026 LitterBox-Web contributors

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation, useParams } from 'react-router';
import { formatNumber } from '../i18n';
import {
    AssessmentApiError,
    fetchAssessmentResults,
    type AssessmentResults,
    type AssessmentResultsQuestion,
    type AssessmentState,
} from '../api/assessments';
import type { AssessmentLimits } from '../api/capabilities';
import { AssessmentCapabilityGate } from '../components/questions/AssessmentCapabilityGate';
import { QuizLifecycleControls } from '../components/questions/QuizLifecycleControls';
import { safeAssessmentFilename } from '../components/questions/assessment-export';
import { assessmentResultsCsv } from '../components/questions/assessment-results-csv';
import { questionSummaryText } from '../components/questions/question-summary';
import { Card } from '../components/Card';
import { PageMain } from '../components/Page';
import { EmptyState, ErrorState, LoadingState } from '../components/States';
import type { CapabilityState } from '../lib/capabilities';
import { csvBlob } from '../lib/csv';
import { downloadBlob } from '../lib/download-blob';
import { assessmentLimits } from '../lib/features';
import { useAsync } from '../lib/useAsync';
import '../styles/pages/assessment.css';

const MAX_QUESTION_LABEL_LENGTH = 80;

const questionLabel = (text: string, locale: string): string =>
    questionSummaryText(text, locale, MAX_QUESTION_LABEL_LENGTH);

const answerLabel = (answer: string, yes: string, no: string): string =>
    answer === 'yes' ? yes : answer === 'no' ? no : answer;

function AssessmentChoiceBreakdown({
    questions,
    locale,
}: {
    questions: readonly AssessmentResultsQuestion[];
    locale: string;
}) {
    const { t: ta } = useTranslation('assessment');
    const chosen = questions.filter((question) => question.answerTallies.length > 0);
    if (chosen.length === 0) return null;
    return (
        <section className="assessment-choices" aria-labelledby="assessment-choices-heading">
            <h3 id="assessment-choices-heading">{ta('resultsChoicesHeading')}</h3>
            <p className="hint">{ta('resultsChoicesHint')}</p>
            {chosen.map((question) => {
                const busiest = question.answerTallies.reduce(
                    (most, tally) => Math.max(most, tally.count),
                    0,
                );
                return (
                    <div className="assessment-results-table-wrapper" key={question.questionId}>
                        <table className="assessment-results-table assessment-choice-table">
                            <caption>{questionLabel(question.questionText, locale)}</caption>
                            <thead>
                                <tr>
                                    <th scope="col">{ta('resultsChoice')}</th>
                                    <th scope="col">{ta('resultsChosenBy')}</th>
                                </tr>
                            </thead>
                            <tbody>
                                {question.answerTallies.map((tally) => (
                                    <tr key={tally.answer}>
                                        <th scope="row">
                                            {questionLabel(
                                                answerLabel(tally.answer, ta('yes'), ta('no')),
                                                locale,
                                            )}
                                        </th>
                                        <td>
                                            <span className="assessment-tally-count">
                                                {formatNumber(tally.count)}
                                            </span>
                                            <span
                                                className="assessment-tally-bar"
                                                aria-hidden="true"
                                            >
                                                <span
                                                    style={{
                                                        width: `${busiest === 0 ? 0 : (tally.count / busiest) * 100}%`,
                                                    }}
                                                />
                                            </span>
                                        </td>
                                    </tr>
                                ))}
                                <tr>
                                    <th scope="row">{ta('resultsOtherAnswers')}</th>
                                    <td>{formatNumber(question.otherAnswers)}</td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                );
            })}
        </section>
    );
}

function AssessmentScoreDistribution({ value }: { value: AssessmentResults }) {
    const { t: ta } = useTranslation('assessment');
    const { markableQuestions, completedAttempts, partialAttempts, counts } = value.scores;
    return (
        <section className="assessment-scores" aria-labelledby="assessment-scores-heading">
            <h3 id="assessment-scores-heading">{ta('resultsScoresHeading')}</h3>
            {markableQuestions === 0 ? (
                <p className="hint">{ta('resultsScoresUnmarkable')}</p>
            ) : (
                <>
                    <p className="hint">
                        {ta('resultsScoresHint', {
                            count: markableQuestions,
                            formatted: formatNumber(markableQuestions),
                        })}
                    </p>
                    {completedAttempts === 0 ? (
                        <p role="status">{ta('resultsScoresNoneComplete')}</p>
                    ) : (
                        <div className="assessment-results-table-wrapper">
                            <table
                                className="assessment-results-table"
                                aria-labelledby="assessment-scores-heading"
                            >
                                <thead>
                                    <tr>
                                        <th scope="col">{ta('resultsScore')}</th>
                                        <th scope="col">{ta('resultsScoreAttempts')}</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {counts.map((count, score) => (
                                        <tr key={score}>
                                            <th scope="row">
                                                {ta('resultsScoreValue', {
                                                    score: formatNumber(score),
                                                    total: formatNumber(markableQuestions),
                                                })}
                                            </th>
                                            <td>{formatNumber(count)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                    <p className="questions-score-detail">
                        {ta('resultsPartialAttempts', {
                            count: partialAttempts,
                            formatted: formatNumber(partialAttempts),
                        })}
                    </p>
                </>
            )}
        </section>
    );
}

function AssessmentResultsTable({ value, locale }: { value: AssessmentResults; locale: string }) {
    const { t } = useTranslation();
    const { totalAttempts, questions } = value;
    if (totalAttempts === 0) return <EmptyState>{t('assessmentResultsEmpty')}</EmptyState>;
    return (
        <>
            <p className="questions-score-detail" role="status">
                {t('assessmentResultsTotalAttempts', {
                    count: totalAttempts,
                    formatted: formatNumber(totalAttempts),
                })}
            </p>
            {questions.length === 0 ? (
                <EmptyState>{t('assessmentResultsNoQuestions')}</EmptyState>
            ) : (
                <>
                    <div className="assessment-results-table-wrapper">
                        <table className="assessment-results-table">
                            <thead>
                                <tr>
                                    <th scope="col">{t('assessmentResultsQuestion')}</th>
                                    <th scope="col">{t('assessmentResultsAnswered')}</th>
                                    <th scope="col">{t('assessmentResultsCorrect')}</th>
                                    <th scope="col">{t('assessmentResultsIncorrect')}</th>
                                    <th scope="col">{t('assessmentResultsNotMarkable')}</th>
                                </tr>
                            </thead>
                            <tbody>
                                {questions.map((question) => (
                                    <tr key={question.questionId}>
                                        <th scope="row" title={question.questionText}>
                                            {questionLabel(question.questionText, locale)}
                                        </th>
                                        <td>{formatNumber(question.answered)}</td>
                                        <td>{formatNumber(question.correct)}</td>
                                        <td>{formatNumber(question.incorrect)}</td>
                                        <td>{formatNumber(question.notMarkable)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                    <AssessmentScoreDistribution value={value} />
                    <AssessmentChoiceBreakdown questions={questions} locale={locale} />
                </>
            )}
        </>
    );
}

function AssessmentResultsDownload({
    value,
    locale,
}: {
    value: AssessmentResults;
    locale: string;
}) {
    const { t } = useTranslation();
    const { t: ta } = useTranslation('assessment');
    const [failed, setFailed] = useState(false);

    const save = () => {
        const content = assessmentResultsCsv(value, locale, {
            question: t('assessmentResultsQuestion'),
            answered: t('assessmentResultsAnswered'),
            correct: t('assessmentResultsCorrect'),
            incorrect: t('assessmentResultsIncorrect'),
            notMarkable: t('assessmentResultsNotMarkable'),
            otherAnswers: ta('resultsOtherAnswers'),
            tallyAnswer: (position) => ta('resultsCsvChoice', { position }),
            tallyCount: (position) => ta('resultsCsvChosenBy', { position }),
            answerText: (answer) => answerLabel(answer, ta('yes'), ta('no')),
        });
        setFailed(
            !downloadBlob(csvBlob(content), `${safeAssessmentFilename(value.title)}-results.csv`),
        );
    };

    return (
        <>
            <button type="button" className="assessment-results-download" onClick={save}>
                {ta('resultsDownloadCsv')}
            </button>
            {failed && <p role="alert">{ta('resultsDownloadError')}</p>}
        </>
    );
}

function AssessmentResultsLoader({
    publicToken,
    teacherToken,
    limits,
}: {
    publicToken: string;
    teacherToken: string;
    limits: AssessmentLimits;
}) {
    const { t, i18n } = useTranslation();
    const [deleted, setDeleted] = useState(false);
    const [changedState, setChangedState] = useState<AssessmentState>();
    const { state, reload } = useAsync<AssessmentResults, unknown>(
        (signal) => fetchAssessmentResults(publicToken, teacherToken, limits, signal),
        [publicToken, teacherToken, limits],
        { toError: (reason) => reason },
    );

    if (deleted)
        return (
            <PageMain className="questions-page questions-result-page">
                <section className="hero" aria-labelledby="assessment-results-heading">
                    <h1 id="assessment-results-heading">{t('assessmentResultsTitle')}</h1>
                </section>
                <Card aria-labelledby="assessment-results-heading">
                    <p role="status">{t('assessmentLifecycleDeleted')}</p>
                </Card>
            </PageMain>
        );

    if (state.status === 'loading' || state.status === 'idle')
        return (
            <PageMain>
                <LoadingState
                    heading={t('assessmentResultsTitle')}
                    message={t('assessmentResultsLoading')}
                    level={1}
                />
            </PageMain>
        );

    if (state.status === 'error') {
        const invalid =
            state.error instanceof AssessmentApiError &&
            (state.error.category === 'not_found' ||
                state.error.category === 'unauthorized' ||
                state.error.category === 'validation' ||
                state.error.category === 'gone');
        return (
            <PageMain>
                <ErrorState
                    heading={t('assessmentResultsTitle')}
                    message={invalid ? t('assessmentResultsInvalidBody') : t('statusError')}
                    retryLabel={invalid ? undefined : t('retry')}
                    onRetry={invalid ? undefined : reload}
                    level={1}
                />
            </PageMain>
        );
    }

    const initialState: AssessmentState = {
        schemaVersion: state.value.schemaVersion,
        publicToken,
        status: state.value.status,
        expiresAt: state.value.expiresAt,
        totalAttempts: state.value.totalAttempts,
    };

    return (
        <PageMain className="questions-page questions-result-page">
            <section className="hero" aria-labelledby="assessment-results-heading">
                <h1 id="assessment-results-heading">{t('assessmentResultsTitle')}</h1>
                <p className="analysis-project-name">
                    <span>{t('assessmentResultsQuizName')}:</span> {state.value.title}
                </p>
            </section>
            <Card aria-labelledby="assessment-results-heading">
                <p className="hint">{t('assessmentResultsPrivacyNote')}</p>
                <AssessmentResultsTable value={state.value} locale={i18n.language} />
                <div className="assessment-results-actions">
                    <button
                        type="button"
                        className="assessment-results-refresh"
                        onClick={() => {
                            setChangedState(undefined);
                            reload();
                        }}
                    >
                        {t('assessmentResultsRefresh')}
                    </button>
                    {state.value.totalAttempts > 0 && state.value.questions.length > 0 && (
                        <AssessmentResultsDownload value={state.value} locale={i18n.language} />
                    )}
                </div>
            </Card>
            <Card aria-labelledby="quiz-lifecycle-heading">
                <QuizLifecycleControls
                    publicToken={publicToken}
                    teacherToken={teacherToken}
                    state={changedState ?? initialState}
                    onChanged={setChangedState}
                    onDeleted={() => setDeleted(true)}
                />
            </Card>
        </PageMain>
    );
}

export function AssessmentResultsPage({
    capabilityState,
    onCapabilityRetry,
}: {
    capabilityState: CapabilityState;
    onCapabilityRetry: () => void;
}) {
    const { t } = useTranslation();
    const { token = '' } = useParams();
    const location = useLocation();
    // In the fragment rather than the query string: a query string reaches access logs, browser history and
    // `Referer` headers, while a fragment is never sent over the network at all.
    const teacherToken =
        new URLSearchParams(location.hash.replace(/^#/, '')).get('teacherToken')?.trim() ?? '';

    return (
        <AssessmentCapabilityGate
            capabilityState={capabilityState}
            onCapabilityRetry={onCapabilityRetry}
            heading={t('assessmentResultsTitle')}
        >
            {teacherToken.length === 0 ? (
                <PageMain>
                    <ErrorState
                        heading={t('assessmentResultsTitle')}
                        message={t('assessmentResultsInvalidBody')}
                        level={1}
                    />
                </PageMain>
            ) : (
                <AssessmentResultsLoader
                    key={`${token}#${teacherToken}`}
                    publicToken={token}
                    teacherToken={teacherToken}
                    limits={assessmentLimits(capabilityState)}
                />
            )}
        </AssessmentCapabilityGate>
    );
}
