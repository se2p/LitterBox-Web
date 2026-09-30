// SPDX-License-Identifier: EUPL-1.2
// SPDX-FileCopyrightText: 2026 LitterBox-Web contributors

const formulaLead = /^[=+\-@\t\r]/;

export const BYTE_ORDER_MARK = '\uFEFF';
export const CSV_MEDIA_TYPE = 'text/csv;charset=utf-8';

export const field = (value: string): string => {
    const guarded = formulaLead.test(value) ? `'${value}` : value;
    return /[",\r\n]/.test(guarded) ? `"${guarded.replaceAll('"', '""')}"` : guarded;
};

export const numeric = (value: number | undefined): string =>
    value === undefined ? '' : String(value);

/** Rows of already-encoded cells as one document: CRLF-terminated, which is what the CSV convention says and
 * what the least forgiving spreadsheet expects. */
export const csvDocument = (rows: readonly (readonly string[])[]): string =>
    `${rows.map((cells) => cells.join(',')).join('\r\n')}\r\n`;

/** The file a CSV is saved as: marked UTF-8 first, so a spreadsheet reads it as such rather than guessing. */
export const csvBlob = (content: string): Blob =>
    new Blob([`${BYTE_ORDER_MARK}${content}`], { type: CSV_MEDIA_TYPE });
