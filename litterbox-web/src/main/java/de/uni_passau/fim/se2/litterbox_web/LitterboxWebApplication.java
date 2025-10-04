/*
 * Copyright (C) 2024 LitterBox-Web contributors
 *
 * This file is part of LitterBox-Web.
 * Licenced under the EUPL-1.2 or later.
 *
 * SPDX-FileCopyrightText: 2024 LitterBox-Web contributors
 * SPDX-License-Identifier: EUPL-1.2
 */
package de.uni_passau.fim.se2.litterbox_web;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.http.codec.ServerCodecConfigurer;
import org.springframework.modulith.Modulithic;
import org.springframework.scheduling.annotation.EnableScheduling;
import org.springframework.util.unit.DataSize;
import org.springframework.web.reactive.config.EnableWebFlux;
import org.springframework.web.reactive.config.WebFluxConfigurer;

@SpringBootApplication
@EnableScheduling
@EnableWebFlux
@SuppressWarnings("checkstyle:HideUtilityClassConstructor")
@Modulithic(
    systemName = "LitterboxWeb",
    sharedModules = { "shared" }
)
public class LitterboxWebApplication implements WebFluxConfigurer {

    public static void main(String[] args) {
        SpringApplication.run(LitterboxWebApplication.class, args);
    }

    @Override
    public void configureHttpMessageCodecs(final ServerCodecConfigurer configurer) {
        configurer.defaultCodecs().maxInMemorySize((int) DataSize.ofMegabytes(2).toBytes());
    }
}
