/*
 * Copyright (C) 2024 LitterBox-Web contributors
 *
 * This file is part of LitterBox-Web.
 *
 * LitterBox-Web is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public Licence as published by
 * the Free Software Foundation, either version 3 of the Licence, or (at
 * your option) any later version.
 *
 * LitterBox-Web is distributed in the hope that it will be useful, but
 * WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU
 * General Public Licence for more details.
 *
 * You should have received a copy of the GNU General Public Licence
 * along with LitterBox-Web. If not, see <http://www.gnu.org/licenses/>.
 */
package de.uni_passau.fim.se2.litterbox_web.configuration;

import java.net.InetAddress;
import java.net.UnknownHostException;
import java.util.Set;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.authorization.AuthorizationDecision;
import org.springframework.security.config.annotation.method.configuration.EnableMethodSecurity;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.config.annotation.web.configurers.AuthorizeHttpRequestsConfigurer;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.access.intercept.RequestAuthorizationContext;
import org.springframework.security.web.util.matcher.AntPathRequestMatcher;

@Configuration
@EnableWebSecurity
@EnableMethodSecurity(securedEnabled = true)
public class SecurityConfiguration {

    private static final Logger log = LoggerFactory.getLogger(SecurityConfiguration.class);

    private final Set<InetAddress> monitoringIpAddresses;

    public SecurityConfiguration(final MonitoringIpConfig monitoringIpAddresses) {
        this.monitoringIpAddresses = monitoringIpAddresses.getIps();
    }

    @Bean
    protected SecurityFilterChain filterChain(final HttpSecurity http) throws Exception {
        http
            .csrf(AbstractHttpConfigurer::disable)
            .sessionManagement(session -> session.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
            .authorizeHttpRequests(this::setupRequestMatchers);

        return http.build();
    }

    private void setupRequestMatchers(
        final AuthorizeHttpRequestsConfigurer<HttpSecurity>.AuthorizationManagerRequestMatcherRegistry requests
    ) {
        requests
            .requestMatchers(new AntPathRequestMatcher("/management/prometheus"))
            .access((auth, context) -> checkMetricsAccess(context))
            .requestMatchers(new AntPathRequestMatcher("/**")).permitAll();
    }

    private AuthorizationDecision checkMetricsAccess(final RequestAuthorizationContext context) {
        final InetAddress remoteAddr;
        try {
            remoteAddr = InetAddress.getByName(context.getRequest().getRemoteAddr());
        }
        catch (UnknownHostException e) {
            return new AuthorizationDecision(false);
        }

        final boolean granted = monitoringIpAddresses.isEmpty() || monitoringIpAddresses.contains(remoteAddr);
        log.debug("Allowing metrics scraping from {}: {}", remoteAddr, granted);
        return new AuthorizationDecision(granted);
    }
}
