// SPDX-License-Identifier: EUPL-1.2
// SPDX-FileCopyrightText: 2026 LitterBox-Web contributors

import { useTranslation } from 'react-i18next';
import { typeKey, type QuizQuestionType } from './quiz-question';

export function TeacherQuestionTypeFilter({
    typeFilter,
    onChangeTypeFilter,
    typeOptions,
    totalCount,
}: {
    typeFilter: QuizQuestionType | 'all';
    onChangeTypeFilter: (value: QuizQuestionType | 'all') => void;
    typeOptions: Array<{ type: QuizQuestionType; count: number }>;
    totalCount: number;
}) {
    const { t } = useTranslation();
    return (
        <fieldset className="teacher-questions-filter">
            <legend>{t('teacherQuestionsNavLabel')}</legend>
            <div className="issue-choice-row">
                <label className="issue-choice">
                    <input
                        type="radio"
                        name="teacher-question-type"
                        checked={typeFilter === 'all'}
                        onChange={() => onChangeTypeFilter('all')}
                    />
                    <span className="issue-choice-label">
                        {t('teacherQuestionsCount', { count: totalCount })}
                    </span>
                </label>
                {typeOptions.map((option) => (
                    <label className="issue-choice" key={option.type}>
                        <input
                            type="radio"
                            name="teacher-question-type"
                            checked={typeFilter === option.type}
                            onChange={() => onChangeTypeFilter(option.type)}
                        />
                        <span className="issue-choice-label">
                            {t(typeKey[option.type])} ({option.count})
                        </span>
                    </label>
                ))}
            </div>
        </fieldset>
    );
}
