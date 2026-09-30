// SPDX-License-Identifier: EUPL-1.2
// SPDX-FileCopyrightText: 2026 LitterBox-Web contributors

import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { PageMain } from '../Page';
import { ErrorState, LoadingState } from '../States';
import type { CapabilityState } from '../../lib/capabilities';
import { capabilityEnabled } from '../../lib/features';

export function AssessmentCapabilityGate({
    capabilityState,
    onCapabilityRetry,
    heading,
    children,
}: {
    capabilityState: CapabilityState;
    onCapabilityRetry: () => void;
    heading: string;
    children: ReactNode;
}) {
    const { t } = useTranslation();

    if (capabilityState.status === 'loading' || capabilityState.status === 'idle')
        return (
            <PageMain>
                <LoadingState
                    heading={heading}
                    message={t('questionsCapabilitiesLoading')}
                    level={1}
                />
            </PageMain>
        );

    if (
        capabilityState.status === 'error' ||
        capabilityState.status === 'incompatible' ||
        !capabilityEnabled(capabilityState, 'assessments')
    )
        return (
            <PageMain>
                <ErrorState
                    heading={heading}
                    message={t('assessmentUnavailable')}
                    retryLabel={t('retry')}
                    onRetry={onCapabilityRetry}
                    level={1}
                />
            </PageMain>
        );

    return <>{children}</>;
}
