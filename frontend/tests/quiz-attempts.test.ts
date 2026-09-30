// SPDX-License-Identifier: EUPL-1.2
// SPDX-FileCopyrightText: 2026 LitterBox-Web contributors

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
    forgetQuizAttempt,
    rememberQuizAnswer,
    rememberQuizAttempt,
    storedQuizAttempt,
} from '../src/lib/quiz-attempts';
import {
    forgetPublishedQuiz,
    publishedQuizzes,
    rememberPublishedQuiz,
} from '../src/lib/published-quizzes';

/**
 * What this device remembers about a quiz it is part way through.
 *
 * <p>
 * The store is a string in a browser the service does not control: another tab writes it, an extension rewrites it,
 * a reader edits it by hand, an older version of this application left a different shape behind. None of that may
 * cost a class the quiz they are sitting — losing the resumed answers is a disappointment, but throwing on the way
 * to the page would take the questions away too.
 */
describe('remembered quiz attempts', () => {
    const KEY = 'litterbox.quiz-attempts';

    beforeEach(() => window.localStorage.clear());
    afterEach(() => window.localStorage.clear());

    it('remembers an attempt and the answers given on it', () => {
        rememberQuizAttempt('pub-1', 'attempt-1');
        rememberQuizAnswer('pub-1', 'attempt-1', 'q1', { correct: true, correctAnswers: ['a'] });
        rememberQuizAnswer('pub-1', 'attempt-1', 'q2', undefined);

        const stored = storedQuizAttempt('pub-1');
        expect(stored?.attemptId).toBe('attempt-1');
        expect(stored?.answers).toEqual([
            { questionId: 'q1', verdict: { correct: true, correctAnswers: ['a'] } },
            { questionId: 'q2', verdict: null },
        ]);
    });

    it('forgets nothing but the quiz it is asked to forget', () => {
        rememberQuizAttempt('pub-1', 'attempt-1');
        rememberQuizAttempt('pub-2', 'attempt-2');

        forgetQuizAttempt('pub-1');

        expect(storedQuizAttempt('pub-1')).toBeUndefined();
        expect(storedQuizAttempt('pub-2')?.attemptId).toBe('attempt-2');
    });

    it.each([
        ['not json at all', 'a value that is not JSON'],
        ['{"publicToken":"pub-1"}', 'an object where a list belongs'],
        ['[{"publicToken":"pub-1"}]', 'an entry with no attempt'],
        [
            '[{"publicToken":"pub-1","attemptId":"a","answers":"none","at":1}]',
            'answers that are not a list',
        ],
        [
            '[{"publicToken":"pub-1","attemptId":"a","answers":[{"questionId":1,"verdict":null}],"at":1}]',
            'a question id that is not a string',
        ],
        [
            '[{"publicToken":"pub-1","attemptId":"a","answers":[{"questionId":"q","verdict":{"correct":"yes","correctAnswers":[]}}],"at":1}]',
            'a verdict whose correctness is not a boolean',
        ],
    ])('reads nothing rather than throwing on %s', (stored) => {
        window.localStorage.setItem(KEY, stored);

        expect(() => storedQuizAttempt('pub-1')).not.toThrow();
        expect(storedQuizAttempt('pub-1')).toBeUndefined();
    });

    it('writes over a store it could not read, so one bad value is not permanent', () => {
        window.localStorage.setItem(KEY, 'not json at all');

        rememberQuizAttempt('pub-1', 'attempt-1');

        expect(storedQuizAttempt('pub-1')?.attemptId).toBe('attempt-1');
    });

    it('keeps the sound entries in a store where only one is broken', () => {
        window.localStorage.setItem(
            KEY,
            '[{"publicToken":"pub-1"},{"publicToken":"pub-2","attemptId":"attempt-2","answers":[],"at":1}]',
        );

        expect(storedQuizAttempt('pub-1')).toBeUndefined();
        expect(storedQuizAttempt('pub-2')?.attemptId).toBe('attempt-2');
    });
});

/**
 * The sibling list: the quizzes a teacher has published from this browser.
 *
 * <p>
 * The stakes are higher here than for a half-finished attempt. The service shows a quiz's teacher token exactly
 * once and will never hand it back, so an entry dropped from this list while its quiz is still live has no
 * recovery path at all — not in this browser, and not on the service.
 */
describe('remembered published quizzes', () => {
    const KEY = 'litterbox.published-quizzes';

    beforeEach(() => window.localStorage.clear());
    afterEach(() => window.localStorage.clear());

    const quiz = (index: number) => ({
        publicToken: `pub-${index}`,
        teacherToken: `teach-${index}`,
        title: `Quiz ${index}`,
        at: index,
    });

    it('remembers far more than a term of weekly quizzes, so none is lost while it is still live', () => {
        // The service keeps results for 180 days by default; one quiz a week over that window is about 26.
        for (let index = 1; index <= 30; index += 1) rememberPublishedQuiz(quiz(index));

        const remembered = publishedQuizzes();
        expect(remembered).toHaveLength(30);
        expect(remembered.map((entry) => entry.publicToken)).toContain('pub-1');
    });

    it('hands back the newest first, whatever order the store happens to hold them in', () => {
        window.localStorage.setItem(KEY, JSON.stringify([quiz(1), quiz(3), quiz(2)]));

        expect(publishedQuizzes().map((entry) => entry.publicToken)).toEqual([
            'pub-3',
            'pub-2',
            'pub-1',
        ]);
    });

    it('forgets nothing but the quiz it is asked to forget', () => {
        rememberPublishedQuiz(quiz(1));
        rememberPublishedQuiz(quiz(2));

        forgetPublishedQuiz('pub-1');

        expect(publishedQuizzes().map((entry) => entry.publicToken)).toEqual(['pub-2']);
    });

    it('forgets nothing at all when asked for a quiz it never held', () => {
        rememberPublishedQuiz(quiz(1));

        forgetPublishedQuiz('pub-never-published');

        expect(publishedQuizzes().map((entry) => entry.publicToken)).toEqual(['pub-1']);
    });

    it('reads nothing rather than throwing on a store holding something else entirely', () => {
        window.localStorage.setItem(KEY, '[{"publicToken":"pub-1"}]');

        expect(() => publishedQuizzes()).not.toThrow();
        expect(publishedQuizzes()).toEqual([]);
    });
});
