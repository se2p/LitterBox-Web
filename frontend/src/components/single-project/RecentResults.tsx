// SPDX-License-Identifier: EUPL-1.2
// SPDX-FileCopyrightText: 2026 LitterBox-Web contributors

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { formatNumber, formatRelativeTime } from '../../i18n';
import type { TranslationKey } from '../../i18n/locales';
import {
    forgetProjects,
    recentProjects,
    type RecentAnalysisKind,
    type RecentProject,
} from '../../lib/recent-projects';

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
 */
export function RecentResults({
    kinds,
    headingId = 'recent-results-heading',
    heading = 'recentResultsTitle',
    linkTo,
}: {
    kinds: readonly RecentAnalysisKind[];
    headingId?: string;
    heading?: TranslationKey;
    linkTo?: (project: RecentProject) => string;
}) {
    const { t } = useTranslation();
    const [forgotten, setForgotten] = useState(false);
    const [remembered] = useState(recentProjects);
    const projects = forgotten
        ? []
        : remembered
              .filter((project) => kinds.includes(project.kind))
              .map((project) => ({
                  project,
                  href: linkTo
                      ? linkTo(project)
                      : `${project.kind === 'questions' ? '/questions' : '/submissions'}/${encodeURIComponent(project.token)}`,
              }));
    if (projects.length === 0) return null;

    const detail = (project: RecentProject): string => {
        const kind: string = t(DETAIL_LABEL_KEYS[project.kind]);
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
        <section className="recent-results" aria-labelledby={headingId}>
            <h2 id={headingId}>{t(heading)}</h2>
            <ul className="recent-results-list">
                {projects.map(({ project, href }) => (
                    <li key={project.token}>
                        <Link to={href}>
                            {/* A class set opened from a shared link arrives with no name on it. What it is is
                                still worth offering; what it was called is simply not known here. */}
                            {project.name.trim() || t('recentResultUnnamed')}
                        </Link>
                        <span className="recent-result-detail">{detail(project)}</span>
                    </li>
                ))}
            </ul>
            <p className="hint">{t('recentResultsHint')}</p>
            <button
                type="button"
                className="recent-results-forget"
                onClick={() => {
                    forgetProjects();
                    setForgotten(true);
                }}
            >
                {t('recentResultsForget')}
            </button>
        </section>
    );
}
