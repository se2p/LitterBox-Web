/*
 * Copyright (C) 2024 LitterBox-Web contributors
 *
 * This file is part of LitterBox-Web.
 * Licenced under the EUPL-1.2 or later.
 *
 * SPDX-FileCopyrightText: 2024 LitterBox-Web contributors
 * SPDX-License-Identifier: EUPL-1.2
 */
package de.uni_passau.fim.se2.litterbox_web.code_completion;

import java.util.Objects;

import com.fasterxml.jackson.databind.annotation.JsonDeserialize;
import com.fasterxml.jackson.databind.annotation.JsonSerialize;

import de.uni_passau.fim.se2.litterbox.ast.model.Program;
import de.uni_passau.fim.se2.litterbox_web.shared.ScratchProgramConverter;

public record CodeCompletionRequestDto(
    @JsonSerialize(converter = ScratchProgramConverter.SerializeConverter.class) @JsonDeserialize(
        converter = ScratchProgramConverter.DeserializeConverter.class
    ) Program program,
    CodeCompletionModelConfig.CodeCompletionModelType model,
    int topkPredictions
) {

    public CodeCompletionRequestDto {
        Objects.requireNonNull(program);
        model = Objects.requireNonNullElse(model, CodeCompletionModelConfig.CodeCompletionModelType.TRANSFORMER);
        if (topkPredictions <= 0) {
            topkPredictions = 5;
        }
    }
}
