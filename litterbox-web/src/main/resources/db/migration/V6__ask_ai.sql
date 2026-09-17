-- SPDX-FileCopyrightText: 2026 LitterBox-Web contributors
-- SPDX-License-Identifier: CC0-1.0

-- Conversation transcripts are stored for readers and never replayed as provider history.

CREATE TABLE ask_ai_conversation (
    id BIGINT NOT NULL AUTO_INCREMENT,
    public_id VARCHAR(43) NOT NULL,
    submission_id BIGINT NOT NULL,
    analysis_id BIGINT NOT NULL,
    locale VARCHAR(8) NOT NULL,
    scope_kind VARCHAR(16) NOT NULL,
    -- Re-resolved against the current retained project for every message.
    scope_selector VARCHAR(200) NOT NULL,
    scope_label TEXT NOT NULL,
    reply_count INT NOT NULL DEFAULT 0,
    -- Turns put to the model, answered or not; a failed turn gives back its reply but not its attempt.
    attempt_count INT NOT NULL DEFAULT 0,
    -- The user row's ordinal; the paired assistant row uses the next ordinal.
    next_ordinal INT NOT NULL DEFAULT 0,
    -- Unique per analysis while active; NULL after the place is released.
    active_slot INT NULL,
    created_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    closed_at TIMESTAMP(6) NULL,
    user_visible_until TIMESTAMP(6) NOT NULL,
    analysis_retain_until TIMESTAMP(6) NOT NULL,
    state VARCHAR(16) NOT NULL DEFAULT 'OPEN',
    PRIMARY KEY (id),
    UNIQUE KEY uq_ask_ai_conversation_public_id (public_id),
    UNIQUE KEY uq_ask_ai_conversation_active_slot (analysis_id, active_slot),
    CONSTRAINT fk_ask_ai_conversation_submission FOREIGN KEY (submission_id) REFERENCES submission (id),
    CONSTRAINT fk_ask_ai_conversation_analysis FOREIGN KEY (analysis_id) REFERENCES analysis (id),
    CHECK (reply_count >= 0),
    CHECK (attempt_count >= 0),
    CHECK (next_ordinal >= 0)
) ENGINE = InnoDB;

CREATE TABLE ask_ai_message (
    id BIGINT NOT NULL AUTO_INCREMENT,
    conversation_id BIGINT NOT NULL,
    ordinal INT NOT NULL,
    sender VARCHAR(9) NOT NULL,
    action VARCHAR(32) NOT NULL,
    follow_up VARCHAR(32) NULL,
    status VARCHAR(16) NULL,
    response_json MEDIUMTEXT NULL,
    -- A conditional pending-to-terminal update arbitrates the answer/abandonment race.
    outcome VARCHAR(32) NOT NULL,
    latency_ms INT NULL,
    client_message_id VARCHAR(64) NULL,
    created_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    PRIMARY KEY (id),
    UNIQUE KEY uq_ask_ai_message_client_id (conversation_id, client_message_id),
    UNIQUE KEY uq_ask_ai_message_ordinal (conversation_id, ordinal),
    CONSTRAINT fk_ask_ai_message_conversation FOREIGN KEY (conversation_id) REFERENCES ask_ai_conversation (id),
    CHECK (latency_ms IS NULL OR latency_ms >= 0)
) ENGINE = InnoDB;

CREATE INDEX ix_ask_ai_conversation_user_visible_until ON ask_ai_conversation (user_visible_until);
CREATE INDEX ix_ask_ai_conversation_analysis_retain_until ON ask_ai_conversation (analysis_retain_until);

CREATE INDEX ix_ask_ai_conversation_analysis ON ask_ai_conversation (analysis_id, state);

CREATE INDEX ix_ask_ai_message_pending ON ask_ai_message (outcome, created_at);
