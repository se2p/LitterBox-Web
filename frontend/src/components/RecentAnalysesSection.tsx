// SPDX-License-Identifier: EUPL-1.2
// SPDX-FileCopyrightText: 2026 LitterBox-Web contributors

import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { forgetProjects, type RecentAnalysisKind } from '../lib/recent-projects';

export function RecentAnalysesSection<Project extends { token: string }>({
    projects,
    headingId,
    headingText,
    className,
    renderEntry,
    forgetKinds,
}: {
    projects: readonly Project[];
    headingId: string;
    headingText: string;
    className?: string;
    renderEntry: (project: Project) => ReactNode;
    forgetKinds?: readonly RecentAnalysisKind[];
}) {
    if (projects.length === 0) return null;

    return (
        <section
            className={className ? `recent-results ${className}` : 'recent-results'}
            aria-labelledby={headingId}
        >
            <h2 id={headingId}>{headingText}</h2>
            <ul className="recent-results-list">
                {projects.map((project) => (
                    <li key={project.token}>{renderEntry(project)}</li>
                ))}
            </ul>
            {forgetKinds !== undefined && <RecentAnalysesFooter kinds={forgetKinds} />}
        </section>
    );
}

export function RecentAnalysesFooter({
    kinds,
    className,
}: {
    kinds: readonly RecentAnalysisKind[];
    className?: string;
}) {
    const { t } = useTranslation();
    return (
        <div className={className}>
            <p className="hint">{t('recentResultsHint')}</p>
            <button
                type="button"
                className="recent-results-forget"
                onClick={() => forgetProjects(kinds)}
            >
                {t('recentResultsForget')}
            </button>
        </div>
    );
}
