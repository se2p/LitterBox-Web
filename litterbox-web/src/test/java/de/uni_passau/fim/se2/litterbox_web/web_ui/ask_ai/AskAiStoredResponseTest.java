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
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.util.List;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

class AskAiStoredResponseTest {

    @Test
    void decodesThePersistedAnswerShape() {
        final AskAiStoredResponse stored = AskAiStoredResponse.decode(
            """
                {"blocks":[{"kind":"text","text":"Hello"}],"references":[],"followUps":[]}
                """
        );

        assertThat(stored.blockViews()).containsExactly(new AskAiBlockView.Text("Hello"));
        assertThat(stored.references()).isEmpty();
        assertThat(stored.asQuotedAnswer()).isEqualTo("Hello");
        assertThat(stored.encode())
            .isEqualTo("{\"blocks\":[{\"kind\":\"text\",\"text\":\"Hello\"}],\"references\":[],\"followUps\":[]}");
    }

    @Test
    void showsTheBlocksATextNamesAsPartsBesideTheText() {
        final AskAiStoredResponse stored = AskAiStoredResponse.decode(
            """
                {"blocks":[{"kind":"text","text":"Der Block 'hide' und 'Game Over!'"}],"references":[],"followUps":[]}
                """
        );

        assertThat(stored.blockViews()).containsExactly(
            new AskAiBlockView.Text(
                "text",
                "Der Block 'hide' und 'Game Over!'",
                List.of(
                    new AskAiBlockView.Part("text", "Der Block ", null),
                    new AskAiBlockView.Part("scratchblocks", null, "hide"),
                    new AskAiBlockView.Part("text", " und 'Game Over!'", null)
                )
            )
        );
        assertThat(stored.asQuotedAnswer()).isEqualTo("Der Block 'hide' und 'Game Over!'");
    }

    @ParameterizedTest
    @ValueSource(
        strings = {
            "null",
            "{}",
            "{\"blocks\":[{\"kind\":\"other\"}],\"references\":[],\"followUps\":[]}",
            "{\"blocks\":[{\"kind\":\"text\"}],\"references\":[],\"followUps\":[]}"
        }
    )
    void rejectsMalformedStoredAnswersAsMissingContext(final String json) {
        assertContextNotFound(json);
    }

    @Test
    void takesTheInternalReferenceIdsBackOutOfWhatTheReaderSees() {
        assertThat(
            AskAiStoredResponse.visibleText(
                "The Apple falls by -5 each step (ref:v1-072ca97ac18793ab75a69cbe84600d38) and the Banana "
                    + "falls by -7 (ref:v1-374775473b7236d15fedce2e77fe21b1)."
            )
        ).isEqualTo("The Apple falls by -5 each step and the Banana falls by -7.");
        assertThat(AskAiStoredResponse.visibleText("See ref:v1-abc123 for this."))
            .isEqualTo("See for this.");
        assertThat(AskAiStoredResponse.visibleText("[see ref:v1-abc123] The flag script waits."))
            .isEqualTo("The flag script waits.");
    }

    @Test
    void leavesAnAnswerWithoutReferenceIdsExactlyAsItWasWritten() {
        final String plain = "The cat moves ten steps, then says hello (and waits a moment).";
        assertThat(AskAiStoredResponse.visibleText(plain)).isSameAs(plain);
        assertThat(AskAiStoredResponse.visibleText("ref:v1-abc123")).isEqualTo("ref:v1-abc123");
    }

    private static void assertContextNotFound(final String json) {
        assertThatThrownBy(() -> AskAiStoredResponse.decode(json))
            .isInstanceOfSatisfying(
                AskAiProblemException.class,
                exception -> assertThat(exception.reason()).isEqualTo(AskAiProblemException.Reason.CONTEXT_NOT_FOUND)
            );
    }
}
