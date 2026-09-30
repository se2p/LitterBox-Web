// SPDX-License-Identifier: EUPL-1.2
// SPDX-FileCopyrightText: 2026 LitterBox-Web contributors

import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { BASE_URL } from '../../lib/base-url';

/** The address of this result, spelled out. Relative to the application root, without a leading slash. */
interface ResultLinkProps {
    path: string;
    /**
     * What this particular link is worth saying, when the default "link to this result" is not it — a published
     * quiz hands back two links from one action, and a reader who cannot tell them apart by their wording has no
     * way to tell them apart at all.
     */
    label?: string;
    hint?: string;
}

const absoluteUrl = (path: string): string => {
    if (typeof window === 'undefined') return path;
    // Joined by hand: a page that stubs URL for its downloads must still be able to draw this line.
    return `${window.location.origin}${BASE_URL.startsWith('/') ? '' : '/'}${BASE_URL}${path}`;
};

/**
 * What a submission actually hands back is a link, not a code to be kept and typed in somewhere: there is nowhere
 * to type it. So the address is shown as an address, ready to be copied, bookmarked or sent to a teacher.
 */
export function ResultLink({ path, label, hint }: ResultLinkProps) {
    const { t } = useTranslation();
    const [copied, setCopied] = useState(false);
    const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
    const url = absoluteUrl(path);

    useEffect(
        () => () => {
            if (timer.current) clearTimeout(timer.current);
        },
        [],
    );

    const copy = () => {
        if (typeof navigator === 'undefined' || !navigator.clipboard) return;
        void navigator.clipboard.writeText(url).then(
            () => {
                setCopied(true);
                if (timer.current) clearTimeout(timer.current);
                timer.current = setTimeout(() => setCopied(false), 4000);
            },
            () => {
                // Nothing to recover: the address is on screen and can be copied by hand.
            },
        );
    };

    return (
        <div className="result-link">
            <p className="result-link-address">
                <span className="result-link-label">{label ?? t('resultLinkLabel')}:</span>{' '}
                <a className="result-link-value" href={url}>
                    {url}
                </a>
                <button type="button" className="result-link-copy" onClick={copy}>
                    {t('copyLink')}
                </button>
            </p>
            <p className="hint" role="status">
                {copied ? t('copiedLink') : (hint ?? t('resultLinkHint'))}
            </p>
        </div>
    );
}
