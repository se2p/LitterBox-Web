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

import static org.assertj.core.api.Assertions.assertThat;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.core.io.DefaultResourceLoader;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpStatus;
import org.springframework.test.web.reactive.server.WebTestClient;
import org.springframework.web.reactive.config.ResourceHandlerRegistry;

class SpaControllerTest {

    @TempDir
    private Path staticDirectory;

    @Test
    void servesIndexWithoutCaching() throws IOException {
        Files.writeString(staticDirectory.resolve("index.html"), "<main>LitterBox</main>");
        final SpaController controller = new SpaController(
            new DefaultResourceLoader(),
            staticDirectory.toUri().toString()
        );

        final var response = controller.index();

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(response.getHeaders().getCacheControl()).isEqualTo(CacheControl.noCache().getHeaderValue());
        assertThat(response.getBody()).isNotNull();
        assertThat(response.getBody().getContentAsByteArray()).isNotEmpty();
    }

    @Test
    void returnsNotFoundWhenAssemblyHasNoFrontend() {
        final SpaController controller = new SpaController(
            new DefaultResourceLoader(),
            staticDirectory.toUri().toString()
        );

        assertThat(controller.index().getStatusCode()).isEqualTo(HttpStatus.NOT_FOUND);
    }

    @Test
    void servesIndexForKnownClientRoutes() throws IOException {
        Files.writeString(staticDirectory.resolve("index.html"), "<main>LitterBox</main>");
        final SpaController controller = new SpaController(
            new DefaultResourceLoader(),
            staticDirectory.toUri().toString()
        );
        final WebTestClient client = WebTestClient.bindToController(controller).build();

        for (
            final String path : new String[] {
                "/litterbox/teacher",
                "/litterbox/teacher/modify",
                "/litterbox/tools",
                // Reachable from the menu, so a reload or a bookmark has to resolve as well.
                "/litterbox/advanced",
                "/litterbox/compare",
                "/litterbox/questions",
                "/litterbox/questions/synthetic-token",
                "/litterbox/teacher/questions",
                "/litterbox/teacher/questions/synthetic-token"
            }
        ) {
            client.get().uri(path).exchange().expectStatus().isOk()
                .expectHeader().contentTypeCompatibleWith("text/html");
        }
    }

    @Test
    void mapsBundledAssetsAndBrandImages() {
        final ResourceHandlerRegistry registry = new ResourceHandlerRegistry(new DefaultResourceLoader());

        new SpaResourceConfiguration(staticDirectory.toUri().toString()).addResourceHandlers(registry);

        assertThat(registry.hasMappingForPattern("/litterbox/assets/**")).isTrue();
        assertThat(registry.hasMappingForPattern("/litterbox/brand/**")).isTrue();
        assertThat(registry.hasMappingForPattern("/litterbox/ui/**")).isTrue();
    }
}
