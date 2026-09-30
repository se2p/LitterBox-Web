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

import java.time.Instant;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

@Entity
@Table(name = "assessment")
public class AssessmentEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "id")
    private Long id;

    @Column(name = "public_token")
    private String publicToken;

    @Column(name = "teacher_token")
    private String teacherToken;

    @Column(name = "analysis_id")
    private long analysisId;

    @Column(name = "title")
    private String title;

    @Column(name = "instructions")
    private String instructions;

    @Column(name = "locale")
    private String locale;

    @Column(
        name = "questions_json",
        columnDefinition = "LONGTEXT"
    )
    private String questionsJson;

    @Column(name = "status")
    private String status;

    @Column(name = "expires_at")
    private Instant expiresAt;

    @Column(name = "attempts")
    private int attempts;

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

    public String getTeacherToken() {
        return teacherToken;
    }

    public void setTeacherToken(final String teacherToken) {
        this.teacherToken = teacherToken;
    }

    public long getAnalysisId() {
        return analysisId;
    }

    public void setAnalysisId(final long analysisId) {
        this.analysisId = analysisId;
    }

    public String getTitle() {
        return title;
    }

    public void setTitle(final String title) {
        this.title = title;
    }

    public String getInstructions() {
        return instructions;
    }

    public void setInstructions(final String instructions) {
        this.instructions = instructions;
    }

    public String getLocale() {
        return locale;
    }

    public void setLocale(final String locale) {
        this.locale = locale;
    }

    public String getQuestionsJson() {
        return questionsJson;
    }

    public void setQuestionsJson(final String questionsJson) {
        this.questionsJson = questionsJson;
    }

    public String getStatus() {
        return status;
    }

    public void setStatus(final String status) {
        this.status = status;
    }

    public Instant getExpiresAt() {
        return expiresAt;
    }

    public void setExpiresAt(final Instant expiresAt) {
        this.expiresAt = expiresAt;
    }

    public int getAttempts() {
        return attempts;
    }

    public void setAttempts(final int attempts) {
        this.attempts = attempts;
    }

}
