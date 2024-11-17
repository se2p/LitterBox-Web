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
import org.springframework.modulith.Modulithic;
import org.springframework.scheduling.annotation.EnableScheduling;
import org.springframework.web.reactive.config.EnableWebFlux;

@SpringBootApplication
@EnableScheduling
@EnableWebFlux
@SuppressWarnings("checkstyle:HideUtilityClassConstructor")
@Modulithic(
    systemName = "LitterboxWeb",
    sharedModules = { "shared" }
)
public class LitterboxWebApplication {

    public static void main(String[] args) {
        SpringApplication.run(LitterboxWebApplication.class, args);
    }
}
