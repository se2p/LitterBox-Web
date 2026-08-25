/*
 * Copyright (C) 2024-2026 LitterBox-Web contributors
 *
 * This file is part of LitterBox-Web.
 * Licenced under the EUPL-1.2 or later.
 *
 * SPDX-FileCopyrightText: 2024-2026 LitterBox-Web contributors
 * SPDX-License-Identifier: EUPL-1.2
 */
package de.uni_passau.fim.se2.litterbox_web.web_ui.persistence.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

/** Maps the {@code submission_event} table. Rows are read and written by the repositories; none escapes one. */
@Entity
@Table(name = "submission_event")
public class SubmissionEventEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "sequence_no")
    private Long sequenceNo;

    @Column(name = "submission_id")
    private long submissionId;

    @Column(name = "event_type")
    private String eventType;

    @Column(
        name = "payload_json",
        columnDefinition = "LONGTEXT"
    )
    private String payloadJson;

    public Long getSequenceNo() {
        return sequenceNo;
    }

    public long getSubmissionId() {
        return submissionId;
    }

    public void setSubmissionId(final long submissionId) {
        this.submissionId = submissionId;
    }

    public String getEventType() {
        return eventType;
    }

    public void setEventType(final String eventType) {
        this.eventType = eventType;
    }

    public String getPayloadJson() {
        return payloadJson;
    }

    public void setPayloadJson(final String payloadJson) {
        this.payloadJson = payloadJson;
    }

}
