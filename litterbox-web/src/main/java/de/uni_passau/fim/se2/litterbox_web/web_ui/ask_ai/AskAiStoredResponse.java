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
import java.util.Map;
import java.util.regex.Pattern;

import com.fasterxml.jackson.annotation.JsonInclude;

import de.uni_passau.fim.se2.litterbox.llm.askai.AskAiFollowUp;
import de.uni_passau.fim.se2.litterbox.llm.askai.AskAiPromptBuilder;
import de.uni_passau.fim.se2.litterbox.llm.askai.AskAiResponse;
import de.uni_passau.fim.se2.litterbox.llm.askai.AskAiResponseBlock;
import de.uni_passau.fim.se2.litterbox.llm.askai.AskAiScratchblocksBlock;
import de.uni_passau.fim.se2.litterbox.llm.askai.AskAiTextBlock;
import tools.jackson.core.JacksonException;
import tools.jackson.databind.json.JsonMapper;

record AskAiStoredResponse(List<Block> blocks, List<AskAiReferenceView> references, List<String> followUps) {

    private static final JsonMapper MAPPER = JsonMapper.shared();
    private static final List<Map.Entry<Pattern, String>> REFERENCE_REWRITES = List.of(
        Map.entry(Pattern.compile("\\s*[(\\[]\\s*(?:see\\s+)?ref:v1-[A-Za-z0-9_-]+\\s*[)\\]]"), ""),
        Map.entry(Pattern.compile("\\s*ref:v1-[A-Za-z0-9_-]+"), ""),
        Map.entry(Pattern.compile("\\s+([,.;:!?])"), "$1"),
        Map.entry(Pattern.compile("[ \\t]{2,}"), " ")
    );

    AskAiStoredResponse {
        if (!validBlocks(blocks) || !validReferences(references) || !validFollowUps(followUps)) {
            throw AskAiProblemException.contextNotFound();
        }
    }

    private static boolean validBlocks(final List<Block> blocks) {
        return blocks != null && blocks.stream().allMatch(Block::wellFormed);
    }

    private static boolean validReferences(final List<AskAiReferenceView> references) {
        return references != null
            && references.stream().allMatch(reference -> reference.kind() != null && reference.label() != null);
    }

    private static boolean validFollowUps(final List<String> followUps) {
        return followUps != null && !followUps.contains(null);
    }

    static AskAiStoredResponse of(final AskAiResponse response) {
        return new AskAiStoredResponse(
            response.blocks().stream().map(AskAiStoredResponse::toBlock).toList(),
            response.references().stream().map(reference -> new AskAiReferenceView(reference.kind(), reference.label()))
                .toList(),
            response.followUps().stream().map(AskAiFollowUp::jsonValue).toList()
        );
    }

    private static Block toBlock(final AskAiResponseBlock block) {
        return switch (block) {
            case AskAiTextBlock text -> new Block("text", text.text(), null, null);
            case AskAiScratchblocksBlock scratch -> new Block("scratchblocks", null, scratch.role(), scratch.code());
        };
    }

    static AskAiStoredResponse decode(final String json) {
        if (json != null) {
            try {
                final AskAiStoredResponse stored = MAPPER.readValue(json, AskAiStoredResponse.class);
                if (stored != null) {
                    return stored;
                }
            }
            catch (JacksonException | IllegalArgumentException malformed) {
                // Treated like a missing answer, below.
            }
        }
        throw AskAiProblemException.contextNotFound();
    }

    String encode() {
        return MAPPER.writeValueAsString(this);
    }

    List<AskAiBlockView> blockViews() {
        return blocks.stream().map(AskAiStoredResponse::toBlockView).toList();
    }

    private static AskAiBlockView toBlockView(final Block block) {
        if ("text".equals(block.kind())) {
            return new AskAiBlockView.Text(visibleText(block.text()));
        }
        return new AskAiBlockView.Scratchblocks(block.role(), block.code());
    }

    /** Supplies prior answer text and code to follow-ups without exposing internal reference ids. */
    String asQuotedAnswer() {
        final StringBuilder words = new StringBuilder();
        for (final Block block : blocks) {
            if ("text".equals(block.kind())) {
                appendParagraph(words, visibleText(block.text()));
            }
            else if ("scratchblocks".equals(block.kind())) {
                final String code = block.code().strip();
                if (!code.isBlank()) {
                    appendParagraph(words, AskAiPromptBuilder.quotedCode(code));
                }
            }
        }
        return words.toString();
    }

    private static void appendParagraph(final StringBuilder words, final String paragraph) {
        if (!words.isEmpty()) {
            words.append("\n\n");
        }
        words.append(paragraph);
    }

    /** Removes model-emitted internal reference ids from user-visible answer text. */
    static String visibleText(final String text) {
        if (text == null || !text.contains("ref:v1-")) {
            return text;
        }
        String stripped = text;
        for (final Map.Entry<Pattern, String> rewrite : REFERENCE_REWRITES) {
            stripped = rewrite.getKey().matcher(stripped).replaceAll(rewrite.getValue());
        }
        stripped = stripped.trim();
        // Preserve text if stripping leaves it empty.
        if (stripped.isBlank()) {
            return text;
        }
        return stripped;
    }

    @JsonInclude(JsonInclude.Include.NON_NULL)
    record Block(String kind, String text, String role, String code) {

        boolean wellFormed() {
            return switch (kind) {
                case "text" -> text != null;
                case "scratchblocks" -> role != null && code != null;
                case null, default -> false;
            };
        }
    }
}
