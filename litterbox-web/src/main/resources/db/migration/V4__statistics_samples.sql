-- SPDX-FileCopyrightText: 2026 LitterBox-Web contributors
-- SPDX-License-Identifier: CC0-1.0

ALTER TABLE statistics_total
    ADD COLUMN finding_projects BIGINT NOT NULL DEFAULT 0 AFTER projects,
    ADD COLUMN block_category_projects BIGINT NOT NULL DEFAULT 0 AFTER finding_projects,
    ADD CONSTRAINT chk_statistics_total_finding_projects CHECK (finding_projects >= 0),
    ADD CONSTRAINT chk_statistics_total_block_category_projects CHECK (block_category_projects >= 0);

-- Existing projections only included current full analyses, for which both sections were projected.
UPDATE statistics_total
SET finding_projects = projects,
    block_category_projects = projects;
