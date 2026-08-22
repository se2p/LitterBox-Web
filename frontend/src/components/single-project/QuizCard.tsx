// SPDX-License-Identifier: EUPL-1.2
// SPDX-FileCopyrightText: 2025 LitterBox-Web contributors

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { sendQuizAnswer, SubmissionApiError } from '../../api/submissions';
import {
    isMultipleSelection,
    joinSelectedAnswers,
    type QuizQuestion,
} from '../questions/quiz-question';
import { RichHint } from './RichHint';
import { ScratchblocksPreview } from './ScratchblocksPreview';
import { spriteDisplayName } from './sprite-name';

interface QuizCardProps {
    analysisId: number;
    token: string;
    question: QuizQuestion;
    questionNumber: number;
    /** How many questions there are, when the card is one of a numbered sequence rather than one of a browsable set. */
    questionCount?: number;
    locale: string;
    /**
     * Called once this card's answer has been taken, with the verdict when the service returned one. A deployment
     * may record an answer without saying whether it was right; that is settled too, and the difference is the
     * caller's to report rather than the card's to hide.
     */
    onSettled?: (questionId: string, verdict?: Verdict) => void;
    /**
     * Naming the sprite is useful when sorting a whole question set, and a giveaway when the question is "which
     * sprite does this script belong to?", so the reader's own card leaves it out.
     */
    showSprite?: boolean;
}

export type Verdict = { correct: boolean; correctAnswers: string[] };

type CardState =
    | { status: 'idle' }
    | { status: 'saving' }
    /** Recorded. The verdict is missing when the deployment answers without one. */
    | { status: 'answered'; verdict?: Verdict }
    | { status: 'error'; errorKey: 'quizError' | 'quizAnswerTooLong' | 'quizAuthorizationError' };

/** Yes and no are typed answers as far as the API is concerned; these are the words the server understands. */
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
    analysisId,
    token,
    question,
    questionNumber,
    questionCount,
    locale,
    onSettled,
    showSprite = false,
}: QuizCardProps) {
    const { t } = useTranslation();
    // Kept as positions, not as strings: a question may offer the same wording twice, and ticking one of them must
    // not tick the other.
    const [selected, setSelected] = useState<number[]>([]);
    const [typed, setTyped] = useState('');
    const [state, setState] = useState<CardState>({ status: 'idle' });

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
    // An answer that has been taken is fixed. Sending it again would ask the service to mark the same question
    // twice, and nothing a reader could do in between would change the verdict.
    const answered = state.status === 'answered';
    const busy = state.status === 'saving';

    const choose = (index: number) => {
        if (answered) return;
        const next = !multiple
            ? [index]
            : selected.includes(index)
              ? selected.filter((value) => value !== index)
              : [...selected, index];
        setSelected(next);
        setState({ status: 'idle' });
    };

    const type = (value: string) => {
        if (answered) return;
        setTyped(value);
        setState({ status: 'idle' });
    };

    const submit = async () => {
        if (!answer || answer.length > 255) {
            setState({
                status: 'error',
                errorKey: answer.length > 255 ? 'quizAnswerTooLong' : 'quizError',
            });
            return;
        }
        setState({ status: 'saving' });
        try {
            const verdict = await sendQuizAnswer(token, analysisId, {
                questionId: question.questionId,
                answer,
            });
            setState({ status: 'answered', verdict });
            onSettled?.(question.questionId, verdict);
        } catch (reason) {
            setState({
                status: 'error',
                errorKey:
                    reason instanceof SubmissionApiError &&
                    (reason.status === 401 || reason.status === 403)
                        ? 'quizAuthorizationError'
                        : 'quizError',
            });
        }
    };

    const headingId = `quiz-${question.questionId}`;
    const answerGroupName = `quiz-answer-${question.questionId}`;
    const verdict = state.status === 'answered' ? state.verdict : undefined;
    // Naming the expected answer only helps once it can no longer be used to answer.
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
                {/* The question is its own heading. All this one has to do is say where the reader is. It takes
                    focus programmatically when a sequence moves, so the move is announced rather than silent. */}
                <h2 id={headingId} className="quiz-question-number" tabIndex={-1}>
                    {questionCount === undefined
                        ? t('quizQuestionNumber', { number: questionNumber })
                        : t('quizQuestionPosition', {
                              number: questionNumber,
                              total: questionCount,
                          })}
                </h2>
                {showSprite && question.sprite && (
                    <p className="quiz-sprite">
                        {spriteDisplayName(question.sprite, t('stageName'))}
                    </p>
                )}
            </header>
            <div className="quiz-question-text">
                <RichHint
                    value={question.question}
                    locale={locale}
                    scratchblocksLabel={t('scratchblocks')}
                    textAlternativeLabel={t('textAlternative')}
                />
            </div>
            {/* Half the questions ask about a particular script; without it they cannot be answered at all. */}
            {question.scratchBlocks && (
                <div className="quiz-question-code">
                    <ScratchblocksPreview
                        source={question.scratchBlocks}
                        locale={locale}
                        label={t('quizCodeContext')}
                        textAlternativeLabel={t('textAlternative')}
                    />
                </div>
            )}
            {question.hint && (
                <p className="quiz-hint">
                    <RichHint
                        value={question.hint}
                        locale={locale}
                        scratchblocksLabel={t('scratchblocks')}
                        textAlternativeLabel={t('textAlternative')}
                    />
                </p>
            )}
            {usesChoices ? (
                <fieldset className="quiz-choice-group">
                    <legend>
                        {multiple
                            ? t('quizChooseSeveral', { count: question.expectedAnswers })
                            : t('quizChoose')}
                    </legend>
                    {/* How many there are decides whether they fit across; the stylesheet cannot count them. */}
                    <div className="quiz-choice-grid" data-choice-count={choices.length}>
                        {choices.map((option, index) => (
                            <label className="quiz-choice-card" key={`${index}-${option}`}>
                                <input
                                    type={multiple ? 'checkbox' : 'radio'}
                                    name={answerGroupName}
                                    value={option}
                                    checked={selected.includes(index)}
                                    disabled={busy || answered}
                                    onChange={() => choose(index)}
                                />
                                <span className="quiz-choice-card-content">
                                    <RichHint
                                        value={option}
                                        locale={locale}
                                        scratchblocksLabel={t('scratchblocks')}
                                        textAlternativeLabel={t('textAlternative')}
                                    />
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
                        maxLength={255}
                        disabled={busy || answered}
                        onChange={(event) => type(event.target.value)}
                    />
                </label>
            )}
            {!answered && (
                <button
                    type="button"
                    className="primary-action"
                    onClick={() => void submit()}
                    disabled={!answer || busy}
                >
                    {busy ? t('quizSaving') : t('quizSubmit')}
                </button>
            )}
            {/* One live region per card, so a reader is told what happened exactly once. */}
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
                                        <RichHint
                                            value={value}
                                            locale={locale}
                                            scratchblocksLabel={t('scratchblocks')}
                                            textAlternativeLabel={t('textAlternative')}
                                        />
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}
                </div>
            )}
            {/* The draft survives a refusal, so the same answer can be sent again once the reason has passed. */}
            {state.status === 'error' && <p role="alert">{t(state.errorKey)}</p>}
        </section>
    );
}
