/*
 * Copyright (C) 2024-2026 LitterBox-Web contributors
 *
 * This file is part of LitterBox-Web.
 * Licenced under the EUPL-1.2 or later.
 *
 * SPDX-FileCopyrightText: 2024-2026 LitterBox-Web contributors
 * SPDX-License-Identifier: EUPL-1.2
 */
package de.uni_passau.fim.se2.litterbox_web.web_ui.ask_ai;

import java.util.List;

/** The frozen v1 shape returned for one validated reply. */
public record AskAiMessageResponseView(
    int schemaVersion, String messageId, String status, List<AskAiBlockView> blocks,
    List<AskAiReferenceView> references, List<String> followUps, int repliesRemaining
) {

    public AskAiMessageResponseView {
        blocks = List.copyOf(blocks);
        references = List.copyOf(references);
        followUps = List.copyOf(followUps);
    }
}
