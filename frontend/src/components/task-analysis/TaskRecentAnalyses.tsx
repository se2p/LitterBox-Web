// SPDX-License-Identifier: EUPL-1.2
// SPDX-FileCopyrightText: 2026 LitterBox-Web contributors

import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { formatRelativeTime } from '../../i18n';
import {
    analysedProjects,
    useRecentProjects,
    type RecentAnalysisKind,
} from '../../lib/recent-projects';
import { TASK_ANALYSIS_PATH, retainedAnalysisDestination } from '../../lib/retained-analysis';
import { RecentAnalysesSection } from '../RecentAnalysesSection';

const FORGET_KINDS: readonly RecentAnalysisKind[] = ['issues'];

export function TaskRecentAnalyses({
    headingId = 'task-recent-analyses-heading',
    headingText,
}: {
    headingId?: string;
    headingText?: string;
} = {}) {
    const { t } = useTranslation();
    const projects = analysedProjects(useRecentProjects());

    return (
        <RecentAnalysesSection
            projects={projects}
            headingId={headingId}
            headingText={headingText ?? t('recentResultsTitle')}
            className="task-recent-analyses"
            forgetKinds={FORGET_KINDS}
            renderEntry={(project) => (
                <>
                    <Link
                        to={TASK_ANALYSIS_PATH}
                        state={
                            retainedAnalysisDestination(TASK_ANALYSIS_PATH, {
                                submissionToken: project.token,
                                analysisId: project.analysisId,
                            }).state
                        }
                    >
                        {t('reuseTaskAnalysisNamed', {
                            project: project.name.trim() || t('recentResultUnnamed'),
                        })}
                    </Link>
                    {project.at !== undefined && (
                        <span className="recent-result-detail">
                            {formatRelativeTime(project.at)}
                        </span>
                    )}
                </>
            )}
        />
    );
}
