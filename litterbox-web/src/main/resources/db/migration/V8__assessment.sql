-- SPDX-FileCopyrightText: 2026 LitterBox-Web contributors
-- SPDX-License-Identifier: CC0-1.0

ALTER TABLE analysis ADD COLUMN assessment_count INT NOT NULL DEFAULT 0;

CREATE TABLE assessment (
    id BIGINT NOT NULL AUTO_INCREMENT,
    public_token VARCHAR(43) NOT NULL,
    teacher_token VARCHAR(43) NOT NULL,
    analysis_id BIGINT NOT NULL,
    title VARCHAR(255) NOT NULL,
    instructions VARCHAR(2000) NULL,
    locale VARCHAR(16) NOT NULL,
    questions_json LONGTEXT NOT NULL,
    status VARCHAR(16) NOT NULL DEFAULT 'OPEN',
    expires_at TIMESTAMP(6) NOT NULL,
    attempts INT NOT NULL DEFAULT 0,
    created_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    PRIMARY KEY (id),
    UNIQUE KEY uq_assessment_public_token (public_token),
    UNIQUE KEY uq_assessment_teacher_token (teacher_token),
    CONSTRAINT fk_assessment_analysis FOREIGN KEY (analysis_id) REFERENCES analysis (id)
) ENGINE = InnoDB;

CREATE TABLE assessment_attempt (
    id BIGINT NOT NULL AUTO_INCREMENT,
    public_token VARCHAR(43) NOT NULL,
    assessment_id BIGINT NOT NULL,
    created_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    PRIMARY KEY (id),
    UNIQUE KEY uq_assessment_attempt_public_token (public_token),
    CONSTRAINT fk_assessment_attempt_assessment FOREIGN KEY (assessment_id) REFERENCES assessment (id)
        ON DELETE CASCADE
) ENGINE = InnoDB;

CREATE TABLE assessment_answer (
    id BIGINT NOT NULL AUTO_INCREMENT,
    attempt_id BIGINT NOT NULL,
    question_id VARCHAR(32) NOT NULL,
    answer VARCHAR(500) NOT NULL,
    correct BOOLEAN NULL,
    created_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    PRIMARY KEY (id),
    UNIQUE KEY uq_assessment_answer_attempt_question (attempt_id, question_id),
    CONSTRAINT fk_assessment_answer_attempt FOREIGN KEY (attempt_id) REFERENCES assessment_attempt (id)
        ON DELETE CASCADE
) ENGINE = InnoDB;

CREATE INDEX ix_assessment_attempt_assessment ON assessment_attempt (assessment_id);

CREATE INDEX ix_assessment_expires_at ON assessment (expires_at);
