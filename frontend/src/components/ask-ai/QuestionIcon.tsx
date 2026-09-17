// SPDX-License-Identifier: EUPL-1.2
// SPDX-FileCopyrightText: 2026 LitterBox-Web contributors

import type { InquiryTheme } from './inquiry-theme';

export type QuestionIconName =
    'stage' | 'lightbulb' | 'magnifier' | 'add-block' | 'sparkle' | InquiryTheme;

export function QuestionIcon({ name }: { name: QuestionIconName }) {
    return (
        <svg
            className={`ask-ai-question-icon ask-ai-question-icon-${name}`}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
            focusable="false"
        >
            {name === 'stage' && (
                <>
                    <rect x="2.4" y="4.2" width="19.2" height="14" rx="2.4" />
                    <path d="M8 21.4h8" />
                    <path d="M10.2 9.1l4.6 2.9-4.6 2.9z" fill="currentColor" stroke="none" />
                </>
            )}
            {name === 'lightbulb' && (
                <>
                    <path d="M9 18h6M10 21h4" />
                    <path d="M12 2a7 7 0 0 0-4.5 12.4c.8.8 1.5 1.8 1.5 2.6h6c0-.8.7-1.8 1.5-2.6A7 7 0 0 0 12 2z" />
                    <path d="M10 9.5l2-3 2 3" strokeWidth="1.3" />
                </>
            )}
            {name === 'magnifier' && (
                <>
                    <circle cx="10" cy="10" r="7" />
                    <path d="M15 15l6 6" />
                    <ellipse cx="10" cy="10" rx="3.1" ry="3.8" />
                    <path d="M10 6.2v7.6M7.2 9h5.6M7.2 11.8h5.6" />
                    <path d="M8.4 7.2l-1.2-1.4M11.6 7.2l1.2-1.4" />
                </>
            )}
            {(name === 'add-block' || name === 'ideas') && (
                <>
                    <rect x="2.6" y="4.2" width="11.4" height="4.6" rx="1.4" />
                    <rect x="2.6" y="11.2" width="11.4" height="4.6" rx="1.4" />
                    <path d="M18.4 13.6v7.2M14.8 17.2h7.2" />
                </>
            )}
            {(name === 'sparkle' || name === 'polishing') && (
                <>
                    <path d="M10 2.8 11.9 8.1 17.2 10 11.9 11.9 10 17.2 8.1 11.9 2.8 10 8.1 8.1z" />
                    <path d="M17.4 15.3l.85 2.35 2.35.85-2.35.85-.85 2.35-.85-2.35-2.35-.85 2.35-.85z" />
                </>
            )}
            {name === 'starting' && (
                <>
                    <path d="M5.4 21.4V3" />
                    <path d="M5.4 4.4h12.4l-2.6 4 2.6 4H5.4z" />
                </>
            )}
            {name === 'scripts' && (
                <>
                    <rect x="4" y="3.4" width="16" height="5" rx="1.6" />
                    <rect x="4" y="9.6" width="16" height="5" rx="1.6" />
                    <rect x="4" y="15.8" width="16" height="5" rx="1.6" />
                </>
            )}
            {name === 'repeating' && (
                <>
                    <path d="M4.4 12a7.6 7.6 0 0 1 13-5.4" />
                    <path d="M19.6 12a7.6 7.6 0 0 1-13 5.4" />
                    <path d="M17.6 2.9v3.8h-3.8M6.4 21.1v-3.8h3.8" />
                </>
            )}
            {name === 'messages' && (
                <>
                    <rect x="2.6" y="5" width="18.8" height="14" rx="2.4" />
                    <path d="M3.6 6.4l8.4 6.4 8.4-6.4" />
                </>
            )}
            {name === 'sensing' && (
                <>
                    <path d="M1.8 12s3.8-6.4 10.2-6.4S22.2 12 22.2 12s-3.8 6.4-10.2 6.4S1.8 12 1.8 12z" />
                    <circle cx="12" cy="12" r="2.8" />
                </>
            )}
            {name === 'moving' && (
                <>
                    <path d="M12 2.6v18.8M2.6 12h18.8" />
                    <path d="M9.2 5.4L12 2.6l2.8 2.8M9.2 18.6L12 21.4l2.8-2.8" />
                    <path d="M5.4 9.2L2.6 12l2.8 2.8M18.6 9.2L21.4 12l-2.8 2.8" />
                </>
            )}
            {name === 'speaking' && (
                <>
                    <path d="M3.2 6.4a2.6 2.6 0 0 1 2.6-2.6h12.4a2.6 2.6 0 0 1 2.6 2.6v7a2.6 2.6 0 0 1-2.6 2.6H10l-4.4 4v-4h-.4a2.6 2.6 0 0 1-2.6-2.6z" />
                    <path d="M8 10h.01M12 10h.01M16 10h.01" strokeWidth="2.2" />
                </>
            )}
            {name === 'sound' && (
                <>
                    <path d="M4 9.2h3.4L12 5.2v13.6l-4.6-4H4z" />
                    <path d="M15.6 9.4a3.6 3.6 0 0 1 0 5.2" />
                    <path d="M18.4 6.8a7.2 7.2 0 0 1 0 10.4" />
                </>
            )}
            {name === 'other' && (
                <>
                    <circle cx="12" cy="12" r="9.4" />
                    <path d="M9.3 9.4a2.8 2.8 0 0 1 5.4 1c0 1.9-2.7 2.4-2.7 4" />
                    <circle cx="12" cy="17.4" r="1.1" fill="currentColor" stroke="none" />
                </>
            )}
        </svg>
    );
}
