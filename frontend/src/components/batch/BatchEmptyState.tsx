// SPDX-License-Identifier: EUPL-1.2
// SPDX-FileCopyrightText: 2025 LitterBox-Web contributors

import { useTranslation } from 'react-i18next';
import { Card } from '../Card';

export function BatchEmptyState({ allFailed = false }: { allFailed?: boolean }) {
    const { t } = useTranslation();
    return (
        <Card className="batch-empty-state">
            <h2>{allFailed ? t('batchAllFailedTitle') : t('batchEmptyTitle')}</h2>
            <p>{allFailed ? t('batchAllFailedBody') : t('batchEmptyBody')}</p>
        </Card>
    );
}
