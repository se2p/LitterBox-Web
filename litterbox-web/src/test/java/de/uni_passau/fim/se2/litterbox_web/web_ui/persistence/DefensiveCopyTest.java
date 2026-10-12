/*
 * Copyright (C) 2024-2026 LitterBox-Web contributors
 *
 * This file is part of LitterBox-Web.
 * Licenced under the EUPL-1.2 or later.
 *
 * SPDX-FileCopyrightText: 2024-2026 LitterBox-Web contributors
 * SPDX-License-Identifier: EUPL-1.2
 */
package de.uni_passau.fim.se2.litterbox_web.web_ui.persistence;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.Map;

import org.junit.jupiter.api.Test;

import de.uni_passau.fim.se2.litterbox_web.web_ui.persistence.entity.AnalysisEntity;

class DefensiveCopyTest {

    @Test
    void analysisDigestCannotBeChangedThroughInputOrGetter() {
        final byte[] digest = { 1, 2, 3 };
        final AnalysisEntity entity = new AnalysisEntity();

        entity.setInputSha256(digest);
        digest[0] = 9;
        assertThat(entity.getInputSha256()).containsExactly(1, 2, 3);

        final byte[] exposed = entity.getInputSha256();
        exposed[1] = 9;
        assertThat(entity.getInputSha256()).containsExactly(1, 2, 3);
    }

    @Test
    void analysisMetricsAreSortedAndImmutable() {
        final Map<String, Double> metrics = new LinkedHashMap<>();
        metrics.put("zeta", 1.0);
        metrics.put("alpha", 2.0);
        final Analysis analysis = new Analysis(
            1, 2, 3, "project", "manual", "schema", "version", "en", "DONE", "sb3",
            null, null, null, null, null, null, metrics
        );

        metrics.clear();
        assertThat(new ArrayList<>(analysis.metrics().keySet())).containsExactly("alpha", "zeta");
        assertThat(analysis.metrics()).containsEntry("alpha", 2.0).containsEntry("zeta", 1.0);
        assertThatThrownBy(() -> analysis.metrics().put("new", 3.0))
            .isInstanceOf(UnsupportedOperationException.class);
    }
}
