/*
 * Copyright (C) 2024-2026 LitterBox-Web contributors
 *
 * This file is part of LitterBox-Web.
 * Licenced under the EUPL-1.2 or later.
 *
 * SPDX-FileCopyrightText: 2024-2026 LitterBox-Web contributors
 * SPDX-License-Identifier: EUPL-1.2
 */
package de.uni_passau.fim.se2.litterbox_web.web_ui.api.v1;

import java.util.List;
import java.util.Objects;

public record MetricReferenceDto(List<MetricBandDto> metrics) {

    public MetricReferenceDto {
        metrics = List.copyOf(Objects.requireNonNull(metrics, "metrics"));
    }

    /**
     * @param sampleSize how many completed analyses the bounds were taken from, so a reader can be told what the
     *                   comparison is against rather than being asked to trust the word "usual"
     * @param lowerBound the value a third of those projects come under
     * @param upperBound the value two thirds of them come under
     * @param minimum    the smallest measurement in the sample
     * @param q1         the value a quarter of the sample comes under
     * @param median     the value half of the sample comes under
     * @param q3         the value three quarters of the sample comes under
     * @param maximum    the largest measurement in the sample
     */
    public record MetricBandDto(
        String name, long sampleSize, double lowerBound, double upperBound,
        double minimum, double q1, double median, double q3, double maximum
    ) {

        public MetricBandDto {
            Objects.requireNonNull(name, "name");
        }
    }
}
