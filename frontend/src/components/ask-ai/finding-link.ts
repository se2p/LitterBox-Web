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

const compare = (value: string | undefined, locale: string): string =>
    richHintPlainText(value ?? '', locale).toLowerCase();

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
    const scoped = (finding: AskAiFinding | undefined): ConversationScope | undefined =>
        finding ? { kind: 'finding', selector: finding.selector, label: finding.label } : undefined;

    let candidates = params.finder
        ? questions.findings.filter((finding) => finding.finder === params.finder)
        : [];

    if (candidates.length > 1 && params.sprite) {
        const wanted = params.sprite.toLowerCase().trim();
        const inSprite = candidates.filter(
            (finding) => (actorOf(questions, finding)?.label ?? '').toLowerCase().trim() === wanted,
        );
        if (inSprite.length > 0) candidates = inSprite;
    }

    if (candidates.length > 1 && params.finding) {
        const wanted = compare(params.finding, locale);
        const sameWords = candidates.filter((finding) => compare(finding.label, locale) === wanted);
        if (sameWords.length > 0) candidates = sameWords;
    }

    if (candidates.length === 1) return scoped(candidates[0]);

    // Fall back to the label only when no finder candidate exists.
    if (candidates.length === 0 && params.finding) {
        const wanted = compare(params.finding, locale);
        return scoped(
            questions.findings.find((finding) => compare(finding.label, locale) === wanted),
        );
    }

    return undefined;
};
