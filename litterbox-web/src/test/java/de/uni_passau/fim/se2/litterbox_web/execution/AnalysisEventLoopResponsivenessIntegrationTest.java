/*
 * Copyright (C) 2024-2026 LitterBox-Web contributors
 *
 * This file is part of LitterBox-Web.
 * Licenced under the EUPL-1.2 or later.
 *
 * SPDX-FileCopyrightText: 2024-2026 LitterBox-Web contributors
 * SPDX-License-Identifier: EUPL-1.2
 */
package de.uni_passau.fim.se2.litterbox_web.execution;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Duration;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.ApplicationContext;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.reactive.server.WebTestClient;

import de.uni_passau.fim.se2.litterbox_web.shared.Profiles;
import reactor.core.Disposable;

@SpringBootTest(
    properties = {
        "litterbox.execution.analysis-threads=1",
        "litterbox.execution.analysis-queue-capacity=1"
    }
)
@ActiveProfiles({ "test", Profiles.PUBLIC_WEB })
class AnalysisEventLoopResponsivenessIntegrationTest {

    @Autowired
    private ApplicationContext applicationContext;

    @Autowired
    private AnalysisWork analysisWork;

    @Test
    void capabilitiesRemainResponsiveWhileAnalysisCapacityIsOccupied() throws InterruptedException {
        final CountDownLatch started = new CountDownLatch(1);
        final CountDownLatch release = new CountDownLatch(1);
        final CountDownLatch completed = new CountDownLatch(2);

        final Disposable running = analysisWork.submit(() -> {
            started.countDown();
            release.await();
            completed.countDown();
            return null;
        }).subscribe();

        assertThat(started.await(2, TimeUnit.SECONDS)).isTrue();

        final Disposable queued = analysisWork.submit(() -> {
            completed.countDown();
            return null;
        }).subscribe();

        try {
            WebTestClient.bindToApplicationContext(applicationContext)
                .configureClient()
                .responseTimeout(Duration.ofSeconds(1))
                .build()
                .get()
                .uri("/litterbox/api/v1/capabilities")
                .exchange()
                .expectStatus().isOk();
        }
        finally {
            release.countDown();
            assertThat(completed.await(2, TimeUnit.SECONDS)).isTrue();
            running.dispose();
            queued.dispose();
        }
    }
}
