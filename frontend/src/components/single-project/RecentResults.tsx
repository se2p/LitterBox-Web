// SPDX-License-Identifier: EUPL-1.2
// SPDX-FileCopyrightText: 2026 LitterBox-Web contributors

import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { formatNumber, formatRelativeTime } from '../../i18n';
import type { TranslationKey } from '../../i18n/locales';
import {
    useRecentProjects,
    type RecentAnalysisKind,
    type RecentProject,
} from '../../lib/recent-projects';
import { RecentAnalysesSection } from '../RecentAnalysesSection';

const DETAIL_LABEL_KEYS: Record<RecentAnalysisKind, TranslationKey> = {
    issues: 'recentResultIssues',
    questions: 'recentResultQuestions',
    batch: 'recentResultBatch',
};

/**
 * The way back to what this browser already had analysed. A result is reached by its link, and the link is the
 * token, so nothing has to be written down and there is nowhere to type a code back in. Kept on the device, and a
 * shared classroom machine can be told to forget it.
 *
 * @param kinds which results belong on this page. The class-set page offers class sets; the page a child lands on
 *              offers what a child made. Mixing them put a teacher's thirty-project set in a child's short list.
 * @param questionsPath where a `questions` entry's link points: the child-facing view or the builder. The token in
 *                       storage cannot say which asked for this list, so the caller does.
 * @param detailLabelKeys overrides one or more of `DETAIL_LABEL_KEYS` per row, for a page whose wording for a kind
 *                         differs from the child-facing one.
 * @param footer true by default. A caller sitting this list beside another of the same device's history can turn
 *               it off and draw one shared footer over both.
 */
export function RecentResults({
    kinds,
    headingId = 'recent-results-heading',
    heading = 'recentResultsTitle',
    headingText,
    linkTo,
    questionsPath = '/questions',
    detailLabelKeys,
    footer = true,
}: {
    kinds: readonly RecentAnalysisKind[];
    headingId?: string;
    heading?: TranslationKey;
    headingText?: string;
    linkTo?: (project: RecentProject) => string;
    questionsPath?: string;
    detailLabelKeys?: Partial<Record<RecentAnalysisKind, TranslationKey>>;
    footer?: boolean;
}) {
    const { t } = useTranslation();
    // Subscribed rather than read once: a forget pressed under any list on the page sharing one of these kinds has
    // to show here at once. Remembering a new project deliberately does not push an update; see
    // `subscribeToRecentProjects`.
    const remembered = useRecentProjects();
    const projects = remembered.filter((project) => kinds.includes(project.kind));
    const detailLabels = { ...DETAIL_LABEL_KEYS, ...detailLabelKeys };

    const detail = (project: RecentProject): string => {
        const kind: string = t(detailLabels[project.kind]);
        // The name alone is the filename, and the same project put through both workflows gives two entries
        // reading exactly the same. What each one is, how big it was, and when it was last open tells them apart.
        const parts = [kind];
        if (project.projects !== undefined)
            parts.push(
                t('recentResultBatchProjects', {
                    count: project.projects,
                    formatted: formatNumber(project.projects),
                }),
            );
        if (project.at !== undefined) parts.push(formatRelativeTime(project.at));
        return parts.join(' · ');
    };

    return (
        <RecentAnalysesSection
            projects={projects}
            headingId={headingId}
            headingText={headingText ?? t(heading)}
            forgetKinds={footer ? kinds : undefined}
            renderEntry={(project) => (
                <>
                    <Link
                        to={
                            linkTo
                                ? linkTo(project)
                                : `${project.kind === 'questions' ? questionsPath : '/submissions'}/${encodeURIComponent(project.token)}`
                        }
                    >
                        {/* A class set opened from a shared link arrives with no name on it. What it is is
                            still worth offering; what it was called is simply not known here. */}
                        {project.name.trim() || t('recentResultUnnamed')}
                    </Link>
                    <span className="recent-result-detail">{detail(project)}</span>
                </>
            )}
        />
    );
}
