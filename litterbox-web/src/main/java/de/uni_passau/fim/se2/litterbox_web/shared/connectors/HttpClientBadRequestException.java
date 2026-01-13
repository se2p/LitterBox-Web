/*
 * Copyright (C) 2024 LitterBox-Web contributors
 *
 * This file is part of LitterBox-Web.
 * Licenced under the EUPL-1.2 or later.
 *
 * SPDX-FileCopyrightText: 2024 LitterBox-Web contributors
 * SPDX-License-Identifier: EUPL-1.2
 */
package de.uni_passau.fim.se2.litterbox_web.shared.connectors;

import java.net.URI;

import org.springframework.http.HttpStatusCode;

public class HttpClientBadRequestException extends RuntimeException {

    private final HttpStatusCode statusCode;

    private final URI requestedURI;

    private final String upstreamResponse;

    public HttpClientBadRequestException(
        final HttpStatusCode statusCode, final URI requestedURI, final String upstreamResponse
    ) {
        super("Invalid external connector request!");

        this.statusCode = statusCode;
        this.requestedURI = requestedURI;
        this.upstreamResponse = upstreamResponse;
    }

    public HttpStatusCode getStatusCode() {
        return statusCode;
    }

    public URI getRequestedURI() {
        return requestedURI;
    }

    public String getUpstreamResponse() {
        return upstreamResponse;
    }
}
