/*
 * Copyright (C) 2024-2026 LitterBox-Web contributors
 *
 * This file is part of LitterBox-Web.
 * Licenced under the EUPL-1.2 or later.
 *
 * SPDX-FileCopyrightText: 2024-2026 LitterBox-Web contributors
 * SPDX-License-Identifier: EUPL-1.2
 */
package de.uni_passau.fim.se2.litterbox_web.web_ui.persistence.jpa;

import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;

import de.uni_passau.fim.se2.litterbox_web.web_ui.persistence.entity.SubmissionEventEntity;

public interface SubmissionEvents extends JpaRepository<SubmissionEventEntity, Long> {

    List<SubmissionEventEntity> findBySubmissionIdAndSequenceNoGreaterThanOrderBySequenceNo(
        long submissionId, long sequenceNo
    );

    /**
     * Records that something happened to a submission.
     *
     * <p>
     * The database numbers the event, so this is a single statement and no lock. Working the number out beforehand
     * meant reading the highest so far and writing one more, and nothing but a lock held across both stops two appends
     * from reading the same answer.
     *
     * @param submissionId submission identifier
     * @param eventType    event type
     * @param payloadJson  event payload
     * @return persisted event
     */
    default SubmissionEventEntity append(
        final long submissionId, final String eventType, final String payloadJson
    ) {
        final SubmissionEventEntity entity = new SubmissionEventEntity();
        entity.setSubmissionId(submissionId);
        entity.setEventType(eventType);
        entity.setPayloadJson(payloadJson);
        return save(entity);
    }
}
