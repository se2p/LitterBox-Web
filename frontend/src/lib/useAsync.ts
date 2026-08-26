// SPDX-License-Identifier: EUPL-1.2
// SPDX-FileCopyrightText: 2026 LitterBox-Web contributors

import { useEffect, useState, type DependencyList } from 'react';
import { isAbortError } from './abort-error';

export type AsyncState<T, E = string> =
    | { status: 'idle' }
    | { status: 'loading' }
    | { status: 'ready'; value: T }
    | { status: 'error'; error: E };

const defaultToError = (reason: unknown): string =>
    reason instanceof Error ? reason.message : String(reason);

const sameDependencies = (left: DependencyList, right: DependencyList): boolean =>
    left.length === right.length && left.every((value, index) => Object.is(value, right[index]));

interface UseAsyncOptions<E> {
    /** When false, no request is made and the state stays 'idle'. Defaults to true. */
    enabled?: boolean;
    /** Maps a rejection reason to the error payload. Defaults to the message string. */
    toError?: (reason: unknown) => E;
}

/**
 * Runs an abortable async load on mount and whenever `deps` change, tracking
 * idle/loading/ready/error state. Call `reload()` to re-run the same load.
 */
export function useAsync<T, E = string>(
    load: (signal: AbortSignal) => Promise<T>,
    deps: DependencyList,
    options?: UseAsyncOptions<E>,
): { state: AsyncState<T, E>; reload: () => void } {
    const enabled = options?.enabled ?? true;
    const toError = options?.toError ?? (defaultToError as (reason: unknown) => E);
    const [state, setState] = useState<AsyncState<T, E>>({
        status: enabled ? 'loading' : 'idle',
    });
    const [reloadToken, setReloadToken] = useState(0);
    const loadKey: DependencyList = [enabled, reloadToken, ...deps];
    const [lastLoadKey, setLastLoadKey] = useState(loadKey);

    /**
     * The reset belongs to the render that asks for a new load, not to the effect that starts it: adjusted here,
     * the value of the previous load never reaches the screen alongside the dependencies that superseded it.
     */
    if (!sameDependencies(lastLoadKey, loadKey)) {
        setLastLoadKey(loadKey);
        setState({ status: enabled ? 'loading' : 'idle' });
    }

    useEffect(() => {
        if (!enabled) return;
        const controller = new AbortController();
        void load(controller.signal)
            .then((value) => {
                if (controller.signal.aborted) return;
                setState({ status: 'ready', value });
            })
            .catch((reason: unknown) => {
                if (controller.signal.aborted || isAbortError(reason)) return;
                setState({ status: 'error', error: toError(reason) });
            });
        return () => controller.abort();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [enabled, reloadToken, ...deps]);

    return { state, reload: () => setReloadToken((value) => value + 1) };
}
