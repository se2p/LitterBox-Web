// SPDX-License-Identifier: EUPL-1.2
// SPDX-FileCopyrightText: 2026 LitterBox-Web contributors

import type { IssueFamily } from './issue-family';

/**
 * A mark for each family of findings.
 *
 * The three names are LitterBox's own and they stay, but two of them are metaphors that only work once someone has
 * explained them. So these draw the meaning rather than the word: a ladybird for the family of likely mistakes, a
 * broom for the family of patterns that work and could be tidied, a sparkle for the family reported as good practice.
 * A nose and a scent bottle would have illustrated the vocabulary and left the reader no better off.
 *
 * Drawn in `currentColor` at the size of the text beside them, so the family's own colour and the reader's font size
 * both reach them, and never carrying meaning on their own — every one of them sits next to the family's name.
 */
export function FamilyIcon({ family }: { family: IssueFamily }) {
    return (
        <svg
            className={`family-icon family-icon-${family}`}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
            focusable="false"
        >
            {family === 'bug' && (
                <>
                    <path d="M9.8 3.6 8.4 1.5M14.2 3.6l1.4-2.1" />
                    <path d="M5.6 9.6 2.6 7.4M5.2 14H2M5.7 18.4l-2.9 2.2" />
                    <path d="M18.4 9.6l3-2.2M18.8 14H22M18.3 18.4l2.9 2.2" />
                    <circle cx="12" cy="5.4" r="2.6" fill="currentColor" stroke="none" />
                    <ellipse cx="12" cy="13.6" rx="6.4" ry="7.4" />
                    <path d="M12 6.7v14" />
                    <g fill="currentColor" stroke="none">
                        <circle cx="9" cy="11.4" r="1.25" />
                        <circle cx="15" cy="11.4" r="1.25" />
                        <circle cx="9.4" cy="16.4" r="1.25" />
                        <circle cx="14.6" cy="16.4" r="1.25" />
                    </g>
                </>
            )}
            {family === 'smell' && (
                <>
                    <path d="M12 1.9v8.2" />
                    <path d="M7.6 10.1h8.8L18.2 22H5.8z" />
                    <path d="M6.9 14.2h10.2" />
                    <path d="M9.6 14.6V22M12 14.6V22M14.4 14.6V22" />
                </>
            )}
            {family === 'perfume' && (
                <>
                    <path d="M10 2.6 11.9 7.9 17.2 9.8 11.9 11.7 10 17 8.1 11.7 2.8 9.8 8.1 7.9z" />
                    <path d="M17.4 15.1l.85 2.35 2.35.85-2.35.85-.85 2.35-.85-2.35-2.35-.85 2.35-.85z" />
                </>
            )}
            {family === 'other' && (
                <>
                    <rect x="2.6" y="6.6" width="18.8" height="10.8" rx="3.2" />
                    <g fill="currentColor" stroke="none">
                        <circle cx="7.4" cy="12" r="1.35" />
                        <circle cx="12" cy="12" r="1.35" />
                        <circle cx="16.6" cy="12" r="1.35" />
                    </g>
                </>
            )}
        </svg>
    );
}
