// SPDX-License-Identifier: EUPL-1.2
// SPDX-FileCopyrightText: 2026 LitterBox-Web contributors

import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
    exportQuestion,
    generatedDrafts,
    publishQuestion,
} from '../src/components/questions/assessment-draft';
import {
    readAssessmentDraft,
    saveAssessmentDraft,
} from '../src/components/questions/assessment-draft-store';
import { normalizeQuizQuestion } from '../src/components/questions/quiz-question';
import { forgetProjects } from '../src/lib/recent-projects';

describe('device quiz drafts', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
        window.localStorage.clear();
    });

    const draft = () => ({
        title: '',
        instructions: 'Unfinished instructions',
        drafts: generatedDrafts([
            normalizeQuizQuestion({ questionId: 'q1', question: '', options: [] })!,
        ]),
    });

    it('preserves unfinished edits and isolates submissions and analyses', () => {
        const saved = draft();
        expect(saveAssessmentDraft('token-a', 1, saved)).toBe(true);
        expect(readAssessmentDraft('token-a', 1)).toEqual(saved);
        expect(readAssessmentDraft('token-b', 1)).toBeUndefined();
        expect(readAssessmentDraft('token-a', 2)).toBeUndefined();
    });

    it('ignores malformed storage and duplicate draft identities', () => {
        const key = 'litterbox.assessment-draft.token-a.1';
        window.localStorage.setItem(key, 'not JSON');
        expect(readAssessmentDraft('token-a', 1)).toBeUndefined();
        const saved = draft();
        saved.drafts.push(saved.drafts[0]!);
        saveAssessmentDraft('token-a', 1, saved);
        expect(readAssessmentDraft('token-a', 1)).toBeUndefined();
        window.localStorage.setItem(
            key,
            JSON.stringify({ schemaVersion: 1, ...draft(), drafts: [{}] }),
        );
        expect(readAssessmentDraft('token-a', 1)).toBeUndefined();
    });

    it.each([
        { marked: ['Alpha'], remaining: [] },
        { marked: ['Alpha', 'Beta'], remaining: ['Beta'] },
        { marked: [], remaining: [] },
    ])('reconciles choices edited before blur on reload: $marked', ({ marked, remaining }) => {
        const saved = draft();
        Object.assign(saved.drafts[0]!, {
            questionType: 'MULTIPLE_CHOICE',
            options: ['Gamma', 'Beta'],
            optionsText: 'Gamma\nBeta\n ',
            correctAnswers: marked,
            expectedAnswers: 3,
        });
        saveAssessmentDraft('token-a', 1, saved);
        const restored = readAssessmentDraft('token-a', 1)!.drafts[0]!;
        expect(restored.optionsText).toBe('Gamma\nBeta\n ');
        expect(restored.correctAnswers).toEqual(remaining);
        expect(restored.expectedAnswers).toBe(2);
        expect(exportQuestion(restored).expectedAnswers).toBe(remaining.length || 2);
        expect(publishQuestion(restored, new Map())).toMatchObject({
            expectedAnswers: remaining.length || 2,
            correctAnswers: remaining.length ? remaining : undefined,
        });
    });

    it('keeps the five most recently saved drafts without evicting unrelated storage', () => {
        window.localStorage.setItem('unrelated', 'kept');
        window.localStorage.setItem('litterbox.assessment-draft.legacy.1', 'broken');
        let now = 100;
        vi.spyOn(Date, 'now').mockImplementation(() => now++);
        for (let index = 1; index <= 5; index++) saveAssessmentDraft(`token-${index}`, 1, draft());
        expect(readAssessmentDraft('legacy', 1)).toBeUndefined();
        expect(window.localStorage.getItem('litterbox.assessment-draft.legacy.1')).toBeNull();
        saveAssessmentDraft('token-1', 1, draft());
        saveAssessmentDraft('token-6', 1, draft());
        expect(readAssessmentDraft('token-1', 1)).toEqual(draft());
        expect(readAssessmentDraft('token-2', 1)).toBeUndefined();
        expect(readAssessmentDraft('token-6', 1)).toEqual(draft());
        expect(window.localStorage.length).toBe(6);
        expect(window.localStorage.getItem('unrelated')).toBe('kept');
    });

    it('deletes all question drafts when forgetting questions or all history, but not other kinds', () => {
        window.localStorage.setItem('unrelated', 'kept');
        saveAssessmentDraft('token-a', 1, draft());
        saveAssessmentDraft('token-b', 2, draft());
        forgetProjects(['issues', 'batch']);
        expect(readAssessmentDraft('token-a', 1)).toEqual(draft());
        forgetProjects(['questions']);
        expect(readAssessmentDraft('token-a', 1)).toBeUndefined();
        expect(readAssessmentDraft('token-b', 2)).toBeUndefined();
        saveAssessmentDraft('token-a', 1, draft());
        forgetProjects();
        expect(readAssessmentDraft('token-a', 1)).toBeUndefined();
        expect(window.localStorage.getItem('unrelated')).toBe('kept');
    });

    it('does not evict saved drafts when a new write fails', () => {
        for (let index = 1; index <= 5; index++) saveAssessmentDraft(`token-${index}`, 1, draft());
        vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
            throw new Error('Storage full');
        });
        expect(saveAssessmentDraft('token-6', 1, draft())).toBe(false);
        expect(window.localStorage.length).toBe(5);
        expect(readAssessmentDraft('token-1', 1)).toEqual(draft());
    });
});
