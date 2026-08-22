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

import java.net.URI;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Component;

import de.uni_passau.fim.se2.litterbox_web.shared.Profiles;

/**
 * Configuration properties for the {@code /llm/raw} hint-generation proxy.
 *
 * <p>
 * Bound from the {@code litterbox.llm.raw.*} namespace, e.g.:
 *
 * <pre>
 * litterbox:
 *   llm:
 *     raw:
 *       api-key: sk-…
 *       base-url: https://llms.innkube.fim.uni-passau.de/v1
 *       model: qwen36-35b
 *       api: chat-completions
 * </pre>
 *
 * <p>
 * {@code base-url} and {@code model} have no code defaults and must be set explicitly. {@code api} defaults to
 * {@link LlmApiStyle#RESPONSES}.
 */
@Component
@ConfigurationProperties(prefix = "litterbox.llm.raw")
@Profile(Profiles.LLM)
public class RawLlmConfig {

    private String apiKey = "";
    private URI baseUrl;
    private String model;
    private LlmApiStyle api = LlmApiStyle.RESPONSES;

    public String getApiKey() {
        return apiKey;
    }

    public void setApiKey(final String apiKey) {
        this.apiKey = apiKey;
    }

    public URI getBaseUrl() {
        return baseUrl;
    }

    public void setBaseUrl(final URI baseUrl) {
        this.baseUrl = baseUrl;
    }

    public String getModel() {
        return model;
    }

    public void setModel(final String model) {
        this.model = model;
    }

    public LlmApiStyle getApi() {
        return api;
    }

    public void setApi(final LlmApiStyle api) {
        this.api = api;
    }
}
