// SPDX-License-Identifier: EUPL-1.2
// SPDX-FileCopyrightText: 2026 LitterBox-Web contributors

import { useRef, useState } from 'react';
import { publishAssessment, type AssessmentQuestionInput } from '../../api/assessments';
import type { AssessmentLimits } from '../../api/capabilities';
import {
    publishedQuizzes,
    rememberPublishedQuiz,
    type PublishedQuiz,
} from '../../lib/published-quizzes';
import type { AssessmentQuestionDraft } from './AssessmentQuestionCard';

export type PublishState =
    | { status: 'idle' }
    | { status: 'publishing' }
    | { status: 'error' }
    | { status: 'done'; publicToken: string; teacherToken: string };

export interface UseAssessmentPublishResult {
    publishState: PublishState;
    confirmFallbackOpen: boolean;
    closeConfirmFallback: () => void;
    fallbackSelected: AssessmentQuestionDraft[];
    remembered: PublishedQuiz[];
    requestPublish: () => void;
    publish: () => Promise<void>;
}

export function useAssessmentPublish({
    token,
    analysisId,
    locale,
    title,
    instructions,
    selected,
    limits,
    unmarkedOnPublish,
    publishQuestion,
}: {
    token: string;
    analysisId: number;
    locale: string;
    title: string;
    instructions: string;
    selected: AssessmentQuestionDraft[];
    limits: AssessmentLimits;
    unmarkedOnPublish: (draft: AssessmentQuestionDraft) => boolean;
    publishQuestion: (draft: AssessmentQuestionDraft) => AssessmentQuestionInput;
}): UseAssessmentPublishResult {
    const [publishState, setPublishState] = useState<PublishState>({ status: 'idle' });
    const [confirmFallbackOpen, setConfirmFallbackOpen] = useState(false);
    const publishing = useRef(false);
    const [remembered, setRemembered] = useState<PublishedQuiz[]>(() => publishedQuizzes());

    const fallbackSelected = selected.filter(unmarkedOnPublish);

    const requestPublish = () => {
        if (fallbackSelected.length > 0) {
            setConfirmFallbackOpen(true);
            return;
        }
        void publish();
    };

    const publish = async () => {
        if (publishing.current) return;
        publishing.current = true;
        setConfirmFallbackOpen(false);
        setPublishState({ status: 'publishing' });
        try {
            const publishedTitle = title.trim();
            const result = await publishAssessment(
                token,
                {
                    analysisId,
                    title: publishedTitle,
                    instructions: instructions.trim(),
                    locale,
                    questions: selected.map(publishQuestion),
                },
                limits,
            );
            rememberPublishedQuiz({
                publicToken: result.publicToken,
                teacherToken: result.teacherToken,
                title: publishedTitle,
                at: Date.now(),
            });
            setRemembered(publishedQuizzes());
            setPublishState({
                status: 'done',
                publicToken: result.publicToken,
                teacherToken: result.teacherToken,
            });
        } catch {
            setPublishState({ status: 'error' });
        } finally {
            publishing.current = false;
        }
    };

    return {
        publishState,
        confirmFallbackOpen,
        closeConfirmFallback: () => setConfirmFallbackOpen(false),
        fallbackSelected,
        remembered,
        requestPublish,
        publish,
    };
}
