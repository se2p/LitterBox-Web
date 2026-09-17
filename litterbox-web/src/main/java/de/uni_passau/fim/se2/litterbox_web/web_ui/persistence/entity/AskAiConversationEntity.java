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
@Table(name = "ask_ai_conversation")
public class AskAiConversationEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "id")
    private Long id;

    @Column(name = "public_id")
    private String publicId;

    @Column(name = "submission_id")
    private long submissionId;

    @Column(name = "analysis_id")
    private long analysisId;

    @Column(name = "locale")
    private String locale;

    @Column(name = "scope_kind")
    private String scopeKind;

    @Column(name = "scope_selector")
    private String scopeSelector;

    @Column(
        name = "scope_label",
        columnDefinition = "TEXT"
    )
    private String scopeLabel;

    @Column(name = "reply_count")
    private int replyCount;

    @Column(name = "attempt_count")
    private int attemptCount;

    @Column(name = "next_ordinal")
    private int nextOrdinal;

    @Column(name = "active_slot")
    private Integer activeSlot;

    @Column(name = "user_visible_until")
    private Instant userVisibleUntil;

    @Column(name = "analysis_retain_until")
    private Instant analysisRetainUntil;

    @Column(name = "state")
    private String state;

    /**
     * Creates an open conversation with an assigned active slot.
     *
     * @param publicId            public identifier exposed to clients
     * @param activeSlot          active admission slot
     * @param submissionId        owning submission
     * @param analysisId          owning analysis
     * @param locale              conversation locale
     * @param scopeKind           selected scope kind
     * @param scopeSelector       selected scope identifier
     * @param scopeLabel          display label for the selected scope
     * @param userVisibleUntil    user-visible expiration
     * @param analysisRetainUntil retention expiration
     * @return a new open conversation entity
     */
    @SuppressWarnings("checkstyle:ParameterNumber")
    public static AskAiConversationEntity opened(
        final String publicId,
        final int activeSlot,
        final long submissionId,
        final long analysisId,
        final String locale,
        final String scopeKind,
        final String scopeSelector,
        final String scopeLabel,
        final Instant userVisibleUntil,
        final Instant analysisRetainUntil
    ) {
        final AskAiConversationEntity entity = new AskAiConversationEntity();
        entity.setPublicId(publicId);
        entity.setSubmissionId(submissionId);
        entity.setAnalysisId(analysisId);
        entity.setLocale(locale);
        entity.setScopeKind(scopeKind);
        entity.setScopeSelector(scopeSelector);
        entity.setScopeLabel(scopeLabel);
        entity.setReplyCount(0);
        entity.setNextOrdinal(0);
        entity.setActiveSlot(activeSlot);
        entity.setUserVisibleUntil(userVisibleUntil);
        entity.setAnalysisRetainUntil(analysisRetainUntil);
        entity.setState("OPEN");
        return entity;
    }

    public Long getId() {
        return id;
    }

    public int getNextOrdinal() {
        return nextOrdinal;
    }

    public void setNextOrdinal(final int nextOrdinal) {
        this.nextOrdinal = nextOrdinal;
    }

    public Integer getActiveSlot() {
        return activeSlot;
    }

    public void setActiveSlot(final Integer activeSlot) {
        this.activeSlot = activeSlot;
    }

    public String getPublicId() {
        return publicId;
    }

    public void setPublicId(final String publicId) {
        this.publicId = publicId;
    }

    public long getSubmissionId() {
        return submissionId;
    }

    public void setSubmissionId(final long submissionId) {
        this.submissionId = submissionId;
    }

    public long getAnalysisId() {
        return analysisId;
    }

    public void setAnalysisId(final long analysisId) {
        this.analysisId = analysisId;
    }

    public String getLocale() {
        return locale;
    }

    public void setLocale(final String locale) {
        this.locale = locale;
    }

    public String getScopeKind() {
        return scopeKind;
    }

    public void setScopeKind(final String scopeKind) {
        this.scopeKind = scopeKind;
    }

    public String getScopeSelector() {
        return scopeSelector;
    }

    public void setScopeSelector(final String scopeSelector) {
        this.scopeSelector = scopeSelector;
    }

    public String getScopeLabel() {
        return scopeLabel;
    }

    public void setScopeLabel(final String scopeLabel) {
        this.scopeLabel = scopeLabel;
    }

    public int getReplyCount() {
        return replyCount;
    }

    public void setReplyCount(final int replyCount) {
        this.replyCount = replyCount;
    }

    public int getAttemptCount() {
        return attemptCount;
    }

    public void setAttemptCount(final int attemptCount) {
        this.attemptCount = attemptCount;
    }

    public Instant getUserVisibleUntil() {
        return userVisibleUntil;
    }

    public void setUserVisibleUntil(final Instant userVisibleUntil) {
        this.userVisibleUntil = userVisibleUntil;
    }

    public Instant getAnalysisRetainUntil() {
        return analysisRetainUntil;
    }

    public void setAnalysisRetainUntil(final Instant analysisRetainUntil) {
        this.analysisRetainUntil = analysisRetainUntil;
    }

    public String getState() {
        return state;
    }

    public void setState(final String state) {
        this.state = state;
    }
}
