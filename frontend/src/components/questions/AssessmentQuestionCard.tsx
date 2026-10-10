// SPDX-License-Identifier: EUPL-1.2
// SPDX-FileCopyrightText: 2026 LitterBox-Web contributors

import { useEffect, useRef, useState, type RefObject } from 'react';
import { useTranslation } from 'react-i18next';
import type { AssessmentLimits } from '../../api/capabilities';
import { RichHint } from '../single-project/RichHint';
import { ScratchblocksPreview } from '../single-project/ScratchblocksPreview';
import { spriteDisplayName } from '../single-project/sprite-name';
import { Disclosure } from '../Disclosure';
import type { DraftLimitBreaches } from './assessment-draft';
import { questionSummaryText } from './question-summary';
import {
    answerLines,
    carriedCorrectAnswers,
    reconcileChoiceAnswers,
    selectedYesNo,
    YES_NO_TOKENS,
} from './correct-answer-rules';
import {
    PROGRAM_DIMENSIONS,
    QUIZ_QUESTION_TYPES,
    SCOPES_OF_FOCUS,
    dimensionKey,
    scopeKey,
    typeKey,
    type ProgramDimension,
    type QuizQuestion,
    type QuizQuestionType,
    type ScopeOfFocus,
} from './quiz-question';

export interface AssessmentQuestionDraft extends QuizQuestion {
    draftId: string;
    source: 'generated' | 'teacher';
    selected: boolean;
    answerGuide: string;
    correctAnswers: string[];
    optionsText?: string;
    acceptedAnswersText?: string;
}

const ROW_LABEL_LENGTH = 56;

function RichTextField({
    label,
    value,
    rows,
    maxLength,
    placeholder,
    tooLong,
    locale,
    onChange,
    inputRef,
}: {
    label: string;
    value: string;
    rows: number;
    maxLength: number;
    placeholder?: string;
    tooLong: boolean;
    locale: string;
    onChange: (value: string) => void;
    inputRef?: RefObject<HTMLTextAreaElement | null>;
}) {
    const { t: ta } = useTranslation('assessment');
    return (
        <div className="form-field assessment-editor-wide">
            <label>
                <span>{label}</span>
                <textarea
                    ref={inputRef}
                    value={value}
                    rows={rows}
                    maxLength={maxLength}
                    placeholder={placeholder}
                    onChange={(event) => onChange(event.target.value)}
                />
            </label>
            <p className="hint">{ta('richHintPreviewHint')}</p>
            {tooLong && <p role="alert">{ta('textTooLong', { limit: maxLength })}</p>}
            {value.trim() && (
                <div className="assessment-preview">
                    <p className="assessment-preview-label">{ta('previewLabel')}</p>
                    <RichHint value={value} locale={locale} />
                </div>
            )}
        </div>
    );
}

export function AssessmentQuestionCard({
    draft,
    number,
    locale,
    limits,
    breaches,
    willFallBackToCustom = false,
    onChange,
    onRemove,
    onRestore,
    onMoveEarlier,
    onMoveLater,
    moveEarlierDisabled = false,
    moveLaterDisabled = false,
    startEditing = false,
}: {
    draft: AssessmentQuestionDraft;
    number?: number;
    locale: string;
    limits: AssessmentLimits;
    breaches: DraftLimitBreaches;
    willFallBackToCustom?: boolean;
    onChange: (change: Partial<AssessmentQuestionDraft>) => void;
    onRemove?: () => void;
    onRestore?: () => void;
    onMoveEarlier?: () => void;
    onMoveLater?: () => void;
    moveEarlierDisabled?: boolean;
    moveLaterDisabled?: boolean;
    startEditing?: boolean;
}) {
    const { t } = useTranslation();
    const { t: ta } = useTranslation('assessment');
    const [expanded, setExpanded] = useState(startEditing);
    const [editing, setEditing] = useState(startEditing);
    const optionsText = draft.optionsText ?? draft.options.join('\n');
    const acceptedText = draft.acceptedAnswersText ?? draft.correctAnswers.join('\n');
    const headingId = `assessment-question-${draft.draftId}`;
    const detailsId = `${headingId}-details`;
    const articleRef = useRef<HTMLElement>(null);
    const questionTextRef = useRef<HTMLTextAreaElement>(null);

    useEffect(() => {
        if (!startEditing) return;
        articleRef.current?.scrollIntoView?.({ block: 'center', behavior: 'smooth' });
        questionTextRef.current?.focus({ preventScroll: true });
        // eslint-disable-next-line react-hooks/exhaustive-deps -- mount-only by design.
    }, []);

    const changeType = (questionType: QuizQuestionType) => {
        const options = questionType === 'MULTIPLE_CHOICE' ? draft.options : [];
        onChange({
            questionType,
            typeDeclared: true,
            ...(questionType === 'MULTIPLE_CHOICE' ? {} : { expectedAnswers: 1, options }),
            correctAnswers: carriedCorrectAnswers(questionType, options, draft.correctAnswers),
            optionsText: undefined,
            acceptedAnswersText: undefined,
        });
    };

    const setCorrectAnswers = (correctAnswers: string[]) => onChange({ correctAnswers });

    const yesNoChoice = selectedYesNo(draft.correctAnswers);
    const yesNoGroup = `${headingId}-correct-yes-no`;

    const sourceLabel = willFallBackToCustom
        ? draft.source === 'generated'
            ? ta('editedGeneratedQuestion')
            : ta('customQuestionFallback')
        : draft.source !== 'generated'
          ? ta('teacherQuestion')
          : ta('generatedQuestion');

    const cellLabel =
        draft.programDimension && draft.scopeOfFocus
            ? t('teacherQuestionsCell', {
                  dimension: t(dimensionKey[draft.programDimension]),
                  scope: t(scopeKey[draft.scopeOfFocus]),
              })
            : ta('noClassification');

    const summary = questionSummaryText(draft.question, locale, ROW_LABEL_LENGTH);

    const limitAlerts = (tooMany: boolean, tooLong: boolean) =>
        [
            tooMany ? ta('tooManyEntries', { limit: limits.maxOptions }) : undefined,
            tooLong ? ta('entryTooLong', { limit: limits.maxOptionLength }) : undefined,
        ]
            .filter((message): message is string => message !== undefined)
            .map((message) => (
                <p key={message} role="alert">
                    {message}
                </p>
            ));

    return (
        <article
            ref={articleRef}
            className={`assessment-question${draft.selected ? ' assessment-question-selected' : ''}`}
            aria-labelledby={headingId}
        >
            <div className="assessment-question-row">
                <h3
                    id={headingId}
                    className={
                        number !== undefined
                            ? 'assessment-question-number'
                            : 'assessment-question-number visually-hidden'
                    }
                    aria-label={number === undefined ? summary : undefined}
                >
                    {number !== undefined && t('quizQuestionNumber', { number })}
                </h3>
                {number !== undefined ? (
                    <input
                        type="checkbox"
                        className="assessment-question-choice"
                        checked={draft.selected}
                        aria-label={ta('includeQuestion', { number })}
                        onChange={(event) => onChange({ selected: event.target.checked })}
                    />
                ) : (
                    <button
                        type="button"
                        className="assessment-question-choice"
                        aria-label={ta('addQuestionToQuiz', { summary })}
                        onClick={() => onChange({ selected: true })}
                    >
                        {ta('addToQuiz')}
                    </button>
                )}
                {number !== undefined && (
                    <div className="assessment-question-move">
                        <button
                            type="button"
                            aria-label={ta('moveQuestionEarlier', { number })}
                            disabled={moveEarlierDisabled}
                            onClick={onMoveEarlier}
                        >
                            <span aria-hidden="true">▲</span>
                        </button>
                        <button
                            type="button"
                            aria-label={ta('moveQuestionLater', { number })}
                            disabled={moveLaterDisabled}
                            onClick={onMoveLater}
                        >
                            <span aria-hidden="true">▼</span>
                        </button>
                    </div>
                )}
                <Disclosure
                    expanded={expanded}
                    controls={detailsId}
                    onClick={() => setExpanded((value) => !value)}
                    className="assessment-question-toggle"
                >
                    <span className="visually-hidden">
                        {number !== undefined
                            ? ta('questionDetailsToggleNumbered', { number })
                            : ta('questionDetailsToggle')}
                    </span>{' '}
                    <span className="assessment-question-summary">{summary}</span>
                </Disclosure>
                <div className="assessment-question-facts">
                    <span className="assessment-question-fact">
                        {t(typeKey[draft.questionType])}
                    </span>
                    <span className="assessment-question-fact">{cellLabel}</span>
                    <span
                        className={`assessment-question-source${willFallBackToCustom ? ' assessment-question-source-fallback' : ''}`}
                    >
                        {sourceLabel}
                    </span>
                </div>
            </div>

            {expanded && (
                <div id={detailsId} className="assessment-question-details">
                    {draft.sprite && (
                        <p className="quiz-sprite">
                            {spriteDisplayName(draft.sprite, t('stageName'))}
                        </p>
                    )}
                    <div className="quiz-question-text">
                        <RichHint value={draft.question} locale={locale} />
                    </div>
                    {draft.scratchBlocks && (
                        <div className="quiz-question-code">
                            <ScratchblocksPreview
                                source={draft.scratchBlocks}
                                locale={locale}
                                label={t('quizCodeContext')}
                            />
                        </div>
                    )}
                    {draft.options.length > 0 && (
                        <ol className="assessment-question-options" type="A">
                            {draft.options.map((option, index) => (
                                <li key={`${index}-${option}`}>
                                    <RichHint value={option} locale={locale} />
                                </li>
                            ))}
                        </ol>
                    )}
                    {draft.hint && (
                        <p className="quiz-hint">
                            <RichHint value={draft.hint} locale={locale} />
                        </p>
                    )}

                    <div className="assessment-question-actions">
                        <button type="button" onClick={() => setEditing((value) => !value)}>
                            {editing
                                ? ta('closeEditor')
                                : number !== undefined
                                  ? ta('editQuestionNumbered', { number })
                                  : ta('editQuestion')}
                        </button>
                        {onRestore && (
                            <button type="button" onClick={onRestore}>
                                {ta('restoreQuestion')}
                            </button>
                        )}
                        {onRemove && (
                            <button type="button" className="button-danger" onClick={onRemove}>
                                {ta('removeQuestion')}
                            </button>
                        )}
                    </div>

                    {editing && (
                        <fieldset className="assessment-question-editor">
                            <legend>
                                {number !== undefined
                                    ? ta('editQuestionNumbered', { number })
                                    : ta('editQuestion')}
                            </legend>
                            <RichTextField
                                label={ta('questionText')}
                                value={draft.question}
                                rows={3}
                                maxLength={limits.maxQuestionTextLength}
                                tooLong={breaches.questionTooLong}
                                locale={locale}
                                onChange={(question) => onChange({ question })}
                                inputRef={questionTextRef}
                            />
                            <label className="form-field">
                                <span>{ta('questionType')}</span>
                                <select
                                    value={draft.questionType}
                                    onChange={(event) =>
                                        changeType(event.target.value as QuizQuestionType)
                                    }
                                >
                                    {QUIZ_QUESTION_TYPES.map((type) => (
                                        <option key={type} value={type}>
                                            {t(typeKey[type])}
                                        </option>
                                    ))}
                                </select>
                            </label>
                            {draft.questionType === 'MULTIPLE_CHOICE' && (
                                <>
                                    <label className="form-field assessment-editor-wide">
                                        <span>{ta('options')}</span>
                                        <textarea
                                            value={optionsText}
                                            rows={Math.max(3, Math.min(8, draft.options.length))}
                                            placeholder={ta('optionsHint')}
                                            onChange={(event) => {
                                                const optionsText = event.target.value;
                                                const options = answerLines(optionsText);
                                                onChange({
                                                    optionsText,
                                                    options,
                                                });
                                            }}
                                            onBlur={() =>
                                                onChange({
                                                    optionsText: undefined,
                                                    ...reconcileChoiceAnswers(draft),
                                                })
                                            }
                                        />
                                    </label>
                                    {limitAlerts(breaches.tooManyOptions, breaches.optionTooLong)}
                                    <fieldset className="form-field assessment-editor-wide assessment-correct-answers">
                                        <legend>{ta('markCorrectAnswers')}</legend>
                                        <p className="hint">{ta('correctAnswersHint')}</p>
                                        {draft.options.length > 0 && (
                                            <ol
                                                className="assessment-correct-answers-list"
                                                type="A"
                                            >
                                                {draft.options.map((option, index) => (
                                                    <li key={`${index}-${option}`}>
                                                        <label className="assessment-correct-answer">
                                                            <input
                                                                type="checkbox"
                                                                checked={draft.correctAnswers.includes(
                                                                    option,
                                                                )}
                                                                onChange={(event) =>
                                                                    setCorrectAnswers(
                                                                        event.target.checked
                                                                            ? [
                                                                                  ...draft.correctAnswers,
                                                                                  option,
                                                                              ]
                                                                            : draft.correctAnswers.filter(
                                                                                  (answer) =>
                                                                                      answer !==
                                                                                      option,
                                                                              ),
                                                                    )
                                                                }
                                                            />
                                                            <span className="assessment-correct-answer-text">
                                                                <RichHint
                                                                    value={option}
                                                                    locale={locale}
                                                                />
                                                            </span>
                                                        </label>
                                                    </li>
                                                ))}
                                            </ol>
                                        )}
                                    </fieldset>
                                    <label className="form-field">
                                        <span>{ta('expectedAnswers')}</span>
                                        {draft.correctAnswers.length > 0 ? (
                                            <span className="assessment-expected-answers-count">
                                                {draft.correctAnswers.length}
                                            </span>
                                        ) : (
                                            <input
                                                type="number"
                                                min={1}
                                                max={Math.max(1, draft.options.length)}
                                                value={draft.expectedAnswers}
                                                onChange={(event) =>
                                                    onChange({
                                                        expectedAnswers: Math.max(
                                                            1,
                                                            Number.parseInt(
                                                                event.target.value,
                                                                10,
                                                            ) || 1,
                                                        ),
                                                    })
                                                }
                                            />
                                        )}
                                    </label>
                                </>
                            )}
                            {draft.questionType === 'YES_NO' && (
                                <fieldset className="form-field assessment-editor-wide assessment-correct-answers">
                                    <legend>{ta('correctAnswerYesNo')}</legend>
                                    <p className="hint">{ta('correctAnswerYesNoHint')}</p>
                                    <ul className="assessment-correct-answers-list">
                                        {YES_NO_TOKENS.map((token) => (
                                            <li key={token}>
                                                <label className="assessment-correct-answer">
                                                    <input
                                                        type="radio"
                                                        name={yesNoGroup}
                                                        checked={yesNoChoice === token}
                                                        onChange={() => setCorrectAnswers([token])}
                                                    />
                                                    <span className="assessment-correct-answer-text">
                                                        {token === 'yes' ? ta('yes') : ta('no')}
                                                    </span>
                                                </label>
                                            </li>
                                        ))}
                                        <li>
                                            <label className="assessment-correct-answer">
                                                <input
                                                    type="radio"
                                                    name={yesNoGroup}
                                                    checked={yesNoChoice === undefined}
                                                    onChange={() => setCorrectAnswers([])}
                                                />
                                                <span className="assessment-correct-answer-text">
                                                    {ta('correctAnswerUnmarked')}
                                                </span>
                                            </label>
                                        </li>
                                    </ul>
                                </fieldset>
                            )}
                            {draft.questionType === 'NUMBER' && (
                                <div className="form-field assessment-correct-answers">
                                    <label>
                                        <span>{ta('correctAnswerNumber')}</span>
                                        <input
                                            type="number"
                                            step="any"
                                            value={draft.correctAnswers[0] ?? ''}
                                            onChange={(event) => {
                                                const value = event.target.value.trim();
                                                setCorrectAnswers(value ? [value] : []);
                                            }}
                                        />
                                    </label>
                                    <p className="hint">{ta('correctAnswerNumberHint')}</p>
                                </div>
                            )}
                            {draft.questionType === 'FREE_TEXT' && (
                                <div className="form-field assessment-editor-wide assessment-correct-answers">
                                    <label>
                                        <span>{ta('correctAnswerFreeText')}</span>
                                        <textarea
                                            value={acceptedText}
                                            rows={Math.max(
                                                3,
                                                Math.min(8, draft.correctAnswers.length),
                                            )}
                                            placeholder={ta('correctAnswerFreeTextPlaceholder')}
                                            onChange={(event) =>
                                                onChange({
                                                    acceptedAnswersText: event.target.value,
                                                    correctAnswers: answerLines(event.target.value),
                                                })
                                            }
                                            onBlur={() =>
                                                onChange({ acceptedAnswersText: undefined })
                                            }
                                        />
                                    </label>
                                    {limitAlerts(
                                        breaches.tooManyAccepted,
                                        breaches.acceptedTooLong,
                                    )}
                                    <p className="hint">{ta('correctAnswerFreeTextHint')}</p>
                                </div>
                            )}
                            <RichTextField
                                label={ta('answerGuide')}
                                value={draft.answerGuide}
                                rows={2}
                                maxLength={limits.maxAnswerGuideLength}
                                placeholder={ta('answerGuideHint')}
                                tooLong={breaches.answerGuideTooLong}
                                locale={locale}
                                onChange={(answerGuide) => onChange({ answerGuide })}
                            />
                            <label className="form-field assessment-editor-wide">
                                <span>{ta('questionHint')}</span>
                                <textarea
                                    value={draft.hint ?? ''}
                                    rows={2}
                                    onChange={(event) =>
                                        onChange({ hint: event.target.value || undefined })
                                    }
                                />
                            </label>
                            <label className="form-field assessment-editor-wide">
                                <span>{ta('codeContext')}</span>
                                <textarea
                                    value={draft.scratchBlocks ?? ''}
                                    rows={4}
                                    onChange={(event) =>
                                        onChange({ scratchBlocks: event.target.value || undefined })
                                    }
                                />
                            </label>
                            <label className="form-field">
                                <span>{ta('programDimension')}</span>
                                <select
                                    value={draft.programDimension ?? ''}
                                    onChange={(event) =>
                                        onChange({
                                            programDimension:
                                                (event.target.value as ProgramDimension) ||
                                                undefined,
                                        })
                                    }
                                >
                                    <option value="">{ta('noClassification')}</option>
                                    {PROGRAM_DIMENSIONS.map((dimension) => (
                                        <option key={dimension} value={dimension}>
                                            {t(dimensionKey[dimension])}
                                        </option>
                                    ))}
                                </select>
                            </label>
                            <label className="form-field">
                                <span>{ta('scopeOfFocus')}</span>
                                <select
                                    value={draft.scopeOfFocus ?? ''}
                                    onChange={(event) =>
                                        onChange({
                                            scopeOfFocus:
                                                (event.target.value as ScopeOfFocus) || undefined,
                                        })
                                    }
                                >
                                    <option value="">{ta('noClassification')}</option>
                                    {SCOPES_OF_FOCUS.map((scope) => (
                                        <option key={scope} value={scope}>
                                            {t(scopeKey[scope])}
                                        </option>
                                    ))}
                                </select>
                            </label>
                        </fieldset>
                    )}
                </div>
            )}
        </article>
    );
}
