/*
 * Copyright (C) 2024-2026 LitterBox-Web contributors
 *
 * This file is part of LitterBox-Web.
 * Licenced under the EUPL-1.2 or later.
 *
 * SPDX-FileCopyrightText: 2024-2026 LitterBox-Web contributors
 * SPDX-License-Identifier: EUPL-1.2
 */
package de.uni_passau.fim.se2.litterbox_web.configuration;

import java.time.Duration;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.io.DefaultResourceLoader;
import org.springframework.http.CacheControl;
import org.springframework.web.reactive.config.ResourceHandlerRegistry;
import org.springframework.web.reactive.config.WebFluxConfigurer;

/**
 * Where the site is served from.
 *
 * <p>
 * The default is the copy inside the jar, so that running the jar is the whole of a deployment. A build that did not
 * have the frontend to hand produces a jar without it; that is a serviceable API and no site, which is worth saying out
 * loud at start-up rather than leaving to be discovered as a page of missing files.
 */
@Configuration
public class SpaResourceConfiguration implements WebFluxConfigurer {

    /** Where the site is unless a deployment says otherwise. Named once; two classes read it. */
    public static final String DEFAULT_STATIC_LOCATION = "classpath:/static/";

    private static final Logger log = LoggerFactory.getLogger(SpaResourceConfiguration.class);

    private final String staticLocation;

    public SpaResourceConfiguration(
        @Value("${litterbox.web.static-location:" + DEFAULT_STATIC_LOCATION + "}") final String staticLocation
    ) {
        this.staticLocation = staticLocation.endsWith("/") ? staticLocation : staticLocation + "/";
        if (!new DefaultResourceLoader().getResource(this.staticLocation + "index.html").exists()) {
            log.warn(
                "No site at {}: this build carries no frontend, so the API will answer and every page will "
                    + "not. Build the frontend before packaging, or point litterbox.web.static-location at a "
                    + "directory that holds it.",
                this.staticLocation
            );
        }
    }

    @Override
    public void addResourceHandlers(final ResourceHandlerRegistry registry) {
        registry.addResourceHandler("/litterbox/assets/**")
            .addResourceLocations(staticLocation + "assets/")
            .setCacheControl(CacheControl.maxAge(Duration.ofDays(365)).cachePublic().immutable());
        registry.addResourceHandler("/litterbox/brand/**")
            .addResourceLocations(staticLocation + "brand/")
            .setCacheControl(CacheControl.maxAge(Duration.ofDays(365)).cachePublic().immutable());
        registry.addResourceHandler("/litterbox/ui/**")
            .addResourceLocations(staticLocation + "ui/")
            .setCacheControl(CacheControl.maxAge(Duration.ofDays(365)).cachePublic().immutable());
    }
}
