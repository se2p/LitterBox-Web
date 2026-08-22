// SPDX-License-Identifier: EUPL-1.2
// SPDX-FileCopyrightText: 2025 LitterBox-Web contributors

import type { TFunction } from 'i18next';
import type { TranslationKey } from '../../i18n/locales';

/** The finding families, in the order a result is read in. The one list; `IssueFamily` is derived from it. */
export const FAMILIES = ['bug', 'smell', 'perfume', 'other'] as const;

export type IssueFamily = (typeof FAMILIES)[number];

// The one map from a finding family to its translation key, so every place that needs the label — batch
// dashboard, results table, CSV export, submission page, catalogue — reads the same four keys.
export const FAMILY_LABEL_KEYS: Record<IssueFamily, TranslationKey> = {
    bug: 'issueFamilyBugs',
    smell: 'issueFamilySmells',
    perfume: 'issueFamilyPerfumes',
    other: 'issueFamilyOther',
};

// "Bug", "Smell" and "Perfume" are the vocabulary of the tool, not of a ten-year-old, and nothing on the page
// otherwise says that two of the three are complaints and the third is praise.
export const FAMILY_EXPLAINER_KEYS: Record<IssueFamily, TranslationKey> = {
    bug: 'issueFamilyBugsExplainer',
    smell: 'issueFamilySmellsExplainer',
    perfume: 'issueFamilyPerfumesExplainer',
    other: 'issueFamilyOtherExplainer',
};

/** One of the key maps above, translated, for a component that draws all four families at once. */
export const familyTranslations = (
    keys: Record<IssueFamily, TranslationKey>,
    t: TFunction,
): Record<IssueFamily, string> =>
    Object.fromEntries(FAMILIES.map((family) => [family, t(keys[family])])) as Record<
        IssueFamily,
        string
    >;

export const issueFamily = (type: string | null | undefined): IssueFamily => {
    const normalized = type?.trim().toLocaleLowerCase() ?? '';
    const terms = normalized.split(/[\s_-]+/);
    if (terms.includes('bug') || terms.includes('bugs')) return 'bug';
    if (terms.includes('smell') || terms.includes('smells')) return 'smell';
    if (terms.includes('perfume') || terms.includes('perfumes')) return 'perfume';
    return 'other';
};
