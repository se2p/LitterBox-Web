// SPDX-License-Identifier: EUPL-1.2
// SPDX-FileCopyrightText: 2026 LitterBox-Web contributors

import { useEffect, useRef, useState, type RefObject } from 'react';
import { useTranslation } from 'react-i18next';
import type { SubmissionRequestOptions } from '../api/submissions';
import { isAbortError } from './abort-error';
import { preflightArchive, type ArchivePreflightResult } from './archive-preflight';
import { localeFrom, newIdempotencyKey } from './project-submission';

export interface ProjectSource {
    file?: File;
    url: string;
    preflight?: ArchivePreflightResult;
    preflightBusy: boolean;
    busy: boolean;
    /** Held so that choosing a link can empty the file box the reader had already filled. */
    fileInput: RefObject<HTMLInputElement | null>;
    chooseFile: (candidate?: File) => void;
    chooseUrl: (value: string) => void;
    /**
     * Sends what was chosen, and answers with what came back — or with nothing, when the form went away before the
     * service did and there is no longer anybody to tell. A request that genuinely failed throws, so the page
     * around this can say so in its own words.
     */
    submit: <T>(send: (options: SubmissionRequestOptions) => Promise<T>) => Promise<T | undefined>;
}

/**
 * Choosing a project to send: a file or a link, one or the other, with an uploaded archive read here on the device
 * before a byte of it goes anywhere.
 *
 * Shared because the same three questions come up wherever a project can be started — which of the two ways in was
 * used, whether the archive is one we can send, and what happens to a request whose form is no longer on screen —
 * and each was answered separately, in near-identical code, on the pages that ask them. What differs between those
 * pages is which endpoint is called, what makes a link acceptable, and what is said afterwards; none of that is
 * here.
 */
export function useProjectSource(): ProjectSource {
    const { i18n } = useTranslation();
    const [file, setFile] = useState<File>();
    const [url, setUrl] = useState('');
    const [preflight, setPreflight] = useState<ArchivePreflightResult>();
    const [preflightBusy, setPreflightBusy] = useState(false);
    const [busy, setBusy] = useState(false);
    // Bumped whenever the reader chooses something else. A preflight that comes back for a file they have already
    // replaced is an answer about a project nobody is sending.
    const choice = useRef(0);
    const preflightController = useRef<AbortController | undefined>(undefined);
    const submitController = useRef<AbortController | undefined>(undefined);
    const idempotencyKey = useRef<string | undefined>(undefined);
    const fileInput = useRef<HTMLInputElement>(null);

    // The key stands for one request, and the language is part of what that request asks for.
    useEffect(() => {
        idempotencyKey.current = undefined;
    }, [i18n.language]);

    // A submission that outlives its form has nobody left to tell: letting it finish would take a reader who has
    // since gone elsewhere and drop them on a result they did not ask to see.
    useEffect(
        () => () => {
            preflightController.current?.abort();
            submitController.current?.abort();
        },
        [],
    );

    /** Whatever was chosen before stops mattering, along with anything still being read or sent about it. */
    const release = (): number => {
        preflightController.current?.abort();
        preflightController.current = undefined;
        idempotencyKey.current = undefined;
        setPreflight(undefined);
        return ++choice.current;
    };

    const chooseFile = (candidate?: File) => {
        const sequence = release();
        setFile(candidate);
        setUrl('');
        if (!candidate) {
            setPreflightBusy(false);
            return;
        }
        setPreflightBusy(true);
        const controller = new AbortController();
        preflightController.current = controller;
        void preflightArchive(candidate, controller.signal)
            .then((result) => {
                if (choice.current === sequence) setPreflight(result);
            })
            .catch(() => {
                if (choice.current === sequence)
                    setPreflight({ valid: false, reason: 'invalid-archive', entries: 0 });
            })
            .finally(() => {
                if (choice.current === sequence) {
                    setPreflightBusy(false);
                    preflightController.current = undefined;
                }
            });
    };

    const chooseUrl = (value: string) => {
        release();
        setUrl(value);
        setFile(undefined);
        setPreflightBusy(false);
        if (fileInput.current) fileInput.current.value = '';
    };

    const submit = async <T>(
        send: (options: SubmissionRequestOptions) => Promise<T>,
    ): Promise<T | undefined> => {
        setBusy(true);
        // The same key across a retry, so a request the service already took is not taken a second time.
        const key = idempotencyKey.current ?? newIdempotencyKey();
        idempotencyKey.current = key;
        const controller = new AbortController();
        submitController.current = controller;
        try {
            return await send({
                idempotencyKey: key,
                locale: localeFrom(i18n.language),
                signal: controller.signal,
            });
        } catch (failure) {
            // Us dropping the request is not the service failing to answer it.
            if (isAbortError(failure)) return undefined;
            throw failure;
        } finally {
            setBusy(false);
        }
    };

    return {
        file,
        url,
        preflight,
        preflightBusy,
        busy,
        fileInput,
        chooseFile,
        chooseUrl,
        submit,
    };
}
