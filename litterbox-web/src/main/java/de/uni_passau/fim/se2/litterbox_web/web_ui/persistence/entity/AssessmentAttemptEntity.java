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

/** Maps the {@code assessment_attempt} table. One child's sitting of an assessment, and nothing that says who. */
@Entity
@Table(name = "assessment_attempt")
public class AssessmentAttemptEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "id")
    private Long id;

    @Column(name = "public_token")
    private String publicToken;

    @Column(name = "assessment_id")
    private long assessmentId;

    public Long getId() {
        return id;
    }

    public void setId(final Long id) {
        this.id = id;
    }

    public String getPublicToken() {
        return publicToken;
    }

    public void setPublicToken(final String publicToken) {
        this.publicToken = publicToken;
    }

    public long getAssessmentId() {
        return assessmentId;
    }

    public void setAssessmentId(final long assessmentId) {
        this.assessmentId = assessmentId;
    }

}
