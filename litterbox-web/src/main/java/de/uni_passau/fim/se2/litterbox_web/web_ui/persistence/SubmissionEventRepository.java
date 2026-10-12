/*
 * Copyright (C) 2024-2026 LitterBox-Web contributors
 *
 * This file is part of LitterBox-Web.
 * Licenced under the EUPL-1.2 or later.
 *
 * SPDX-FileCopyrightText: 2024-2026 LitterBox-Web contributors
 * SPDX-License-Identifier: EUPL-1.2
 */
package de.uni_passau.fim.se2.litterbox_web.web_ui.persistence;

import java.util.List;
import java.util.Objects;

import org.springframework.stereotype.Repository;

import de.uni_passau.fim.se2.litterbox_web.web_ui.persistence.entity.SubmissionEventEntity;
import de.uni_passau.fim.se2.litterbox_web.web_ui.persistence.jpa.SubmissionEvents;
import reactor.core.publisher.Mono;

@Repository
public class SubmissionEventRepository {

    private final SubmissionEvents events;
    private final DatabaseWork databaseWork;

    /** Appending an event is one statement, so there is nothing here for a transaction to hold together. */
    public SubmissionEventRepository(final SubmissionEvents events, final DatabaseWork databaseWork) {
        this.events = Objects.requireNonNull(events, "events");
        this.databaseWork = Objects.requireNonNull(databaseWork, "databaseWork");
    }

    public Mono<SubmissionEvent> append(final long submissionId, final String eventType, final String payloadJson) {
        Objects.requireNonNull(eventType, "eventType");
        Objects.requireNonNull(payloadJson, "payloadJson");
        return databaseWork.submit(() -> appendEvent(submissionId, eventType, payloadJson));
    }

    /**
     * Returns events for a submission after the supplied sequence number.
     *
     * @param submissionId submission identifier
     * @param sequenceNo   exclusive sequence number boundary
     * @return matching events
     */
    public Mono<List<SubmissionEvent>> findAfter(final long submissionId, final long sequenceNo) {
        return databaseWork.submit(
            () -> events.findBySubmissionIdAndSequenceNoGreaterThanOrderBySequenceNo(submissionId, sequenceNo)
                .stream()
                .map(
                    stored -> new SubmissionEvent(
                        stored.getSubmissionId(), stored.getSequenceNo(), stored.getEventType(),
                        stored.getPayloadJson()
                    )
                )
                .toList()
        );
    }

    public record SubmissionEvent(long submissionId, long sequenceNo, String eventType, String payloadJson) {
    }

    private SubmissionEvent appendEvent(final long submissionId, final String eventType, final String payloadJson) {
        final SubmissionEventEntity saved = events.append(submissionId, eventType, payloadJson);
        return new SubmissionEvent(submissionId, saved.getSequenceNo(), eventType, payloadJson);
    }
}
