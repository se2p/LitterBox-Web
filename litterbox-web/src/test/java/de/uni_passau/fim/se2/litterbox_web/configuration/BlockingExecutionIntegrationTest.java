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

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.ApplicationContext;
import org.springframework.context.annotation.Import;
import org.springframework.test.web.reactive.server.WebTestClient;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

import reactor.core.scheduler.Schedulers;

/**
 * The endpoints that analyse a Scratch program without wrapping the work in a {@code Mono} — the converter, the linter,
 * the tokenizer, the question generator — return a plain value, and WebFlux would run them on the thread the request
 * arrived on unless told otherwise. Minutes of parsing there is not their own request being slow, it is every other
 * request that thread is carrying being stopped.
 *
 * <p>
 * Asked of a handler written for the question rather than of one of those four, because what is being checked is the
 * rule WebFlux applies to all of them: a method whose return type Reactor has no adapter for is invoked somewhere it is
 * allowed to block.
 */
@SpringBootTest
@Import(BlockingExecutionIntegrationTest.BlockingProbeController.class)
class BlockingExecutionIntegrationTest {

    private static final String PROBE_PATH = "/test/blocking-execution-probe";

    @Autowired
    private ApplicationContext applicationContext;

    /**
     * Both halves are asserted, because either alone can hold while the thing they are about is broken: a platform
     * thread out of a fixed pool is off the server's threads and still queues one analysis behind another, and a
     * virtual thread is no use if the handler was never handed to it.
     *
     * <p>
     * The second half is why the executor is built in {@code WebServerConfiguration} rather than taken from the
     * context. Spring Boot's application executor is virtual only where {@code spring.threads.virtual.enabled} is set,
     * which the packaged configuration sets and the test configuration — which stands in for it rather than adding to
     * it — does not. Borrowing it meant this test ran on {@code task-2} and could never have said so.
     */
    @Test
    void handlerMethodsThatReturnAPlainValueGetAVirtualThreadOfTheirOwn() {
        WebTestClient.bindToApplicationContext(applicationContext)
            .build()
            .get()
            .uri(PROBE_PATH)
            .exchange()
            .expectStatus().isOk()
            .expectBody(String.class).isEqualTo("blocking-allowed virtual=true");
    }

    @RestController
    static class BlockingProbeController {

        @GetMapping(PROBE_PATH)
        String probe() {
            final String where = Schedulers.isInNonBlockingThread() ? "non-blocking-thread" : "blocking-allowed";
            return where + " virtual=" + Thread.currentThread().isVirtual();
        }
    }
}
