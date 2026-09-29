// SPDX-License-Identifier: EUPL-1.2
// SPDX-FileCopyrightText: 2025 LitterBox-Web contributors

import { useEffect, useRef, useState } from 'react';
import {
    normalizeScratchblocksTransforms,
    prepareScratchblocks,
    translateScratchblocks,
} from '../../lib/scratchblocks-runtime';
import { normalizeScratchblocksSource, scratchblocksLanguages } from './scratchblocks-source';

/**
 * How large a rendered block is drawn. Blocks are quoted evidence inside an explanation, and at full size they read as
 * the point of the paragraph rather than as the thing being pointed at, so they are drawn a little under the
 * surrounding prose.
 */
const BLOCK_SCALE = 0.6;

interface ScratchblocksPreviewProps {
    source: string | null | undefined;
    locale?: string;
    label: string;
    textAlternativeLabel: string;
    inline?: boolean;
    showLabel?: boolean;
    showTextAlternative?: boolean;
    /**
     * What to write out in place of the source when the drawing is unavailable. Set where the drawn source carries
     * markup that exists only for the drawing — colour markers on the blocks that changed, say — which would read
     * as noise to anybody handed the text instead.
     */
    alternativeSource?: string | null;
    /**
     * Wait for the browser to be idle before fetching the renderer. Set on drawings that decorate a page rather
     * than carry any of its content: the renderer and its dictionaries are a sixth of a megabyte, and a landing
     * page should be usable before it has been made to look like anything.
     */
    deferred?: boolean;
}

/**
 * After the page has settled, or after a moment if it never does. `requestIdleCallback` is absent in Safari and in
 * jsdom; the fallback is short enough that a picture still arrives promptly.
 */
const whenIdle = (start: () => void): (() => void) => {
    const view = typeof window === 'undefined' ? undefined : window;
    const idle = view as
        (Window & { requestIdleCallback?: typeof requestIdleCallback }) | undefined;
    if (idle?.requestIdleCallback) {
        const handle = idle.requestIdleCallback(start, { timeout: 2_000 });
        return () => idle.cancelIdleCallback?.(handle);
    }
    const timer = setTimeout(start, 200);
    return () => clearTimeout(timer);
};

export function ScratchblocksPreview({
    source,
    locale = 'en',
    label,
    textAlternativeLabel,
    inline = false,
    showLabel = true,
    showTextAlternative = true,
    alternativeSource,
    deferred = false,
}: ScratchblocksPreviewProps) {
    const hostRef = useRef<HTMLElement>(null);
    const setHostRef = (host: HTMLElement | null): void => {
        hostRef.current = host;
    };
    const [state, setState] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
    const code = normalizeScratchblocksSource(source);
    const readableCode =
        alternativeSource === undefined || alternativeSource === null
            ? code
            : normalizeScratchblocksSource(alternativeSource);

    useEffect(() => {
        const host = hostRef.current;
        if (!host || !code.trim()) {
            setState('idle');
            return;
        }
        let active = true;
        host.replaceChildren();
        setState('loading');

        const draw = () => {
            void prepareScratchblocks(host.ownerDocument)
                .then((renderer) => {
                    if (!active || !host.ownerDocument.defaultView) return;
                    const languages = scratchblocksLanguages(locale);
                    const documentModel = renderer.parse(code, {
                        inline,
                        languages,
                    });
                    translateScratchblocks(renderer, documentModel, languages[0]);
                    const rendered = renderer.render(documentModel, {
                        inline,
                        languages,
                        scale: BLOCK_SCALE,
                        style: 'scratch3',
                    });
                    const NodeConstructor = host.ownerDocument.defaultView.Node;
                    if (!(rendered instanceof NodeConstructor))
                        throw new Error('Scratchblocks did not return a DOM node');
                    normalizeScratchblocksTransforms(rendered);
                    host.replaceChildren(rendered);
                    if (active) setState('ready');
                })
                .catch(() => {
                    if (active) setState('error');
                });
        };
        let cancel: (() => void) | undefined;
        if (deferred) cancel = whenIdle(draw);
        else draw();

        return () => {
            active = false;
            cancel?.();
            host.replaceChildren();
        };
    }, [code, deferred, inline, locale]);

    if (!code.trim()) return null;

    if (inline) {
        return (
            <span
                className="scratchblocks-inline-preview"
                aria-label={`${label}: ${readableCode}`}
                data-render-state={state}
            >
                <span
                    ref={setHostRef}
                    className="scratchblocks-inline-rendered"
                    aria-hidden="true"
                    data-render-state={state}
                />
                {state === 'error' ? (
                    <code className="scratchblocks-inline-fallback">{readableCode}</code>
                ) : (
                    <span className="visually-hidden">{readableCode}</span>
                )}
            </span>
        );
    }

    return (
        <section className="scratchblocks-preview" aria-label={label}>
            {showLabel && <p className="code-label">{label}</p>}
            <div
                ref={setHostRef}
                className="scratchblocks-rendered"
                aria-hidden="true"
                data-render-state={state}
            />
            {/* Where the alternative is wanted at all, a drawing that never arrived is shown as its source: the
                source is then all there is left to show. Where a caller has suppressed it, it stays suppressed
                even then — those callers draw this inside a button, and a disclosure widget in a press target is
                interactive content nobody can reach: it takes the press meant for the button, and it is focusable
                inside the very region its caller marked as decoration. The words on the button say what it is. */}
            {showTextAlternative && (
                <details className="code-alternative" open={state === 'error'}>
                    <summary>{textAlternativeLabel}</summary>
                    <pre>{readableCode}</pre>
                </details>
            )}
        </section>
    );
}
