// SPDX-License-Identifier: EUPL-1.2
// SPDX-FileCopyrightText: 2026 LitterBox-Web contributors

/** Share query encoding and resolution so the analysis and Ask AI routes stay compatible. */
import type { AskAiFinding, AskAiQuestions, AskAiTarget } from '../../api/ask-ai';
import type { ConversationScope } from '../../pages/ask-ai-machine';
import { richHintPlainText } from '../single-project/rich-hint';

export interface FindingLinkSource {
    finderId?: string;
    sprite?: string;
    hint?: string;
}

export interface FindingLinkParams {
    finder?: string;
    sprite?: string;
    finding?: string;
}

const findingLinkQuery = (source: FindingLinkSource): string => {
    const params = new URLSearchParams();
    if (source.finderId) params.set('finder', source.finderId);
    if (source.sprite) params.set('sprite', source.sprite);
    if (source.hint) params.set('finding', source.hint);
    return params.toString();
};

export const findingLinkTo = (token: string, source: FindingLinkSource): string => {
    const query = findingLinkQuery(source);
    return `/ask-ai/submissions/${encodeURIComponent(token)}${query ? `?${query}` : ''}`;
};

export const findingLinkParams = (search: string): FindingLinkParams => {
    const params = new URLSearchParams(search);
    const read = (name: string) => params.get(name)?.trim() || undefined;
    return {
        finder: read('finder'),
        sprite: read('sprite'),
        finding: read('finding'),
    };
};

const normalise = (value: string): string => value.trim().toLowerCase();

/** The sprite or stage a finding sits in: the target's parent, or the target itself when it is one. */
export const actorOf = (
    questions: AskAiQuestions,
    finding: AskAiFinding,
): AskAiTarget | undefined => {
    const target = questions.targets.find((candidate) => candidate.key === finding.target);
    if (!target) return undefined;
    return target.parent
        ? questions.targets.find((candidate) => candidate.key === target.parent)
        : target;
};

/** Resolve only an unambiguous finding link. */
export const scopeForLink = (
    questions: AskAiQuestions,
    params: FindingLinkParams,
    locale: string,
): ConversationScope | undefined => {
    const scoped = (finding: AskAiFinding): ConversationScope => ({
        kind: 'finding',
        selector: finding.selector,
        label: finding.label,
    });
    const findingText = (value: string): string => normalise(richHintPlainText(value, locale));

    // Every supplied discriminator must hold, so an absent occurrence never resolves to a sibling.
    const narrow = (candidates: AskAiFinding[]): AskAiFinding[] => {
        let remaining = candidates;
        if (params.sprite) {
            const wanted = normalise(params.sprite);
            remaining = remaining.filter(
                (finding) => normalise(actorOf(questions, finding)?.label ?? '') === wanted,
            );
        }
        if (params.finding) {
            const wanted = findingText(params.finding);
            remaining = remaining.filter((finding) => findingText(finding.label) === wanted);
        }
        return remaining;
    };

    const { findings } = questions;
    const byFinder = params.finder
        ? findings.filter((finding) => finding.finder === params.finder)
        : [];
    // With no finder to go by, the words must name the finding, and any sprite must still agree.
    const candidates = byFinder.length > 0 ? byFinder : params.finding ? findings : [];
    const narrowed = narrow(candidates);
    return narrowed.length === 1 ? scoped(narrowed[0]) : undefined;
};
