/*
 * Copyright (C) 2024-2026 LitterBox-Web contributors
 *
 * This file is part of LitterBox-Web.
 * Licenced under the EUPL-1.2 or later.
 *
 * SPDX-FileCopyrightText: 2024-2026 LitterBox-Web contributors
 * SPDX-License-Identifier: EUPL-1.2
 */
package de.uni_passau.fim.se2.litterbox_web.web_ui.assessment;

import java.util.concurrent.atomic.AtomicBoolean;

import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import io.micrometer.core.instrument.MeterRegistry;

/** Deletes expired assessments in bounded sweeps. */
@Component
public class AssessmentRetention {

    private final AssessmentService assessments;
    private final MeterRegistry metrics;

    /** Prevents overlapping cleanup sweeps. */
    private final AtomicBoolean sweeping = new AtomicBoolean();

    public AssessmentRetention(final AssessmentService assessments, final MeterRegistry metrics) {
        this.assessments = assessments;
        this.metrics = metrics;
    }

    /**
     * Deletes expired assessments, counting removals and failures in the metrics registry. A sweep is skipped while the
     * previous one is still running.
     */
    @Scheduled(fixedDelayString = "${litterbox.capabilities.assessments.cleanup-millis:3600000}")
    public void removeExpired() {
        if (!sweeping.compareAndSet(false, true)) {
            return;
        }
        assessments.removeExpired().doFinally(ignored -> sweeping.set(false)).subscribe(
            removed -> metrics.counter("litterbox.assessments.expired.removed").increment(removed),
            error -> metrics.counter("litterbox.assessments.expired.errors").increment()
        );
    }
}
