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

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.net.URI;
import java.util.LinkedHashMap;
import java.util.Map;

import org.junit.jupiter.api.Test;
import org.springframework.boot.context.properties.bind.Bindable;
import org.springframework.boot.context.properties.bind.Binder;
import org.springframework.boot.context.properties.source.MapConfigurationPropertySource;

class CodeCompletionModelConfigTest {

    private static final String MODEL_URL = "https://model.test";

    @Test
    void springBinderPopulatesModels() {
        final Binder binder = new Binder(
            new MapConfigurationPropertySource(
                Map.of("litterbox-web.code-completion.models.transformer.url", MODEL_URL)
            )
        );

        final CodeCompletionModelConfig config = binder.bind(
            "litterbox-web.code-completion", Bindable.of(CodeCompletionModelConfig.class)
        ).get();

        assertThat(config.getModelConfig(CodeCompletionModelConfig.CodeCompletionModelType.TRANSFORMER))
            .contains(new CodeCompletionModelConfig.ModelConfig(URI.create(MODEL_URL)));
    }

    @Test
    void modelsAreCopiedWhenBound() {
        final CodeCompletionModelConfig config = new CodeCompletionModelConfig();
        final CodeCompletionModelConfig.ModelConfig model = new CodeCompletionModelConfig.ModelConfig(
            URI.create(MODEL_URL)
        );
        final Map<CodeCompletionModelConfig.CodeCompletionModelType, CodeCompletionModelConfig.ModelConfig> models = new LinkedHashMap<>();
        models.put(CodeCompletionModelConfig.CodeCompletionModelType.TRANSFORMER, model);

        config.setModels(models);
        models.clear();

        assertThat(config.getModelConfig(CodeCompletionModelConfig.CodeCompletionModelType.TRANSFORMER))
            .contains(model);
        assertThat(config.getModelConfig(CodeCompletionModelConfig.CodeCompletionModelType.N_GRAM)).isEmpty();
    }

    @Test
    void unsetAndNullModelsFailFast() {
        final CodeCompletionModelConfig config = new CodeCompletionModelConfig();
        assertThatThrownBy(
            () -> config.getModelConfig(CodeCompletionModelConfig.CodeCompletionModelType.TRANSFORMER)
        ).isInstanceOf(NullPointerException.class);

        config.setModels(null);
        assertThatThrownBy(
            () -> config.getModelConfig(CodeCompletionModelConfig.CodeCompletionModelType.TRANSFORMER)
        ).isInstanceOf(NullPointerException.class);
    }
}
