// SPDX-License-Identifier: EUPL-1.2
// SPDX-FileCopyrightText: 2026 LitterBox-Web contributors

import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { PROGRAM_DIMENSIONS, SCOPES_OF_FOCUS, dimensionKey, scopeKey } from './quiz-question';
import { sameFilter, type BlockModelFilter } from './use-question-filters';

export function TeacherQuestionCoverage({
    blockModelFilter,
    countFor,
    onChooseFilter,
    onResetFilter,
    shownCount,
    totalCount,
}: {
    blockModelFilter: BlockModelFilter;
    countFor: (filter: BlockModelFilter) => number;
    onChooseFilter: (filter: BlockModelFilter) => void;
    onResetFilter: () => void;
    shownCount: number;
    totalCount: number;
}) {
    const { t } = useTranslation();
    const choice = (filter: BlockModelFilter, label: string, content: ReactNode) => (
        <button
            type="button"
            className="block-model-choice"
            aria-pressed={sameFilter(blockModelFilter, filter)}
            disabled={countFor(filter) === 0}
            onClick={() => onChooseFilter(filter)}
            aria-label={label}
        >
            {content}
        </button>
    );
    return (
        <section
            className="teacher-questions-coverage"
            aria-labelledby="teacher-questions-coverage-heading"
        >
            <h4 id="teacher-questions-coverage-heading">{t('teacherQuestionsCoverage')}</h4>
            <p className="hint">{t('teacherQuestionsAnswerNote')}</p>
            <p className="hint">{t('teacherQuestionsCoverageHint')}</p>
            <div className="block-model-grid-scroll">
                <table className="block-model-grid">
                    <thead>
                        <tr>
                            <td />
                            {SCOPES_OF_FOCUS.map((scope) => {
                                const filter: BlockModelFilter = { kind: 'scope', scope };
                                const count = countFor(filter);
                                return (
                                    <th key={scope} scope="col">
                                        {choice(
                                            filter,
                                            t('teacherQuestionsFilterScope', {
                                                scope: t(scopeKey[scope]),
                                                count,
                                            }),
                                            t(scopeKey[scope]),
                                        )}
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
                                        {choice(
                                            rowFilter,
                                            t('teacherQuestionsFilterDimension', {
                                                dimension: t(dimensionKey[dimension]),
                                                count: rowCount,
                                            }),
                                            t(dimensionKey[dimension]),
                                        )}
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
                                                {choice(
                                                    filter,
                                                    t('teacherQuestionsFilterCell', {
                                                        dimension: t(dimensionKey[dimension]),
                                                        scope: t(scopeKey[scope]),
                                                        count,
                                                    }),
                                                    <span aria-hidden="true">
                                                        {count > 0 ? count : '—'}
                                                    </span>,
                                                )}
                                            </td>
                                        );
                                    })}
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
            <p className="teacher-questions-showing" role="status" aria-live="polite">
                {t('teacherQuestionsShowing', {
                    shown: shownCount,
                    total: totalCount,
                })}{' '}
                {blockModelFilter.kind !== 'all' && (
                    <button
                        type="button"
                        className="teacher-questions-reset"
                        onClick={onResetFilter}
                    >
                        {t('teacherQuestionsFilterAll')}
                    </button>
                )}
            </p>
        </section>
    );
}
