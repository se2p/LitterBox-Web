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
