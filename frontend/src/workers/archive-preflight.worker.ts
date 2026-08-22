// SPDX-License-Identifier: EUPL-1.2
// SPDX-FileCopyrightText: 2025 LitterBox-Web contributors

import { validateArchiveBuffer, validateTeacherArchiveBuffer } from '../lib/archive-inspection';
import { MAX_ARCHIVE_BYTES, type ArchivePreflightResult } from '../lib/archive-preflight';

const inspect = (data: ArrayBuffer, kind?: 'teacher'): Promise<ArchivePreflightResult> => {
    if (data.byteLength > MAX_ARCHIVE_BYTES)
        return Promise.resolve({ valid: false, reason: 'too-large', entries: 0 });
    return kind === 'teacher' ? validateTeacherArchiveBuffer(data) : validateArchiveBuffer(data);
};

self.onmessage = (event: MessageEvent<{ data: ArrayBuffer; kind?: 'teacher' }>) => {
    let data = event.data.data;
    const { kind } = event.data;
    void inspect(data, kind)
        .then((result) => self.postMessage(result))
        .finally(() => {
            data = new ArrayBuffer(0);
        });
};
