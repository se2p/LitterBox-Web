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

import java.util.Arrays;
import java.util.List;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;
import org.springframework.web.filter.CorsFilter;

@Configuration
public class LitterBoxWebCorsConfiguration {

    private final CorsConfigurationProperties configProps;

    public LitterBoxWebCorsConfiguration(final CorsConfigurationProperties configuration) {
        this.configProps = configuration;
    }

    /**
     * Configures the CORS filter to allow cross-origin requests from the origins permitted in the configuration.
     *
     * @return A Spring CORS filter that will be applied as default to all endpoints.
     */
    @Bean
    public CorsFilter corsFilter() {
        final CorsConfiguration config = new CorsConfiguration();
        config.setAllowedOrigins(configProps.getAllowedOrigins());
        config.setAllowedHeaders(List.of("content-type"));
        config.setAllowedMethods(Arrays.asList("GET", "POST"));

        final UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
        source.registerCorsConfiguration("/**", config);

        return new CorsFilter(source);
    }
}
