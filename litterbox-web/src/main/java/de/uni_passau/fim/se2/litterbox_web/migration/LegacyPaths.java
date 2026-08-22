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

import java.nio.file.Path;

final class LegacyPaths {

    private LegacyPaths() {
    }

    /**
     * Resolves one legacy name inside a directory, or {@code null} when it names anything but a file directly in it.
     * The names come from a database this migration does not own, so one that climbs out of the directory it belongs to
     * is refused rather than followed. Both the uploads and the reports are named that way, and they are refused on the
     * same terms.
     */
    static Path resolveInsideDirectory(final Path directory, final String name) {
        final Path base = directory.toAbsolutePath().normalize();
        final Path resolved = base.resolve(name).normalize();
        if (!resolved.startsWith(base) || !base.equals(resolved.getParent())) {
            return null;
        }
        return resolved;
    }
}
