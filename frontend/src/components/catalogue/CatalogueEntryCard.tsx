// SPDX-License-Identifier: EUPL-1.2
// SPDX-FileCopyrightText: 2025 LitterBox-Web contributors

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { CatalogueEntry } from '../../api/submissions';
import { RichHint } from '../single-project/RichHint';
import { ScratchblocksPreview } from '../single-project/ScratchblocksPreview';
import { FamilyIcon } from '../single-project/FamilyIcon';
import { FAMILY_LABEL_KEYS, issueFamily } from '../single-project/issue-family';
import { BlockSetIcon } from './BlockSetIcon';
import { catalogueBlockSet, catalogueIssueType, catalogueProse } from './catalogue-utils';

export interface CatalogueEntryCardProps {
    entry: CatalogueEntry;
    requestedLocale: string;
    /**
     * Whether another entry in the catalogue carries this one's title. Two finders currently arrive named "Turn off
     * LED Matrix", and closed they are the same line of text twice. The finder id is dropped everywhere else, since
     * a reader looking for a pattern knows what it is called and not what it is called in the source; here it is
     * the only thing that tells the two entries apart, and it is what a report would have named.
     */
    titleShared?: boolean;
}

const usesEnglishFallback = (entry: CatalogueEntry, requestedLocale: string): boolean =>
    requestedLocale !== 'en' && entry.locale === 'en';

export function CatalogueEntryCard({
    entry,
    requestedLocale,
    titleShared = false,
}: CatalogueEntryCardProps) {
    const { t } = useTranslation();
    // The catalogue is 173 entries, and a body holds parsed prose and rendered block images. Building all of them
    // for a list nobody has opened cost tens of thousands of nodes; an entry builds itself when it is first asked
    // for, and stays built so that reopening it is free.
    const [everOpened, setEverOpened] = useState(false);
    const englishFallback = usesEnglishFallback(entry, requestedLocale);
    const type = catalogueIssueType(entry);
    const blockSet = catalogueBlockSet(entry);
    const blockSetLabel = t(
        blockSet === 'scratch'
            ? 'catalogueBlockSetBadgeScratch'
            : blockSet === 'qscratch'
              ? 'catalogueBlockSetBadgeQscratch'
              : 'catalogueBlockSetBadgeMblock',
    );
    const family = issueFamily(type);
    // An entry with no type at all is not "other" in the sense the four-family map means: it was never classified,
    // rather than classified into the leftover bucket, so it gets its own word instead of a lookup.
    const familyLabel =
        family === 'other' && !type
            ? t('catalogueFamilyUnclassified')
            : t(FAMILY_LABEL_KEYS[family]);
    const description = catalogueProse(entry.description, entry);
    const instruction = catalogueProse(entry.instruction, entry);
    // Many entries fall back to the hint for their instruction, and printing the same paragraph twice under two
    // headings reads as a mistake. The section is only shown when it actually says something else.
    const instructionAddsDetail = instruction !== undefined && instruction !== description;

    return (
        <details
            className={`catalogue-entry catalogue-entry-${family}`}
            aria-label={titleShared ? `${entry.title} (${entry.id})` : entry.title}
            name="catalogue-entry"
            onToggle={(event) => {
                if (event.currentTarget.open) setEverOpened(true);
            }}
        >
            {/* The list is long, so it reads as a list of names; an entry opens only when it is asked for. */}
            <summary className="catalogue-entry-summary">
                {/* The mark and its colour carry the family down the list; the word carries it to anyone who
                    reads neither. */}
                <span className={`catalogue-family-badge catalogue-family-badge-${family}`}>
                    <FamilyIcon family={family} />
                </span>
                <span className="visually-hidden">{familyLabel}</span>
                <span className="catalogue-entry-title">{entry.title}</span>
                {titleShared && <span className="catalogue-entry-qualifier">{entry.id}</span>}
                <span className={`catalogue-block-set-badge catalogue-block-set-badge-${blockSet}`}>
                    <BlockSetIcon blockSet={blockSet} />
                    <span>{blockSetLabel}</span>
                </span>
                {englishFallback && (
                    <span className="fallback-badge">{t('catalogueEnglishFallback')}</span>
                )}
            </summary>

            {everOpened && (
                <div className="catalogue-entry-body">
                    {/* The finder's own id does not head the body: it names nothing a reader of this page is
                        looking for, and the entry is already titled. It stays searchable, so an id copied out of
                        a report still finds the pattern it belongs to. */}

                    {/* Catalogue prose carries the same markup as a finding hint, blocks included. */}
                    {description && (
                        <p className="catalogue-description">
                            <RichHint
                                value={description}
                                locale={entry.locale}
                                scratchblocksLabel={t('scratchblocks')}
                                textAlternativeLabel={t('textAlternative')}
                            />
                        </p>
                    )}

                    {instructionAddsDetail && (
                        <section
                            className="catalogue-detail"
                            aria-labelledby={`catalogue-instruction-${entry.id}`}
                        >
                            <h3 id={`catalogue-instruction-${entry.id}`}>
                                {t('catalogueInstruction')}
                            </h3>
                            <p>
                                <RichHint
                                    value={instruction}
                                    locale={entry.locale}
                                    scratchblocksLabel={t('scratchblocks')}
                                    textAlternativeLabel={t('textAlternative')}
                                />
                            </p>
                        </section>
                    )}

                    {/* Only one entry currently carries worked examples; an empty section under a heading is noise. */}
                    {entry.examples.length > 0 && (
                        <section
                            className="catalogue-detail"
                            aria-labelledby={`catalogue-examples-${entry.id}`}
                        >
                            <h3 id={`catalogue-examples-${entry.id}`}>{t('catalogueExamples')}</h3>
                            <ul className="catalogue-examples">
                                {entry.examples.map((example, index) => (
                                    <li key={`${entry.id}-${example.label}-${index}`}>
                                        {/* Side by side the two captions head their columns, so the preview does not
                                        need to repeat the one above it. */}
                                        <p className="catalogue-example-label">{example.label}</p>
                                        <ScratchblocksPreview
                                            source={example.scratchblocks}
                                            locale={entry.locale}
                                            label={example.label}
                                            textAlternativeLabel={t('textAlternative')}
                                            showLabel={false}
                                        />
                                    </li>
                                ))}
                            </ul>
                        </section>
                    )}
                </div>
            )}
        </details>
    );
}
