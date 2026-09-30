// SPDX-License-Identifier: EUPL-1.2
// SPDX-FileCopyrightText: 2026 LitterBox-Web contributors

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { CatalogueEntry } from '../../api/submissions';
import { formatNumber } from '../../i18n';
import { completeProse } from './catalogue-lookup';
import { issueFamily } from './issue-family';
import { IssueCard, type IssueCardLabels } from './IssueCard';
import { namedSprites, type FindingGroup as Group } from './finding-groups';
import { RichHint } from './RichHint';
import { CatalogueExampleList } from './CatalogueExampleList';
import { spriteDisplayName } from './sprite-name';

/** How many sprites the heading names before it starts counting the rest instead. */
const NAMED_SPRITES = 4;

/**
 * One finder's occurrences under one heading, with the count in plain text beside it.
 *
 * Open to begin with. Grouping is worth having for the heading and the count — for saying that this is one thing
 * found nine times rather than nine things — and none of that needs the findings hidden. Closing it is the reader's
 * to do once they have finished with a finder, which is why it is a fold at all.
 */
export function FindingGroup({
    group,
    entry,
    analysisId,
    analysisKey,
    showTechnical,
    findingName,
    token,
    locale,
    labels,
    askAiAvailable = false,
}: {
    group: Group;
    /** What the catalogue says about this finder, when the analysis carries an entry it can be matched to. */
    entry?: CatalogueEntry;
    analysisId?: number;
    /** Distinguishes this analysis's element ids from another analysis's in the same collection. */
    analysisKey: string;
    /** Passed straight through: whether a finding offers the analyser's own numbers beneath it. */
    showTechnical?: boolean;
    findingName: (id: number) => string | undefined;
    token: string;
    locale: string;
    labels: IssueCardLabels;
    askAiAvailable?: boolean;
}) {
    const { t } = useTranslation();
    const [open, setOpen] = useState(true);
    const headingId = `finding-group-${analysisKey}-${group.key}`;
    const sprites = group.sprites.map((sprite) => spriteDisplayName(sprite, t('stageName')));
    const several = group.occurrences.length > 1;

    // Enough names to see where a finder has been at work, and not so many that the count disappears behind them.
    const { named, remaining } = namedSprites(sprites, NAMED_SPRITES);
    const where =
        named.length === 0
            ? undefined
            : t('findingAffectedSprites', {
                  sprites:
                      remaining === 0
                          ? named.join(', ')
                          : `${named.join(', ')} ${t('findingMoreSprites', {
                                count: remaining,
                                formatted: formatNumber(remaining),
                            })}`,
              });

    const heading = (
        <>
            <h4 id={headingId}>{group.finderName || t('issueUntitled')}</h4>
            <span className="finding-group-meta">
                {/* The family in a class as well as in the word, because the colour that marks it is the same
                    colour the filter above and the fold's own icon use, and it is read off the class. Normalised
                    the way the card below normalises it, so a finder reported as "CODE_SMELL" is the one colour
                    in all three places rather than the odd one out. */}
                {group.type && (
                    <span className={`issue-type issue-type-${issueFamily(group.type)}`}>
                        {group.type}
                    </span>
                )}
                {/* Text, not a coloured dot: how many times this was reported is the whole point of the
                    grouping, and it has to survive being read rather than looked at.
                    How many and where in one phrase — "reported twice" leaves a reader asking twice where. */}
                {several && (
                    <span className="finding-group-count">
                        {[
                            t('findingOccurrences', {
                                count: group.occurrences.length,
                                formatted: formatNumber(group.occurrences.length),
                            }),
                            where,
                        ]
                            .filter((part) => part !== undefined)
                            .join(' ')}
                    </span>
                )}
            </span>
        </>
    );

    // Once for the finder, not once per occurrence: the pattern is the same one however many times it was found.
    // Folded, and under the findings rather than over them — it is background about the pattern, so it must not
    // sit where a reader would take it for this project's own finding.
    const description = completeProse(entry?.description);
    const instruction = completeProse(entry?.instruction);
    const examples = entry?.examples ?? [];
    const entryLocale = entry?.locale ?? locale;
    const borrowedLanguage =
        entry !== undefined &&
        (entry.fallback || entry.locale.toLowerCase() !== locale.toLowerCase());

    const catalogue = entry !== undefined &&
        (description !== undefined || instruction !== undefined || examples.length > 0) && (
            <details className="finding-group-catalogue">
                <summary>{t('findingCatalogueTitle')}</summary>
                {/* Said in a language the reader did not ask for, and saying so beats letting it pass as
                    translated. */}
                {borrowedLanguage && (
                    <p>
                        <span className="fallback-badge">{t('catalogueEnglishFallback')}</span>
                    </p>
                )}
                {description !== undefined && (
                    <p>
                        <RichHint
                            value={description}
                            locale={entryLocale}
                            scratchblocksLabel={labels.scratchblocks}
                            textAlternativeLabel={labels.textAlternative}
                        />
                    </p>
                )}
                {instruction !== undefined && instruction !== description && (
                    <p>
                        <RichHint
                            value={instruction}
                            locale={entryLocale}
                            scratchblocksLabel={labels.scratchblocks}
                            textAlternativeLabel={labels.textAlternative}
                        />
                    </p>
                )}
                {examples.length > 0 && (
                    <section aria-labelledby={`${headingId}-examples`}>
                        <h5 id={`${headingId}-examples`}>{t('catalogueExamples')}</h5>
                        <CatalogueExampleList
                            examples={examples}
                            locale={entryLocale}
                            textAlternativeLabel={labels.textAlternative}
                        />
                    </section>
                )}
            </details>
        );

    const occurrences = (
        <div className="issue-list" aria-labelledby={headingId}>
            {group.occurrences.map((issue, index) => (
                <IssueCard
                    key={issue.id}
                    issue={issue}
                    analysisId={analysisId}
                    analysisKey={analysisKey}
                    occurrenceNumber={index + 1}
                    showTechnical={showTechnical}
                    findingName={findingName}
                    token={token}
                    locale={locale}
                    labels={labels}
                    askAiAvailable={askAiAvailable}
                />
            ))}
        </div>
    );

    // One occurrence is not a group of anything. It keeps the finder's name and loses the count, the sprite list
    // and the fold, all of which would only be furniture around a single finding.
    if (!several) {
        return (
            <section className="finding-group finding-group-single" aria-labelledby={headingId}>
                <div className="finding-group-heading">{heading}</div>
                {occurrences}
                {catalogue}
            </section>
        );
    }

    return (
        <details
            className="finding-group"
            open={open}
            onToggle={(event) => setOpen(event.currentTarget.open)}
        >
            <summary className="finding-group-heading">{heading}</summary>
            {occurrences}
            {catalogue}
        </details>
    );
}
