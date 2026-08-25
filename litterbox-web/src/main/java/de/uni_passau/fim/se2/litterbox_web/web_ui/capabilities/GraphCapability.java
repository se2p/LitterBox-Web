/*
 * Copyright (C) 2024-2026 LitterBox-Web contributors
 *
 * This file is part of LitterBox-Web.
 * Licenced under the EUPL-1.2 or later.
 *
 * SPDX-FileCopyrightText: 2024-2026 LitterBox-Web contributors
 * SPDX-License-Identifier: EUPL-1.2
 */
package de.uni_passau.fim.se2.litterbox_web.web_ui.capabilities;

import java.util.Objects;

import reactor.core.publisher.Mono;

/** Internal implementation port for one on-demand graph. */
public interface GraphCapability {

    Mono<GraphResult> graph(String submissionToken, long analysisId, String graphType);

    record GraphResult(String dot, int nodeCount, int edgeCount) {

        public GraphResult {
            dot = Objects.requireNonNull(dot, "dot");
        }
    }
}
