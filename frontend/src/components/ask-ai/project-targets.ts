// SPDX-License-Identifier: EUPL-1.2
// SPDX-FileCopyrightText: 2026 LitterBox-Web contributors

import type { AskAiFinding, AskAiInquiry, AskAiQuestions, AskAiTarget } from '../../api/ask-ai';

export interface TargetNode {
    target: AskAiTarget;
    inquiries: AskAiInquiry[];
    findings: AskAiFinding[];
    scripts: TargetNode[];
}

export interface ProjectTree {
    program: TargetNode | undefined;
    actors: TargetNode[];
    byKey: Map<string, TargetNode>;
}

const emptyNode = (target: AskAiTarget): TargetNode => ({
    target,
    inquiries: [],
    findings: [],
    scripts: [],
});

const isActor = (target: AskAiTarget): boolean =>
    target.kind === 'sprite' || target.kind === 'stage';

const isScript = (target: AskAiTarget): boolean =>
    target.kind === 'script' || target.kind === 'procedure';

/** Group the flat target list while preserving service order; unknown target keys fall back to the project. */
export const buildProjectTree = (questions: AskAiQuestions): ProjectTree => {
    const byKey = new Map<string, TargetNode>();
    for (const target of questions.targets) byKey.set(target.key, emptyNode(target));

    const program = questions.targets.find((target) => target.kind === 'program');
    const programNode = program ? byKey.get(program.key) : undefined;
    const nodeFor = (key: string): TargetNode | undefined => byKey.get(key) ?? programNode;

    for (const inquiry of questions.inquiries) nodeFor(inquiry.target)?.inquiries.push(inquiry);
    for (const finding of questions.findings) nodeFor(finding.target)?.findings.push(finding);

    const actors: TargetNode[] = [];
    for (const target of questions.targets) {
        const node = byKey.get(target.key);
        if (!node) continue;
        if (isActor(target)) actors.push(node);
        if (isScript(target)) byKey.get(target.parent)?.scripts.push(node);
    }

    return { program: programNode, actors, byKey };
};
