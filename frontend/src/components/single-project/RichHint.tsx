// SPDX-License-Identifier: EUPL-1.2
// SPDX-FileCopyrightText: 2025 LitterBox-Web contributors

import type { ReactNode } from 'react';
import {
    parseRichHint,
    richHintTerms,
    scratchblocksSourceForInline,
    type RichHintFormat,
    type RichHintNode,
} from './rich-hint';
import { ScratchblocksPreview } from './ScratchblocksPreview';

interface RichHintProps {
    value: string | null | undefined;
    locale: string;
    scratchblocksLabel: string;
    textAlternativeLabel: string;
}

const formatClassName: Record<RichHintFormat, string> = {
    strong: 'rich-hint-strong',
    italic: 'rich-hint-italic',
    underline: 'rich-hint-underline',
    strike: 'rich-hint-strike',
    code: 'rich-hint-code',
    color: 'rich-hint-color',
};

const formatTag: Record<RichHintFormat, 'strong' | 'em' | 'u' | 's' | 'code' | 'span'> = {
    strong: 'strong',
    italic: 'em',
    underline: 'u',
    strike: 's',
    code: 'code',
    color: 'span',
};

const renderNodes = (
    nodes: RichHintNode[],
    locale: string,
    scratchblocksLabel: string,
    textAlternativeLabel: string,
): ReactNode[] =>
    nodes.map((node, index) => {
        const key = `${node.kind}-${index}`;
        switch (node.kind) {
            case 'text':
                return <span key={key}>{node.value}</span>;
            case 'lineBreak':
                return <br key={key} />;
            case 'variablesBadge': {
                const terms = richHintTerms(locale);
                return (
                    <span
                        key={key}
                        className="rich-hint-variables"
                        role="img"
                        aria-label={terms.variables}
                    >
                        <span className="rich-hint-variables-icon" aria-hidden="true">
                            ●
                        </span>{' '}
                        {terms.variables}
                    </span>
                );
            }
            case 'term': {
                const terms = richHintTerms(locale);
                return (
                    <strong key={key} className={`rich-hint-term rich-hint-term-${node.term}`}>
                        {node.term === 'true' ? terms.trueValue : terms.falseValue}
                    </strong>
                );
            }
            case 'format': {
                const Tag = formatTag[node.format];
                return (
                    <Tag
                        key={key}
                        className={formatClassName[node.format]}
                        style={node.format === 'color' ? { color: node.color } : undefined}
                    >
                        {renderNodes(
                            node.children,
                            locale,
                            scratchblocksLabel,
                            textAlternativeLabel,
                        )}
                    </Tag>
                );
            }
            case 'script':
                return (
                    // A script quoted inside an explanation is already introduced by the sentence above it; the
                    // caption only ever repeated the name of the notation.
                    <ScratchblocksPreview
                        key={key}
                        source={node.source}
                        locale={locale}
                        label={scratchblocksLabel}
                        textAlternativeLabel={textAlternativeLabel}
                        showLabel={false}
                    />
                );
            case 'inline': {
                const source = scratchblocksSourceForInline(node, locale);
                return (
                    <ScratchblocksPreview
                        key={key}
                        source={source}
                        locale={locale}
                        label={scratchblocksLabel}
                        textAlternativeLabel={textAlternativeLabel}
                        inline
                    />
                );
            }
        }
    });

export function RichHint({
    value,
    locale,
    scratchblocksLabel,
    textAlternativeLabel,
}: RichHintProps) {
    return (
        <>{renderNodes(parseRichHint(value), locale, scratchblocksLabel, textAlternativeLabel)}</>
    );
}
