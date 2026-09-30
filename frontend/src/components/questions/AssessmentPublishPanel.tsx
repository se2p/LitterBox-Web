// SPDX-License-Identifier: EUPL-1.2
// SPDX-FileCopyrightText: 2026 LitterBox-Web contributors

import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { formatDateTime } from '../../i18n';
import { learnerQuizPath, quizResultsPath } from '../../lib/published-quizzes';
import { Dialog } from '../Dialog';
import { ResultLink } from '../single-project/ResultLink';
import type { AssessmentQuestionDraft } from './AssessmentQuestionCard';
import type { UseAssessmentPublishResult } from './use-assessment-publish';

export function AssessmentPublishPanel({
    publish,
    questionNumber,
}: {
    publish: UseAssessmentPublishResult;
    questionNumber: (draft: AssessmentQuestionDraft) => number | undefined;
}) {
    const { t } = useTranslation();
    const { t: ta } = useTranslation('assessment');
    const { publishState, fallbackSelected, remembered } = publish;
    return (
        <>
            {publishState.status === 'error' && <p role="alert">{ta('publishError')}</p>}
            <Dialog
                open={publish.confirmFallbackOpen}
                title={ta('publishEditedConfirmTitle')}
                closeLabel={ta('publishEditedConfirmBack')}
                onClose={publish.closeConfirmFallback}
            >
                <p>{ta('publishEditedConfirmIntro', { count: fallbackSelected.length })}</p>
                <ul>
                    {fallbackSelected.map((draft) => (
                        <li key={draft.draftId}>
                            {t('quizQuestionNumber', {
                                number: questionNumber(draft) ?? 0,
                            })}
                        </li>
                    ))}
                </ul>
                <p>{ta('publishEditedConfirmConsequence')}</p>
                <div className="dialog-actions">
                    <button type="button" onClick={publish.closeConfirmFallback}>
                        {ta('publishEditedConfirmBack')}
                    </button>
                    <button
                        type="button"
                        onClick={() => void publish.publish()}
                        disabled={publishState.status === 'publishing'}
                    >
                        {publishState.status === 'publishing'
                            ? ta('publishing')
                            : ta('publishAction')}
                    </button>
                </div>
            </Dialog>
            {publishState.status === 'done' && (
                <div className="assessment-published" role="status">
                    <h4>{ta('publishedHeading')}</h4>
                    <ResultLink
                        path={learnerQuizPath(publishState.publicToken)}
                        label={ta('publishedLearnerLabel')}
                        hint={ta('publishedLearnerHint')}
                    />
                    <ResultLink
                        path={quizResultsPath(publishState.publicToken, publishState.teacherToken)}
                        label={ta('publishedResultsLabel')}
                        hint={ta('publishedResultsHint')}
                    />
                </div>
            )}
            {remembered.length > 0 && (
                <section
                    className="assessment-remembered-quizzes"
                    aria-labelledby="assessment-remembered-quizzes-heading"
                >
                    <h4 id="assessment-remembered-quizzes-heading">
                        {ta('rememberedQuizzesHeading')}
                    </h4>
                    <ul>
                        {remembered.map((quiz) => (
                            <li key={`${quiz.publicToken}-${quiz.at}`}>
                                <span className="assessment-remembered-quiz-title">
                                    {quiz.title}
                                </span>
                                <span className="assessment-remembered-quiz-date">
                                    {ta('rememberedQuizPublished', {
                                        date: formatDateTime(quiz.at),
                                    })}
                                </span>
                                <Link to={`/${learnerQuizPath(quiz.publicToken)}`}>
                                    {ta('rememberedQuizLearnerLink')}
                                </Link>
                                <Link
                                    to={`/${quizResultsPath(quiz.publicToken, quiz.teacherToken)}`}
                                >
                                    {ta('rememberedQuizResultsLink')}
                                </Link>
                            </li>
                        ))}
                    </ul>
                </section>
            )}
        </>
    );
}
