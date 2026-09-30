// SPDX-License-Identifier: EUPL-1.2
// SPDX-FileCopyrightText: 2026 LitterBox-Web contributors

export const isObject = (value: unknown): value is Record<string, unknown> =>
    value !== null && typeof value === 'object' && !Array.isArray(value);

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

export const isJsonContentType = (value: string | null): boolean => {
    if (!value) return false;
    const { mediaType, parameters } = mediaTypeOf(value);
    return (
        mediaType === 'application/json' &&
        parameters.every((parameter) => parameter === '' || parameter === 'charset=utf-8')
    );
};

export const MAX_PROBLEM_RESPONSE_BYTES = 16 * 1024;

export const MAX_SEVERITY = 100;

export const isProblemJsonContentType = (value: string | null): boolean => {
    if (!value) return false;
    const { mediaType, parameters } = mediaTypeOf(value);
    return (
        (mediaType === 'application/json' || mediaType === 'application/problem+json') &&
        parameters.every((parameter) => parameter === '' || parameter === 'charset=utf-8')
    );
};

export const isContentEncoded = (value: string | null): boolean => {
    const normalized = value?.trim().toLowerCase() ?? '';
    return normalized !== '' && normalized !== 'identity';
};

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

export interface BoundedReadErrors<E> {
    tooLarge: () => E;
    readFailed?: (error: unknown) => E;
}

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
