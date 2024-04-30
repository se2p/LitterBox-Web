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

import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.net.URI;
import java.util.List;
import java.util.Map;

import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Service;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders;
import org.springframework.util.LinkedMultiValueMap;

import com.fasterxml.jackson.databind.ObjectMapper;

@Service
public class RequestUtilService {

    private final MockMvc mvc;
    private final ObjectMapper mapper;

    public RequestUtilService(MockMvc mvc, ObjectMapper objectMapper) {
        this.mvc = mvc;
        this.mapper = objectMapper;
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
     * @throws Exception In case parsing to/from JSON fails or the request is invalid in some other way.
     */
    public <T, R> R postWithResponseBody(String path, T body, Class<R> responseType, HttpStatus expectedStatus)
        throws Exception {
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
     * @throws Exception In case parsing to/from JSON fails or the request is invalid in some other way.
     */
    public <T, R> R postWithResponseBody(
        String path, T body, Class<R> responseType, HttpStatus expectedStatus, Map<String, String> params
    ) throws Exception {
        final String res = postWithResponseBodyString(path, body, expectedStatus, params);
        if (res == null || res.isEmpty() || res.trim().isEmpty()) {
            return null;
        }

        return mapper.readValue(res, responseType);
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
        final String res = postWithResponseBodyString(path, body, expectedStatus, params);
        if (res == null || res.isEmpty() || res.trim().isEmpty()) {
            return null;
        }

        return mapper.readValue(res, mapper.getTypeFactory().constructCollectionType(List.class, listElementType));
    }

    /**
     * Sends a post request with the given body object converted to JSON.
     *
     * @param path           The REST endpoint to send the data to.
     * @param body           The body of the POST request.
     * @param expectedStatus The expected HTTP status of the request.
     * @param params         Additional request parameters.
     * @param <T>            The type of the body that is sent to the endpoint.
     * @return The response body for the request as string.
     * @throws Exception In case parsing to/from JSON fails or the request is invalid in some other way.
     */
    public <T> String postWithResponseBodyString(
        String path, T body, HttpStatus expectedStatus, Map<String, String> params
    ) throws Exception {
        final String jsonBody;
        if (body instanceof String sBody) {
            jsonBody = sBody;
        }
        else {
            jsonBody = mapper.writeValueAsString(body);
        }

        var request = MockMvcRequestBuilders.post(new URI(path)).contentType(MediaType.APPLICATION_JSON)
            .content(jsonBody);
        if (params != null) {
            request = request.params(buildParams(params));
        }

        final MvcResult res = mvc.perform(request).andExpect(status().is(expectedStatus.value())).andReturn();
        if (!expectedStatus.is2xxSuccessful()) {
            return null;
        }

        return res.getResponse().getContentAsString();
    }

    private static LinkedMultiValueMap<String, String> buildParams(final Map<String, String> params) {
        final LinkedMultiValueMap<String, String> result = new LinkedMultiValueMap<>();
        for (final Map.Entry<String, String> entry : params.entrySet()) {
            result.put(entry.getKey(), List.of(entry.getValue()));
        }
        return result;
    }
}
