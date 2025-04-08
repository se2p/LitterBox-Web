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
import java.util.Objects;
import java.util.Optional;

import com.fasterxml.jackson.databind.annotation.JsonDeserialize;
import com.fasterxml.jackson.databind.annotation.JsonSerialize;

import de.uni_passau.fim.se2.litterbox.ast.model.Program;
import de.uni_passau.fim.se2.litterbox_web.shared.ScratchProgramConverter;
import jakarta.validation.constraints.NotBlank;

public record CodeReadabilityRequestDto(
    @JsonSerialize(converter = ScratchProgramConverter.SerializeConverter.class) @JsonDeserialize(
        converter = ScratchProgramConverter.DeserializeConverter.class
    ) Program program,
    Optional<Collection<@NotBlank String>> spriteNames
) {

    public CodeReadabilityRequestDto {
        Objects.requireNonNull(program);
    }
}
