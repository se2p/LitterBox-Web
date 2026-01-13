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

import java.net.InetSocketAddress;
import java.util.List;
import java.util.Map;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.ApplicationContext;
import org.springframework.core.ParameterizedTypeReference;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.server.reactive.ServerHttpRequest;
import org.springframework.http.server.reactive.ServerHttpRequestDecorator;
import org.springframework.stereotype.Service;
import org.springframework.test.web.reactive.server.WebTestClient;
import org.springframework.util.LinkedMultiValueMap;
import org.springframework.web.server.ServerWebExchange;
import org.springframework.web.server.ServerWebExchangeDecorator;
import org.springframework.web.server.WebFilter;
import org.springframework.web.server.WebFilterChain;

import reactor.core.publisher.Mono;

@Service
public class RequestUtilService {

    private final WebTestClient testClient;

    @Autowired
    public RequestUtilService(final ApplicationContext applicationContext) {
        this.testClient = WebTestClient
            .bindToApplicationContext(applicationContext)
            .webFilter(new WithAddressFilter("127.0.0.1"))
            .configureClient()
            .build();
    }

    public RequestUtilService(final WebTestClient testClient) {
        this.testClient = testClient;
    }

    /**
     * Sends a get request.
     *
     * @param path           The REST endpoint to send the data to.
     * @param responseType   Type of the response body.
     * @param expectedStatus The expected HTTP status of the request.
     * @return The response body for the request, already parsed.
     * @param <R> The type of the body that is received back from the endpoint.
     */
    public <R> R get(String path, Class<R> responseType, HttpStatus expectedStatus) {
        return get(path, responseType, expectedStatus, null);
    }

    /**
     * Sends a get request.
     *
     * @param path           The REST endpoint to send the data to.
     * @param responseType   Type of the response body.
     * @param expectedStatus The expected HTTP status of the request.
     * @param params         Additional request URL parameters.
     * @return The response body for the request, already parsed.
     * @param <R> The type of the body that is received back from the endpoint.
     */
    public <R> R get(
        String path, Class<R> responseType, HttpStatus expectedStatus, Map<String, String> params
    ) {
        final var request = buildGetRequest(path, params);
        final var response = request.exchange()
            .expectStatus().isEqualTo(expectedStatus)
            .expectBody(responseType)
            .returnResult();

        return response.getResponseBody();
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

        return response.getResponseBody();
    }

    /**
     * Sends a post request with the given body object converted to JSON.
     *
     * @param path           The REST endpoint to send the data to.
     * @param body           The body of the POST request.
     * @param responseType   Type reference of the response body.
     * @param expectedStatus The expected HTTP status of the request.
     * @param <T>            The type of the body that is sent to the endpoint.
     * @param <R>            The type of the body that is received back from the endpoint.
     * @return The response body for the request, already parsed.
     */
    public <T, R> R postWithResponseBody(
        String path, T body, ParameterizedTypeReference<R> responseType, HttpStatus expectedStatus
    ) {
        return postWithResponseBody(path, body, responseType, expectedStatus, null);
    }

    /**
     * Sends a post request with the given body object converted to JSON.
     *
     * @param path           The REST endpoint to send the data to.
     * @param body           The body of the POST request.
     * @param responseType   Type reference of the response body.
     * @param expectedStatus The expected HTTP status of the request.
     * @param params         Additional request URL parameters.
     * @param <T>            The type of the body that is sent to the endpoint.
     * @param <R>            The type of the body that is received back from the endpoint.
     * @return The response body for the request, already parsed.
     */
    public <T, R> R postWithResponseBody(
        String path, T body, ParameterizedTypeReference<R> responseType,
        HttpStatus expectedStatus, Map<String, String> params
    ) {
        final var request = buildPostRequest(path, body, params);
        final var response = request.exchange()
            .expectStatus().isEqualTo(expectedStatus)
            .expectBody(responseType)
            .returnResult();

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
     */
    public <T, R> List<R> postWithResponseBodyList(
        String path, T body, Class<R> listElementType, HttpStatus expectedStatus
    ) {
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
     */
    public <T, R> List<R> postWithResponseBodyList(
        String path, T body, Map<String, String> params, Class<R> listElementType, HttpStatus expectedStatus
    ) {
        final var request = buildPostRequest(path, body, params);
        final var responseSpec = request.exchange()
            .expectStatus().isEqualTo(expectedStatus)
            .expectHeader().contentType(MediaType.APPLICATION_JSON);

        return getListResponse(listElementType, responseSpec);
    }

    @SuppressWarnings("unchecked")
    private static <R> List<R> getListResponse(Class<R> listElementType, WebTestClient.ResponseSpec responseSpec) {
        if (String.class.equals(listElementType)) {
            // casting List<String> to List<R> is safe, since we check for R == String
            return (List<R>) responseSpec
                .expectBody(new ParameterizedTypeReference<List<String>>() {
                })
                .returnResult()
                .getResponseBody();
        }
        else {
            return responseSpec
                .expectBodyList(listElementType)
                .returnResult()
                .getResponseBody();
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

    private WebTestClient.RequestHeadersSpec<?> buildGetRequest(final String path, final Map<String, String> params) {
        return testClient.get()
            .uri(uriBuilder -> uriBuilder.path(path).queryParams(buildParams(params)).build());
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

    public static class WithAddressFilter implements WebFilter {

        private final InetSocketAddress address;

        public WithAddressFilter(final String address) {
            this.address = new InetSocketAddress(address, 80);
        }

        @Override
        public Mono<Void> filter(ServerWebExchange exchange, WebFilterChain chain) {
            return chain.filter(new ServerWebExchangeDecorator(exchange) {

                @Override
                public ServerHttpRequest getRequest() {
                    return new ServerHttpRequestDecorator(exchange.getRequest()) {

                        @Override
                        public InetSocketAddress getRemoteAddress() {
                            return address;
                        }
                    };
                }
            });
        }
    }
}
