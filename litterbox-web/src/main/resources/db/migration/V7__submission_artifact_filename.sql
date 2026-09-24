-- SPDX-FileCopyrightText: 2026 LitterBox-Web contributors
-- SPDX-License-Identifier: CC0-1.0

-- The name a submission gave the file it was made from. An artifact is shared by every submission of the same bytes
-- and keeps the name of whichever stored it first, which is another reader's file name and not this one's. Null for
-- links made before the name was kept.
ALTER TABLE submission_artifact ADD COLUMN original_filename VARCHAR(255) NULL;
