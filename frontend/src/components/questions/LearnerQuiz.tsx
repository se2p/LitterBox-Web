// SPDX-License-Identifier: EUPL-1.2
// SPDX-FileCopyrightText: 2026 LitterBox-Web contributors

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { formatNumber } from '../../i18n';
import { QuizCard, type Verdict } from '../single-project/QuizCard';
import { ProjectCode } from './ProjectCode';
import type { QuizQuestion } from './quiz-question';

/**
 * The reader's own way through a generated question set: one question, then what the service said about it, then the
 * next one. One at a time means the reply to the first question arrives before the second is read, which is the only
 * arrangement in which a wrong answer can teach anything.
 *
 * Every card stays mounted and the ones that are not current are `hidden`, which takes them out of the accessibility
 * tree and out of the tab order. That is what makes going back show the answer that was given rather than an empty
 * question, without this component having to own each card's draft.
 */
export function LearnerQuiz({
    questions,
    analysisId,
    token,
    locale,
    showProjectCode = false,
}: {
    questions: QuizQuestion[];
    analysisId: number;
    token: string;
    locale: string;
    /** Whether the deployment can hand back the project's scripts for the reader to look at while answering. */
    showProjectCode?: boolean;
}) {
    const { t } = useTranslation();
    const [current, setCurrent] = useState(0);
    const [summary, setSummary] = useState(false);
    /** Whether the summary has been reached at all, which is what makes going straight back to it meaningful. */
    const [reachedSummary, setReachedSummary] = useState(false);
    /** What came back for each question. A key with `undefined` was recorded without a verdict. */
    const [settled, setSettled] = useState<Record<string, Verdict | undefined>>({});

    const question = questions[current];
    const isSettled = question !== undefined && question.questionId in settled;
    const last = current === questions.length - 1;

    const show = (index: number) => {
        setSummary(false);
        setCurrent(index);
        // The heading, not the card: a reader who has just moved needs to hear where they are before they hear the
        // question again. Deferred because the card it belongs to is only unhidden on this render.
        requestAnimationFrame(() =>
            document.getElementById(`quiz-${questions[index]?.questionId}`)?.focus(),
        );
    };

    const openSummary = () => {
        setReachedSummary(true);
        setSummary(true);
    };

    /** What the review list says about a question, which is exactly what the service said about it and no more. */
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
            <h2 id="questions-results-heading">{t('questionsGeneratedTitle')}</h2>
            <p className="hint">{t('questionsGeneratedLead')}</p>

            {questions.map((one, index) => (
                <div key={one.questionId} hidden={summary || index !== current}>
                    <QuizCard
                        analysisId={analysisId}
                        token={token}
                        question={one}
                        questionNumber={index + 1}
                        questionCount={questions.length}
                        locale={locale}
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
                        {/* Reading a question again is one press from the summary, not as many presses as there
                            are questions left. Only once there is a summary to go back to. */}
                        {reachedSummary && (
                            <button type="button" onClick={openSummary}>
                                {t('quizBackToSummary')}
                            </button>
                        )}
                        {/* Only once this question has been answered: the point of the arrangement is that the
                            reply arrives before the next question does. */}
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

            {/* Under the question and its navigation, where a reader who cannot answer from the question alone
                will look next, and open on whichever question they are on. Hidden rather than unmounted on the
                summary, so a trip through it does not close the code or fetch it again. */}
            {showProjectCode && (
                <div hidden={summary}>
                    <ProjectCode token={token} analysisId={analysisId} locale={locale} />
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
                            {/* Out of the answers that came back with a verdict, not out of everything the
                                analysis generated: the rest were never marked. */}
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
                    {/* How each question went, on the list of them. A row of identical buttons would say only
                        that ten questions had been asked. */}
                    <ol className="learner-quiz-review">
                        {questions.map((one, index) => {
                            const { key, label } = outcome(one);
                            return (
                                <li key={one.questionId} className={`learner-quiz-review-${key}`}>
                                    <button type="button" onClick={() => show(index)}>
                                        <span className="learner-quiz-review-question">
                                            {t('quizReviewQuestion', { number: index + 1 })}
                                        </span>
                                        {/* The mark is a shape as well as a colour, so it survives being
                                            printed, read aloud, or looked at by someone who cannot tell red
                                            from green. */}
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
