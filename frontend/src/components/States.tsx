// SPDX-License-Identifier: EUPL-1.2
// SPDX-FileCopyrightText: 2025 LitterBox-Web contributors
import type { ReactNode } from 'react';
import { Alert } from './Alert';
import { Card } from './Card';

type HeadingLevel = 1 | 2 | 3;

interface StateHeadingProps {
    heading: ReactNode;
    level?: HeadingLevel;
}

function StateHeading({ heading, level = 2 }: StateHeadingProps) {
    if (level === 1) return <h1>{heading}</h1>;
    if (level === 3) return <h3>{heading}</h3>;
    return <h2>{heading}</h2>;
}

export function LoadingState({
    heading,
    message,
    level = 2,
}: StateHeadingProps & { message: ReactNode }) {
    return (
        <Card aria-busy="true">
            <StateHeading heading={heading} level={level} />
            <p role="status">{message}</p>
        </Card>
    );
}

export function EmptyState({ children }: { children: ReactNode }) {
    return (
        <div className="empty-state">
            <p>{children}</p>
        </div>
    );
}

export function ErrorState({
    heading,
    message,
    technicalDetail,
    retryLabel,
    onRetry,
    level = 2,
}: StateHeadingProps & {
    message: ReactNode;
    technicalDetail?: ReactNode;
    retryLabel?: ReactNode;
    onRetry?: () => void;
}) {
    return (
        <Card>
            <StateHeading heading={heading} level={level} />
            <Alert tone="error">
                <p>{message}</p>
            </Alert>
            {technicalDetail && <p className="technical-detail">{technicalDetail}</p>}
            {onRetry && retryLabel && (
                <button type="button" className="primary-action" onClick={onRetry}>
                    {retryLabel}
                </button>
            )}
        </Card>
    );
}
