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
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.net.InetAddress;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

import org.junit.jupiter.api.Test;
import org.springframework.boot.context.properties.bind.Bindable;
import org.springframework.boot.context.properties.bind.Binder;
import org.springframework.boot.context.properties.source.MapConfigurationPropertySource;

class ConfigurationPropertiesDefensiveCopyTest {

    private static final String ORIGIN = "https://example.test";
    private static final String LOOPBACK = "127.0.0.1";

    @Test
    void springBinderPopulatesCorsAndMonitoringProperties() throws Exception {
        final Binder binder = new Binder(
            new MapConfigurationPropertySource(
                Map.of(
                    "cors.allowed-origins[0]", ORIGIN,
                    "management.prometheus.monitoring-ips[0]", LOOPBACK
                )
            )
        );

        final CorsConfigurationProperties cors = binder.bind(
            "cors", Bindable.of(CorsConfigurationProperties.class)
        ).get();
        final MonitoringIpConfig monitoring = binder.bind(
            "management.prometheus", Bindable.of(MonitoringIpConfig.class)
        ).get();

        assertThat(cors.getAllowedOrigins()).containsExactly(ORIGIN);
        assertThat(monitoring.getIps()).contains(InetAddress.getByName(LOOPBACK));
    }

    @Test
    void corsOriginsAreCopiedWhenBound() {
        final CorsConfigurationProperties config = new CorsConfigurationProperties();
        final List<String> origins = new ArrayList<>(List.of(ORIGIN));

        config.setAllowedOrigins(origins);
        origins.clear();

        assertThat(config.getAllowedOrigins()).containsExactly(ORIGIN);
        assertThatThrownBy(() -> config.getAllowedOrigins().add(ORIGIN))
            .isInstanceOf(UnsupportedOperationException.class);
    }

    @Test
    void monitoringIpsAreCopiedWhenBound() throws Exception {
        final MonitoringIpConfig config = new MonitoringIpConfig();
        final List<String> addresses = new ArrayList<>(List.of(LOOPBACK));

        config.setMonitoringIps(addresses);
        addresses.clear();

        assertThat(config.getIps()).contains(InetAddress.getByName(LOOPBACK));
    }

    @Test
    void nullBindingsKeepExistingGetterBehavior() {
        final CorsConfigurationProperties cors = new CorsConfigurationProperties();
        cors.setAllowedOrigins(null);
        assertThatThrownBy(cors::getAllowedOrigins).isInstanceOf(NullPointerException.class);

        final MonitoringIpConfig monitoring = new MonitoringIpConfig();
        monitoring.setMonitoringIps(null);
        assertThatThrownBy(monitoring::getIps).isInstanceOf(NullPointerException.class);
    }
}
