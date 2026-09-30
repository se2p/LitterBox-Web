// SPDX-License-Identifier: EUPL-1.2
// SPDX-FileCopyrightText: 2026 LitterBox-Web contributors

import { richHintPlainText } from '../single-project/rich-hint';

const DEFAULT_SUMMARY_LENGTH = 120;

const truncate = (value: string, maxLength: number): string => {
    const collapsed = value.replace(/\s+/g, ' ').trim();
    if (collapsed.length <= maxLength) return collapsed;
    const cut = collapsed.slice(0, maxLength);
    const lastSpace = cut.lastIndexOf(' ');
    const atWord = lastSpace > maxLength * 0.6 ? cut.slice(0, lastSpace) : cut;
    return `${atWord.trimEnd()}…`;
};

export const questionSummaryText = (
    question: string,
    locale: string,
    maxLength: number = DEFAULT_SUMMARY_LENGTH,
): string => truncate(richHintPlainText(question, locale), maxLength);
