// SPDX-License-Identifier: EUPL-1.2
// SPDX-FileCopyrightText: 2025 LitterBox-Web contributors

const isPublicAssetPath = (pathname: string): boolean => {
    const parts = pathname.split('/').filter(Boolean);
    const assetsIndex = parts.lastIndexOf('assets');
    const hash = parts[assetsIndex + 1] ?? '';
    return (
        assetsIndex >= 2 &&
        parts[assetsIndex - 2] === 'submissions' &&
        Boolean(parts[assetsIndex - 1]) &&
        assetsIndex === parts.length - 2 &&
        /^[a-f0-9]{64}$/i.test(hash)
    );
};

export const safeAssetUrl = (reference: string): string | undefined => {
    try {
        const url = new URL(reference, window.location.href);
        if (
            url.origin !== window.location.origin ||
            url.username !== '' ||
            url.password !== '' ||
            url.search !== '' ||
            url.hash !== '' ||
            !isPublicAssetPath(url.pathname)
        )
            return undefined;
        return url.href;
    } catch {
        return undefined;
    }
};
