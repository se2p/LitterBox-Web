// SPDX-License-Identifier: EUPL-1.2
// SPDX-FileCopyrightText: 2026 LitterBox-Web contributors

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { deleteAssessment, updateAssessment, type AssessmentState } from '../../api/assessments';
import { formatDateTime } from '../../i18n';
import { forgetPublishedQuiz } from '../../lib/published-quizzes';
import { Alert } from '../Alert';
import { Dialog } from '../Dialog';

export function QuizLifecycleControls({
    publicToken,
    teacherToken,
    state,
    onChanged,
    onDeleted,
}: {
    publicToken: string;
    teacherToken: string;
    state: AssessmentState;
    onChanged: (state: AssessmentState) => void;
    onDeleted: () => void;
}) {
    const { t } = useTranslation();
    const [busy, setBusy] = useState(false);
    const [failed, setFailed] = useState(false);
    const [confirmDelete, setConfirmDelete] = useState(false);

    const [openedAt] = useState(() => Date.now());

    const open = state.status === 'OPEN';
    const lapsed = !open && new Date(state.expiresAt).getTime() <= openedAt;

    const changeStatus = async () => {
        setBusy(true);
        setFailed(false);
        try {
            onChanged(
                await updateAssessment(publicToken, teacherToken, {
                    status: open ? 'CLOSED' : 'OPEN',
                }),
            );
        } catch {
            setFailed(true);
        } finally {
            setBusy(false);
        }
    };

    const remove = async () => {
        setBusy(true);
        setFailed(false);
        try {
            await deleteAssessment(publicToken, teacherToken);
            forgetPublishedQuiz(publicToken);
            setConfirmDelete(false);
            onDeleted();
        } catch {
            setConfirmDelete(false);
            setFailed(true);
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="quiz-lifecycle">
            <h2 id="quiz-lifecycle-heading">{t('assessmentLifecycleTitle')}</h2>
            <p role="status">
                {open
                    ? t('assessmentLifecycleOpen')
                    : lapsed
                      ? t('assessmentLifecycleLapsed')
                      : t('assessmentLifecycleClosed')}
            </p>
            <p className="hint">
                {lapsed
                    ? t('assessmentLifecycleExpired', { date: formatDateTime(state.expiresAt) })
                    : t('assessmentLifecycleExpires', { date: formatDateTime(state.expiresAt) })}
            </p>
            {failed && (
                <Alert tone="error">
                    <p>{t('assessmentLifecycleError')}</p>
                </Alert>
            )}
            <div className="quiz-lifecycle-actions">
                {!lapsed && (
                    <button
                        type="button"
                        disabled={busy}
                        aria-busy={busy}
                        onClick={() => void changeStatus()}
                    >
                        {open ? t('assessmentLifecycleClose') : t('assessmentLifecycleReopen')}
                    </button>
                )}
                <button
                    type="button"
                    className="button-danger"
                    disabled={busy}
                    onClick={() => setConfirmDelete(true)}
                >
                    {t('assessmentLifecycleDelete')}
                </button>
            </div>
            <Dialog
                open={confirmDelete}
                title={t('assessmentLifecycleDeleteConfirmTitle')}
                closeLabel={t('assessmentLifecycleDeleteConfirmBack')}
                onClose={() => {
                    if (!busy) setConfirmDelete(false);
                }}
            >
                <p>{t('assessmentLifecycleDeleteConfirmBody')}</p>
                <div className="dialog-actions">
                    <button type="button" disabled={busy} onClick={() => setConfirmDelete(false)}>
                        {t('assessmentLifecycleDeleteConfirmBack')}
                    </button>
                    <button
                        type="button"
                        className="button-danger"
                        disabled={busy}
                        aria-busy={busy}
                        onClick={() => void remove()}
                    >
                        {busy ? t('assessmentLifecycleDeleting') : t('assessmentLifecycleDelete')}
                    </button>
                </div>
            </Dialog>
        </div>
    );
}
