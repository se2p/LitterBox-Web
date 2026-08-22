// SPDX-License-Identifier: EUPL-1.2
// SPDX-FileCopyrightText: 2026 LitterBox-Web contributors
import { describe, expect, it } from 'vitest';
import {
    boundedNonblankString,
    boundedString,
    hasExactKeys,
    isJsonContentType,
    isObject,
    isProblemJsonContentType,
    nonnegativeSafeInteger,
    nullableBoundedString,
    positiveSafeInteger,
    problemCodeFrom,
} from '../src/api/validation';
import { isAbortError } from '../src/lib/abort-error';

describe('api response validation', () => {
    it('accepts only plain objects', () => {
        expect(isObject({})).toBe(true);
        for (const value of [null, undefined, [], 'text', 7]) expect(isObject(value)).toBe(false);
    });

    it('requires exactly the declared keys', () => {
        expect(hasExactKeys({ a: 1, b: 2 }, ['a', 'b'])).toBe(true);
        // A field this client does not know about means the response is not the one it was written for.
        expect(hasExactKeys({ a: 1, b: 2, c: 3 }, ['a', 'b'])).toBe(false);
        expect(hasExactKeys({ a: 1 }, ['a', 'b'])).toBe(false);
        // Same count, different names.
        expect(hasExactKeys({ a: 1, z: 2 }, ['a', 'b'])).toBe(false);
    });

    it('bounds strings and rejects blank ones where a value is required', () => {
        expect(boundedString('abc', 3)).toBe(true);
        expect(boundedString('abcd', 3)).toBe(false);
        expect(boundedString('', 3)).toBe(true);
        expect(boundedNonblankString('   ', 3)).toBe(false);
        expect(boundedNonblankString(' a ', 3)).toBe(true);
        expect(nullableBoundedString(null, 3)).toBe(true);
        expect(nullableBoundedString(undefined, 3)).toBe(false);
    });

    it('accepts only safe integers in range', () => {
        expect(positiveSafeInteger(1)).toBe(true);
        for (const value of [0, -1, 1.5, Number.NaN, '1', Number.MAX_SAFE_INTEGER + 2])
            expect(positiveSafeInteger(value)).toBe(false);
        expect(nonnegativeSafeInteger(0)).toBe(true);
        expect(nonnegativeSafeInteger(5, 4)).toBe(false);
        expect(nonnegativeSafeInteger(-1)).toBe(false);
    });

    // Three copies of this had drifted; two recognised only something carrying a name. Both spellings a runtime
    // actually uses are recognised here, and nothing that merely looks like one is.
    it('recognises an abort however the runtime raised it', () => {
        expect(isAbortError(new DOMException('gone', 'AbortError'))).toBe(true);
        const error = new Error('gone');
        error.name = 'AbortError';
        expect(isAbortError(error)).toBe(true);
        expect(isAbortError(new Error('something else'))).toBe(false);
        expect(isAbortError({ name: 'AbortError' })).toBe(false);
        expect(isAbortError(undefined)).toBe(false);
    });

    it('separates a payload content type from a problem content type', () => {
        expect(isJsonContentType('application/json')).toBe(true);
        expect(isJsonContentType('Application/JSON; charset=UTF-8')).toBe(true);
        // A problem is not a payload: a success path must not read one as its result.
        expect(isJsonContentType('application/problem+json')).toBe(false);
        expect(isJsonContentType('text/html')).toBe(false);
        expect(isJsonContentType(null)).toBe(false);
        expect(isJsonContentType('application/json; charset=iso-8859-1')).toBe(false);

        // The service answers errors as RFC 9457 problems, which is what it really sends.
        expect(isProblemJsonContentType('application/problem+json')).toBe(true);
        expect(isProblemJsonContentType('application/json')).toBe(true);
        expect(isProblemJsonContentType('text/plain')).toBe(false);
    });

    it('reads a known problem code and nothing else', () => {
        const known = (value: unknown): value is 'capability_disabled' =>
            value === 'capability_disabled';
        expect(problemCodeFrom('{"code":"capability_disabled"}', known)).toBe(
            'capability_disabled',
        );
        expect(problemCodeFrom('{"code":"something_else"}', known)).toBeUndefined();
        expect(problemCodeFrom('{"code":42}', known)).toBeUndefined();
        // A body that is not an object, or not JSON at all, yields nothing rather than throwing.
        expect(problemCodeFrom('["capability_disabled"]', known)).toBeUndefined();
        expect(problemCodeFrom('not json', known)).toBeUndefined();
    });
});
