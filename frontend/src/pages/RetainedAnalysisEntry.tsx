// SPDX-License-Identifier: EUPL-1.2
// SPDX-FileCopyrightText: 2026 LitterBox-Web contributors

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router';
import { Alert } from '../components/Alert';
import { ProjectSubmissionForm } from '../components/single-project/ProjectSubmissionForm';
import { ReuseProjectButton } from '../components/single-project/ReuseProjectButton';
import { localeFrom } from '../lib/project-submission';
import { latestProject } from '../lib/recent-projects';
import type {
    RetainedAnalysisDestination,
    RetainedAnalysisSelection,
} from '../lib/retained-analysis';
import type { RetainedAnalysisCopy } from './retained-analysis-page';

export interface RetainedAnalysisEntryProps {
    recovering: boolean;
    heroClassName: string;
    titleId: string;
    idPrefix: string;
    continueTo: string;
    destination: (selection: RetainedAnalysisSelection) => RetainedAnalysisDestination<string>;
    copy: RetainedAnalysisCopy;
}

/**
 * Reached with no analysis in hand — from the menu, a bookmark, or a reload. Sending people back to the start page
 * made the two analyses look like a loop, so the project can be handed over right here instead.
 */
export function RetainedAnalysisEntry({
    recovering,
    heroClassName,
    titleId,
    idPrefix,
    continueTo,
    destination,
    copy,
}: RetainedAnalysisEntryProps) {
    const { i18n } = useTranslation();
    const navigate = useNavigate();
    // The last project this device analysed. A completed single-project result already has an analysis behind it,
    // so that one is a link; anything else has to be analysed once before there is something to work from.
    const [recent] = useState(latestProject);
    // The analysis rides along as the link's own navigation state, which is a prop of its own rather than part
    // of the address it points at.
    const recentDestination =
        recent?.kind === 'issues' && recent.analysisId
            ? destination({ submissionToken: recent.token, analysisId: recent.analysisId })
            : undefined;
    return (
        <>
            <section className={heroClassName} aria-labelledby={titleId}>
                <h1 id={titleId}>{copy.title}</h1>
                <p className="lead">{copy.lead}</p>
            </section>
            {recovering && (
                <Alert tone="warning">
                    <p>{copy.recoveryBody}</p>
                </Alert>
            )}
            {recent &&
                (recentDestination ? (
                    <p className="recent-project-offer">
                        <Link
                            className="action-button"
                            to={recentDestination.pathname}
                            state={recentDestination.state}
                        >
                            {copy.reuseNamed(recent.name)}
                        </Link>
                    </p>
                ) : (
                    <ReuseProjectButton
                        className="recent-project-offer"
                        token={recent.token}
                        originKind={recent.kind}
                        projectName={recent.name}
                        analysis="issues"
                        locale={localeFrom(i18n.language)}
                        label={copy.reuseNamed(recent.name)}
                        onReused={(next) =>
                            navigate(`/submissions/${encodeURIComponent(next)}`, {
                                state: { continueTo },
                            })
                        }
                    />
                ))}
            <ProjectSubmissionForm
                idPrefix={idPrefix}
                legend={copy.entryTitle}
                description={copy.entryLead}
                submitLabel={copy.entryAction}
                onAccepted={(token) =>
                    navigate(`/submissions/${encodeURIComponent(token)}`, {
                        state: { continueTo },
                    })
                }
            />
        </>
    );
}
