-- SPDX-FileCopyrightText: 2026 LitterBox-Web contributors
-- SPDX-License-Identifier: CC0-1.0

-- Earlier projections interpreted legacy finding rows as current report rows. Rebuild the anonymous projection using
-- the legacy report adapter so prevalence includes only projects whose complete finding arrays can be read.
DELETE FROM statistics_processed_analysis;
DELETE FROM statistics_distribution;
DELETE FROM statistics_finding;
DELETE FROM statistics_block_category;
DELETE FROM statistics_total;
