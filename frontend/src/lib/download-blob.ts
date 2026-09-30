// SPDX-License-Identifier: EUPL-1.2
// SPDX-FileCopyrightText: 2026 LitterBox-Web contributors

export const canDownloadBlobs = (): boolean => typeof URL.createObjectURL === 'function';

export const clickDownload = (url: string, filename: string): void => {
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.rel = 'noopener';
    link.hidden = true;
    document.body.append(link);
    link.click();
    link.remove();
};

export const downloadBlob = (blob: Blob, filename: string): boolean => {
    if (!canDownloadBlobs()) return false;
    const url = URL.createObjectURL(blob);
    try {
        clickDownload(url, filename);
    } finally {
        if (typeof URL.revokeObjectURL === 'function') URL.revokeObjectURL(url);
    }
    return true;
};

export const downloadText = (content: string, mediaType: string, filename: string): boolean =>
    downloadBlob(new Blob([content], { type: mediaType }), filename);
