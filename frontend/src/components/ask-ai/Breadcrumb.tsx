// SPDX-License-Identifier: EUPL-1.2
// SPDX-FileCopyrightText: 2026 LitterBox-Web contributors

import type { ReactNode, RefObject } from 'react';
import { useTranslation } from 'react-i18next';
import { QuestionIcon, type QuestionIconName } from './QuestionIcon';

export interface Crumb {
    key: string;
    /** Accessible name, even when the step is drawn as an image. */
    label: string;
    content?: ReactNode;
    icon?: QuestionIconName;
    className?: string;
    onNavigate?: () => void;
}

export function Breadcrumb({
    crumbs,
    headingLevel,
    headingRef,
}: {
    crumbs: Crumb[];
    /** Heading level for the active screen. */
    headingLevel: 2 | 3;
    headingRef?: RefObject<HTMLHeadingElement | null>;
}) {
    const { t } = useTranslation();
    if (crumbs.length === 0) return null;
    const Heading = headingLevel === 2 ? 'h2' : 'h3';
    return (
        <nav className="ask-ai-trail" aria-label={t('askAiTrailLabel')}>
            <ol>
                {crumbs.map((crumb, index) => {
                    const last = index === crumbs.length - 1;
                    // Hidden crumbs are excluded from layout and assistive technology.
                    const previous = index === crumbs.length - 2;
                    const marked = crumb.icon !== undefined || crumb.className !== undefined;

                    return (
                        <li
                            key={crumb.key}
                            className={
                                previous
                                    ? 'ask-ai-trail-step ask-ai-trail-previous'
                                    : 'ask-ai-trail-step'
                            }
                        >
                            {last || !crumb.onNavigate ? (
                                <Heading
                                    className="ask-ai-trail-current"
                                    // Focus the active screen heading.
                                    ref={last ? headingRef : undefined}
                                    tabIndex={-1}
                                    aria-current="page"
                                >
                                    {crumb.content ??
                                        (marked ? (
                                            <span className={crumb.className}>
                                                {crumb.icon && <QuestionIcon name={crumb.icon} />}
                                                <span>{crumb.label}</span>
                                            </span>
                                        ) : (
                                            <span className="ask-ai-trail-words">
                                                {crumb.label}
                                            </span>
                                        ))}
                                </Heading>
                            ) : (
                                <button
                                    type="button"
                                    className={
                                        crumb.className
                                            ? `ask-ai-trail-link ${crumb.className}`
                                            : 'ask-ai-trail-link'
                                    }
                                    onClick={crumb.onNavigate}
                                >
                                    {crumb.icon && <QuestionIcon name={crumb.icon} />}
                                    <span>{crumb.label}</span>
                                </button>
                            )}
                        </li>
                    );
                })}
            </ol>
        </nav>
    );
}
