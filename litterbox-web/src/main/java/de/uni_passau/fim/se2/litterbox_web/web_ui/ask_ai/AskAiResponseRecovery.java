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

import de.uni_passau.fim.se2.litterbox.llm.askai.AskAiPrompt;

/**
 * The second attempt at a reply whose first attempt the parser could not use.
 *
 * <p>
 * The parser repairs whatever can be repaired without deciding what the model meant, so what reaches here is a reply
 * with no answer in it: not a JSON object, no known status, or an answer with no usable block. The model is told that,
 * and nothing more: the rejected text is never quoted back, because it is unbounded provider output about a learner's
 * project, and the reason is not quoted either, because the parser's messages are for the log.
 *
 * <p>
 * A reply the provider cut off at its output token cap is the one case where a fresh answer would fail the same way, so
 * that one is asked for shorter instead.
 *
 * <p>
 * The correction also makes the second request differ from the first, which matters against a provider that answers a
 * request it has seen before from a cache: sent again unchanged, the first attempt's reply would simply come back.
 */
final class AskAiResponseRecovery {

    private static final String CORRECTION = "Your previous answer could not be used. Return one complete JSON "
        + "object with the keys status, blocks, references, and followUps, and nothing outside it; put every "
        + "sentence a reader should see in the 'blocks' array. Write a fresh, short answer using the same selected "
        + "project facts; do not describe the correction.";
    private static final String SHORTER = "Your previous answer was cut off before it ended because it was too "
        + "long. Write the same answer much shorter: fewer blocks, each of a sentence or two, and only the code "
        + "that is needed. Use the same selected project facts; do not describe the correction.";

    private AskAiResponseRecovery() {
    }

    static AskAiPrompt correctivePrompt(final AskAiPrompt prompt) {
        return new AskAiPrompt(prompt.systemPrompt() + "\n" + CORRECTION, prompt.userPrompt());
    }

    /** The second attempt at a reply the provider stopped writing at its output token cap. */
    static AskAiPrompt shorterPrompt(final AskAiPrompt prompt) {
        return new AskAiPrompt(prompt.systemPrompt() + "\n" + SHORTER, prompt.userPrompt());
    }
}
