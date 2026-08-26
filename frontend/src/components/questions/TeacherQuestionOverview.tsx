// SPDX-License-Identifier: EUPL-1.2
// SPDX-FileCopyrightText: 2026 LitterBox-Web contributors

import { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { TranslationKey } from '../../i18n/locales';
import { QuizCard } from '../single-project/QuizCard';
import {
    PROGRAM_DIMENSIONS,
    QUIZ_QUESTION_TYPES,
    SCOPES_OF_FOCUS,
    blockModelCell,
    type ProgramDimension,
    type QuizQuestion,
    type QuizQuestionType,
    type ScopeOfFocus,
} from './quiz-question';

const dimensionKey: Record<ProgramDimension, TranslationKey> = {
    TEXT: 'programDimensionText',
    EXECUTION: 'programDimensionExecution',
    PURPOSE: 'programDimensionPurpose',
};

const scopeKey: Record<ScopeOfFocus, TranslationKey> = {
    ATOM: 'scopeOfFocusAtom',
    BLOCK: 'scopeOfFocusBlock',
    RELATION: 'scopeOfFocusRelation',
    MACRO: 'scopeOfFocusMacro',
};

const typeKey: Record<QuizQuestionType, TranslationKey> = {
    MULTIPLE_CHOICE: 'questionTypeMultipleChoice',
    YES_NO: 'questionTypeYesNo',
    NUMBER: 'questionTypeNumber',
    FREE_TEXT: 'questionTypeFreeText',
};

/**
 * A question set can be read whole, or through the block model it was drawn from: one dimension across every scope,
 * one scope across every dimension, or the single cell where the two meet. The grid that reports the coverage is
 * also how it is asked for, the way LitterBox's own questions export works.
 */
type BlockModelFilter =
    | { kind: 'all' }
    | { kind: 'dimension'; dimension: ProgramDimension }
    | { kind: 'scope'; scope: ScopeOfFocus }
    | { kind: 'cell'; dimension: ProgramDimension; scope: ScopeOfFocus };

const sameFilter = (left: BlockModelFilter, right: BlockModelFilter): boolean =>
    JSON.stringify(left) === JSON.stringify(right);

const matchesFilter = (question: QuizQuestion, filter: BlockModelFilter): boolean => {
    switch (filter.kind) {
        case 'all':
            return true;
        case 'dimension':
            return question.programDimension === filter.dimension;
        case 'scope':
            return question.scopeOfFocus === filter.scope;
        case 'cell':
            return (
                question.programDimension === filter.dimension &&
                question.scopeOfFocus === filter.scope
            );
    }
};

export function TeacherQuestionOverview({
    questions,
    analysisId,
    token,
    locale,
}: {
    questions: QuizQuestion[];
    analysisId: number;
    token: string;
    locale: string;
}) {
    const { t } = useTranslation();
    const [typeFilter, setTypeFilter] = useState<QuizQuestionType | 'all'>('all');
    const [blockModelFilter, setBlockModelFilter] = useState<BlockModelFilter>({ kind: 'all' });

    // What the grid reports is what a chosen type leaves behind, so a teacher can see where that type actually lands
    // before narrowing to a cell. Narrowing to a cell does not then change the grid under their hand.
    const ofChosenType = useMemo(
        () =>
            questions.filter(
                (question) => typeFilter === 'all' || question.questionType === typeFilter,
            ),
        [questions, typeFilter],
    );

    // Counted on each call rather than through a memoising map: the map was written to while the rows were being
    // drawn, which is a render mutating a value it will still be holding on the next one. The count is a pass over
    // the questions of the chosen type, and there are a few dozen of those.
    const countFor = useCallback(
        (filter: BlockModelFilter): number =>
            ofChosenType.filter((question) => matchesFilter(question, filter)).length,
        [ofChosenType],
    );

    const typeOptions = useMemo(
        () =>
            QUIZ_QUESTION_TYPES.map((type) => ({
                type,
                count: questions.filter((question) => question.questionType === type).length,
            })).filter((option) => option.count > 0),
        [questions],
    );

    // Picking what is already picked is how a reader puts it back, so no filter is a trap.
    const chooseFilter = (filter: BlockModelFilter) =>
        setBlockModelFilter((current) => (sameFilter(current, filter) ? { kind: 'all' } : filter));

    const shown = ofChosenType.filter((question) => matchesFilter(question, blockModelFilter));
    const grouped = useMemo(() => {
        const groups: Array<{ cell: string | undefined; label: string; items: QuizQuestion[] }> =
            [];
        for (const dimension of PROGRAM_DIMENSIONS) {
            for (const scope of SCOPES_OF_FOCUS) {
                const cell = `${dimension}/${scope}`;
                const items = shown.filter((question) => blockModelCell(question) === cell);
                if (items.length === 0) continue;
                groups.push({
                    cell,
                    label: t('teacherQuestionsCell', {
                        dimension: t(dimensionKey[dimension]),
                        scope: t(scopeKey[scope]),
                    }),
                    items,
                });
            }
        }
        const loose = shown.filter((question) => blockModelCell(question) === undefined);
        if (loose.length > 0) {
            groups.push({
                cell: undefined,
                label: t('teacherQuestionsUncategorised'),
                items: loose,
            });
        }
        return groups;
    }, [shown, t]);

    let questionNumber = 0;

    return (
        <>
            <section
                className="teacher-questions-coverage"
                aria-labelledby="teacher-questions-coverage-heading"
            >
                <h2 id="teacher-questions-coverage-heading">{t('teacherQuestionsCoverage')}</h2>
                <p className="hint">{t('teacherQuestionsAnswerNote')}</p>
                <p className="hint">{t('teacherQuestionsCoverageHint')}</p>
                {/* The block model is a grid, so it is shown as one: dimensions down, scopes across. It is also
                    how the set is narrowed, so every heading and every cell is the control for its own slice. */}
                <table className="block-model-grid">
                    <thead>
                        <tr>
                            <td />
                            {SCOPES_OF_FOCUS.map((scope) => {
                                const filter: BlockModelFilter = { kind: 'scope', scope };
                                const count = countFor(filter);
                                return (
                                    <th key={scope} scope="col">
                                        <button
                                            type="button"
                                            className="block-model-choice"
                                            aria-pressed={sameFilter(blockModelFilter, filter)}
                                            disabled={count === 0}
                                            onClick={() => chooseFilter(filter)}
                                            aria-label={t('teacherQuestionsFilterScope', {
                                                scope: t(scopeKey[scope]),
                                                count,
                                            })}
                                        >
                                            {t(scopeKey[scope])}
                                        </button>
                                    </th>
                                );
                            })}
                        </tr>
                    </thead>
                    <tbody>
                        {PROGRAM_DIMENSIONS.map((dimension) => {
                            const rowFilter: BlockModelFilter = { kind: 'dimension', dimension };
                            const rowCount = countFor(rowFilter);
                            return (
                                <tr key={dimension}>
                                    <th scope="row">
                                        <button
                                            type="button"
                                            className="block-model-choice"
                                            aria-pressed={sameFilter(blockModelFilter, rowFilter)}
                                            disabled={rowCount === 0}
                                            onClick={() => chooseFilter(rowFilter)}
                                            aria-label={t('teacherQuestionsFilterDimension', {
                                                dimension: t(dimensionKey[dimension]),
                                                count: rowCount,
                                            })}
                                        >
                                            {t(dimensionKey[dimension])}
                                        </button>
                                    </th>
                                    {SCOPES_OF_FOCUS.map((scope) => {
                                        const filter: BlockModelFilter = {
                                            kind: 'cell',
                                            dimension,
                                            scope,
                                        };
                                        const count = countFor(filter);
                                        return (
                                            <td
                                                key={scope}
                                                className={
                                                    count > 0
                                                        ? 'block-model-covered'
                                                        : 'block-model-empty'
                                                }
                                            >
                                                <button
                                                    type="button"
                                                    className="block-model-choice"
                                                    aria-pressed={sameFilter(
                                                        blockModelFilter,
                                                        filter,
                                                    )}
                                                    disabled={count === 0}
                                                    onClick={() => chooseFilter(filter)}
                                                    aria-label={t('teacherQuestionsFilterCell', {
                                                        dimension: t(dimensionKey[dimension]),
                                                        scope: t(scopeKey[scope]),
                                                        count,
                                                    })}
                                                >
                                                    <span aria-hidden="true">
                                                        {count > 0 ? count : '—'}
                                                    </span>
                                                </button>
                                            </td>
                                        );
                                    })}
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
                <p className="teacher-questions-showing" role="status" aria-live="polite">
                    {t('teacherQuestionsShowing', {
                        shown: shown.length,
                        total: questions.length,
                    })}{' '}
                    {blockModelFilter.kind !== 'all' && (
                        <button
                            type="button"
                            className="teacher-questions-reset"
                            onClick={() => setBlockModelFilter({ kind: 'all' })}
                        >
                            {t('teacherQuestionsFilterAll')}
                        </button>
                    )}
                </p>
            </section>

            {typeOptions.length > 1 && (
                <fieldset className="teacher-questions-filter">
                    <legend>{t('teacherQuestionsNavLabel')}</legend>
                    <div className="issue-choice-row">
                        <label className="issue-choice">
                            <input
                                type="radio"
                                name="teacher-question-type"
                                checked={typeFilter === 'all'}
                                onChange={() => setTypeFilter('all')}
                            />
                            <span className="issue-choice-label">
                                {t('teacherQuestionsCount', { count: questions.length })}
                            </span>
                        </label>
                        {typeOptions.map((option) => (
                            <label className="issue-choice" key={option.type}>
                                <input
                                    type="radio"
                                    name="teacher-question-type"
                                    checked={typeFilter === option.type}
                                    onChange={() => setTypeFilter(option.type)}
                                />
                                <span className="issue-choice-label">
                                    {t(typeKey[option.type])} ({option.count})
                                </span>
                            </label>
                        ))}
                    </div>
                </fieldset>
            )}

            {grouped.length === 0 && (
                <p className="empty-state">{t('teacherQuestionsFilterEmpty')}</p>
            )}

            {grouped.map((group) => (
                <section
                    className="teacher-questions-group"
                    key={group.cell ?? 'uncategorised'}
                    aria-labelledby={`teacher-questions-${group.cell ?? 'uncategorised'}`}
                >
                    <h2 id={`teacher-questions-${group.cell ?? 'uncategorised'}`}>
                        {group.label}{' '}
                        <span className="teacher-questions-group-count">
                            {t('teacherQuestionsCount', { count: group.items.length })}
                        </span>
                    </h2>
                    <div className="questions-list">
                        {group.items.map((question) => {
                            questionNumber += 1;
                            return (
                                <QuizCard
                                    key={question.questionId}
                                    analysisId={analysisId}
                                    token={token}
                                    question={question}
                                    questionNumber={questionNumber}
                                    locale={locale}
                                    showSprite
                                />
                            );
                        })}
                    </div>
                </section>
            ))}
        </>
    );
}
