/*
 * Copyright (C) 2024-2026 LitterBox-Web contributors
 *
 * This file is part of LitterBox-Web.
 * Licenced under the EUPL-1.2 or later.
 *
 * SPDX-FileCopyrightText: 2024-2026 LitterBox-Web contributors
 * SPDX-License-Identifier: EUPL-1.2
 */
package de.uni_passau.fim.se2.litterbox_web.migration;

import java.util.List;

public final class LegacyAlreadyMigratedException extends LegacyMigrationException {

    public LegacyAlreadyMigratedException(final long mappedRows) {
        super(
            "Target schema already contains a completed legacy migration",
            List.of(new Diagnostic("ALREADY_MIGRATED", "legacy_id_map", null, "mapped rows exist", mappedRows))
        );
    }
}
