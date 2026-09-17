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

/** Child-visible answer block; each variant serializes only its own fields. */
public sealed interface AskAiBlockView permits AskAiBlockView.Text, AskAiBlockView.Scratchblocks {

    record Text(String kind, String text) implements AskAiBlockView {

        public Text(final String text) {
            this("text", text);
        }
    }

    record Scratchblocks(String kind, String role, String code) implements AskAiBlockView {

        public Scratchblocks(final String role, final String code) {
            this("scratchblocks", role, code);
        }
    }
}
