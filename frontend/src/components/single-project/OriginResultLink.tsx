// SPDX-License-Identifier: EUPL-1.2
// SPDX-FileCopyrightText: 2026 LitterBox-Web contributors

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { rememberedProject } from '../../lib/recent-projects';

/**
 * The way back to the other analysis of the same project. Putting a project through a second analysis makes a
 * second result with its own link, and the two are only related on the device that made them, so the way back is
 * offered where that is known and quietly absent where it is not — a result opened from a shared link stands alone.
 */
export function OriginResultLink({ token }: { token: string }) {
    const { t } = useTranslation();
    const [known] = useState(() => {
        const here = rememberedProject(token);
        if (!here?.origin) return undefined;
        // Both entries name the same project, so either will do; the origin may have aged out of the store.
        const name = rememberedProject(here.origin.token)?.name ?? here.name;
        return { ...here.origin, name };
    });
    if (!known) return null;

    return (
        <p className="origin-result-link">
            <Link
                className="action-button"
                to={`${known.kind === 'questions' ? '/questions' : '/submissions'}/${encodeURIComponent(known.token)}`}
            >
                {known.kind === 'questions'
                    ? t('originQuestions', { project: known.name })
                    : t('originIssues', { project: known.name })}
            </Link>
        </p>
    );
}
