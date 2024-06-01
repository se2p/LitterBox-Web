/*
 * Copyright (C) 2024 LitterBox-Web contributors
 *
 * This file is part of LitterBox-Web.
 * Licenced under the EUPL-1.2 or later.
 *
 * SPDX-FileCopyrightText: 2024 LitterBox-Web contributors
 * SPDX-License-Identifier: EUPL-1.2
 */
package de.uni_passau.fim.se2.litterbox_web.util;

import java.util.List;
import java.util.Map;

import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Service;
import org.springframework.test.web.reactive.server.WebTestClient;
import org.springframework.util.LinkedMultiValueMap;

import com.fasterxml.jackson.databind.ObjectMapper;

@Service
public class RequestUtilService {

    private final WebTestClient testClient;

    private final ObjectMapper mapper;

    public RequestUtilService(WebTestClient testClient, ObjectMapper mapper) {
        this.testClient = testClient;
        this.mapper = mapper;
    }

    /**
     * Sends a post request with the given body object converted to JSON.
     *
     * @param path           The REST endpoint to send the data to.
     * @param body           The body of the POST request.
     * @param responseType   Type of the response body.
     * @param expectedStatus The expected HTTP status of the request.
     * @return The response body for the request, already parsed.
     * @param <T> The type of the body that is sent to the endpoint.
     * @param <R> The type of the body that is received back from the endpoint.
     */
    public <T, R> R postWithResponseBody(String path, T body, Class<R> responseType, HttpStatus expectedStatus) {
        return postWithResponseBody(path, body, responseType, expectedStatus, null);
    }

    /**
     * Sends a post request with the given body object converted to JSON.
     *
     * @param path           The REST endpoint to send the data to.
     * @param body           The body of the POST request.
     * @param responseType   Type of the response body.
     * @param expectedStatus The expected HTTP status of the request.
     * @param params         Additional request URL parameters.
     * @return The response body for the request, already parsed.
     * @param <T> The type of the body that is sent to the endpoint.
     * @param <R> The type of the body that is received back from the endpoint.
     */
    public <T, R> R postWithResponseBody(
        String path, T body, Class<R> responseType, HttpStatus expectedStatus, Map<String, String> params
    ) {
        final var request = buildPostRequest(path, body, params);
        final var response = request.exchange()
            .expectStatus().isEqualTo(expectedStatus)
            .expectBody(responseType)
            .returnResult();

        if (!expectedStatus.is2xxSuccessful()) {
            return null;
        }

        return response.getResponseBody();
    }

    /**
     * Sends a post request with the given body object converted to JSON as List of objects.
     *
     * @param path            The REST endpoint to send the data to.
     * @param body            The body of the POST request.
     * @param listElementType Class of a single list element of the response.
     * @param expectedStatus  The expected HTTP status of the request.
     * @return The response body for the request, already parsed.
     * @param <T> The type of the body that is sent to the endpoint.
     * @param <R> The type of the list element that is received back from the endpoint.
     * @throws Exception In case parsing to/from JSON fails or the request is invalid in some other way.
     */
    public <T, R> List<R> postWithResponseBodyList(
        String path, T body, Class<R> listElementType, HttpStatus expectedStatus
    ) throws Exception {
        return postWithResponseBodyList(path, body, null, listElementType, expectedStatus);
    }

    /**
     * Sends a post request with the given body object converted to JSON as List of objects.
     *
     * @param path            The REST endpoint to send the data to.
     * @param body            The body of the POST request.
     * @param params          Additional request parameters.
     * @param listElementType Class of a single list element of the response.
     * @param expectedStatus  The expected HTTP status of the request.
     * @return The response body for the request, already parsed.
     * @param <T> The type of the body that is sent to the endpoint.
     * @param <R> The type of the list element that is received back from the endpoint.
     * @throws Exception In case parsing to/from JSON fails or the request is invalid in some other way.
     */
    public <T, R> List<R> postWithResponseBodyList(
        String path, T body, Map<String, String> params, Class<R> listElementType,
        HttpStatus expectedStatus
    ) throws Exception {
        final var request = buildPostRequest(path, body, params);
        final var response = request.exchange()
            .expectStatus().isEqualTo(expectedStatus)
            .expectHeader().contentType(MediaType.APPLICATION_JSON)
            .expectBodyList(listElementType)
            .returnResult();

        final List<R> responseBody = response.getResponseBody();

        if (!expectedStatus.is2xxSuccessful() || responseBody == null) {
            return null;
        }

        // Why does parsing the String list does not work as expected?
        // It returns a list containing one String like `["some","list","items"]` instead.
        if (String.class.equals(listElementType) && !responseBody.isEmpty()) {
            final String head = (String) response.getResponseBody().getFirst();
            return mapper.readValue(head, mapper.getTypeFactory().constructCollectionType(List.class, String.class));
        }
        else {
            return responseBody;
        }
    }

    private <T> WebTestClient.RequestHeadersSpec<?> buildPostRequest(
        final String path, final T body, final Map<String, String> params
    ) {
        return testClient.post()
            .uri(uriBuilder -> uriBuilder.path(path).queryParams(buildParams(params)).build())
            .contentType(MediaType.APPLICATION_JSON)
            .bodyValue(body);
    }

    private static LinkedMultiValueMap<String, String> buildParams(final Map<String, String> params) {
        final LinkedMultiValueMap<String, String> result = new LinkedMultiValueMap<>();
        if (params == null) {
            return result;
        }

        for (final Map.Entry<String, String> entry : params.entrySet()) {
            result.put(entry.getKey(), List.of(entry.getValue()));
        }

        return result;
    }
}
