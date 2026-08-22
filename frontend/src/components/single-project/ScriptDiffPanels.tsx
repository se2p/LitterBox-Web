// SPDX-License-Identifier: EUPL-1.2
// SPDX-FileCopyrightText: 2026 LitterBox-Web contributors

import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { annotateScratchblocksDiff } from '../../lib/scratchblocks-diff';
import { ScratchblocksPreview } from './ScratchblocksPreview';

interface ScriptDiffPanelsProps {
    before: string | null | undefined;
    after: string | null | undefined;
    locale: string;
    beforeLabel: string;
    afterLabel: string;
    /** Set where the two sides arrive already marked up, as the comparison capability's own reports do. */
    annotatedBefore?: string | null;
    annotatedAfter?: string | null;
}

/**
 * One script before and after a change, side by side, with the blocks that differ picked out in colour: red on the
 * side that loses them, green on the side that gains them. LitterBox's HTML diff report reads this way, and a reader
 * who has been shown a change there should not have to learn a second convention here.
 */
export function ScriptDiffPanels({
    before,
    after,
    locale,
    beforeLabel,
    afterLabel,
    annotatedBefore,
    annotatedAfter,
}: ScriptDiffPanelsProps) {
    const { t } = useTranslation();
    const computed = useMemo(() => annotateScratchblocksDiff(before, after), [after, before]);
    const beforeSource = annotatedBefore ?? computed.before;
    const afterSource = annotatedAfter ?? computed.after;
    const hasBefore = Boolean(beforeSource?.trim());
    const hasAfter = Boolean(afterSource?.trim());
    if (!hasBefore && !hasAfter) return null;

    return (
        <div className={`script-diff${hasBefore && hasAfter ? '' : ' script-diff-single'}`}>
            {hasBefore && (
                <div className="script-diff-panel script-diff-before">
                    {/* The strip over a panel says which side of the change it is; which script it is belongs to
                        the region's name, where it is read once rather than set in small capitals. */}
                    <p className="script-diff-heading">{t('diffBefore')}</p>
                    {/* The colour markers exist for the drawing; whoever reads the source instead wants the
                        script as the analysis reported it, without them. */}
                    <ScratchblocksPreview
                        source={beforeSource}
                        alternativeSource={before}
                        locale={locale}
                        label={beforeLabel}
                        textAlternativeLabel={t('textAlternative')}
                        showLabel={false}
                    />
                </div>
            )}
            {hasAfter && (
                <div className="script-diff-panel script-diff-after">
                    <p className="script-diff-heading">{t('diffAfter')}</p>
                    <ScratchblocksPreview
                        source={afterSource}
                        alternativeSource={after}
                        locale={locale}
                        label={afterLabel}
                        textAlternativeLabel={t('textAlternative')}
                        showLabel={false}
                    />
                </div>
            )}
        </div>
    );
}
