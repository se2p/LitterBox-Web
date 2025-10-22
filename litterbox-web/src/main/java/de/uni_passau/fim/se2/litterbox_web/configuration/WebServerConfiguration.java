/*
 * Copyright (C) 2024 LitterBox-Web contributors
 *
 * This file is part of LitterBox-Web.
 * Licenced under the EUPL-1.2 or later.
 *
 * SPDX-FileCopyrightText: 2024 LitterBox-Web contributors
 * SPDX-License-Identifier: EUPL-1.2
 */
package de.uni_passau.fim.se2.litterbox_web.configuration;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.codec.ServerCodecConfigurer;
import org.springframework.stereotype.Component;
import org.springframework.util.unit.DataSize;
import org.springframework.web.reactive.config.WebFluxConfigurer;

@Component
public class WebServerConfiguration implements WebFluxConfigurer {

    private static final Logger log = LoggerFactory.getLogger(WebServerConfiguration.class);

    private final DataSize maxPostSize;

    public WebServerConfiguration(final @Value("${spring.servlet.multipart.max-request-size:2MB}") String maxPostSize) {
        DataSize size;
        try {
            size = DataSize.parse(maxPostSize);
        }
        catch (Exception e) {
            log.error("Could not parse web server max request size: {}.", maxPostSize);
            size = DataSize.ofMegabytes(2);
        }

        this.maxPostSize = size;
        log.debug("Web server max request size: {}", size);
    }

    @Override
    public void configureHttpMessageCodecs(final ServerCodecConfigurer configurer) {
        configurer.defaultCodecs().maxInMemorySize((int) maxPostSize.toBytes());
    }
}
