// SPDX-License-Identifier: EUPL-1.2
// SPDX-FileCopyrightText: 2025 LitterBox-Web contributors

import { useTranslation } from 'react-i18next';
import { sendFeedback, type AnalysisIssue } from '../../api/submissions';
import { formatNumber } from '../../i18n';
import { FeedbackControls } from '../FeedbackControls';
import { RichHint } from './RichHint';
import { ScratchblocksPreview } from './ScratchblocksPreview';
import { Thumbnail } from './Thumbnail';
import { issueFamily } from './issue-family';
import { normalizeScratchblocksSource } from './scratchblocks-source';
import { spriteDisplayName } from './sprite-name';

export interface IssueCardLabels {
    severity: (value: number) => string;
    affectedSprite: string;
    refactoringComparison: string;
    currentCode: string;
    suggestedRefactoring: string;
    scratchblocks: string;
    textAlternative: string;
    thumbnail: (sprite: string) => string;
    thumbnailFallback: string;
}

interface IssueCardProps {
    issue: AnalysisIssue;
    analysisId?: number;
    /** Distinguishes this analysis's element ids from another analysis's in the same collection. */
    analysisKey: string;
    /** Where this occurrence sits among the ones its finder reported, used when nothing else tells them apart. */
    occurrenceNumber: number;
    /**
     * Whether to offer the severity number and the graph of findings this one sits in. A child working through
     * their own project has no use for either, and folded or not they were another line under every finding. A
     * teacher looking at one project out of a class set is checking the analysis, and does.
     */
    showTechnical?: boolean;
    /** The finder name of another finding in the same analysis, for the relationships this one records. */
    findingName: (id: number) => string | undefined;
    token: string;
    locale: string;
    labels: IssueCardLabels;
}

/** A relationship target, named when the analysis still holds the finding it points at. */
const relatedFinding = (
    id: number,
    findingName: (value: number) => string | undefined,
    fallback: (value: number) => string,
): string => {
    const name = findingName(id);
    return name ? `${name} (${fallback(id)})` : fallback(id);
};

export function IssueCard({
    issue,
    analysisId,
    analysisKey,
    occurrenceNumber,
    showTechnical = false,
    findingName,
    token,
    locale,
    labels,
}: IssueCardProps) {
    const { t } = useTranslation();
    const family = issueFamily(issue.type);
    const sprite = spriteDisplayName(issue.sprite, t('stageName'));
    const currentCode = normalizeScratchblocksSource(issue.scratchblocks);
    const refactoringCode = normalizeScratchblocksSource(issue.refactoringScratchblocks);
    const hasRefactoring = refactoringCode.length > 0;

    const occurrenceId = `issue-${analysisKey}-${issue.id}`;
    // An identifier, not a quantity: "Finding 20,202" invents a thousands separator inside a number that is a name.
    const targetFallback = (id: number) => t('findingTarget', { id: String(id) });
    const related = (ids: readonly number[] | null | undefined): string | undefined =>
        ids && ids.length > 0
            ? ids.map((id) => relatedFinding(id, findingName, targetFallback)).join(', ')
            : undefined;
    // Only what this finding actually carries. A row reading "none" is a row saying nothing.
    //
    // No finder id and no block id. They name things inside the analyser, and a child working through their project
    // has nothing to do with either: the finder is already named in the heading above, and the block is the one
    // drawn underneath. Whoever needs the identifiers has the report itself.
    const technical = (
        !showTechnical
            ? []
            : ([
                  { label: t('technicalSeverity'), value: formatNumber(issue.severity) },
                  { label: t('findingDuplicates'), value: related(issue.duplicates) },
                  { label: t('findingSubsumedBy'), value: related(issue.subsumedBy) },
                  { label: t('findingCoupledWith'), value: related(issue.coupledWith) },
                  {
                      label: t('findingSimilarTo'),
                      value:
                          issue.similarTo && issue.similarTo.length > 0
                              ? issue.similarTo
                                    .map(
                                        (similar) =>
                                            // The number is repeated as it arrived. What a distance of 0.4 means is
                                            // the analyser's business, and guessing at it here would be inventing.
                                            `${relatedFinding(similar.id, findingName, targetFallback)}, ` +
                                            t('findingDistance', {
                                                distance: formatNumber(similar.distance),
                                            }),
                                    )
                                    .join('; ')
                              : undefined,
                  },
              ] as const)
    ).filter((row): row is { label: string; value: string } => row.value !== undefined);

    return (
        <article
            className={`issue-card issue-card-detailed issue-card-${family}`}
            aria-labelledby={occurrenceId}
        >
            <div className="issue-heading-row">
                {/* The group above names the finder and the body below names the affected sprite, so a visible
                    heading here could only repeat one of them. The region still needs a name, and where this
                    occurrence sits among its finder's is the one thing neither of them says. */}
                <h5 id={occurrenceId} className="visually-hidden">
                    {t('findingOccurrenceNumber', { number: occurrenceNumber })}
                </h5>
                {/* The one question we ask back about the finding, in the corner rather than across the card. */}
                <div className="issue-heading-meta">
                    {analysisId !== undefined && (
                        <FeedbackControls
                            label={t('feedbackLabel')}
                            helpfulLabel={t('feedbackHelpful')}
                            notHelpfulLabel={t('feedbackNotHelpful')}
                            savingMessage={t('feedbackSaving')}
                            savedMessage={t('feedbackSaved')}
                            errorMessage={t('feedbackError')}
                            onReact={(reaction) =>
                                sendFeedback(token, analysisId, {
                                    finderId: issue.finderId,
                                    reaction,
                                })
                            }
                        />
                    )}
                </div>
            </div>
            <div className="issue-card-body">
                <div className="issue-explanation">
                    <div className="issue-hint">
                        <RichHint
                            value={issue.hint}
                            locale={locale}
                            scratchblocksLabel={labels.scratchblocks}
                            textAlternativeLabel={labels.textAlternative}
                        />
                    </div>
                    <div className="issue-context">
                        <Thumbnail
                            sprite={sprite}
                            thumbnailRef={issue.thumbnailRef}
                            label={labels.thumbnail(sprite)}
                            fallbackLabel={labels.thumbnailFallback}
                        />
                        {sprite && (
                            <dl className="issue-details">
                                <div>
                                    <dt>{labels.affectedSprite}</dt>
                                    <dd>{sprite}</dd>
                                </div>
                            </dl>
                        )}
                    </div>
                </div>
                <div className="issue-code">
                    {!hasRefactoring && (
                        // "Scratchblocks" over a picture of Scratch blocks names the technology, not the thing shown.
                        // It stays as the accessible name, where saying what the region is does some work.
                        <ScratchblocksPreview
                            source={currentCode}
                            locale={locale}
                            label={labels.scratchblocks}
                            textAlternativeLabel={labels.textAlternative}
                            showLabel={false}
                        />
                    )}
                    {hasRefactoring && (
                        <section
                            className="refactoring-comparison"
                            aria-labelledby={`refactor-${analysisKey}-${issue.id}`}
                        >
                            <h6 id={`refactor-${analysisKey}-${issue.id}`}>
                                {labels.refactoringComparison}
                            </h6>
                            <div className="comparison-grid">
                                <div className="comparison-side">
                                    <p className="code-label">{labels.currentCode}</p>
                                    {currentCode ? (
                                        <ScratchblocksPreview
                                            source={currentCode}
                                            locale={locale}
                                            label={labels.currentCode}
                                            textAlternativeLabel={labels.textAlternative}
                                            showLabel={false}
                                        />
                                    ) : (
                                        <p className="code-empty" aria-label={labels.currentCode}>
                                            —
                                        </p>
                                    )}
                                </div>
                                <div className="comparison-side">
                                    <p className="code-label">{labels.suggestedRefactoring}</p>
                                    <ScratchblocksPreview
                                        source={refactoringCode}
                                        locale={locale}
                                        label={labels.suggestedRefactoring}
                                        textAlternativeLabel={labels.textAlternative}
                                        showLabel={false}
                                    />
                                </div>
                            </div>
                        </section>
                    )}
                </div>
            </div>
            {technical.length > 0 && (
                /* The severity number and the graph this finding sits in. Not on a child's page at all: they need
                   the explanation and the blocks, and this is for whoever is checking the analysis against the
                   tool. Above the evidence it crowded it out; folded under it, it was still one more thing. */
                <details className="issue-technical">
                    <summary>{t('technicalDetails')}</summary>
                    <dl className="data-list">
                        {technical.map(({ label, value }) => (
                            <div key={label}>
                                <dt>{label}</dt>
                                <dd>{value}</dd>
                            </div>
                        ))}
                    </dl>
                </details>
            )}
        </article>
    );
}
