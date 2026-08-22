// SPDX-License-Identifier: EUPL-1.2
// SPDX-FileCopyrightText: 2026 LitterBox-Web contributors

import { useEffect, useState } from 'react';
import { fetchMetricReference, type MetricBand } from '../api/metric-reference';

/**
 * What is usual across the analysed projects, or nothing at all. The comparison improves a measurement and is never
 * a precondition for it: where the service cannot say what is usual, the numbers are still the numbers and the page
 * says nothing about them. Both places that read the reference need exactly that, so they read it the same way.
 */
export function useMetricReference(): MetricBand[] {
    const [reference, setReference] = useState<MetricBand[]>([]);
    useEffect(() => {
        const controller = new AbortController();
        fetchMetricReference(controller.signal)
            .then((bands) => setReference(bands))
            .catch(() => setReference([]));
        return () => controller.abort();
    }, []);
    return reference;
}
