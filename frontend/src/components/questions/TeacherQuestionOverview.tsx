// SPDX-License-Identifier: EUPL-1.2
// SPDX-FileCopyrightText: 2026 LitterBox-Web contributors

import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import '../../styles/pages/assessment.css';
import { AssessmentBuilderPanel } from './AssessmentBuilderPanel';
import { AssessmentQuestionCard, type AssessmentQuestionDraft } from './AssessmentQuestionCard';
import { EmptyState } from '../States';
import { SectionCard, SectionNav } from '../SectionCard';
import { TeacherQuestionCoverage } from './TeacherQuestionCoverage';
import { TeacherQuestionTypeFilter } from './TeacherQuestionTypeFilter';
import { useAssessmentDrafts } from './use-assessment-drafts';
import { readAssessmentDraft, saveAssessmentDraft } from './assessment-draft-store';
import { useAssessmentExport } from './use-assessment-export';
import { useAssessmentPublish } from './use-assessment-publish';
import { useQuestionFilters } from './use-question-filters';
import type { AssessmentLimits } from '../../api/capabilities';
import { blockModelCell, dimensionKey, scopeKey, type QuizQuestion } from './quiz-question';

export function TeacherQuestionOverview({
    questions,
    analysisId,
    token,
    locale,
    projectName,
    assessmentsEnabled,
    limits,
}: {
    questions: QuizQuestion[];
    analysisId: number;
    token: string;
    locale: string;
    projectName: string;
    assessmentsEnabled: boolean;
    limits: AssessmentLimits;
}) {
    const { t } = useTranslation();
    const { t: ta } = useTranslation('assessment');
    const [savedDraft] = useState(() => readAssessmentDraft(token, analysisId));
    const drafts = useAssessmentDrafts(questions, limits, savedDraft?.drafts);
    const filters = useQuestionFilters(drafts.drafts, t);
    const [title, setTitle] = useState(
        () =>
            savedDraft?.title ??
            ta('defaultTitle', { project: projectName || ta('untitledProject') }),
    );
    const [instructions, setInstructions] = useState(savedDraft?.instructions ?? '');
    const [draftSaveFailed, setDraftSaveFailed] = useState(false);
    useEffect(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect -- report localStorage write failures.
        setDraftSaveFailed(
            !saveAssessmentDraft(token, analysisId, { title, instructions, drafts: drafts.drafts }),
        );
    }, [token, analysisId, title, instructions, drafts.drafts]);

    const exportImport = useAssessmentExport({
        token,
        analysisId,
        locale,
        projectName,
        title,
        instructions,
        selected: drafts.selected,
        limits,
        onImport: (result) => {
            setTitle(result.title);
            setInstructions(result.instructions);
            drafts.loadFromImport(result.questions);
            filters.resetFilters();
        },
    });

    const publish = useAssessmentPublish({
        token,
        analysisId,
        locale,
        title,
        instructions,
        selected: drafts.selected,
        limits,
        unmarkedOnPublish: drafts.unmarkedOnPublish,
        publishQuestion: drafts.publishQuestion,
    });

    const exportDisabled =
        drafts.selected.length === 0 ||
        drafts.selectedInvalid ||
        drafts.selectedStructurallyInvalid ||
        title.trim().length === 0;

    const cardHandlers = (draft: AssessmentQuestionDraft) => ({
        onChange: (change: Partial<AssessmentQuestionDraft>) =>
            drafts.updateDraft(draft.draftId, change),
        onRestore:
            draft.source === 'generated' ? () => drafts.restoreDraft(draft.draftId) : undefined,
        onRemove: draft.source === 'teacher' ? () => drafts.removeDraft(draft.draftId) : undefined,
    });

    const bankGroups = filters.grouped
        .map((group) => ({ ...group, items: group.items.filter((draft) => !draft.selected) }))
        .filter((group) => group.items.length > 0);
    const bankShownIds = new Set(
        filters.shown.filter((draft) => !draft.selected).map((draft) => draft.draftId),
    );
    const selectedCellLabels = [
        ...new Map(
            drafts.selected.flatMap((draft) => {
                const cell = blockModelCell(draft);
                if (!cell || !draft.programDimension || !draft.scopeOfFocus) return [];
                return [
                    [
                        cell,
                        t('teacherQuestionsCell', {
                            dimension: t(dimensionKey[draft.programDimension]),
                            scope: t(scopeKey[draft.scopeOfFocus]),
                        }),
                    ] as const,
                ];
            }),
        ).values(),
    ];

    return (
        <>
            <section className="assessment-builder" aria-labelledby="assessment-builder-heading">
                <div className="assessment-builder-heading">
                    <div>
                        <p className="section-eyebrow">{ta('eyebrow')}</p>
                        <h2 id="assessment-builder-heading">{ta('title')}</h2>
                    </div>
                </div>
                <p className="lead">{ta('lead')}</p>
                <p className="hint" role={draftSaveFailed ? 'alert' : undefined}>
                    {ta(draftSaveFailed ? 'draftSaveError' : 'draftSavedOnDevice')}
                </p>
                <p className="visually-hidden" role="status" aria-live="polite">
                    {drafts.announcement}
                </p>
            </section>

            <SectionNav
                label={ta('builderNavLabel')}
                sections={[
                    { id: 'assessment-quiz', title: ta('quizSectionTitle') },
                    { id: 'assessment-bank', title: ta('bankSectionTitle') },
                    { id: 'assessment-publish', title: ta('publishSectionTitle') },
                ]}
            />

            <div className="section-cards">
                <SectionCard
                    id="assessment-quiz"
                    number={1}
                    title={ta('quizSectionTitle')}
                    description={ta('quizSectionDescription')}
                    headingLevel="h3"
                >
                    <p className="assessment-selection-summary" role="status" aria-live="polite">
                        {ta('quizCoverageSummary', {
                            cells: drafts.selectedCells,
                        })}
                    </p>
                    {selectedCellLabels.length > 0 && (
                        <div className="assessment-covered-cells">
                            <span>{ta('quizCoveredCells')}</span>
                            <ul>
                                {selectedCellLabels.map((label) => (
                                    <li key={label}>{label}</li>
                                ))}
                            </ul>
                        </div>
                    )}
                    {drafts.selected.length === 0 ? (
                        <EmptyState>{ta('quizEmpty')}</EmptyState>
                    ) : (
                        <div className="questions-list assessment-question-list">
                            {drafts.selected.map((draft) => (
                                <AssessmentQuestionCard
                                    key={draft.draftId}
                                    draft={draft}
                                    limits={limits}
                                    number={drafts.questionNumber(draft)}
                                    locale={locale}
                                    startEditing={draft.draftId === drafts.newestDraft}
                                    breaches={drafts.limitBreaches(draft)}
                                    willFallBackToCustom={drafts.unmarkedOnPublish(draft)}
                                    {...cardHandlers(draft)}
                                    onMoveEarlier={() => drafts.moveQuestionEarlier(draft.draftId)}
                                    onMoveLater={() => drafts.moveQuestionLater(draft.draftId)}
                                    moveEarlierDisabled={!drafts.canMoveEarlier(draft)}
                                    moveLaterDisabled={!drafts.canMoveLater(draft)}
                                />
                            ))}
                        </div>
                    )}
                    <p className="teacher-questions-add">
                        <button
                            type="button"
                            className="primary-action"
                            onClick={drafts.addQuestion}
                        >
                            {ta('addQuestion')}
                        </button>
                    </p>
                </SectionCard>

                <SectionCard
                    id="assessment-bank"
                    number={2}
                    title={ta('bankSectionTitle')}
                    description={ta('bankSectionDescription')}
                    headingLevel="h3"
                >
                    <p
                        className="assessment-selection-summary assessment-bank-selection-summary"
                        role="status"
                        aria-live="polite"
                    >
                        {ta('bankSelectionSummary', {
                            selected: drafts.selected.length,
                            total: drafts.drafts.length,
                        })}
                    </p>
                    <TeacherQuestionCoverage
                        blockModelFilter={filters.blockModelFilter}
                        countFor={filters.countFor}
                        onChooseFilter={filters.chooseFilter}
                        onResetFilter={filters.clearBlockModelFilter}
                        shownCount={filters.shown.length}
                        totalCount={drafts.drafts.length}
                    />

                    {filters.typeOptions.length > 1 && (
                        <TeacherQuestionTypeFilter
                            typeFilter={filters.typeFilter}
                            onChangeTypeFilter={filters.setTypeFilter}
                            typeOptions={filters.typeOptions}
                            totalCount={drafts.drafts.length}
                        />
                    )}

                    <div className="assessment-selection-actions">
                        <button
                            type="button"
                            onClick={() => drafts.setSelectionFor(bankShownIds, true)}
                        >
                            {ta('selectShown')}
                        </button>
                        <button
                            type="button"
                            onClick={() => drafts.setSelectionFor(bankShownIds, false)}
                        >
                            {ta('deselectShown')}
                        </button>
                    </div>

                    {bankGroups.length === 0 && (
                        <EmptyState>
                            {filters.shown.length === 0
                                ? t('teacherQuestionsFilterEmpty')
                                : ta('bankEmpty')}
                        </EmptyState>
                    )}

                    {bankGroups.map((group) => (
                        <section
                            className="teacher-questions-group"
                            key={group.cell ?? 'uncategorised'}
                            aria-labelledby={`teacher-questions-${group.cell ?? 'uncategorised'}`}
                        >
                            <h4 id={`teacher-questions-${group.cell ?? 'uncategorised'}`}>
                                {group.label}{' '}
                                <span className="teacher-questions-group-count">
                                    {t('teacherQuestionsCount', { count: group.items.length })}
                                </span>
                            </h4>
                            <div className="questions-list assessment-question-list">
                                {group.items.map((draft) => (
                                    <AssessmentQuestionCard
                                        key={draft.draftId}
                                        draft={draft}
                                        limits={limits}
                                        locale={locale}
                                        breaches={drafts.limitBreaches(draft)}
                                        willFallBackToCustom={drafts.unmarkedOnPublish(draft)}
                                        {...cardHandlers(draft)}
                                    />
                                ))}
                            </div>
                        </section>
                    ))}
                </SectionCard>

                <SectionCard
                    id="assessment-publish"
                    number={3}
                    title={ta('publishSectionTitle')}
                    description={ta('publishSectionDescription')}
                    headingLevel="h3"
                >
                    <AssessmentBuilderPanel
                        title={title}
                        onTitleChange={setTitle}
                        instructions={instructions}
                        onInstructionsChange={setInstructions}
                        exportDisabled={exportDisabled}
                        limits={limits}
                        drafts={drafts}
                        exportImport={exportImport}
                        publish={assessmentsEnabled ? publish : undefined}
                    />
                </SectionCard>
            </div>
        </>
    );
}
