// SPDX-License-Identifier: EUPL-1.2
// SPDX-FileCopyrightText: 2026 LitterBox-Web contributors

import { useCallback, useMemo, useState } from 'react';
import type { TFunction } from 'i18next';
import type { AssessmentQuestionDraft } from './AssessmentQuestionCard';
import {
    PROGRAM_DIMENSIONS,
    QUIZ_QUESTION_TYPES,
    SCOPES_OF_FOCUS,
    blockModelCell,
    dimensionKey,
    scopeKey,
    type ProgramDimension,
    type QuizQuestionType,
    type ScopeOfFocus,
} from './quiz-question';

export type BlockModelFilter =
    | { kind: 'all' }
    | { kind: 'dimension'; dimension: ProgramDimension }
    | { kind: 'scope'; scope: ScopeOfFocus }
    | { kind: 'cell'; dimension: ProgramDimension; scope: ScopeOfFocus };

export const sameFilter = (left: BlockModelFilter, right: BlockModelFilter): boolean =>
    JSON.stringify(left) === JSON.stringify(right);

const matchesFilter = (question: AssessmentQuestionDraft, filter: BlockModelFilter): boolean => {
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

export interface QuestionGroup {
    cell: string | undefined;
    label: string;
    items: AssessmentQuestionDraft[];
}

export interface UseQuestionFiltersResult {
    typeFilter: QuizQuestionType | 'all';
    setTypeFilter: (value: QuizQuestionType | 'all') => void;
    blockModelFilter: BlockModelFilter;
    chooseFilter: (filter: BlockModelFilter) => void;
    clearBlockModelFilter: () => void;
    resetFilters: () => void;
    countFor: (filter: BlockModelFilter) => number;
    typeOptions: Array<{ type: QuizQuestionType; count: number }>;
    shown: AssessmentQuestionDraft[];
    grouped: QuestionGroup[];
}

export function useQuestionFilters(
    drafts: AssessmentQuestionDraft[],
    t: TFunction,
): UseQuestionFiltersResult {
    const [typeFilter, setTypeFilter] = useState<QuizQuestionType | 'all'>('all');
    const [blockModelFilter, setBlockModelFilter] = useState<BlockModelFilter>({ kind: 'all' });

    const ofChosenType = useMemo(
        () =>
            drafts.filter(
                (question) => typeFilter === 'all' || question.questionType === typeFilter,
            ),
        [drafts, typeFilter],
    );

    const countFor = useCallback(
        (filter: BlockModelFilter): number =>
            ofChosenType.filter((question) => matchesFilter(question, filter)).length,
        [ofChosenType],
    );

    const typeOptions = useMemo(
        () =>
            QUIZ_QUESTION_TYPES.map((type) => ({
                type,
                count: drafts.filter((question) => question.questionType === type).length,
            })).filter((option) => option.count > 0),
        [drafts],
    );

    const chooseFilter = (filter: BlockModelFilter) =>
        setBlockModelFilter((current) => (sameFilter(current, filter) ? { kind: 'all' } : filter));

    const clearBlockModelFilter = () => setBlockModelFilter({ kind: 'all' });

    const resetFilters = () => {
        setTypeFilter('all');
        clearBlockModelFilter();
    };

    const shown = useMemo(
        () => ofChosenType.filter((question) => matchesFilter(question, blockModelFilter)),
        [ofChosenType, blockModelFilter],
    );
    const grouped = useMemo(() => {
        const groups: QuestionGroup[] = [];
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

    return {
        typeFilter,
        setTypeFilter,
        blockModelFilter,
        chooseFilter,
        clearBlockModelFilter,
        resetFilters,
        countFor,
        typeOptions,
        shown,
        grouped,
    };
}
