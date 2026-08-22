// SPDX-License-Identifier: EUPL-1.2
// SPDX-FileCopyrightText: 2025 LitterBox-Web contributors
import { useState } from 'react';
import { BASE_URL } from '../lib/base-url';

export type FeedbackReaction = 'helpful' | 'not-helpful';

interface FeedbackControlsProps {
    label: string;
    helpfulLabel: string;
    notHelpfulLabel: string;
    savingMessage: string;
    savedMessage: string;
    errorMessage: string;
    onReact: (reaction: FeedbackReaction) => Promise<void>;
}

export function FeedbackControls({
    label,
    helpfulLabel,
    notHelpfulLabel,
    savingMessage,
    savedMessage,
    errorMessage,
    onReact,
}: FeedbackControlsProps) {
    const [saved, setSaved] = useState<FeedbackReaction>();
    const [state, setState] = useState<'idle' | 'saving' | 'error'>('idle');

    const react = async (reaction: FeedbackReaction) => {
        setState('saving');
        try {
            await onReact(reaction);
            setSaved(reaction);
            setState('idle');
        } catch {
            setState('error');
        }
    };

    return (
        <div
            className="feedback-controls"
            role="group"
            aria-label={label}
            aria-busy={state === 'saving'}
        >
            <button
                type="button"
                className={saved === 'helpful' ? 'selected' : ''}
                aria-label={helpfulLabel}
                aria-pressed={saved === 'helpful'}
                disabled={state === 'saving'}
                onClick={() => void react('helpful')}
            >
                <img className="feedback-icon" src={`${BASE_URL}ui/thumbs-up.png`} alt="" />
                <span className="feedback-label">{helpfulLabel}</span>
            </button>
            <button
                type="button"
                className={saved === 'not-helpful' ? 'selected' : ''}
                aria-label={notHelpfulLabel}
                aria-pressed={saved === 'not-helpful'}
                disabled={state === 'saving'}
                onClick={() => void react('not-helpful')}
            >
                <img className="feedback-icon" src={`${BASE_URL}ui/thumbs-down.png`} alt="" />
                <span className="feedback-label">{notHelpfulLabel}</span>
            </button>
            {state === 'saving' && <span role="status">{savingMessage}</span>}
            {saved && state !== 'saving' && <span role="status">{savedMessage}</span>}
            {state === 'error' && <span role="alert">{errorMessage}</span>}
        </div>
    );
}
