// SPDX-License-Identifier: EUPL-1.2
// SPDX-FileCopyrightText: 2026 LitterBox-Web contributors

import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useLocation } from 'react-router';
import type { CapabilityState } from '../lib/capabilities';
import { Card } from '../components/Card';
import { PageMain } from '../components/Page';
import { InjectionControls } from '../components/capabilities/injection/InjectionControls';
import { useDeclaredNavigation } from '../lib/active-navigation';
import { capabilityEnabled } from '../lib/features';
import {
    MODIFICATION_PATH,
    readRetainedAnalysis,
    retainedAnalysisDestination,
} from '../lib/retained-analysis';
import { localeFrom } from '../lib/project-submission';
import { retainedAnalysisGate, useRetainedAnalysis } from './retained-analysis-page';
import { validToolFormat } from './submission-utils';

export function ModificationPage({
    capabilityState = { status: 'idle' },
    onCapabilityRetry = () => undefined,
}: {
    capabilityState?: CapabilityState;
    onCapabilityRetry?: () => void;
}) {
    const { t, i18n } = useTranslation();
    const location = useLocation();
    const selection = useMemo(() => readRetainedAnalysis(location.state), [location.state]);
    const state = useRetainedAnalysis(selection);
    // The address says /teacher/modify, but the menu has no entry of its own for it; it belongs to the page a
    // teacher reached it from.
    useDeclaredNavigation('/teacher');

    const gate = retainedAnalysisGate({
        selection,
        state,
        capabilityState,
        onCapabilityRetry,
        t,
        pageClassName: 'modification-page',
        heroClassName: 'hero',
        titleId: 'modification-entry-title',
        idPrefix: 'modification-project',
        continueTo: MODIFICATION_PATH,
        destination: (selection) => retainedAnalysisDestination(MODIFICATION_PATH, selection),
        copy: {
            title: t('modificationTitle'),
            lead: t('modificationLead'),
            loading: t('modificationLoading'),
            recoveryBody: t('modificationRecoveryBody'),
            reuseNamed: (project) => t('reuseModificationNamed', { project }),
            entryTitle: t('modificationEntryTitle'),
            entryLead: t('modificationEntryLead'),
            entryAction: t('modificationAction'),
        },
    });
    if (!gate.ready) return gate.fallback;

    const { analysis, selection: retainedSelection } = gate.value;
    const locale = localeFrom(analysis.locale ?? i18n.language);
    const available =
        capabilityEnabled(capabilityState, 'fault-injection') &&
        String(analysis.status).toLowerCase() === 'completed' &&
        validToolFormat(analysis.inputFormat);

    return (
        <PageMain className="modification-page">
            <section className="hero" aria-labelledby="modification-title">
                <h1 id="modification-title">{t('modificationTitle')}</h1>
                <p className="lead">{t('modificationLead')}</p>
                {analysis.name && (
                    <p className="analysis-project-name">
                        <span>{t('analysedProject')}:</span> {analysis.name}
                    </p>
                )}
            </section>

            {available ? (
                <InjectionControls
                    enabled
                    // The page is named for what comes out of it in words a teacher uses; the card's own
                    // "Fault injection" underneath it would only say the same thing again in jargon.
                    headingHidden
                    token={retainedSelection.submissionToken}
                    analysisId={retainedSelection.analysisId}
                    analysisStatus={analysis.status}
                    inputFormat={analysis.inputFormat}
                    locale={locale}
                />
            ) : (
                <Card aria-labelledby="modification-unavailable-heading">
                    <h2 id="modification-unavailable-heading">
                        {t('modificationUnavailableTitle')}
                    </h2>
                    <p>{t('modificationUnavailableBody')}</p>
                    <Link className="action-button action-button-primary" to="/teacher">
                        {t('modificationBackToTeacher')}
                    </Link>
                </Card>
            )}
        </PageMain>
    );
}
