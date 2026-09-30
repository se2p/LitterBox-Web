// SPDX-License-Identifier: EUPL-1.2
// SPDX-FileCopyrightText: 2026 LitterBox-Web contributors

import type { ReactNode } from 'react';

function SectionCardHeading({
    number,
    description,
    heading,
}: {
    number: number;
    description: ReactNode;
    heading: ReactNode;
}) {
    return (
        <header className="section-card-heading" data-section-number={number}>
            <div>
                {heading}
                <p>{description}</p>
            </div>
        </header>
    );
}

export function SectionCard({
    id,
    number,
    title,
    description,
    headingLevel: Heading,
    children,
}: {
    id: string;
    number: number;
    title: ReactNode;
    description: ReactNode;
    headingLevel: 'h3' | 'h4';
    children: ReactNode;
}) {
    const headingId = `${id}-heading`;
    return (
        <section id={id} className="section-card" aria-labelledby={headingId}>
            <SectionCardHeading
                number={number}
                heading={<Heading id={headingId}>{title}</Heading>}
                description={description}
            />
            <div className="section-card-body">{children}</div>
        </section>
    );
}

export function SectionNav({
    label,
    sections,
    isOpen,
    onSelect,
}: {
    label: string;
    sections: readonly { id: string; title: ReactNode }[];
    isOpen?: (id: string) => boolean;
    onSelect?: (id: string) => void;
}) {
    return (
        <nav className="section-nav" aria-label={label}>
            <ol>
                {sections.map((section) => (
                    <li key={section.id}>
                        {onSelect ? (
                            <button
                                type="button"
                                aria-expanded={isOpen?.(section.id) ?? false}
                                aria-controls={section.id}
                                onClick={() => onSelect(section.id)}
                            >
                                {section.title}
                            </button>
                        ) : (
                            <a href={`#${section.id}`}>{section.title}</a>
                        )}
                    </li>
                ))}
            </ol>
        </nav>
    );
}
