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

/** The frozen v1 shape returned when a conversation is opened. */
public record AskAiConversationCreatedView(
    int schemaVersion, String conversationId, AskAiScopeView scope, int repliesRemaining
) {
}
