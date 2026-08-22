// SPDX-License-Identifier: EUPL-1.2
// SPDX-FileCopyrightText: 2026 LitterBox-Web contributors

import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { DiffApiError, fetchDiff } from '../../../api/diffs';
import { Alert } from '../../Alert';
import { Card } from '../../Card';
import {
    emptyReference,
    errorMessageKey,
    toReference,
    type ReferenceInput,
} from '../../../pages/comparison-utils';
import { DiffResult } from './DiffResult';
import { ExpertComparisonForm } from './ExpertComparisonForm';

type RequestState =
    | { status: 'idle' }
    | { status: 'loading' }
    | { status: 'success'; value: Awaited<ReturnType<typeof fetchDiff>> }
    | { status: 'error'; error: DiffApiError };

/**
 * The way in for a reader who has an analysis identifier already and knows what it is for, independent of the
 * project workflow above it: typed references in, a diff out, nothing shared but the page they both sit on.
 */
export function ExpertComparison() {
    const { t } = useTranslation();
    const [before, setBefore] = useState<ReferenceInput>(emptyReference);
    const [after, setAfter] = useState<ReferenceInput>(emptyReference);
    const [validationError, setValidationError] = useState<'before' | 'after' | null>(null);
    const [request, setRequest] = useState<RequestState>({ status: 'idle' });
    const controllerRef = useRef<AbortController | undefined>(undefined);
    const statusHeadingRef = useRef<HTMLHeadingElement>(null);

    useEffect(() => () => controllerRef.current?.abort(), []);

    useEffect(() => {
        if (request.status === 'success' || request.status === 'error') {
            statusHeadingRef.current?.focus({ preventScroll: true });
        }
    }, [request.status]);

    /** Editing either box withdraws the answer to the question it used to be part of. */
    const editReference = (set: (value: ReferenceInput) => void) => (value: ReferenceInput) => {
        set(value);
        setValidationError(null);
        if (request.status !== 'loading') setRequest({ status: 'idle' });
    };

    const run = async () => {
        setRequest({ status: 'idle' });
        setValidationError(null);
        const beforeReference = toReference(before);
        const afterReference = toReference(after);
        if (!beforeReference || !afterReference) {
            setValidationError(beforeReference ? 'after' : 'before');
            setRequest({ status: 'error', error: new DiffApiError('validation') });
            return;
        }
        const controller = new AbortController();
        controllerRef.current = controller;
        setRequest({ status: 'loading' });
        try {
            const value = await fetchDiff(
                { before: beforeReference, after: afterReference },
                controller.signal,
            );
            setRequest({ status: 'success', value });
        } catch (error) {
            setRequest({
                status: 'error',
                error: error instanceof DiffApiError ? error : new DiffApiError('network_failure'),
            });
        } finally {
            if (controllerRef.current === controller) controllerRef.current = undefined;
        }
    };

    return (
        <>
            <ExpertComparisonForm
                before={before}
                after={after}
                validationError={validationError}
                loading={request.status === 'loading'}
                onBeforeChange={editReference(setBefore)}
                onAfterChange={editReference(setAfter)}
                onSwap={() => {
                    setBefore(after);
                    setAfter(before);
                    setValidationError(null);
                    setRequest({ status: 'idle' });
                }}
                onSubmit={(event) => {
                    event.preventDefault();
                    void run();
                }}
                onCancel={() => controllerRef.current?.abort()}
            />
            {request.status === 'error' && (
                <Card className="diff-request-error" aria-labelledby="diff-request-status-heading">
                    <h2 id="diff-request-status-heading" ref={statusHeadingRef} tabIndex={-1}>
                        {t('diffRequestFailed')}
                    </h2>
                    <Alert tone="error">
                        <p>{t(errorMessageKey(request.error))}</p>
                    </Alert>
                    {request.error.category !== 'validation' && (
                        <button type="button" onClick={() => void run()}>
                            {t('retry')}
                        </button>
                    )}
                </Card>
            )}
            {request.status === 'success' && (
                <section aria-labelledby="diff-result-status-heading">
                    <h2
                        id="diff-result-status-heading"
                        ref={statusHeadingRef}
                        tabIndex={-1}
                        className="diff-result-heading"
                    >
                        {t('diffResultTitle')}
                    </h2>
                    <DiffResult value={request.value} />
                </section>
            )}
        </>
    );
}
