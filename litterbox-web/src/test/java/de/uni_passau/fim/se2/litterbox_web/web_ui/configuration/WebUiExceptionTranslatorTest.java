/*
 * Copyright (C) 2024-2026 LitterBox-Web contributors
 *
 * This file is part of LitterBox-Web.
 * Licenced under the EUPL-1.2 or later.
 *
 * SPDX-FileCopyrightText: 2024-2026 LitterBox-Web contributors
 * SPDX-License-Identifier: EUPL-1.2
 */
package de.uni_passau.fim.se2.litterbox_web.web_ui.configuration;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;

import de.uni_passau.fim.se2.litterbox_web.web_ui.ask_ai.AskAiProblemException;
import de.uni_passau.fim.se2.litterbox_web.web_ui.capabilities.CapabilityException;
import de.uni_passau.fim.se2.litterbox_web.web_ui.execution.AnalysisCapacityExceededException;
import de.uni_passau.fim.se2.litterbox_web.web_ui.persistence.DatabaseCapacityExceededException;

class WebUiExceptionTranslatorTest {

    @Test
    void translatesAskAiProblemsAsPrivateAndNonCacheable() {
        final WebUiExceptionTranslator translator = new WebUiExceptionTranslator();

        final var response = translator.handleAskAiProblem(AskAiProblemException.contextNotFound());

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.NOT_FOUND);
        assertThat(response.getHeaders().getCacheControl()).isEqualTo("no-store, private");
    }

    @Test
    void keepsRetryAfterOnAskAiCapacityProblems() {
        final WebUiExceptionTranslator translator = new WebUiExceptionTranslator();

        final var response = translator.handleAskAiProblem(AskAiProblemException.capacityExhausted());

        assertThat(response.getHeaders().getFirst(HttpHeaders.RETRY_AFTER)).isEqualTo("1");
    }

    @Test
    void translatesAnalysisRejectionToStableProblemDetail() {
        final WebUiExceptionTranslator translator = new WebUiExceptionTranslator();

        final var response = translator.handleAnalysisCapacityExceeded(new AnalysisCapacityExceededException());

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.SERVICE_UNAVAILABLE);
        assertThat(response.getHeaders().getFirst(HttpHeaders.RETRY_AFTER)).isEqualTo("1");
        assertThat(response.getBody()).isNotNull();
        assertThat(response.getBody().getType().toString())
            .isEqualTo("urn:litterbox:problem:analysis-capacity-exhausted");
        assertThat(response.getBody().getProperties()).containsEntry("code", "analysis_capacity_exhausted");
    }

    @Test
    void translatesDatabaseRejectionToStableProblemDetail() {
        final WebUiExceptionTranslator translator = new WebUiExceptionTranslator();

        final var response = translator.handleDatabaseCapacityExceeded(new DatabaseCapacityExceededException());

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.SERVICE_UNAVAILABLE);
        assertThat(response.getHeaders().getFirst(HttpHeaders.RETRY_AFTER)).isEqualTo("1");
        assertThat(response.getBody()).isNotNull();
        assertThat(response.getBody().getType().toString())
            .isEqualTo("urn:litterbox:problem:database-capacity-exhausted");
        assertThat(response.getBody().getProperties()).containsEntry("code", "database_capacity_exhausted");
    }

    @Test
    void translatesDisabledCapabilitiesWithoutDisclosingImplementationState() {
        final WebUiExceptionTranslator translator = new WebUiExceptionTranslator();

        final var response = translator.handleCapabilityException(CapabilityException.disabled());

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.NOT_FOUND);
        assertThat(response.getBody()).isNotNull();
        assertThat(response.getBody().getType().toString())
            .isEqualTo("urn:litterbox:problem:capability-disabled");
        assertThat(response.getBody().getProperties()).containsEntry("code", "capability_disabled");
    }
}
