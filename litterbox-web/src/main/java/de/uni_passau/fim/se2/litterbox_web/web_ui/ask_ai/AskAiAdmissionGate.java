/*
 * Copyright (C) 2024-2026 LitterBox-Web contributors
 *
 * This file is part of LitterBox-Web.
 * Licenced under the EUPL-1.2 or later.
 *
 * SPDX-FileCopyrightText: 2024-2026 LitterBox-Web contributors
 * SPDX-License-Identifier: EUPL-1.2
 */
package de.uni_passau.fim.se2.litterbox_web.web_ui.ask_ai;

import java.util.concurrent.Semaphore;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

/** Non-blocking global concurrency bound; every acquired permit must be released exactly once. */
@Component
public final class AskAiAdmissionGate {

    private static final Logger log = LoggerFactory.getLogger(AskAiAdmissionGate.class);

    private final int limit;
    private final Semaphore slots;

    public AskAiAdmissionGate(final AskAiConfigurationProperties configuration) {
        this.limit = configuration.getConversation().getMaxConcurrentGenerations();
        this.slots = new Semaphore(limit);
    }

    public boolean tryAcquire() {
        return slots.tryAcquire();
    }

    public void release() {
        if (slots.availablePermits() >= limit) {
            log.warn("AskAiAdmissionGate.release() called without a matching tryAcquire()");
        }
        slots.release();
    }
}
