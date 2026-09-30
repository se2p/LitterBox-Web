// SPDX-License-Identifier: EUPL-1.2
// SPDX-FileCopyrightText: 2026 LitterBox-Web contributors

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { formatNumber } from '../../i18n';
import { QuizCard, type Verdict } from '../single-project/QuizCard';
import { ProjectCode, type LoadProjectCode } from './ProjectCode';
import type { SubmitQuizAnswer } from './quiz-answer';
import type { QuizQuestion } from './quiz-question';

export function LearnerQuiz({
    questions,
    locale,
    submitAnswer,
    loadProjectCode,
    initialAnswers,
    heading,
    lead,
    maxAnswerLength,
}: {
    questions: QuizQuestion[];
    locale: string;
    submitAnswer: SubmitQuizAnswer;
    loadProjectCode?: LoadProjectCode;
    initialAnswers?: Record<string, Verdict | undefined>;
    maxAnswerLength?: number;
    heading?: string;
    lead?: string;
}) {
    const { t } = useTranslation();
    const [current, setCurrent] = useState(0);
    const [summary, setSummary] = useState(false);
    const [reachedSummary, setReachedSummary] = useState(false);
    const [settled, setSettled] = useState<Record<string, Verdict | undefined>>(
        () => initialAnswers ?? {},
    );

    const question = questions[current];
    const isSettled = question !== undefined && question.questionId in settled;
    const last = current === questions.length - 1;

    const show = (index: number) => {
        setSummary(false);
        setCurrent(index);
        requestAnimationFrame(() =>
            document.getElementById(`quiz-${questions[index]?.questionId}`)?.focus(),
        );
    };

    const openSummary = () => {
        setReachedSummary(true);
        setSummary(true);
    };

    const outcome = (
        one: QuizQuestion,
    ): { key: 'correct' | 'incorrect' | 'recorded' | 'unanswered'; label: string } => {
        if (!(one.questionId in settled))
            return { key: 'unanswered', label: t('quizReviewUnanswered') };
        const verdict = settled[one.questionId];
        if (verdict === undefined) return { key: 'recorded', label: t('quizSaved') };
        return verdict.correct
            ? { key: 'correct', label: t('quizCorrect') }
            : { key: 'incorrect', label: t('quizIncorrect') };
    };

    const verdicts = questions.filter(
        (one) => one.questionId in settled && settled[one.questionId] !== undefined,
    );
    const correct = verdicts.filter((one) => settled[one.questionId]?.correct);
    const recordedOnly = questions.filter(
        (one) => one.questionId in settled && settled[one.questionId] === undefined,
    );

    return (
        <section
            className="questions-results learner-quiz"
            aria-labelledby="questions-results-heading"
        >
            <h2 id="questions-results-heading">{heading ?? t('questionsGeneratedTitle')}</h2>
            <p className="hint">{lead ?? t('questionsGeneratedLead')}</p>

            {questions.map((one, index) => (
                <div key={one.questionId} hidden={summary || index !== current}>
                    <QuizCard
                        question={one}
                        questionNumber={index + 1}
                        questionCount={questions.length}
                        locale={locale}
                        submitAnswer={submitAnswer}
                        maxAnswerLength={maxAnswerLength}
                        resumedAnswer={
                            initialAnswers && one.questionId in initialAnswers
                                ? { verdict: initialAnswers[one.questionId] }
                                : undefined
                        }
                        onSettled={(questionId, verdict) =>
                            setSettled((known) => ({ ...known, [questionId]: verdict }))
                        }
                    />
                </div>
            ))}

            {!summary && (
                <div className="learner-quiz-navigation">
                    <button
                        type="button"
                        onClick={() => show(current - 1)}
                        disabled={current === 0}
                    >
                        {t('quizPreviousQuestion')}
                    </button>
                    <div className="learner-quiz-forward">
                        {reachedSummary && (
                            <button type="button" onClick={openSummary}>
                                {t('quizBackToSummary')}
                            </button>
                        )}
                        <button
                            type="button"
                            className="primary-action"
                            onClick={() => (last ? openSummary() : show(current + 1))}
                            disabled={!isSettled}
                        >
                            {last ? t('quizSeeSummary') : t('quizNextQuestion')}
                        </button>
                    </div>
                </div>
            )}

            {loadProjectCode && (
                <div hidden={summary}>
                    <ProjectCode loadCode={loadProjectCode} locale={locale} />
                </div>
            )}

            {summary && (
                <div className="questions-score" role="status">
                    <h3>{t('quizYourScore')}</h3>
                    {verdicts.length > 0 ? (
                        <>
                            <p className="questions-score-value">
                                {formatNumber(correct.length)}/{formatNumber(verdicts.length)}
                            </p>
                            <p className="questions-score-detail">
                                {t('quizScoreSummary', {
                                    correct: formatNumber(correct.length),
                                    total: formatNumber(verdicts.length),
                                })}
                            </p>
                        </>
                    ) : (
                        <p className="questions-score-detail">{t('quizRecorded')}</p>
                    )}
                    {recordedOnly.length > 0 && (
                        <p className="questions-score-detail">
                            {t('quizRecordedWithoutVerdict', {
                                count: recordedOnly.length,
                                formatted: formatNumber(recordedOnly.length),
                            })}
                        </p>
                    )}
                    <ol className="learner-quiz-review">
                        {questions.map((one, index) => {
                            const { key, label } = outcome(one);
                            return (
                                <li key={one.questionId} className={`learner-quiz-review-${key}`}>
                                    <button type="button" onClick={() => show(index)}>
                                        <span className="learner-quiz-review-question">
                                            {t('quizReviewQuestion', { number: index + 1 })}
                                        </span>
                                        <span
                                            className="learner-quiz-review-mark"
                                            aria-hidden="true"
                                        >
                                            {key === 'correct'
                                                ? '✓'
                                                : key === 'incorrect'
                                                  ? '✗'
                                                  : '·'}
                                        </span>
                                        <span className="learner-quiz-review-outcome">{label}</span>
                                    </button>
                                </li>
                            );
                        })}
                    </ol>
                </div>
            )}
        </section>
    );
}
