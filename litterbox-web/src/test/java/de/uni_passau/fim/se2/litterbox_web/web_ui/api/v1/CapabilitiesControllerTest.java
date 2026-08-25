/*
 * Copyright (C) 2024-2026 LitterBox-Web contributors
 *
 * This file is part of LitterBox-Web.
 * Licenced under the EUPL-1.2 or later.
 *
 * SPDX-FileCopyrightText: 2024-2026 LitterBox-Web contributors
 * SPDX-License-Identifier: EUPL-1.2
 */
package de.uni_passau.fim.se2.litterbox_web.web_ui.api.v1;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;

import de.uni_passau.fim.se2.litterbox_web.LitterboxWebIntegrationTest;
import de.uni_passau.fim.se2.litterbox_web.util.RequestUtilService;
import de.uni_passau.fim.se2.litterbox_web.web_ui.capabilities.AdvancedCapabilitiesConfiguration;

class CapabilitiesControllerTest extends LitterboxWebIntegrationTest {

    @Autowired
    private RequestUtilService requestUtilService;

    @Test
    void exposesFrozenFoundationContract() {
        final CapabilitiesDto response = requestUtilService.get(
            "/api/v1/capabilities",
            CapabilitiesDto.class,
            HttpStatus.OK
        );

        assertThat(response.schemaVersion()).isEqualTo(1);
        assertThat(response.litterboxVersion()).isEqualTo("1.13-SNAPSHOT");
        assertThat(response.supportedLocales()).containsExactlyElementsOf(List.of("de", "en", "es", "nl"));
        assertThat(response.enabledFeatures()).containsExactlyInAnyOrder(
            "single-project", "teacher-archive", "studio", "feedback", "qlc", "catalogue"
        );
    }

    @Test
    void exposesTheSameContractAtThePublicWebMount() {
        final CapabilitiesDto response = requestUtilService.get(
            "/litterbox/api/v1/capabilities",
            CapabilitiesDto.class,
            HttpStatus.OK
        );

        assertThat(response.schemaVersion()).isEqualTo(ApiV1.SCHEMA_VERSION);
        assertThat(response.supportedLocales()).containsExactly("de", "en", "es", "nl");
    }

    @Test
    void advertisesEachAdvancedCapabilityOnlyFromItsIndependentFlag() {
        final List<String> foundation = List.of(
            "single-project", "teacher-archive", "studio", "feedback", "qlc", "catalogue"
        );
        final List<String> advanced = List.of(
            AdvancedCapabilitiesConfiguration.METRICS_GRAPHS,
            AdvancedCapabilitiesConfiguration.SEMANTIC_DIFF,
            AdvancedCapabilitiesConfiguration.PROGRAM_EXPORT,
            AdvancedCapabilitiesConfiguration.FAULT_INJECTION
        );

        for (String feature : advanced) {
            final AdvancedCapabilitiesConfiguration configuration = new AdvancedCapabilitiesConfiguration();
            enable(configuration, feature);
            final CapabilitiesDto response = new CapabilitiesController("1.13-SNAPSHOT", configuration)
                .getCapabilities();

            assertThat(response.enabledFeatures()).containsExactlyInAnyOrderElementsOf(
                java.util.stream.Stream.concat(foundation.stream(), java.util.stream.Stream.of(feature)).toList()
            );
        }

        final AdvancedCapabilitiesConfiguration allEnabled = new AdvancedCapabilitiesConfiguration();
        advanced.forEach(feature -> enable(allEnabled, feature));
        assertThat(new CapabilitiesController("1.13-SNAPSHOT", allEnabled).getCapabilities().enabledFeatures())
            .containsExactlyInAnyOrderElementsOf(
                java.util.stream.Stream.concat(foundation.stream(), advanced.stream()).toList()
            );
    }

    private void enable(final AdvancedCapabilitiesConfiguration configuration, final String feature) {
        switch (feature) {
            case AdvancedCapabilitiesConfiguration.METRICS_GRAPHS -> configuration.getMetricsGraphs().setEnabled(true);
            case AdvancedCapabilitiesConfiguration.SEMANTIC_DIFF -> configuration.getSemanticDiff().setEnabled(true);
            case AdvancedCapabilitiesConfiguration.PROGRAM_EXPORT -> configuration.getProgramExport().setEnabled(true);
            case AdvancedCapabilitiesConfiguration.FAULT_INJECTION ->
                configuration.getFaultInjection().setEnabled(true);
            default -> throw new IllegalArgumentException("Unknown synthetic capability");
        }
    }
}
