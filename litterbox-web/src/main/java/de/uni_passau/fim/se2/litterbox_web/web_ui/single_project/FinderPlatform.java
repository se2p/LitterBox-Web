/*
 * Copyright (C) 2024-2026 LitterBox-Web contributors
 *
 * This file is part of LitterBox-Web.
 * Licenced under the EUPL-1.2 or later.
 *
 * SPDX-FileCopyrightText: 2024-2026 LitterBox-Web contributors
 * SPDX-License-Identifier: EUPL-1.2
 */
package de.uni_passau.fim.se2.litterbox_web.web_ui.single_project;

import java.util.Locale;

import de.uni_passau.fim.se2.litterbox_web.web_ui.catalogue.FinderBlockSet;

/**
 * Broad editor classification retained by the catalogue API. The more precise block ecosystem is supplied separately.
 */
public enum FinderPlatform {

    SCRATCH,
    MBLOCK;

    public static FinderPlatform of(final FinderBlockSet blockSet) {
        return blockSet == FinderBlockSet.MBLOCK ? MBLOCK : SCRATCH;
    }

    public String wireName() {
        return name().toLowerCase(Locale.ROOT);
    }
}
