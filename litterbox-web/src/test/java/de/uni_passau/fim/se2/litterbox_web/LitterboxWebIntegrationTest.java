/*
 * Copyright (C) 2024-2026 LitterBox-Web contributors
 *
 * This file is part of LitterBox-Web.
 * Licenced under the EUPL-1.2 or later.
 *
 * SPDX-FileCopyrightText: 2024-2026 LitterBox-Web contributors
 * SPDX-License-Identifier: EUPL-1.2
 */
package de.uni_passau.fim.se2.litterbox_web;

import java.io.IOException;

import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.extension.ExtendWith;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.HttpStatus;
import org.springframework.http.HttpStatusCode;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.junit.jupiter.SpringExtension;

import de.uni_passau.fim.se2.litterbox_web.shared.Profiles;
import mockwebserver3.MockResponse;
import mockwebserver3.MockWebServer;
import tools.jackson.databind.json.JsonMapper;

@SpringBootTest
@ExtendWith(SpringExtension.class)
@ActiveProfiles({ "test", "metrics", "llm", Profiles.CODE_COMPLETION, Profiles.CODE_READABILITY })
public abstract class LitterboxWebIntegrationTest {

    @Autowired
    private JsonMapper jsonMapper;

    protected static MockWebServer mockWebServer;

    @BeforeAll
    static void beforeAll() throws IOException {
        mockWebServer = new MockWebServer();
        mockWebServer.start();
    }

    @AfterAll
    static void afterAll() {
        mockWebServer.close();
    }

    protected <T> void enqueueMockWebServerJsonResponse(final T response) {
        enqueueMockWebServerJsonResponse(response, HttpStatus.OK);
    }

    protected <T> void enqueueMockWebServerJsonResponse(final T response, final HttpStatusCode statusCode) {
        final String responseJson = jsonMapper.writeValueAsString(response);
        mockWebServer.enqueue(
            new MockResponse.Builder()
                .body(responseJson)
                .code(statusCode.value())
                .addHeader("Content-Type", "application/json")
                .build()
        );
    }
}
