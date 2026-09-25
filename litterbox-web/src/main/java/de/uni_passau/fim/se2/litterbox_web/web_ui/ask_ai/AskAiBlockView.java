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

import com.fasterxml.jackson.annotation.JsonInclude;

import de.uni_passau.fim.se2.litterbox.llm.askai.AskAiInlineCode;

/** Child-visible answer block; each variant serializes only its own fields. */
public sealed interface AskAiBlockView permits AskAiBlockView.Text, AskAiBlockView.Scratchblocks {

    /**
     * Text, and the same text cut into words and the blocks it names in Scratchblocks, where it names any, so a client
     * can draw those blocks; {@code parts} is left out where there is nothing to draw.
     */
    @JsonInclude(JsonInclude.Include.NON_NULL)
    record Text(String kind, String text, List<Part> parts) implements AskAiBlockView {

        public Text(final String text) {
            this("text", text, parts(text));
        }

        private static List<Part> parts(final String text) {
            final List<AskAiInlineCode.Piece> pieces = AskAiInlineCode.pieces(text);
            if (pieces.stream().noneMatch(AskAiInlineCode.Piece::code)) {
                return null;
            }
            return pieces.stream().map(Text::part).toList();
        }

        private static Part part(final AskAiInlineCode.Piece piece) {
            if (piece.code()) {
                return new Part("scratchblocks", null, piece.text());
            }
            return new Part("text", piece.text(), null);
        }
    }

    /** A piece of a text: words, or one block drawn inline. */
    @JsonInclude(JsonInclude.Include.NON_NULL)
    record Part(String kind, String text, String code) {
    }

    record Scratchblocks(String kind, String role, String code) implements AskAiBlockView {

        public Scratchblocks(final String role, final String code) {
            this("scratchblocks", role, code);
        }
    }
}
