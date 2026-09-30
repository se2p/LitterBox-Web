// SPDX-License-Identifier: EUPL-1.2
// SPDX-FileCopyrightText: 2026 LitterBox-Web contributors

import { useTranslation } from 'react-i18next';
import { ScratchblocksPreview } from './ScratchblocksPreview';

/**
 * A catalogue entry's worked examples, each drawn as blocks under its own label. Every place that explains a
 * finder — a single project's report, a class set's common findings, a task's findings — lists them the same way.
 */
export function CatalogueExampleList({
    examples,
    locale,
    textAlternativeLabel,
}: {
    examples: readonly { label: string; scratchblocks: string }[];
    locale: string;
    textAlternativeLabel?: string;
}) {
    const { t } = useTranslation();
    const textAlternative = textAlternativeLabel ?? t('textAlternative');
    return (
        <ul className="catalogue-examples">
            {examples.map((example, index) => (
                <li key={`${example.label}-${index}`}>
                    <p className="catalogue-example-label">{example.label}</p>
                    <ScratchblocksPreview
                        source={example.scratchblocks}
                        locale={locale}
                        label={example.label}
                        textAlternativeLabel={textAlternative}
                        showLabel={false}
                    />
                </li>
            ))}
        </ul>
    );
}
