/*
 * Copyright (C) 2024 LitterBox-Web contributors
 *
 * This file is part of LitterBox-Web.
 * Licenced under the EUPL-1.2 or later.
 *
 * SPDX-FileCopyrightText: 2024 LitterBox-Web contributors
 * SPDX-License-Identifier: EUPL-1.2
 */
package de.uni_passau.fim.se2.litterbox_web.code_readability;

import java.util.Collection;
import java.util.Optional;

import jakarta.validation.constraints.NotBlank;

public record CodeReadabilityRequestDto(
    @NotBlank String program,
    Optional<Collection<@NotBlank String>> spriteNames
) {
}
