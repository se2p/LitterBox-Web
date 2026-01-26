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

import java.net.URI;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ControllerAdvice;
import org.springframework.web.bind.annotation.ExceptionHandler;

import de.uni_passau.fim.se2.litterbox_web.shared.connectors.HttpClientBadRequestException;
import de.uni_passau.fim.se2.litterbox_web.shared.exceptions.LlmConnectionStatusException;
import dev.langchain4j.exception.LangChain4jException;

@ControllerAdvice
public class ExceptionTranslator {

    @ExceptionHandler
    public void handleLangchainException(final LangChain4jException cause) {
        throw new LlmConnectionStatusException("Error when communicating with the LLM!", cause);
    }

    @ExceptionHandler
    public ResponseEntity<HttpClientErrorDto> handleHttpClientBadRequestException(
        final HttpClientBadRequestException e
    ) {
        final HttpClientErrorDto errorDto = new HttpClientErrorDto(
            e.getMessage(), e.getRequestedURI(), e.getUpstreamResponse()
        );
        return ResponseEntity.status(e.getStatusCode()).body(errorDto);
    }

    public record HttpClientErrorDto(String message, URI upstreamUri, String upstreamResponse) {
    }
}
