// SPDX-License-Identifier: EUPL-1.2
// SPDX-FileCopyrightText: 2026 LitterBox-Web contributors

import { useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { AssessmentQuestionDraft } from './AssessmentQuestionCard';
import type { AssessmentExportQuestion } from './assessment-export';
import type { AssessmentLimits } from '../../api/capabilities';
import { ASSESSMENT_SHORT_TEXT_LENGTH } from '../../api/assessments';
import {
    draftLimitBreaches,
    generatedDrafts,
    importedDraft,
    publishQuestion as publishQuestionOf,
    structurallyInvalid,
    unmarkedOnPublish as unmarkedOnPublishOf,
    withinLimits,
    type DraftLimitBreaches,
} from './assessment-draft';
import { blockModelCell, type QuizQuestion } from './quiz-question';

export interface UseAssessmentDraftsResult {
    drafts: AssessmentQuestionDraft[];
    selected: AssessmentQuestionDraft[];
    selectedCells: number;
    selectedInvalid: boolean;
    selectedStructurallyInvalid: boolean;
    selectedOverLimit: boolean;
    newestDraft: string | undefined;
    announcement: string | undefined;
    updateDraft: (id: string, change: Partial<AssessmentQuestionDraft>) => void;
    restoreDraft: (id: string) => void;
    removeDraft: (id: string) => void;
    addQuestion: () => void;
    loadFromImport: (questions: AssessmentExportQuestion[]) => void;
    setSelectionFor: (ids: ReadonlySet<string>, selected: boolean) => void;
    unmarkedOnPublish: (draft: AssessmentQuestionDraft) => boolean;
    limitBreaches: (draft: AssessmentQuestionDraft) => DraftLimitBreaches;
    publishQuestion: (draft: AssessmentQuestionDraft) => ReturnType<typeof publishQuestionOf>;
    questionNumber: (draft: AssessmentQuestionDraft) => number | undefined;
    moveQuestionEarlier: (id: string) => void;
    moveQuestionLater: (id: string) => void;
    canMoveEarlier: (draft: AssessmentQuestionDraft) => boolean;
    canMoveLater: (draft: AssessmentQuestionDraft) => boolean;
}

export function useAssessmentDrafts(
    questions: QuizQuestion[],
    limits: AssessmentLimits,
    savedDrafts?: AssessmentQuestionDraft[],
): UseAssessmentDraftsResult {
    const { t } = useTranslation('assessment');
    const initialDrafts = useMemo(() => generatedDrafts(questions), [questions]);
    const originals = useMemo(
        () => new Map(initialDrafts.map((draft) => [draft.draftId, draft])),
        [initialDrafts],
    );
    const originalsByQuestionId = useMemo(
        () =>
            new Map(
                initialDrafts
                    .filter((draft) => draft.source === 'generated')
                    .map((draft) => [draft.questionId, draft]),
            ),
        [initialDrafts],
    );
    const [drafts, setDrafts] = useState<AssessmentQuestionDraft[]>(savedDrafts ?? initialDrafts);
    const [newestDraft, setNewestDraft] = useState<string>();
    const [announcement, setAnnouncement] = useState<string>();
    const customSequence = useRef(0);

    const updateDraft = (id: string, change: Partial<AssessmentQuestionDraft>) =>
        setDrafts((current) =>
            current.map((draft) => (draft.draftId === id ? { ...draft, ...change } : draft)),
        );

    const restoreDraft = (id: string) =>
        setDrafts((current) =>
            current.map((draft) => {
                if (draft.draftId !== id) return draft;
                const original = originals.get(id);
                return original ? { ...original, selected: draft.selected } : draft;
            }),
        );

    const removeDraft = (id: string) =>
        setDrafts((current) => current.filter((candidate) => candidate.draftId !== id));

    const addQuestion = () => {
        let id: string;
        do {
            customSequence.current += 1;
            id = `teacher-${customSequence.current}`;
        } while (drafts.some((draft) => draft.draftId === id));
        setDrafts((current) => [
            ...current,
            {
                draftId: id,
                questionId: id,
                source: 'teacher',
                selected: true,
                question: t('newQuestionText'),
                options: [],
                questionType: 'FREE_TEXT',
                typeDeclared: true,
                expectedAnswers: 1,
                answerGuide: '',
                correctAnswers: [],
            },
        ]);
        setNewestDraft(id);
        setAnnouncement(t('questionAdded', { number: selected.length + 1 }));
    };

    const loadFromImport = (questions: AssessmentExportQuestion[]) => {
        const imported = questions.map((question, index) =>
            importedDraft(question, index, originalsByQuestionId),
        );
        const reservedIds = new Set(imported.map((draft) => draft.draftId));
        const importedIds = new Set<string>();
        for (const draft of imported) {
            const base = draft.draftId;
            if (importedIds.has(base)) {
                let suffix = 2;
                do {
                    const ending = `-${suffix++}`;
                    draft.draftId = `${base.slice(0, ASSESSMENT_SHORT_TEXT_LENGTH - ending.length)}${ending}`;
                } while (reservedIds.has(draft.draftId) || importedIds.has(draft.draftId));
            }
            importedIds.add(draft.draftId);
        }
        setDrafts((current) => [
            ...imported,
            ...current
                .filter((draft) => !importedIds.has(draft.draftId))
                .map((draft) => ({ ...draft, selected: false })),
        ]);
        setNewestDraft(undefined);
    };

    const setSelectionFor = (ids: ReadonlySet<string>, selected: boolean) =>
        setDrafts((current) =>
            current.map((draft) => (ids.has(draft.draftId) ? { ...draft, selected } : draft)),
        );

    const selected = drafts.filter((draft) => draft.selected);
    const selectedCells = new Set(selected.map(blockModelCell).filter(Boolean)).size;
    const selectedInvalid = selected.some((draft) => draft.question.trim().length === 0);
    const selectedStructurallyInvalid = selected.some(structurallyInvalid);
    const selectedOverLimit = selected.some((draft) => !withinLimits(draft, limits, originals));

    const swapSelected = (id: string, step: -1 | 1) =>
        setDrafts((current) => {
            const index = current.findIndex((draft) => draft.draftId === id);
            if (index === -1 || !current[index]!.selected) return current;
            let neighbour = index + step;
            while (neighbour >= 0 && neighbour < current.length && !current[neighbour]!.selected) {
                neighbour += step;
            }
            if (neighbour < 0 || neighbour >= current.length) return current;
            const next = [...current];
            [next[index], next[neighbour]] = [next[neighbour]!, next[index]!];
            return next;
        });

    const moveQuestionEarlier = (id: string) => {
        const index = selected.findIndex((draft) => draft.draftId === id);
        if (index <= 0) return;
        swapSelected(id, -1);
        setAnnouncement(t('questionMovedEarlier', { number: index }));
    };

    const moveQuestionLater = (id: string) => {
        const index = selected.findIndex((draft) => draft.draftId === id);
        if (index === -1 || index >= selected.length - 1) return;
        swapSelected(id, 1);
        setAnnouncement(t('questionMovedLater', { number: index + 2 }));
    };

    const selectedIndex = new Map(selected.map((draft, index) => [draft.draftId, index]));
    const positionOf = (draft: AssessmentQuestionDraft): number | undefined =>
        draft.selected ? selectedIndex.get(draft.draftId) : undefined;

    const canMoveEarlier = (draft: AssessmentQuestionDraft): boolean =>
        (positionOf(draft) ?? 0) > 0;

    const canMoveLater = (draft: AssessmentQuestionDraft): boolean => {
        const index = positionOf(draft);
        return index !== undefined && index < selected.length - 1;
    };

    return {
        drafts,
        selected,
        selectedCells,
        selectedInvalid,
        selectedStructurallyInvalid,
        selectedOverLimit,
        newestDraft,
        announcement,
        updateDraft,
        restoreDraft,
        removeDraft,
        addQuestion,
        loadFromImport,
        setSelectionFor,
        unmarkedOnPublish: (draft) => unmarkedOnPublishOf(draft, originals),
        limitBreaches: (draft) => draftLimitBreaches(draft, limits, originals),
        publishQuestion: (draft) => publishQuestionOf(draft, originals),
        questionNumber: (draft) => {
            const index = positionOf(draft);
            return index === undefined ? undefined : index + 1;
        },
        moveQuestionEarlier,
        moveQuestionLater,
        canMoveEarlier,
        canMoveLater,
    };
}
