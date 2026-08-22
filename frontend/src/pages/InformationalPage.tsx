// SPDX-License-Identifier: EUPL-1.2
// SPDX-FileCopyrightText: 2026 LitterBox-Web contributors

import { useTranslation } from 'react-i18next';
import { PageMain } from '../components/Page';
import {
    staticPageContent,
    type StaticPageKind,
    type StaticSection,
} from '../content/staticContent';

function Section({ section }: { section: StaticSection }) {
    const { t } = useTranslation();
    return (
        <section className="static-section">
            {section.heading && <h2>{t(section.heading)}</h2>}
            {section.lines && (
                <p className="static-lines">
                    {section.lines.map((line) => (
                        <span key={line}>{t(line)}</span>
                    ))}
                </p>
            )}
            {section.paragraphs?.map((paragraph) => (
                <p key={paragraph}>{t(paragraph)}</p>
            ))}
            {section.steps && (
                <ol className="static-steps">
                    {section.steps.map((step) => (
                        <li key={step}>{t(step)}</li>
                    ))}
                </ol>
            )}
            {section.links && (
                <ul className="static-links">
                    {section.links.map((link) => (
                        <li key={link.href}>
                            {/* Leaving the site, so it opens beside the page rather than replacing it. */}
                            <a href={link.href} target="_blank" rel="noreferrer noopener">
                                {t(link.label)}
                            </a>
                        </li>
                    ))}
                </ul>
            )}
        </section>
    );
}

/**
 * The pages that carry text rather than behaviour — about, contact, FAQ, imprint, privacy. They differ only in the
 * content they name, so one renderer serves all of them and the content file stays the single place to edit words.
 */
export function InformationalPage({ kind }: { kind: StaticPageKind }) {
    const { t } = useTranslation();
    const content = staticPageContent[kind];
    return (
        <PageMain className="static-page-layout">
            <section className="hero static-hero" aria-labelledby={`${kind}-heading`}>
                <h1 id={`${kind}-heading`}>{t(content.title)}</h1>
                <p className="lead">{t(content.lead ?? 'staticPageLead')}</p>
            </section>
            <article className="static-page" aria-label={t(content.title)}>
                {content.sections.map((section, index) => (
                    <Section
                        key={section.heading ?? section.paragraphs?.[0] ?? String(index)}
                        section={section}
                    />
                ))}
            </article>
            {content.funding && (
                <section className="static-funding" aria-labelledby={`${kind}-funding-heading`}>
                    <h2 id={`${kind}-funding-heading`}>{t('fundingHeading')}</h2>
                    <ul className="static-funding-list">
                        {content.funding.map((grant) => (
                            <li key={grant.reference}>
                                <h3>
                                    <a href={grant.href} target="_blank" rel="noreferrer noopener">
                                        {t(grant.funder)}
                                    </a>
                                </h3>
                                <p>{t(grant.body)}</p>
                                <p className="static-funding-reference">
                                    {t(grant.referenceLabel)}: <code>{grant.reference}</code>
                                </p>
                            </li>
                        ))}
                    </ul>
                </section>
            )}
        </PageMain>
    );
}
