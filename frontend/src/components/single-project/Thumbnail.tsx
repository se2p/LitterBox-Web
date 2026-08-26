// SPDX-License-Identifier: EUPL-1.2
// SPDX-FileCopyrightText: 2025 LitterBox-Web contributors

import { useState } from 'react';
import { safeAssetUrl } from './asset-url';

interface ThumbnailProps {
    sprite?: string | null;
    thumbnailRef?: string | null;
    label: string;
    fallbackLabel: string;
}

export function Thumbnail({ sprite, thumbnailRef, label, fallbackLabel }: ThumbnailProps) {
    const assetUrl = thumbnailRef ? safeAssetUrl(thumbnailRef) : undefined;
    const [failedUrl, setFailedUrl] = useState<string>();
    const [shownUrl, setShownUrl] = useState(assetUrl);

    // Another address deserves another attempt, including one that failed earlier and is returned to, so the recorded
    // failure is dropped while the new address is being rendered rather than afterwards.
    if (shownUrl !== assetUrl) {
        setShownUrl(assetUrl);
        setFailedUrl(undefined);
    }

    const imageAvailable = Boolean(assetUrl && failedUrl !== assetUrl);

    if (imageAvailable)
        return (
            <img
                className="costume-thumbnail"
                src={assetUrl}
                alt={label}
                decoding="async"
                onError={() => setFailedUrl(assetUrl)}
            />
        );

    return (
        <div className="costume-fallback" role="img" aria-label={label}>
            <span aria-hidden="true" className="costume-fallback-mark">
                {sprite?.slice(0, 1).toUpperCase() || 'S'}
            </span>
            <span>{fallbackLabel}</span>
        </div>
    );
}
