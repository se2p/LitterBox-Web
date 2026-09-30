// SPDX-License-Identifier: EUPL-1.2
// SPDX-FileCopyrightText: 2025 LitterBox-Web contributors

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
    isMultipleSelection,
    joinSelectedAnswers,
    type QuizQuestion,
} from '../questions/quiz-question';
import {
    QuizAnswerAuthorizationError,
    QuizAttemptsExhaustedError,
    QuizClosedError,
    type QuizVerdict,
    type SubmitQuizAnswer,
} from '../questions/quiz-answer';
import { RichHint } from './RichHint';
import { ScratchblocksPreview } from './ScratchblocksPreview';

interface QuizCardProps {
    question: QuizQuestion;
    questionNumber: number;
    questionCount?: number;
    locale: string;
    submitAnswer: SubmitQuizAnswer;
    onSettled?: (questionId: string, verdict?: Verdict) => void;
    resumedAnswer?: { verdict?: Verdict };
    maxAnswerLength?: number;
}

export type Verdict = QuizVerdict;

/** The single-project quiz endpoint's answer limit; assessments pass their own. */
const SINGLE_PROJECT_ANSWER_LENGTH = 255;

type CardState =
    | { status: 'idle' }
    | { status: 'saving' }
    | { status: 'answered'; verdict?: Verdict }
    | {
          status: 'error';
          errorKey:
              | 'quizError'
              | 'quizAnswerTooLong'
              | 'quizAuthorizationError'
              | 'quizAttemptsExhausted'
              | 'quizClosed';
          terminal?: boolean;
      };

const yesNoAnswers = (locale: string): { yes: string; no: string } => {
    switch (locale.toLowerCase().slice(0, 2)) {
        case 'de':
            return { yes: 'ja', no: 'nein' };
        case 'es':
            return { yes: 'sí', no: 'no' };
        case 'nl':
            return { yes: 'ja', no: 'nee' };
        default:
            return { yes: 'yes', no: 'no' };
    }
};

export function QuizCard({
    question,
    questionNumber,
    questionCount,
    locale,
    submitAnswer,
    onSettled,
    resumedAnswer,
    maxAnswerLength = SINGLE_PROJECT_ANSWER_LENGTH,
}: QuizCardProps) {
    const { t } = useTranslation();
    const [selected, setSelected] = useState<number[]>([]);
    const [typed, setTyped] = useState('');
    const [state, setState] = useState<CardState>(() =>
        resumedAnswer ? { status: 'answered', verdict: resumedAnswer.verdict } : { status: 'idle' },
    );

    const multiple = isMultipleSelection(question);
    const yesNo = yesNoAnswers(locale);
    const choices =
        question.questionType === 'YES_NO' && question.options.length === 0
            ? [yesNo.yes, yesNo.no]
            : question.options;
    const usesChoices = choices.length > 0;
    const answerFrom = (indices: number[]): string =>
        joinSelectedAnswers(indices.map((index) => choices[index] ?? ''));
    const answer = usesChoices ? answerFrom(selected) : typed.trim();
    const answered = state.status === 'answered';
    const busy = state.status === 'saving';
    const terminal = state.status === 'error' && state.terminal === true;

    const choose = (index: number) => {
        if (answered || terminal) return;
        const next = !multiple
            ? [index]
            : selected.includes(index)
              ? selected.filter((value) => value !== index)
              : [...selected, index];
        setSelected(next);
        setState({ status: 'idle' });
    };

    const type = (value: string) => {
        if (answered || terminal) return;
        setTyped(value);
        setState({ status: 'idle' });
    };

    const submit = async () => {
        if (!answer || answer.length > maxAnswerLength) {
            setState({
                status: 'error',
                errorKey: answer.length > maxAnswerLength ? 'quizAnswerTooLong' : 'quizError',
            });
            return;
        }
        setState({ status: 'saving' });
        try {
            const verdict = await submitAnswer(question.questionId, answer);
            setState({ status: 'answered', verdict });
            onSettled?.(question.questionId, verdict);
        } catch (reason) {
            if (reason instanceof QuizAttemptsExhaustedError) {
                setState({ status: 'error', errorKey: 'quizAttemptsExhausted', terminal: true });
            } else if (reason instanceof QuizAnswerAuthorizationError) {
                setState({ status: 'error', errorKey: 'quizAuthorizationError' });
            } else if (reason instanceof QuizClosedError) {
                setState({ status: 'error', errorKey: 'quizClosed' });
            } else {
                setState({ status: 'error', errorKey: 'quizError' });
            }
        }
    };

    const headingId = `quiz-${question.questionId}`;
    const answerGroupName = `quiz-answer-${question.questionId}`;
    const verdict = state.status === 'answered' ? state.verdict : undefined;
    const missedAnswers =
        verdict && !verdict.correct
            ? verdict.correctAnswers.filter((value) => value.trim().length > 0)
            : [];

    return (
        <section
            className={`quiz-card card${verdict ? (verdict.correct ? ' quiz-card-correct' : ' quiz-card-incorrect') : ''}`}
            aria-labelledby={headingId}
            aria-busy={busy}
        >
            <header className="quiz-card-header">
                <h2 id={headingId} className="quiz-question-number" tabIndex={-1}>
                    {questionCount === undefined
                        ? t('quizQuestionNumber', { number: questionNumber })
                        : t('quizQuestionPosition', {
                              number: questionNumber,
                              total: questionCount,
                          })}
                </h2>
            </header>
            <div className="quiz-question-text">
                <RichHint value={question.question} locale={locale} />
            </div>
            {question.scratchBlocks && (
                <div className="quiz-question-code">
                    <ScratchblocksPreview
                        source={question.scratchBlocks}
                        locale={locale}
                        label={t('quizCodeContext')}
                    />
                </div>
            )}
            {question.hint && (
                <p className="quiz-hint">
                    <RichHint value={question.hint} locale={locale} />
                </p>
            )}
            {usesChoices ? (
                <fieldset className="quiz-choice-group">
                    <legend>
                        {multiple
                            ? t('quizChooseSeveral', { count: question.expectedAnswers })
                            : t('quizChoose')}
                    </legend>
                    <div className="quiz-choice-grid" data-choice-count={choices.length}>
                        {choices.map((option, index) => (
                            <label className="quiz-choice-card" key={`${index}-${option}`}>
                                <input
                                    type={multiple ? 'checkbox' : 'radio'}
                                    name={answerGroupName}
                                    value={option}
                                    checked={selected.includes(index)}
                                    disabled={busy || answered || terminal}
                                    onChange={() => choose(index)}
                                />
                                <span className="quiz-choice-card-content">
                                    <RichHint value={option} locale={locale} />
                                </span>
                            </label>
                        ))}
                    </div>
                </fieldset>
            ) : (
                <label className="quiz-free-text-label">
                    <span>{t('quizChoose')}</span>
                    <input
                        type={question.questionType === 'NUMBER' ? 'number' : 'text'}
                        inputMode={question.questionType === 'NUMBER' ? 'numeric' : undefined}
                        value={typed}
                        maxLength={maxAnswerLength}
                        disabled={busy || answered || terminal}
                        onChange={(event) => type(event.target.value)}
                    />
                </label>
            )}
            {!answered && !terminal && (
                <button
                    type="button"
                    className="primary-action"
                    onClick={() => void submit()}
                    disabled={!answer || busy}
                >
                    {busy ? t('quizSaving') : t('quizSubmit')}
                </button>
            )}
            {(busy || answered) && (
                <div
                    className={`quiz-feedback${verdict ? ` quiz-verdict-${verdict.correct ? 'correct' : 'incorrect'}` : ''}`}
                    role="status"
                >
                    <p className="quiz-verdict-line">
                        {busy
                            ? t('quizSaving')
                            : verdict
                              ? verdict.correct
                                  ? t('quizCorrect')
                                  : t('quizIncorrect')
                              : t('quizSaved')}
                    </p>
                    {missedAnswers.length > 0 && (
                        <div className="quiz-expected-answer">
                            <p>{t('quizExpectedAnswer')}</p>
                            <ul>
                                {missedAnswers.map((value, index) => (
                                    <li key={`${index}-${value}`}>
                                        <RichHint value={value} locale={locale} />
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}
                </div>
            )}
            {state.status === 'error' && (
                <p role="alert">
                    {state.errorKey === 'quizAnswerTooLong'
                        ? t('quizAnswerTooLong', { count: maxAnswerLength })
                        : t(state.errorKey)}
                </p>
            )}
        </section>
    );
}
