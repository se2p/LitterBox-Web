// SPDX-License-Identifier: EUPL-1.2
// SPDX-FileCopyrightText: 2026 LitterBox-Web contributors

/** The formats the exporter can read a program back out of. Anything else it has nothing to offer. */
const EXPORTABLE_FORMATS = ['.sb3', '.mblock'];

const normalizeInputFormat = (value: string | null | undefined): string => {
    const normalized = String(value ?? '').toLowerCase();
    return normalized.startsWith('.') ? normalized : `.${normalized}`;
};

/**
 * Whether this deployment can hand the program back for this analysis: the capability is advertised, the analysis
 * can be referred to, and its source is in a format the exporter reads.
 *
 * Asked in two places — the export controls, where the answer decides whether to offer a download, and the question
 * page, where it decides whether a reader can look at the code they are being asked about.
 */
export const exportEligible = (
    enabled: boolean,
    analysisId: number | null | undefined,
    inputFormat: string | null | undefined,
): boolean =>
    enabled &&
    typeof analysisId === 'number' &&
    Number.isSafeInteger(analysisId) &&
    analysisId > 0 &&
    EXPORTABLE_FORMATS.includes(normalizeInputFormat(inputFormat));
