/*
 * Copyright (C) 2024-2026 LitterBox-Web contributors
 *
 * This file is part of LitterBox-Web.
 * Licenced under the EUPL-1.2 or later.
 *
 * SPDX-FileCopyrightText: 2024-2026 LitterBox-Web contributors
 * SPDX-License-Identifier: EUPL-1.2
 */
package de.uni_passau.fim.se2.litterbox_web.shared.connectors;

import java.net.URI;

import org.springframework.http.HttpStatusCode;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Service;
import org.springframework.util.unit.DataSize;
import org.springframework.web.reactive.function.client.WebClient;

import reactor.core.publisher.Mono;

@Service
public class ExternalApiConnector {

    private final WebClient client = WebClient.builder()
        .codecs(configurer -> configurer.defaultCodecs().maxInMemorySize((int) DataSize.ofMegabytes(10).toBytes()))
        .build();

    /**
     * Performs an HTTP POST request with a JSON body and parses the returned JSON.
     *
     * @param uri        The target URI to POST the data to.
     * @param entity     The data sent as JSON body.
     * @param returnType The type of the response. Will be auto-converted from the JSON-body of the response.
     * @return The response to the POST request.
     * @param <R> The type of the response.
     * @param <E> The type of the data that is sent.
     */
    public <R, E> Mono<R> postEntity(final URI uri, final E entity, final Class<R> returnType) {
        return client
            .post()
            .uri(uri)
            .contentType(MediaType.APPLICATION_JSON)
            .bodyValue(entity)
            .retrieve()
            .onStatus(
                HttpStatusCode::is4xxClientError,
                response -> response.bodyToMono(String.class)
                    .map(bodyString -> new HttpClientBadRequestException(response.statusCode(), uri, bodyString))
            )
            .bodyToMono(returnType);
    }
}
