// SPDX-License-Identifier: EUPL-1.2
// SPDX-FileCopyrightText: 2026 LitterBox-Web contributors

/**
 * The checks every capability response is put through before anything is read out of it. A response is untrusted
 * input, so each feature declares the exact shape it expects; these are the pieces those declarations are built
 * from, kept in one place so they cannot drift apart from one another.
 *
 * Only the shape checks live here. What each feature's payload has to look like stays with the feature, where it
 * can be read against the endpoint it belongs to.
 */

export const isObject = (value: unknown): value is Record<string, unknown> =>
    value !== null && typeof value === 'object' && !Array.isArray(value);

/** Exactly these keys and no others: an unexpected field means the response is not what this client knows. */
export const hasExactKeys = (
    value: unknown,
    keys: readonly string[],
): value is Record<string, unknown> =>
    isObject(value) &&
    Object.keys(value).length === keys.length &&
    keys.every((key) => Object.prototype.hasOwnProperty.call(value, key));

export const boundedString = (value: unknown, maximum: number): value is string =>
    typeof value === 'string' && value.length <= maximum;

export const boundedNonblankString = (value: unknown, maximum: number): value is string =>
    boundedString(value, maximum) && value.trim().length > 0;

export const nullableBoundedString = (value: unknown, maximum: number): value is string | null =>
    value === null || boundedString(value, maximum);

export const positiveSafeInteger = (value: unknown): value is number =>
    typeof value === 'number' && Number.isSafeInteger(value) && value > 0;

export const nonnegativeSafeInteger = (
    value: unknown,
    maximum: number = Number.MAX_SAFE_INTEGER,
): value is number =>
    typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 && value <= maximum;

const mediaTypeOf = (value: string | null): { mediaType: string; parameters: string[] } => {
    const [mediaType, ...parameters] = (value ?? '')
        .split(';')
        .map((part) => part.trim().toLowerCase());
    return { mediaType: mediaType ?? '', parameters };
};

/** What a successful capability response must be. Anything else is not a payload this client will read. */
export const isJsonContentType = (value: string | null): boolean => {
    if (!value) return false;
    const { mediaType, parameters } = mediaTypeOf(value);
    return (
        mediaType === 'application/json' &&
        parameters.every((parameter) => parameter === '' || parameter === 'charset=utf-8')
    );
};

/** What a failure carries. The service answers errors as RFC 9457 problems, so both spellings are accepted. */
export const isProblemJsonContentType = (value: string | null): boolean => {
    if (!value) return false;
    const { mediaType, parameters } = mediaTypeOf(value);
    return (
        (mediaType === 'application/json' || mediaType === 'application/problem+json') &&
        parameters.every((parameter) => parameter === '' || parameter === 'charset=utf-8')
    );
};

/**
 * Whether the body was transformed in transit — gzip, br, deflate, zstd, or anything else `fetch` decodes before
 * handing the bytes back. Content-Length in that case still describes what went over the wire, not the decoded
 * bytes this client counts, so a caller comparing declared length against bytes read must treat the two as
 * unrelated quantities whenever this is true.
 */
export const isContentEncoded = (value: string | null): boolean => {
    const normalized = value?.trim().toLowerCase() ?? '';
    return normalized !== '' && normalized !== 'identity';
};

/**
 * The `code` out of a problem body, when it is one this caller knows. How the bytes were read differs between
 * features — each has its own ceiling and its own way of saying the response was too large — so only the reading
 * of the parsed body is shared.
 */
export const problemCodeFrom = <T extends string>(
    text: string,
    isKnownCode: (value: unknown) => value is T,
): T | undefined => {
    try {
        const parsed: unknown = JSON.parse(text);
        if (!isObject(parsed)) return undefined;
        return isKnownCode(parsed.code) ? parsed.code : undefined;
    } catch {
        return undefined;
    }
};

/**
 * What every bounded response reader in this API layer needs to say for itself: each feature throws its own error
 * class, under its own category name, for a response that ran over its ceiling. Reading a chunk can also fail
 * outright — most often because the request was aborted mid-stream — which a caller that cares to tell that apart
 * from an ordinary read failure does through `readFailed`. A caller that leaves it out lets the raw error propagate.
 */
export interface BoundedReadErrors<E> {
    tooLarge: () => E;
    readFailed?: (error: unknown) => E;
}

/**
 * A response read up to a byte ceiling and no further, for every feature that downloads a body — a graph, a diff,
 * an export, a fault-injection archive. The ceiling is enforced against what actually arrives rather than against
 * what a header claimed, so a server that understates its length cannot talk this client past the limit.
 */
export const readBoundedBytes = async <E>(
    response: Response,
    maximum: number,
    errors: BoundedReadErrors<E>,
): Promise<Uint8Array> => {
    if (!response.body) {
        let buffer: ArrayBuffer;
        try {
            buffer = await response.arrayBuffer();
        } catch (error) {
            throw errors.readFailed ? errors.readFailed(error) : error;
        }
        if (buffer.byteLength > maximum) throw errors.tooLarge();
        return new Uint8Array(buffer);
    }
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let byteLength = 0;
    try {
        while (true) {
            let chunk: ReadableStreamReadResult<Uint8Array>;
            try {
                chunk = await reader.read();
            } catch (error) {
                throw errors.readFailed ? errors.readFailed(error) : error;
            }
            if (chunk.done) break;
            byteLength += chunk.value.byteLength;
            if (byteLength > maximum) {
                try {
                    await reader.cancel();
                } catch {
                    // The response is already rejected for exceeding its byte ceiling.
                }
                throw errors.tooLarge();
            }
            chunks.push(chunk.value);
        }
    } finally {
        reader.releaseLock();
    }
    const bytes = new Uint8Array(byteLength);
    let offset = 0;
    for (const chunk of chunks) {
        bytes.set(chunk, offset);
        offset += chunk.byteLength;
    }
    return bytes;
};

/**
 * The same bounded read, for a caller that wants text rather than bytes. Decoding is fatal: a response that is not
 * valid UTF-8 is not a body this client can use, whatever its Content-Type claimed.
 */
export const readBoundedText = async <E>(
    response: Response,
    maximum: number,
    errors: BoundedReadErrors<E> & { malformed?: (error: unknown) => E },
): Promise<string> => {
    const bytes = await readBoundedBytes(response, maximum, errors);
    try {
        return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    } catch (error) {
        throw errors.malformed ? errors.malformed(error) : error;
    }
};
