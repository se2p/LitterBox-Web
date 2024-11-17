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

import java.net.InetAddress;
import java.net.InetSocketAddress;
import java.util.Set;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.authorization.AuthorizationDecision;
import org.springframework.security.config.annotation.method.configuration.EnableReactiveMethodSecurity;
import org.springframework.security.config.annotation.web.reactive.EnableWebFluxSecurity;
import org.springframework.security.config.web.server.ServerHttpSecurity;
import org.springframework.security.web.server.SecurityWebFilterChain;
import org.springframework.security.web.server.authorization.AuthorizationContext;

import reactor.core.publisher.Mono;

@Configuration
@EnableWebFluxSecurity
@EnableReactiveMethodSecurity
public class SecurityConfiguration {

    private static final Logger log = LoggerFactory.getLogger(SecurityConfiguration.class);

    private final Set<InetAddress> monitoringIpAddresses;

    public SecurityConfiguration(final MonitoringIpConfig monitoringIpAddresses) {
        this.monitoringIpAddresses = monitoringIpAddresses.getIps();
    }

    @Bean
    protected SecurityWebFilterChain filterChain(final ServerHttpSecurity http) {
        http
            .csrf(ServerHttpSecurity.CsrfSpec::disable)
            .authorizeExchange(this::setupRequestMatchers);

        return http.build();
    }

    private void setupRequestMatchers(
        final ServerHttpSecurity.AuthorizeExchangeSpec requests
    ) {
        requests
            .pathMatchers("/management/prometheus")
            .access((auth, context) -> checkMetricsAccess(context))
            .pathMatchers("/**").permitAll();
    }

    private Mono<AuthorizationDecision> checkMetricsAccess(final AuthorizationContext context) {
        final InetSocketAddress remoteAddr = context.getExchange().getRequest().getRemoteAddress();
        if (remoteAddr == null) {
            return Mono.just(new AuthorizationDecision(false));
        }

        final boolean granted = monitoringIpAddresses.isEmpty()
            || monitoringIpAddresses.contains(remoteAddr.getAddress());
        log.debug("Allowing metrics scraping from {}: {}", remoteAddr, granted);
        return Mono.just(new AuthorizationDecision(granted));
    }
}
