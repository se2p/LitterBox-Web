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

/** Maps the {@code analysis_job} table. Rows are read and written by the repositories; none escapes one. */
@Entity
@Table(name = "analysis_job")
public class AnalysisJobEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "id")
    private Long id;

    @Column(name = "submission_id")
    private long submissionId;

    @Column(name = "analysis_id")
    private Long analysisId;

    @Column(name = "job_kind")
    private String jobKind;

    @Column(name = "source_reference")
    private String sourceReference;

    // Mapped because a claim reads the row back by the token it just stamped there; nothing in Java reads the value.
    @Column(name = "lease_owner")
    private String leaseOwner;

    @Column(name = "state")
    private String state;

    @Column(name = "cancel_requested")
    private boolean cancelRequested;

    @Column(name = "attempts")
    private int attempts;

    public Long getId() {
        return id;
    }

    public void setId(final Long id) {
        this.id = id;
    }

    public long getSubmissionId() {
        return submissionId;
    }

    public void setSubmissionId(final long submissionId) {
        this.submissionId = submissionId;
    }

    public Long getAnalysisId() {
        return analysisId;
    }

    public void setAnalysisId(final Long analysisId) {
        this.analysisId = analysisId;
    }

    public String getJobKind() {
        return jobKind;
    }

    public void setJobKind(final String jobKind) {
        this.jobKind = jobKind;
    }

    public String getSourceReference() {
        return sourceReference;
    }

    public String getState() {
        return state;
    }

    public void setState(final String state) {
        this.state = state;
    }

    public boolean isCancelRequested() {
        return cancelRequested;
    }

    public int getAttempts() {
        return attempts;
    }

}
