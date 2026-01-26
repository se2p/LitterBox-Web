/*
 * Copyright (C) 2024-2026 LitterBox-Web contributors
 *
 * This file is part of LitterBox-Web.
 * Licenced under the EUPL-1.2 or later.
 *
 * SPDX-FileCopyrightText: 2024-2026 LitterBox-Web contributors
 * SPDX-License-Identifier: EUPL-1.2
 */
package de.uni_passau.fim.se2.litterbox_web.llm;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

import de.uni_passau.fim.se2.litterbox.llm.api.LlmApi;
import de.uni_passau.fim.se2.litterbox_web.LitterboxWebIntegrationTest;

class LlmConfigurationTest extends LitterboxWebIntegrationTest {

    @Autowired
    private LlmApi api;

    @Test
    void apiGetsConstructed() {
        assertThat(api).isNotNull();
    }

    @Test
    void setsLitterBoxLlmSystemProperties() {
        assertThat(System.getProperty("litterbox.llm.api")).isEqualTo("ollama");
        assertThat(System.getProperty("litterbox.llm.ollama.model")).isEqualTo("mistral:7b");
    }
}
