// SPDX-License-Identifier: EUPL-1.2
// SPDX-FileCopyrightText: 2026 LitterBox-Web contributors

import { useCallback, useEffect, useRef, useState } from 'react';
import type { SupportedLocale } from '../../../api/capabilities';
import type {
    InjectionPreviewDto,
    InjectorCatalogueViewDto,
    InjectorViewDto,
} from '../../../api/generated';
import {
    fetchAllInjectionPreviews,
    fetchInjectionArchive,
    fetchInjectionBundle,
    fetchInjectionPreview,
    fetchInjectorCatalogue,
    InjectionApiError,
    type InjectionArchiveResult,
    type InjectionErrorCategory,
} from '../../../api/injections';
import { resultForKey, resultKey, sortInjectorsByName } from './injection-utils';
import type { InjectorSelectionMode } from './use-injector-selection';
import { canDownloadBlobs, clickDownload } from '../../../lib/download-blob';

type InjectionOperation = 'injectors' | 'preview' | 'download';
/** Which mutation is being fetched: one of them by key, or the whole set. */
export type DownloadTarget = string | 'all';

export type InjectionState =
    | { status: 'loadingInjectors' }
    | { status: 'injectorsReady' }
    | { status: 'previewing' }
    | { status: 'previewReady' }
    | { status: 'downloading'; target: DownloadTarget }
    | { status: 'downloaded'; result: InjectionArchiveResult }
    | { status: 'error'; category: InjectionErrorCategory; operation: InjectionOperation };

interface UseInjectionRequestsParams {
    token: string;
    analysisId: number;
    inputFormat: string | null | undefined;
    locale: SupportedLocale;
}

export interface InjectionRequests {
    catalogue: InjectorCatalogueViewDto | undefined;
    injectors: InjectorViewDto[];
    state: InjectionState;
    preview: InjectionPreviewDto | undefined;
    lastDownload: DownloadTarget | undefined;
    busy: boolean;
    statusHeading: React.RefObject<HTMLHeadingElement | null>;
    previewHeading: React.RefObject<HTMLHeadingElement | null>;
    /**
     * Anything the reader does to the selection makes a request in flight, and an archive already prepared, the
     * answer to a question nobody is asking any more.
     */
    beginSelectionChange: () => void;
    requestPreview: (selectedInjectorIds: string[], selectionMode: InjectorSelectionMode) => void;
    downloadResult: (injectorId: string, resultIndex: number) => void;
    downloadAll: (selectedInjectorIds: string[], selectionMode: InjectorSelectionMode) => void;
    cancel: () => void;
    retry: (selectedInjectorIds: string[], selectionMode: InjectorSelectionMode) => void;
}

/**
 * The request lifecycle for the injector catalogue, a preview, and a download: one status machine, one abort
 * controller and one sequence counter shared by all three, since only one of them is ever in flight at a time and
 * a late answer from a superseded request must never overwrite fresher state.
 */
export function useInjectionRequests({
    token,
    analysisId,
    inputFormat,
    locale,
}: UseInjectionRequestsParams): InjectionRequests {
    const [catalogue, setCatalogue] = useState<InjectorCatalogueViewDto>();
    const [injectors, setInjectors] = useState<InjectorViewDto[]>([]);
    const [preview, setPreview] = useState<InjectionPreviewDto>();
    const [state, setState] = useState<InjectionState>({ status: 'loadingInjectors' });
    /** Which download to try again after one fails, since the failure state does not carry what was asked for. */
    const [lastDownload, setLastDownload] = useState<DownloadTarget>();
    const requestController = useRef<AbortController | undefined>(undefined);
    const requestSequence = useRef(0);
    const objectUrl = useRef<string | undefined>(undefined);
    const statusHeading = useRef<HTMLHeadingElement>(null);
    /**
     * The preview panel keeps its own heading focus target, distinct from the status headings above. Once a
     * download starts, the preview panel stays on screen behind the "preparing" status, and a single shared ref
     * would then sit on two mounted headings at once with no telling which one last claimed it.
     */
    const previewHeading = useRef<HTMLHeadingElement>(null);

    const revokeObjectUrl = useCallback(() => {
        if (!objectUrl.current) return;
        if (typeof URL.revokeObjectURL === 'function') URL.revokeObjectURL(objectUrl.current);
        objectUrl.current = undefined;
    }, []);

    const abortActiveRequest = useCallback(() => {
        requestSequence.current += 1;
        requestController.current?.abort();
        requestController.current = undefined;
    }, []);

    const cancelPending = useCallback(() => {
        abortActiveRequest();
        revokeObjectUrl();
    }, [abortActiveRequest, revokeObjectUrl]);

    /**
     * The shape all three requests share. Only one is ever in flight, so each supersedes the last: the sequence
     * number decides whether an answer arriving late is still the one being waited for, and an older one is
     * dropped rather than allowed to overwrite fresher state. A failure is reported under the operation that
     * asked for it, which is what tells the page which panel to draw the message in.
     */
    const runRequest = useCallback(
        <T>(
            operation: InjectionOperation,
            request: (signal: AbortSignal) => Promise<T>,
            onSuccess: (value: T) => void,
        ) => {
            const sequence = ++requestSequence.current;
            const controller = new AbortController();
            requestController.current = controller;
            void request(controller.signal)
                .then((value) => {
                    if (controller.signal.aborted || sequence !== requestSequence.current) return;
                    onSuccess(value);
                })
                .catch((error: unknown) => {
                    if (sequence !== requestSequence.current) return;
                    const category =
                        error instanceof InjectionApiError ? error.category : 'malformed_response';
                    setState({ status: 'error', category, operation });
                })
                .finally(() => {
                    if (sequence === requestSequence.current) requestController.current = undefined;
                });
        },
        [],
    );

    /** Back to what a page that has asked for nothing yet holds, so no answer to an older question is left over. */
    const clearCatalogue = useCallback(() => {
        setCatalogue(undefined);
        setInjectors([]);
        setPreview(undefined);
        setState({ status: 'loadingInjectors' });
    }, []);

    const requestCatalogue = useCallback(() => {
        runRequest(
            'injectors',
            (signal) => fetchInjectorCatalogue(token, analysisId, locale, signal),
            (value) => {
                setCatalogue(value);
                setInjectors(sortInjectorsByName(value.injectors, locale));
                setState({ status: 'injectorsReady' });
            },
        );
    }, [analysisId, locale, runRequest, token]);

    const loadCatalogue = useCallback(() => {
        cancelPending();
        clearCatalogue();
        requestCatalogue();
    }, [cancelPending, clearCatalogue, requestCatalogue]);

    /**
     * Which analysis, in which language, the state below belongs to. When that changes the clearing belongs to the
     * render that first knows of it, not to the effect that starts the new request: adjusted here, an injector list
     * fetched for the analysis being left behind is never drawn under the one arriving.
     */
    const catalogueKey = `${token}|${String(analysisId)}|${locale}`;
    const [loadedCatalogueKey, setLoadedCatalogueKey] = useState(catalogueKey);
    if (loadedCatalogueKey !== catalogueKey) {
        setLoadedCatalogueKey(catalogueKey);
        clearCatalogue();
    }

    useEffect(() => {
        requestCatalogue();
        return () => {
            abortActiveRequest();
            revokeObjectUrl();
        };
    }, [abortActiveRequest, requestCatalogue, revokeObjectUrl]);

    useEffect(() => {
        if (state.status === 'loadingInjectors') return;
        const target = state.status === 'previewReady' ? previewHeading : statusHeading;
        target.current?.focus();
    }, [state.status]);

    const busy = state.status === 'previewing' || state.status === 'downloading';

    const beginSelectionChange = useCallback(() => {
        cancelPending();
        setPreview(undefined);
        setState({ status: 'injectorsReady' });
    }, [cancelPending]);

    const requestPreview = (
        selectedInjectorIds: string[],
        selectionMode: InjectorSelectionMode,
    ) => {
        const explicitLimit = catalogue?.maxSelectedInjectors ?? 0;
        if (
            selectionMode === 'explicit' &&
            (selectedInjectorIds.length < 1 || selectedInjectorIds.length > explicitLimit)
        )
            return;
        if (selectionMode === 'all' && (!catalogue?.allSelectionSupported || injectors.length < 1))
            return;
        cancelPending();
        setPreview(undefined);
        setState({ status: 'previewing' });
        const selection = [...selectedInjectorIds];
        runRequest(
            'preview',
            (signal) =>
                selectionMode === 'all'
                    ? fetchAllInjectionPreviews(
                          token,
                          analysisId,
                          injectors.map((injector) => injector.injectorId),
                          signal,
                      )
                    : fetchInjectionPreview(token, analysisId, selection, signal),
            (value) => {
                setPreview(value);
                setState({ status: 'previewReady' });
            },
        );
    };

    /** Hands the fetched archive to the browser under the name the service put on it. */
    const saveArchive = (archive: InjectionArchiveResult) => {
        if (!canDownloadBlobs()) throw new InjectionApiError('malformed_response');
        objectUrl.current = URL.createObjectURL(archive.blob);
        clickDownload(objectUrl.current, archive.filename);
    };

    /**
     * Asking for a mutation and saving it were a selection, a tick box, a preparation and then a download: four
     * acts for one intention. Pressing the button beside a mutation, or the one above them all, is the intention.
     */
    const startDownload = (
        target: DownloadTarget,
        request: (signal: AbortSignal) => Promise<InjectionArchiveResult>,
    ) => {
        cancelPending();
        setState({ status: 'downloading', target });
        setLastDownload(target);
        runRequest('download', request, (archive) => {
            saveArchive(archive);
            setState({ status: 'downloaded', result: archive });
        });
    };

    const downloadResult = (injectorId: string, resultIndex: number) =>
        startDownload(resultKey(injectorId, resultIndex), (signal) =>
            fetchInjectionArchive(
                token,
                analysisId,
                inputFormat,
                { injectorId, resultIndex },
                signal,
            ),
        );

    const downloadAll = (selectedInjectorIds: string[], selectionMode: InjectorSelectionMode) =>
        startDownload('all', (signal) =>
            fetchInjectionBundle(
                token,
                analysisId,
                selectedInjectorIds,
                selectionMode === 'all',
                signal,
            ),
        );

    const cancel = () => {
        const operation: InjectionOperation =
            state.status === 'downloading' ? 'download' : 'preview';
        abortActiveRequest();
        revokeObjectUrl();
        setState({ status: 'error', category: 'cancellation', operation });
    };

    const retry = (selectedInjectorIds: string[], selectionMode: InjectorSelectionMode) => {
        if (state.status !== 'error') return;
        if (state.operation === 'injectors') {
            loadCatalogue();
            return;
        }
        if (state.operation === 'preview') {
            requestPreview(selectedInjectorIds, selectionMode);
            return;
        }
        if (lastDownload === 'all') {
            downloadAll(selectedInjectorIds, selectionMode);
            return;
        }
        const failed = resultForKey(preview, lastDownload);
        if (failed) downloadResult(failed.injectorId, failed.resultIndex);
    };

    return {
        catalogue,
        injectors,
        state,
        preview,
        lastDownload,
        busy,
        statusHeading,
        previewHeading,
        beginSelectionChange,
        requestPreview,
        downloadResult,
        downloadAll,
        cancel,
        retry,
    };
}
