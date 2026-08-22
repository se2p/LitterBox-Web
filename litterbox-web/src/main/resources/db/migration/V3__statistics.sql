-- SPDX-FileCopyrightText: 2026 LitterBox-Web contributors
-- SPDX-License-Identifier: CC0-1.0

-- These rows intentionally describe populations only.  The sole link back to an analysis is the short-lived
-- idempotency marker; no public aggregate contains a project, submission, or user identifier.
CREATE TABLE statistics_processed_analysis (
    analysis_id BIGINT NOT NULL,
    PRIMARY KEY (analysis_id),
    CONSTRAINT fk_statistics_processed_analysis FOREIGN KEY (analysis_id) REFERENCES analysis (id) ON DELETE CASCADE
) ENGINE = InnoDB;

CREATE TABLE statistics_total (
    singleton TINYINT NOT NULL,
    projects BIGINT NOT NULL DEFAULT 0,
    blocks BIGINT NOT NULL DEFAULT 0,
    scripts BIGINT NOT NULL DEFAULT 0,
    sprites BIGINT NOT NULL DEFAULT 0,
    synthetic BOOLEAN NOT NULL DEFAULT FALSE,
    updated_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    PRIMARY KEY (singleton),
    CHECK (singleton = 1),
    CHECK (projects >= 0), CHECK (blocks >= 0), CHECK (scripts >= 0), CHECK (sprites >= 0)
) ENGINE = InnoDB;

CREATE TABLE statistics_distribution (
    metric VARCHAR(128) NOT NULL,
    metric_value BIGINT NOT NULL,
    count BIGINT NOT NULL DEFAULT 0,
    PRIMARY KEY (metric, metric_value),
    CHECK (metric_value >= 0), CHECK (count >= 0)
) ENGINE = InnoDB;

CREATE TABLE statistics_finding (
    finder_id VARCHAR(255) NOT NULL,
    issue_type VARCHAR(64) NOT NULL,
    projects_affected BIGINT NOT NULL DEFAULT 0,
    occurrences BIGINT NOT NULL DEFAULT 0,
    PRIMARY KEY (finder_id, issue_type),
    KEY ix_statistics_finding_type (issue_type, finder_id),
    CHECK (projects_affected >= 0), CHECK (occurrences >= 0)
) ENGINE = InnoDB;

CREATE TABLE statistics_block_category (
    metric VARCHAR(128) NOT NULL,
    projects_using BIGINT NOT NULL DEFAULT 0,
    blocks BIGINT NOT NULL DEFAULT 0,
    PRIMARY KEY (metric),
    CHECK (projects_using >= 0), CHECK (blocks >= 0)
) ENGINE = InnoDB;
