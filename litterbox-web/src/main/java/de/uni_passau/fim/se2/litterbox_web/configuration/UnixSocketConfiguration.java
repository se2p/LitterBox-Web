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

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.boot.reactor.netty.NettyReactiveWebServerFactory;
import org.springframework.boot.web.server.WebServerFactoryCustomizer;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import io.netty.channel.unix.DomainSocketAddress;

@Configuration(proxyBeanMethods = false)
@ConditionalOnProperty("server.unix-socket")
public final class UnixSocketConfiguration {

    private static final Logger log = LoggerFactory.getLogger(UnixSocketConfiguration.class);

    private final DomainSocketAddress socketAddress;

    public UnixSocketConfiguration(@Value("${server.unix-socket}") final Path socket) {
        try {
            Files.deleteIfExists(socket);
        }
        catch (IOException e) {
            log.error("Could not remove stale socket at {}", socket);
            throw new IllegalStateException("Could not remove stale socket.", e);
        }

        this.socketAddress = new DomainSocketAddress(socket.toAbsolutePath().toString());
    }

    @Bean
    public WebServerFactoryCustomizer<NettyReactiveWebServerFactory> socketConfig() {
        return factory -> factory.addServerCustomizers(httpServer -> httpServer.bindAddress(() -> socketAddress));
    }

}
