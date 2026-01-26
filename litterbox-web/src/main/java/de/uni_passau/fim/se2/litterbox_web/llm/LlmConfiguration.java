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

import java.util.Arrays;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Lazy;
import org.springframework.core.env.EnumerablePropertySource;
import org.springframework.core.env.StandardEnvironment;
import org.springframework.stereotype.Component;

import de.uni_passau.fim.se2.litterbox.llm.api.LlmApi;
import de.uni_passau.fim.se2.litterbox.llm.api.LlmApiProvider;
import jakarta.annotation.PostConstruct;

@Lazy
@Component
public class LlmConfiguration {

    private static final Logger log = LoggerFactory.getLogger(LlmConfiguration.class);

    private final StandardEnvironment env;

    public LlmConfiguration(StandardEnvironment env) {
        this.env = env;
    }

    @PostConstruct
    void setUp() {
        env.getPropertySources().stream()
            .filter(EnumerablePropertySource.class::isInstance)
            .map(EnumerablePropertySource.class::cast)
            .flatMap(src -> Arrays.stream(src.getPropertyNames()))
            .filter(key -> key.startsWith("litterbox.llm"))
            .forEach(key -> System.setProperty(key, env.getRequiredProperty(key)));

        log.info("Initialised LitterBox LLM configuration.");
    }

    @Bean
    public LlmApi getLlmApi() {
        return LlmApiProvider.get();
    }
}
