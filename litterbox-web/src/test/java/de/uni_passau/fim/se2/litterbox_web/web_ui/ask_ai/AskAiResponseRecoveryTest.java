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

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

import de.uni_passau.fim.se2.litterbox.llm.askai.AskAiPrompt;

class AskAiResponseRecoveryTest {

    @Test
    void asksForAFreshAnswerWithoutReplayingTheRejectedOne() {
        final AskAiPrompt prompt = new AskAiPrompt("rules", "project facts");

        final AskAiPrompt corrected = AskAiResponseRecovery.correctivePrompt(prompt);

        assertThat(corrected.systemPrompt()).startsWith("rules\n");
        assertThat(corrected.systemPrompt())
            .contains("Your previous answer could not be used", "status, blocks, references, and followUps");
        assertThat(corrected.userPrompt()).isEqualTo("project facts");
        assertThat(corrected).isNotEqualTo(prompt);
    }
}
