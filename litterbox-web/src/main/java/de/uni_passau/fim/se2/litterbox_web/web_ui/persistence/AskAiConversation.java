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

import java.time.Instant;

public record AskAiConversation(
    long id,
    String publicId,
    long submissionId,
    long analysisId,
    String locale,
    String scopeKind,
    String scopeSelector,
    String scopeLabel,
    int replyCount,
    Instant userVisibleUntil,
    Instant analysisRetainUntil,
    String state
) {

    public boolean open() {
        return "OPEN".equals(state);
    }
}
