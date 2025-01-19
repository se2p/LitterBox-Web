/*
 * Copyright (C) 2024 LitterBox-Web contributors
 *
 * This file is part of LitterBox-Web.
 * Licenced under the EUPL-1.2 or later.
 *
 * SPDX-FileCopyrightText: 2024 LitterBox-Web contributors
 * SPDX-License-Identifier: EUPL-1.2
 */
package de.uni_passau.fim.se2.litterbox_web;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.ApplicationContext;
import org.springframework.http.HttpStatus;
import org.springframework.test.web.reactive.server.WebTestClient;

import de.uni_passau.fim.se2.litterbox_web.util.RequestUtilService;

class SecurityConfigurationTest extends LitterboxWebIntegrationTest {

    @Autowired
    private ApplicationContext applicationContext;

    @Test
    void getMetricsAllowed() {
        final RequestUtilService requestUtilService = new RequestUtilService(applicationContext);
        final String metrics = requestUtilService.get("/management/prometheus", String.class, HttpStatus.OK);
        assertThat(metrics).contains("application_started_time_seconds");
    }

    @Test
    void checkMonitoringIpUnknownRejected() {
        final WebTestClient client = WebTestClient
            .bindToApplicationContext(applicationContext)
            .configureClient()
            .build();
        final RequestUtilService requestUtilService = new RequestUtilService(client);

        final String response = requestUtilService.get("/management/prometheus", String.class, HttpStatus.UNAUTHORIZED);
        assertThat(response).isNull();
    }

    @Test
    void checkMonitoringForbiddenIpRejected() {
        final WebTestClient client = WebTestClient
            .bindToApplicationContext(applicationContext)
            .webFilter(new RequestUtilService.WithAddressFilter("1.1.1.1"))
            .configureClient()
            .build();
        final RequestUtilService requestUtilService = new RequestUtilService(client);

        final String response = requestUtilService.get("/management/prometheus", String.class, HttpStatus.UNAUTHORIZED);
        assertThat(response).isNull();
    }
}
