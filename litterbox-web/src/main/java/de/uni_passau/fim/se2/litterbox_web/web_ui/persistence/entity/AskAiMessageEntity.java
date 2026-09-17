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

@Entity
@Table(name = "ask_ai_message")
public class AskAiMessageEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "id")
    private Long id;

    @Column(name = "conversation_id")
    private long conversationId;

    @Column(name = "ordinal")
    private int ordinal;

    @Column(name = "sender")
    private String sender;

    @Column(name = "action")
    private String action;

    @Column(name = "follow_up")
    private String followUp;

    @Column(name = "status")
    private String status;

    @Column(
        name = "response_json",
        columnDefinition = "MEDIUMTEXT"
    )
    private String responseJson;

    @Column(name = "outcome")
    private String outcome;

    @Column(name = "latency_ms")
    private Integer latencyMs;

    @Column(name = "client_message_id")
    private String clientMessageId;

    /**
     * Creates a pending user row; the user row owns the client id used for idempotency.
     *
     * @param conversationId  conversation containing the message
     * @param ordinal         message ordinal
     * @param action          requested action
     * @param followUp        requested follow-up, if any
     * @param clientMessageId client-generated idempotency key
     * @return a pending user message entity
     */
    public static AskAiMessageEntity pendingUser(
        final long conversationId, final int ordinal, final String action, final String followUp,
        final String clientMessageId
    ) {
        final AskAiMessageEntity entity = pending(conversationId, ordinal, "user", action, followUp);
        entity.setClientMessageId(clientMessageId);
        return entity;
    }

    /**
     * Creates a pending assistant row; its client id remains on the paired user row.
     *
     * @param conversationId conversation containing the message
     * @param ordinal        message ordinal
     * @param action         requested action
     * @param followUp       requested follow-up, if any
     * @return a pending assistant message entity
     */
    public static AskAiMessageEntity pendingAssistant(
        final long conversationId, final int ordinal, final String action, final String followUp
    ) {
        return pending(conversationId, ordinal, "assistant", action, followUp);
    }

    private static AskAiMessageEntity pending(
        final long conversationId, final int ordinal, final String sender, final String action, final String followUp
    ) {
        final AskAiMessageEntity entity = new AskAiMessageEntity();
        entity.setConversationId(conversationId);
        entity.setOrdinal(ordinal);
        entity.setSender(sender);
        entity.setAction(action);
        entity.setFollowUp(followUp);
        entity.setOutcome("pending");
        return entity;
    }

    public Long getId() {
        return id;
    }

    public long getConversationId() {
        return conversationId;
    }

    public void setConversationId(final long conversationId) {
        this.conversationId = conversationId;
    }

    public int getOrdinal() {
        return ordinal;
    }

    public void setOrdinal(final int ordinal) {
        this.ordinal = ordinal;
    }

    public String getSender() {
        return sender;
    }

    public void setSender(final String sender) {
        this.sender = sender;
    }

    public String getAction() {
        return action;
    }

    public void setAction(final String action) {
        this.action = action;
    }

    public String getFollowUp() {
        return followUp;
    }

    public void setFollowUp(final String followUp) {
        this.followUp = followUp;
    }

    public String getStatus() {
        return status;
    }

    public void setStatus(final String status) {
        this.status = status;
    }

    public String getResponseJson() {
        return responseJson;
    }

    public void setResponseJson(final String responseJson) {
        this.responseJson = responseJson;
    }

    public String getOutcome() {
        return outcome;
    }

    public void setOutcome(final String outcome) {
        this.outcome = outcome;
    }

    public Integer getLatencyMs() {
        return latencyMs;
    }

    public void setLatencyMs(final Integer latencyMs) {
        this.latencyMs = latencyMs;
    }

    public String getClientMessageId() {
        return clientMessageId;
    }

    public void setClientMessageId(final String clientMessageId) {
        this.clientMessageId = clientMessageId;
    }
}
