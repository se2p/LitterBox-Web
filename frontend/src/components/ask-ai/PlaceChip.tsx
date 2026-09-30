// SPDX-License-Identifier: EUPL-1.2
// SPDX-FileCopyrightText: 2026 LitterBox-Web contributors

import { useTranslation } from 'react-i18next';
import { Thumbnail } from '../single-project/Thumbnail';
import { placeTrigger, type CataloguePlace } from './goal-catalogue';

export function PlaceChip({ place, locale }: { place: CataloguePlace; locale: string }) {
    const { t } = useTranslation();
    if (place.key === null) return null;
    const trigger = placeTrigger(place, locale);
    return (
        <span className="ask-ai-place-chip">
            {place.node?.target.thumbnail && (
                <span aria-hidden="true">
                    <Thumbnail
                        sprite={place.node.target.label}
                        thumbnailRef={place.node.target.thumbnail}
                        label={place.sprite}
                        fallbackLabel={t('fallbackPreview')}
                    />
                </span>
            )}
            {place.kind === 'script' && trigger
                ? t('askAiPlaceChipScript', { sprite: place.sprite, trigger })
                : place.sprite}
        </span>
    );
}
