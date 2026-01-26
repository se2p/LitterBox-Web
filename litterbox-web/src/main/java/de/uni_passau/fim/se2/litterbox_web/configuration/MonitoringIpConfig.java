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

import java.net.InetAddress;
import java.net.UnknownHostException;
import java.util.Collections;
import java.util.List;
import java.util.Set;
import java.util.stream.Collectors;
import java.util.stream.Stream;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;

@Component
@ConfigurationProperties(prefix = "management.prometheus")
public final class MonitoringIpConfig {

    private static final Logger log = LoggerFactory.getLogger(MonitoringIpConfig.class);

    private List<String> monitoringIps = Collections.emptyList();

    public void setMonitoringIps(final List<String> monitoringIps) {
        this.monitoringIps = monitoringIps;
    }

    public Set<InetAddress> getIps() {
        return monitoringIps.stream()
            .flatMap(ip -> {
                try {
                    return Stream.of(InetAddress.getByName(ip));
                }
                catch (UnknownHostException e) {
                    log.warn("Cannot parse monitoring IP: '{}'. Ignoring.", ip);
                    return Stream.empty();
                }
            })
            .collect(Collectors.toUnmodifiableSet());
    }
}
