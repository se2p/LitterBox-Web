// SPDX-License-Identifier: EUPL-1.2
// SPDX-FileCopyrightText: 2026 LitterBox-Web contributors

import { useTranslation } from 'react-i18next';
import { formatRelativeTime } from '../../i18n';
import {
    checkedProjects,
    useRecentProjects,
    type ReusableProject,
} from '../../lib/recent-projects';
import { RecentAnalysesSection } from '../RecentAnalysesSection';
import { ReuseProjectButton } from '../single-project/ReuseProjectButton';

export function QuizRecentAnalyses({
    headingId = 'quiz-recent-analyses-heading',
    headingText,
    locale,
    onReused,
}: {
    headingId?: string;
    headingText?: string;
    locale: string;
    onReused: (token: string) => void;
}) {
    const { t } = useTranslation();
    const projects = checkedProjects(useRecentProjects());

    const label = (project: ReusableProject): string =>
        t('reuseQuizNamed', { project: project.name.trim() || t('recentResultUnnamed') });

    return (
        <RecentAnalysesSection
            projects={projects}
            headingId={headingId}
            headingText={headingText ?? t('recentResultsTitle')}
            className="quiz-recent-analyses"
            renderEntry={(project) => (
                <>
                    <ReuseProjectButton
                        token={project.token}
                        originKind={project.kind}
                        projectName={project.name}
                        analysis="questions"
                        locale={locale}
                        label={label(project)}
                        onReused={onReused}
                    />
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
