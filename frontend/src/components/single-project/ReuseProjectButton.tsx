// SPDX-License-Identifier: EUPL-1.2
// SPDX-FileCopyrightText: 2026 LitterBox-Web contributors

import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { reuseSubmission, SubmissionApiError } from '../../api/submissions';
import { rememberProject, type ReusableKind } from '../../lib/recent-projects';
import { newIdempotencyKey } from '../../lib/project-submission';
import { Alert } from '../Alert';

interface ReuseProjectButtonProps {
    /** The result that names the project; the service still holds the project behind it. */
    token: string;
    /** Which analysis that result was, so the one this makes can point back at it. */
    originKind: ReusableKind;
    /** How the reader knows the project, carried over so the new result is recognisable before it is named. */
    projectName: string;
    analysis: ReusableKind;
    label: string;
    className?: string;
    locale: string;
    onReused: (token: string) => void;
}

/**
 * One press to put a project that has already been analysed through a different analysis. The project is named by
 * the result it produced, so nothing is uploaded a second time and nothing has to be found on disk again.
 */
export function ReuseProjectButton({
    token,
    originKind,
    projectName,
    analysis,
    label,
    className = '',
    locale,
    onReused,
}: ReuseProjectButtonProps) {
    const { t } = useTranslation();
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<'gone' | 'failed'>();
    const controller = useRef<AbortController | undefined>(undefined);
    const idempotencyKey = useRef<string | undefined>(undefined);

    useEffect(
        () => () => {
            controller.current?.abort();
        },
        [],
    );

    const reuse = async () => {
        setBusy(true);
        setError(undefined);
        controller.current?.abort();
        const pending = new AbortController();
        controller.current = pending;
        const key = idempotencyKey.current ?? newIdempotencyKey();
        idempotencyKey.current = key;
        try {
            const accepted = await reuseSubmission(token, analysis, {
                idempotencyKey: key,
                locale,
                signal: pending.signal,
            });
            if (!accepted.token) throw new Error('missing token');
            // Written before the reader arrives, so the new result knows what it was made from and can offer the
            // way back to it; the page itself only ever learns its own name.
            rememberProject({
                token: accepted.token,
                name: projectName,
                kind: analysis,
                origin: { token, kind: originKind },
            });
            onReused(accepted.token);
        } catch (reason) {
            if (pending.signal.aborted) return;
            // The project is kept only as long as its result is; once it is gone, only a fresh upload will do.
            setError(
                reason instanceof SubmissionApiError &&
                    (reason.status === 404 || reason.status === 409 || reason.status === 410)
                    ? 'gone'
                    : 'failed',
            );
        } finally {
            if (!pending.signal.aborted) setBusy(false);
        }
    };

    return (
        <div className={`reuse-project ${className}`.trim()}>
            <button
                type="button"
                className="reuse-project-button"
                onClick={() => void reuse()}
                disabled={busy}
                aria-busy={busy}
            >
                {busy ? t('reuseBusy') : label}
            </button>
            {error && (
                <Alert tone="error">
                    <p>{error === 'gone' ? t('reuseGone') : t('reuseError')}</p>
                </Alert>
            )}
        </div>
    );
}
