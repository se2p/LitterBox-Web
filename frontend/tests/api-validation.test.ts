// SPDX-License-Identifier: EUPL-1.2
// SPDX-FileCopyrightText: 2026 LitterBox-Web contributors
import { afterEach, describe, expect, it, vi } from 'vitest';
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
import { fetchMetricReference } from '../src/api/metric-reference';

describe('api response validation', () => {
    it('accepts only plain objects', () => {
        expect(isObject({})).toBe(true);
        for (const value of [null, undefined, [], 'text', 7]) expect(isObject(value)).toBe(false);
    });

    it('requires exactly the declared keys', () => {
        expect(hasExactKeys({ a: 1, b: 2 }, ['a', 'b'])).toBe(true);
        expect(hasExactKeys({ a: 1, b: 2, c: 3 }, ['a', 'b'])).toBe(false);
        expect(hasExactKeys({ a: 1 }, ['a', 'b'])).toBe(false);
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
        expect(problemCodeFrom('["capability_disabled"]', known)).toBeUndefined();
        expect(problemCodeFrom('not json', known)).toBeUndefined();
    });
});

describe('metric reference band validation', () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    const respondWith = (metrics: readonly unknown[]) =>
        vi.spyOn(globalThis, 'fetch').mockResolvedValue(
            new Response(JSON.stringify({ metrics }), {
                status: 200,
                headers: { 'Content-Type': 'application/json' },
            }),
        );

    it('keeps a band whose five-number summary is present and in nondecreasing order', async () => {
        respondWith([
            {
                name: 'block_count',
                sampleSize: 40,
                lowerBound: 20,
                upperBound: 90,
                minimum: 1,
                q1: 15,
                median: 40,
                q3: 80,
                maximum: 200,
            },
        ]);
        const [band] = await fetchMetricReference();
        expect(band).toMatchObject({
            name: 'block_count',
            minimum: 1,
            q1: 15,
            median: 40,
            q3: 80,
            maximum: 200,
        });
    });

    it('keeps a band whose five-number summary is entirely absent - an older deployment - for the tercile fallback', async () => {
        respondWith([{ name: 'block_count', sampleSize: 40, lowerBound: 20, upperBound: 90 }]);
        const [band] = await fetchMetricReference();
        expect(band).toBeDefined();
        expect(band?.lowerBound).toBe(20);
        expect(band?.minimum).toBeUndefined();
        expect(band?.median).toBeUndefined();
        expect(band?.maximum).toBeUndefined();
    });

    it('drops a band whose five-number summary is out of order - it would draw a box outside its own whiskers', async () => {
        respondWith([
            {
                name: 'block_count',
                sampleSize: 40,
                lowerBound: 20,
                upperBound: 90,
                minimum: 1,
                q1: 50,
                median: 40,
                q3: 80,
                maximum: 200,
            },
        ]);
        expect(await fetchMetricReference()).toHaveLength(0);
    });

    it('drops a band that sends only some of the five fields, rather than guess at the rest', async () => {
        respondWith([
            {
                name: 'block_count',
                sampleSize: 40,
                lowerBound: 20,
                upperBound: 90,
                minimum: 1,
                median: 40,
            },
        ]);
        expect(await fetchMetricReference()).toHaveLength(0);
    });

    it('still drops a band whose tercile bounds are the wrong way round, regardless of the five-number summary', async () => {
        respondWith([{ name: 'block_count', sampleSize: 40, lowerBound: 90, upperBound: 20 }]);
        expect(await fetchMetricReference()).toHaveLength(0);
    });
});
