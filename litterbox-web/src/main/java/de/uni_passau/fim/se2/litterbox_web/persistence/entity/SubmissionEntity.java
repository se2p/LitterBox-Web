/*
 * Copyright (C) 2024-2026 LitterBox-Web contributors
 *
 * This file is part of LitterBox-Web.
 * Licenced under the EUPL-1.2 or later.
 *
 * SPDX-FileCopyrightText: 2024-2026 LitterBox-Web contributors
 * SPDX-License-Identifier: EUPL-1.2
 */
package de.uni_passau.fim.se2.litterbox_web.persistence.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

/** Maps the {@code submission} table. Rows are read and written by the repositories; none escapes one. */
@Entity
@Table(name = "submission")
public class SubmissionEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "id")
    private Long id;

    @Column(name = "share_token")
    private String shareToken;

    @Column(name = "source_type")
    private String sourceType;

    @Column(name = "locale")
    private String locale;

    @Column(name = "state")
    private String state;

    @Column(name = "retention_state")
    private String retentionState;

    @Column(name = "expected_count")
    private int expectedCount;

    @Column(name = "completed_count")
    private int completedCount;

    @Column(name = "failed_count")
    private int failedCount;

    public Long getId() {
        return id;
    }

    public void setId(final Long id) {
        this.id = id;
    }

    public String getShareToken() {
        return shareToken;
    }

    public void setShareToken(final String shareToken) {
        this.shareToken = shareToken;
    }

    public String getSourceType() {
        return sourceType;
    }

    public void setSourceType(final String sourceType) {
        this.sourceType = sourceType;
    }

    public String getLocale() {
        return locale;
    }

    public void setLocale(final String locale) {
        this.locale = locale;
    }

    public String getState() {
        return state;
    }

    public void setState(final String state) {
        this.state = state;
    }

    public String getRetentionState() {
        return retentionState;
    }

    public void setRetentionState(final String retentionState) {
        this.retentionState = retentionState;
    }

    public int getExpectedCount() {
        return expectedCount;
    }

    public void setExpectedCount(final int expectedCount) {
        this.expectedCount = expectedCount;
    }

    public int getCompletedCount() {
        return completedCount;
    }

    public void setCompletedCount(final int completedCount) {
        this.completedCount = completedCount;
    }

    public int getFailedCount() {
        return failedCount;
    }

    public void setFailedCount(final int failedCount) {
        this.failedCount = failedCount;
    }

}
