-- SPDX-FileCopyrightText: 2026 LitterBox-Web contributors
-- SPDX-License-Identifier: CC0-1.0

-- The whole schema, as one migration. Nothing has been deployed from this project yet, so there is no
-- installation anywhere that needs stepping from an older shape to this one, and five migrations recording
-- how the shape was arrived at only ask a reader to replay history to learn what a table looks like now.

-- Tables

CREATE TABLE submission (
    id BIGINT NOT NULL AUTO_INCREMENT,
    share_token VARCHAR(43) NOT NULL,
    source_type VARCHAR(32) NOT NULL,
    locale VARCHAR(16) NOT NULL,
    school_type VARCHAR(64) NULL,
    state VARCHAR(24) NOT NULL,
    retention_state VARCHAR(24) NOT NULL DEFAULT 'ACTIVE',
    expected_count INT NOT NULL DEFAULT 0,
    completed_count INT NOT NULL DEFAULT 0,
    failed_count INT NOT NULL DEFAULT 0,
    created_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    updated_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    PRIMARY KEY (id),
    UNIQUE KEY uq_submission_share_token (share_token),
    CHECK (expected_count >= 0),
    CHECK (completed_count >= 0),
    CHECK (failed_count >= 0)
) ENGINE = InnoDB;

CREATE TABLE submission_event (
    -- The database hands these out, so appending an event needs no lock to work out what to call it. They are
    -- shared with every submission and so run with gaps, which the only reader does not mind: it carries the
    -- highest number it has seen and asks for what came after, and for that all that matters is the order.
    sequence_no BIGINT NOT NULL AUTO_INCREMENT,
    submission_id BIGINT NOT NULL,
    event_type VARCHAR(32) NOT NULL,
    payload_json LONGTEXT NOT NULL,
    created_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    PRIMARY KEY (sequence_no),
    KEY ix_submission_event_submission (submission_id, sequence_no),
    CONSTRAINT fk_submission_event_submission FOREIGN KEY (submission_id) REFERENCES submission (id)
) ENGINE = InnoDB;

CREATE TABLE source_artifact (
    id BIGINT NOT NULL AUTO_INCREMENT,
    sha256 BINARY(32) NOT NULL,
    storage_key VARCHAR(512) NOT NULL,
    original_filename VARCHAR(255) NULL,
    media_type VARCHAR(128) NULL,
    byte_size BIGINT NOT NULL CHECK (byte_size >= 0),
    source_kind VARCHAR(32) NOT NULL,
    manifest_json LONGTEXT NULL,
    retention_state VARCHAR(24) NOT NULL,
    created_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    PRIMARY KEY (id),
    UNIQUE KEY uq_source_artifact_sha256 (sha256),
    UNIQUE KEY uq_source_artifact_storage_key (storage_key)
) ENGINE = InnoDB;

CREATE TABLE submission_artifact (
    submission_id BIGINT NOT NULL,
    artifact_id BIGINT NOT NULL,
    role VARCHAR(32) NOT NULL,
    created_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    PRIMARY KEY (submission_id, artifact_id, role),
    CONSTRAINT fk_submission_artifact_submission FOREIGN KEY (submission_id) REFERENCES submission (id),
    CONSTRAINT fk_submission_artifact_artifact FOREIGN KEY (artifact_id) REFERENCES source_artifact (id)
) ENGINE = InnoDB;

CREATE TABLE analysis (
    id BIGINT NOT NULL AUTO_INCREMENT,
    submission_id BIGINT NOT NULL,
    source_artifact_id BIGINT NOT NULL,
    -- The Scratch project a migrated legacy programme was of, parsed from the URL the old system kept.
    -- Nothing else retains it: the legacy URL is not carried over, and legacy_id_map records which row a
    -- programme came from, not which project it was. Written only by the migration.
    project_id VARCHAR(128) NULL,
    project_name VARCHAR(255) NULL,
    provenance VARCHAR(24) NOT NULL,
    report_schema_version VARCHAR(32) NOT NULL,
    litterbox_artifact_version VARCHAR(128) NOT NULL,
    detector_set VARCHAR(255) NULL,
    configuration_json LONGTEXT NULL,
    locale VARCHAR(16) NOT NULL,
    input_sha256 BINARY(32) NULL,
    input_format VARCHAR(32) NULL,
    report_json LONGTEXT NULL,
    status VARCHAR(24) NOT NULL,
    failure_type VARCHAR(64) NULL,
    failure_message TEXT NULL,
    legacy_id VARCHAR(128) NULL,
    -- Whether this analysis is the one that creating the submission made, as against one run afterwards over a
    -- project the submission already holds.
    from_creation BOOLEAN NOT NULL DEFAULT FALSE,
    -- The project an analysis was created for, and nothing at all for one added later.
    --
    -- A batch names its projects after the files it was packed from. A submission of a single project has one
    -- project and no name to tell it apart from, and stands here as the empty name, which no file has. The two
    -- cannot be confused because no submission is both: a batch's creation makes an analysis per named child and
    -- none for the submission itself.
    creation_project VARCHAR(255) AS (CASE WHEN from_creation THEN COALESCE(project_name, '') END) VIRTUAL,
    created_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    completed_at TIMESTAMP(6) NULL,
    PRIMARY KEY (id),
    -- One creation per project. Two workers unpacking the same class set, or two repeats of a request whose first
    -- attempt bound its idempotency key and then died, can both find the submission empty; the database simply
    -- refuses the second, which makes the insert itself the decision and leaves nothing to be decided between
    -- reading and writing.
    --
    -- Only creations, so that a project can be run again under a newer LitterBox or a different configuration. A
    -- later run leaves this null, and nulls do not collide.
    UNIQUE KEY uq_analysis_creation (submission_id, creation_project),
    CONSTRAINT fk_analysis_submission FOREIGN KEY (submission_id) REFERENCES submission (id),
    CONSTRAINT fk_analysis_artifact FOREIGN KEY (source_artifact_id) REFERENCES source_artifact (id)
) ENGINE = InnoDB;

CREATE TABLE analysis_metric (
    analysis_id BIGINT NOT NULL,
    name VARCHAR(128) NOT NULL,
    value DOUBLE NOT NULL,
    PRIMARY KEY (analysis_id, name),
    CONSTRAINT fk_analysis_metric_analysis FOREIGN KEY (analysis_id) REFERENCES analysis (id)
) ENGINE = InnoDB;

CREATE TABLE scratch_project_stats (
    analysis_id BIGINT NOT NULL,
    views BIGINT NULL,
    loves BIGINT NULL,
    favorites BIGINT NULL,
    remixes BIGINT NULL,
    author_username VARCHAR(255) NULL,
    username_source VARCHAR(64) NULL,
    scratch_created_at TIMESTAMP(6) NULL,
    fetched_at TIMESTAMP(6) NULL,
    PRIMARY KEY (analysis_id),
    CONSTRAINT fk_scratch_stats_analysis FOREIGN KEY (analysis_id) REFERENCES analysis (id)
) ENGINE = InnoDB;

CREATE TABLE asset (
    sha256 BINARY(32) NOT NULL,
    scratch_md5 VARCHAR(32) NULL,
    extension VARCHAR(16) NULL,
    media_type VARCHAR(128) NULL,
    byte_size BIGINT NOT NULL CHECK (byte_size >= 0),
    content LONGBLOB NULL,
    PRIMARY KEY (sha256),
    UNIQUE KEY uq_asset_md5 (scratch_md5)
) ENGINE = InnoDB;

CREATE TABLE analysis_asset (
    analysis_id BIGINT NOT NULL,
    asset_sha256 BINARY(32) NOT NULL,
    role VARCHAR(32) NOT NULL,
    PRIMARY KEY (analysis_id, asset_sha256, role),
    CONSTRAINT fk_analysis_asset_analysis FOREIGN KEY (analysis_id) REFERENCES analysis (id),
    CONSTRAINT fk_analysis_asset_asset FOREIGN KEY (asset_sha256) REFERENCES asset (sha256)
) ENGINE = InnoDB;

CREATE TABLE issue_feedback (
    analysis_id BIGINT NOT NULL,
    finder_name VARCHAR(255) NOT NULL,
    reaction VARCHAR(32) NOT NULL,
    created_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    updated_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    PRIMARY KEY (analysis_id, finder_name),
    CONSTRAINT fk_issue_feedback_analysis FOREIGN KEY (analysis_id) REFERENCES analysis (id)
) ENGINE = InnoDB;

CREATE TABLE quiz_answer (
    id BIGINT NOT NULL AUTO_INCREMENT,
    analysis_id BIGINT NOT NULL,
    question_id VARCHAR(500) NOT NULL,
    answer VARCHAR(500) NOT NULL,
    correct BOOLEAN NULL,
    created_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    PRIMARY KEY (id),
    CONSTRAINT fk_quiz_answer_analysis FOREIGN KEY (analysis_id) REFERENCES analysis (id)
) ENGINE = InnoDB;

CREATE TABLE legacy_id_map (
    old_table_name VARCHAR(128) NOT NULL,
    old_id VARCHAR(255) NOT NULL,
    old_token VARCHAR(255) NULL,
    old_filename VARCHAR(255) NULL,
    analysis_id BIGINT NULL,
    PRIMARY KEY (old_table_name, old_id),
    CONSTRAINT fk_legacy_id_map_analysis FOREIGN KEY (analysis_id) REFERENCES analysis (id)
) ENGINE = InnoDB;

CREATE TABLE external_id (
    id BIGINT NOT NULL AUTO_INCREMENT,
    legacy_name VARCHAR(128) NOT NULL,
    legacy_value VARCHAR(255) NOT NULL,
    created_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    PRIMARY KEY (id),
    UNIQUE KEY uq_external_id (legacy_name, legacy_value)
) ENGINE = InnoDB;

CREATE TABLE contact_message (
    id BIGINT NOT NULL AUTO_INCREMENT,
    sender_name VARCHAR(255) NULL,
    sender_email VARCHAR(320) NULL,
    message TEXT NOT NULL,
    created_at TIMESTAMP(6) NULL,
    PRIMARY KEY (id)
) ENGINE = InnoDB;

CREATE TABLE idempotency_key (
    scope VARCHAR(64) NOT NULL,
    idempotency_key VARCHAR(255) NOT NULL,
    -- What the request was, as something two requests carrying one key can be compared by. See RequestFingerprint
    -- for what goes in and why the bytes alone will not do.
    request_fingerprint BINARY(32) NOT NULL,
    submission_id BIGINT NOT NULL,
    created_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    PRIMARY KEY (scope, idempotency_key),
    CONSTRAINT fk_idempotency_submission FOREIGN KEY (submission_id) REFERENCES submission (id)
) ENGINE = InnoDB;

CREATE TABLE analysis_job (
    id BIGINT NOT NULL AUTO_INCREMENT,
    submission_id BIGINT NOT NULL,
    analysis_id BIGINT NULL,
    job_kind VARCHAR(24) NOT NULL DEFAULT 'ANALYSIS',
    source_reference VARCHAR(128) NULL,
    state VARCHAR(24) NOT NULL,
    lease_owner VARCHAR(128) NULL,
    lease_until TIMESTAMP(6) NULL,
    cancel_requested BOOLEAN NOT NULL DEFAULT FALSE,
    attempts INT NOT NULL DEFAULT 0,
    -- Where this job stands among its own submission's jobs. Claiming orders by it before id, so the nth
    -- project of every submission is taken before the (n+1)th of any: one studio of three hundred projects
    -- fills the idle workers but never holds them against somebody who uploads a single project afterwards.
    queue_position INT NOT NULL DEFAULT 0,
    -- The reference of an ingestion job that could still run, and nothing otherwise. A job that has failed or been
    -- cancelled drops out of the unique key below, because nulls do not collide, which is what lets the same studio
    -- or archive be queued again after one attempt came to nothing. Analysis jobs carry no reference and so are
    -- never constrained by it.
    active_source_reference VARCHAR(128) AS (
        CASE WHEN state IN ('FAILED', 'CANCELLED') THEN NULL ELSE source_reference END
    ) VIRTUAL,
    created_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    updated_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    PRIMARY KEY (id),
    UNIQUE KEY uq_analysis_job_analysis (analysis_id),
    -- Asking whether an ingestion is already queued and then queueing one is two decisions, and two requests can
    -- both ask before either answers. This makes the insert itself the decision.
    UNIQUE KEY uq_analysis_job_active_ingestion (submission_id, job_kind, active_source_reference),
    KEY ix_analysis_job_claim (cancel_requested, state, queue_position, id),
    -- Claiming stamps a row with a token nobody else will generate and then reads the row back by it. Without this
    -- that read is a scan of every job ever recorded. Not unique: nothing depends on it being so, since the token
    -- carries a fresh UUID, and saying so would only forbid tests from writing a lease owner worth reading.
    KEY ix_analysis_job_lease_owner (lease_owner),
    CONSTRAINT fk_analysis_job_submission FOREIGN KEY (submission_id) REFERENCES submission (id),
    CONSTRAINT fk_analysis_job_analysis FOREIGN KEY (analysis_id) REFERENCES analysis (id)
) ENGINE = InnoDB;

-- Indexes

CREATE INDEX ix_analysis_submission_status ON analysis (submission_id, status, created_at);

-- The primary key is (analysis_id, name), which answers "what did this analysis measure" but not "what does this
-- measurement usually come to", and the latter is what a reader is told when a count is called usual or unusual.
CREATE INDEX idx_analysis_metric_name_value ON analysis_metric (name, value);
