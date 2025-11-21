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

import de.uni_passau.fim.se2.litterbox.ast.model.Program;
import de.uni_passau.fim.se2.litterbox_web.shared.JsonScratchProgram;

public record CodeCompletionRequestDto(
    @JsonScratchProgram Program program,
    CodeCompletionModelConfig.CodeCompletionModelType model,
    int topkPredictions
    // note: probably needs some additional attributes to be actually usable
    // e.g. ID of a block where something should be completed,
    // (probably best to add some artificial block in the Scratch-VM and save the ID, then it can
    // also be replaced by the response easily, and it may be easier to handle different block types
    // like statements or expressions)
) {

    public CodeCompletionRequestDto {
        Objects.requireNonNull(program);
        model = Objects.requireNonNullElse(model, CodeCompletionModelConfig.CodeCompletionModelType.TRANSFORMER);
        if (topkPredictions <= 0) {
            topkPredictions = 5;
        }
    }
}
