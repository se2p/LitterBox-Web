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
import org.springframework.boot.reactor.netty.NettyReactiveWebServerFactory;
import org.springframework.boot.test.context.assertj.AssertableApplicationContext;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;
import org.springframework.boot.web.server.WebServerFactoryCustomizer;

class UnixSocketConfigurationTest {

    @Test
    void removesStaleSocketAndBindsTheConfiguredCustomizer(@TempDir final Path temporaryDirectory) throws IOException {
        final Path socket = temporaryDirectory.resolve("litterbox.sock");
        Files.createFile(socket);

        new ApplicationContextRunner()
            .withUserConfiguration(UnixSocketConfiguration.class)
            .withPropertyValues("server.unix-socket=" + socket)
            .run(context -> assertCustomizer(context, socket));
    }

    private static void assertCustomizer(final AssertableApplicationContext context, final Path socket) {
        assertThat(context).hasNotFailed();
        assertThat(Files.exists(socket)).isFalse();
        assertThat(context).hasBean("socketConfig");

        @SuppressWarnings("unchecked")
        final WebServerFactoryCustomizer<NettyReactiveWebServerFactory> customizer = (WebServerFactoryCustomizer<NettyReactiveWebServerFactory>) context
            .getBean("socketConfig");
        final NettyReactiveWebServerFactory factory = new NettyReactiveWebServerFactory();
        customizer.customize(factory);

        assertThat(factory.getServerCustomizers()).hasSize(1);
    }
}
