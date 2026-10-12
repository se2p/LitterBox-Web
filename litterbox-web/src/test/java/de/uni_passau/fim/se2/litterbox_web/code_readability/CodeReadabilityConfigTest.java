/*
 * Copyright (C) 2024-2026 LitterBox-Web contributors
 *
 * This file is part of LitterBox-Web.
 * Licenced under the EUPL-1.2 or later.
 *
 * SPDX-FileCopyrightText: 2024-2026 LitterBox-Web contributors
 * SPDX-License-Identifier: EUPL-1.2
 */
package de.uni_passau.fim.se2.litterbox_web.code_readability;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.util.Map;

import org.junit.jupiter.api.Test;
import org.springframework.boot.context.properties.bind.Bindable;
import org.springframework.boot.context.properties.bind.Binder;
import org.springframework.boot.context.properties.source.MapConfigurationPropertySource;

class CodeReadabilityConfigTest {

    @Test
    void springBinderPopulatesConfiguredZoomLevel() {
        final Binder binder = new Binder(
            new MapConfigurationPropertySource(
                Map.of("litterbox-web.code-readability.zoom-level", "0.75")
            )
        );

        final CodeReadabilityConfig config = binder.bind(
            "litterbox-web.code-readability", Bindable.of(CodeReadabilityConfig.class)
        ).get();

        assertThat(config.getZoomLevel()).isEqualTo(0.75);
    }

    @Test
    void unsetAndNullZoomLevelsFailFast() {
        final CodeReadabilityConfig config = new CodeReadabilityConfig();
        assertThatThrownBy(config::getZoomLevel).isInstanceOf(NullPointerException.class);

        config.setZoomLevel(null);
        assertThatThrownBy(config::getZoomLevel).isInstanceOf(NullPointerException.class);
    }
}
