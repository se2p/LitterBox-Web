/*
 * Copyright (C) 2024-2026 LitterBox-Web contributors
 *
 * This file is part of LitterBox-Web.
 * Licenced under the EUPL-1.2 or later.
 *
 * SPDX-FileCopyrightText: 2024-2026 LitterBox-Web contributors
 * SPDX-License-Identifier: EUPL-1.2
 */
package de.uni_passau.fim.se2.litterbox_web.code_completion;

import java.net.URI;
import java.util.Map;
import java.util.Optional;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Component;

import de.uni_passau.fim.se2.litterbox_web.shared.Profiles;

@Profile(Profiles.CODE_COMPLETION)
@Component
@ConfigurationProperties(prefix = "litterbox-web.code-completion")
public class CodeCompletionModelConfig {

    private Map<CodeCompletionModelType, ModelConfig> models;

    public void setModels(final Map<CodeCompletionModelType, ModelConfig> models) {
        this.models = models;
    }

    public Optional<ModelConfig> getModelConfig(final CodeCompletionModelType modelType) {
        return Optional.ofNullable(models.get(modelType));
    }

    public record ModelConfig(URI url) {
    }

    public enum CodeCompletionModelType {
        TRANSFORMER,
        N_GRAM,
    }
}
