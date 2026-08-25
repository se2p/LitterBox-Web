/*
 * Copyright (C) 2024-2026 LitterBox-Web contributors
 *
 * This file is part of LitterBox-Web.
 * Licenced under the EUPL-1.2 or later.
 *
 * SPDX-FileCopyrightText: 2024-2026 LitterBox-Web contributors
 * SPDX-License-Identifier: EUPL-1.2
 */
package de.uni_passau.fim.se2.litterbox_web.web_ui.capabilities;

import java.util.Objects;

import org.jspecify.annotations.Nullable;

/** Internal immutable content returned through a controller-owned download boundary. */
public record CapabilityContent(byte[] bytes, @Nullable String sourceFormat) {

    public CapabilityContent {
        bytes = Objects.requireNonNull(bytes, "bytes").clone();
    }

    public CapabilityContent(final byte[] bytes) {
        this(bytes, null);
    }

    @Override
    public byte[] bytes() {
        return bytes.clone();
    }
}
