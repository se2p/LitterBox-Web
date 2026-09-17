// SPDX-License-Identifier: EUPL-1.2
// SPDX-FileCopyrightText: 2026 LitterBox-Web contributors

const MAX_DOTS = 10;

export function RepliesRemainingDots({
    remaining,
    budget,
    label,
}: {
    remaining: number;
    budget: number;
    label: string;
}) {
    // The row of marks only makes sense once the end of the budget is in sight; the count in words always does.
    const total = Math.min(Math.max(budget, remaining, 1), MAX_DOTS);
    return (
        <div className="ask-ai-replies-remaining">
            {remaining <= MAX_DOTS && (
                <span className="ask-ai-reply-dots" aria-hidden="true">
                    {Array.from({ length: total }, (_, index) => (
                        <span
                            key={index}
                            className={`ask-ai-reply-dot ${index < remaining ? 'ask-ai-reply-dot-left' : 'ask-ai-reply-dot-spent'}`}
                        />
                    ))}
                </span>
            )}
            <span className="ask-ai-replies-remaining-text">{label}</span>
        </div>
    );
}
