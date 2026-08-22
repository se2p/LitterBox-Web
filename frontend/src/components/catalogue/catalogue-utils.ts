// SPDX-License-Identifier: EUPL-1.2
// SPDX-FileCopyrightText: 2025 LitterBox-Web contributors

import type { CatalogueEntry } from '../../api/submissions';
import { richHintPlainText } from '../single-project/rich-hint';
import { withCataloguePlaceholders } from './catalogue-placeholders';

const optionalString = (value: unknown): string | undefined =>
    typeof value === 'string' && value.trim() ? value : undefined;

export const catalogueIssueType = (entry: CatalogueEntry): string | undefined => {
    return optionalString(entry.issueType);
};

export type CatalogueBlockSet = 'scratch' | 'qscratch' | 'mblock';

/**
 * A deployment that predates the split says nothing about the editor. Scratch is the honest reading there: it is what
 * the service was built for, and it is what every pattern the older catalogue described belonged to.
 */
export const catalogueBlockSet = (entry: CatalogueEntry): CatalogueBlockSet => {
    const blockSet = optionalString(entry.blockSet)?.toLowerCase();
    if (blockSet === 'scratch' || blockSet === 'qscratch' || blockSet === 'mblock') {
        return blockSet;
    }
    return optionalString(entry.platform)?.toLowerCase() === 'mblock' ? 'mblock' : 'scratch';
};

/** The entry's prose as the reader meets it: placeholders filled in, ready for the rich-hint renderer. */
export const catalogueProse = (
    value: string | null | undefined,
    entry: CatalogueEntry,
): string | undefined => {
    const filled = withCataloguePlaceholders(value, entry.locale).trim();
    return filled.length > 0 ? filled : undefined;
};

/**
 * Eleven finder ids have no hint of their own — their variants carry the text — so the catalogue answered with the
 * bare id as the description. An entry whose only content is its own name explains nothing.
 */
export const catalogueHasContent = (entry: CatalogueEntry): boolean => {
    const description = catalogueProse(entry.description, entry);
    return description !== undefined && description !== entry.id;
};

export const catalogueSearchText = (entry: CatalogueEntry): string =>
    [
        entry.id,
        entry.title,
        // Search the prose a reader sees, not the markup it is transported in.
        richHintPlainText(catalogueProse(entry.description, entry), entry.locale),
        richHintPlainText(catalogueProse(entry.instruction, entry), entry.locale),
        catalogueIssueType(entry) ?? '',
        // These terms are deliberately derived from the resolved API field, not translated prose or finder ids.
        catalogueBlockSet(entry),
        catalogueBlockSet(entry) === 'qscratch'
            ? 'quantum qscratch'
            : catalogueBlockSet(entry) === 'mblock'
              ? 'mblock robot'
              : 'scratch',
    ]
        .join(' ')
        .toLocaleLowerCase();
